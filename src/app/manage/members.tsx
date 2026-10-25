import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { Button, Card, Chip, ErrorView, Field, Icon, Pill, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isCuhkEmail } from '@/lib/backend';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { radius, space, type, useColors } from '@/lib/theme';
import type { SocietyMember, SocietyRole } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type AssignableRole = Exclude<SocietyRole, 'owner'>;

const roleInfo = (role: SocietyRole) =>
  ({
    owner: t('Everything, including handing the society over'),
    admin: t('Edit the society, manage the committee and events'),
    editor: t('Create and edit events, check people in'),
  })[role];

export default function Members() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('editor');
  const [adding, setAdding] = useState(false);

  const q = useQuery(() => api.listMembers(societyId), [societyId]);

  if (q.loading && !q.data) return <ListSkeleton rows={3} />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const members = q.data ?? [];
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 'editor';
  const canManage = myRole !== 'editor';

  const run = async (work: () => Promise<void>, done: string) => {
    try {
      await work();
      invalidate();
      toast(done);
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  const add = async () => {
    setAdding(true);
    await run(
      async () => {
        await api.addMember(societyId, email, role);
        setEmail('');
      },
      t('Added as {role}', { role: t(role) }),
    );
    setAdding(false);
  };

  const manage = (m: SocietyMember) => {
    const isMe = m.user_id === user?.id;
    const name = m.display_name || m.email;
    if (isMe) {
      if (m.role === 'owner') {
        showAlert(t('You own this society'), t('To leave, first make someone else the owner by tapping their name.'));
        return;
      }
      showAlert(t('Leave the committee?'), t("You won't be able to manage this society any more."), [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Leave committee'),
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await api.removeMember(societyId, m.user_id);
              router.dismissTo('/profile');
            }, t('You left the committee')),
        },
      ]);
      return;
    }
    if (!canManage || m.role === 'owner') return;
    const other: AssignableRole = m.role === 'admin' ? 'editor' : 'admin';
    showAlert(name, roleInfo(m.role), [
      {
        text: t('Make {role}', { role: t(other) }),
        onPress: () => run(() => api.setMemberRole(societyId, m.user_id, other), t('{name} is now {role}', { name, role: t(other) })),
      },
      ...(myRole === 'owner'
        ? [
            {
              text: t('Make owner'),
              onPress: async () => {
                if (
                  await confirmAsync(
                    t('Make {name} the owner?', { name }),
                    t("You'll become an admin. Only the owner can hand the society over again."),
                    t('Transfer ownership'),
                    true,
                  )
                ) {
                  run(() => api.transferOwnership(societyId, m.user_id), t('{name} now owns the society', { name }));
                }
              },
            },
          ]
        : []),
      {
        text: t('Remove from committee'),
        style: 'destructive' as const,
        onPress: () => run(() => api.removeMember(societyId, m.user_id), t('{name} removed', { name })),
      },
      { text: t('Cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <SectionHeader title={t('{n} on the committee', { n: members.length })} />
        <View style={[styles.group, { backgroundColor: c.card }]}>
          {members.map((m, i) => (
            <Pressable
              key={m.user_id}
              onPress={() => manage(m)}
              accessibilityRole="button"
              accessibilityLabel={`${m.display_name || m.email}, ${t(m.role)}`}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? c.fill : c.card, borderTopColor: c.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 },
              ]}>
              <SocietyAvatar name={m.display_name || m.email} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
                  {m.display_name || m.email}
                  {m.user_id === user?.id ? t(' (you)') : ''}
                </Text>
                <Text style={[type.footnote, { color: c.textSecondary }]} numberOfLines={1}>
                  {m.email}
                </Text>
              </View>
              <Pill label={t(m.role)} tone={m.role === 'owner' ? 'brand' : m.role === 'admin' ? 'success' : 'neutral'} />
            </Pressable>
          ))}
        </View>

        {canManage ? (
          <>
            <SectionHeader title={t('Add someone')} />
            <Card style={{ marginHorizontal: space.lg, gap: space.md }}>
              <Field
                label={t('Their CUHK email')}
                value={email}
                onChangeText={setEmail}
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                hint={t('They need to have signed in to the app once.')}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {(['editor', 'admin'] as const).map((r) => (
                  <Chip key={r} label={r === 'editor' ? t('Editor') : t('Admin')} selected={role === r} onPress={() => setRole(r)} />
                ))}
              </View>
              <Text style={[type.footnote, { color: c.textSecondary }]}>{roleInfo(role)}.</Text>
              <Button
                title={t('Add to committee')}
                icon="person-add-outline"
                loading={adding}
                disabled={!isCuhkEmail(email)}
                onPress={add}
              />
            </Card>
          </>
        ) : (
          <View style={styles.note}>
            <Icon name="information-circle-outline" />
            <Text style={[type.footnote, { color: c.textSecondary, flex: 1 }]}>
              {t('Editors can manage events. Ask an admin or the owner to change the committee.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: space.lg, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  note: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg, marginTop: space.lg },
});
