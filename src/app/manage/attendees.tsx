import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { Button, Chip, ChipRow, EmptyState, ErrorView, Icon, Pill, StatTile, tap } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { confirmAsync } from '@/lib/dialog';
import { formatTime, formatWhen } from '@/lib/format';
import { radius, space, type, useColors } from '@/lib/theme';
import type { Attendee } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type Filter = 'all' | 'in' | 'not-in' | 'waitlist';

export default function Attendees() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useColors();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  // Manual check-ins show immediately, before the list reloads.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  const q = useQuery(async () => {
    const [event, attendees] = await Promise.all([api.getEvent(eventId), api.listAttendees(eventId)]);
    return { event, attendees };
  }, [eventId]);

  const attendees = useMemo(
    () =>
      (q.data?.attendees ?? []).map((a) => (a.registration_id in overrides ? { ...a, checked_in_at: overrides[a.registration_id] } : a)),
    [q.data, overrides],
  );

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = term
      ? attendees.filter((a) => a.display_name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term))
      : attendees;
    if (filter === 'in') return all.filter((a) => a.checked_in_at);
    if (filter === 'not-in') return all.filter((a) => a.status === 'confirmed' && !a.checked_in_at);
    if (filter === 'waitlist') return all.filter((a) => a.status === 'waitlisted');
    return all;
  }, [attendees, filter, search]);

  if (q.loading) return <ListSkeleton />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const e = q.data?.event;
  if (!e) return <ErrorView message={t('Event not found.')} />;

  const all = attendees;
  const checkedIn = all.filter((a) => a.checked_in_at).length;
  // Counts come from the event row; the list itself may be capped.
  const confirmed = e.confirmed_count;
  const waitlisted = e.waitlist_count;

  const exportCsv = () => {
    const rows = [
      [
        t('Name'),
        t('Email'),
        t('College'),
        t('Status'),
        t('Checked in'),
        t('Registered'),
        ...(e.signup_question ? [e.signup_question] : []),
      ],
      ...all.map((a) => [
        a.display_name,
        a.email,
        a.college ?? '',
        a.status,
        a.checked_in_at ?? '',
        a.created_at,
        ...(e.signup_question ? [a.answer ?? ''] : []),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    Share.share({ title: `${e.title} attendees.csv`, message: csv });
  };

  const toggleCheckIn = async (a: Attendee) => {
    if (a.status !== 'confirmed') return;
    const checking = !a.checked_in_at;
    if (
      !checking &&
      !(await confirmAsync(t('Undo check-in?'), t('{name} will show as not arrived.', { name: a.display_name || a.email }), t('Undo')))
    )
      return;
    tap();
    setOverrides((o) => ({ ...o, [a.registration_id]: checking ? new Date().toISOString() : null }));
    try {
      await api.setCheckedIn(a.registration_id, checking);
      if (checking) toast(t('{name} checked in', { name: a.display_name || t('Attendee') }));
    } catch (err) {
      setOverrides((o) => ({ ...o, [a.registration_id]: a.checked_in_at }));
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: e.title }} />
      <FlatList
        style={{ backgroundColor: c.background }}
        data={list}
        keyExtractor={(a) => a.registration_id}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <Text style={{ color: c.textSecondary, marginHorizontal: space.lg }}>{formatWhen(e.starts_at, e.ends_at)}</Text>
            <View style={styles.stats}>
              <StatTile style={{ flex: 1 }} value={`${confirmed}${e.capacity ? `/${e.capacity}` : ''}`} label={t('Going')} />
              <StatTile style={{ flex: 1 }} value={String(checkedIn)} label={t('Checked in')} tone="success" />
              <StatTile style={{ flex: 1 }} value={String(waitlisted)} label={t('Waitlist')} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg }}>
              <Button
                style={{ flex: 1 }}
                title={t('Scan tickets')}
                icon="qr-code-outline"
                onPress={() => router.push({ pathname: '/manage/scan', params: { mode: 'event', eventId: e.id, title: e.title } })}
              />
              <Button
                title={t('Edit')}
                icon="create-outline"
                variant="secondary"
                onPress={() => router.push({ pathname: '/manage/event-form', params: { eventId: e.id } })}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg }}>
              <Button
                style={{ flex: 1 }}
                small
                title={t('Promote')}
                icon="megaphone-outline"
                variant="secondary"
                onPress={() => router.push({ pathname: '/manage/promote', params: { eventId: e.id } })}
              />
              <Button
                style={{ flex: 1 }}
                small
                title={t('Duplicate')}
                icon="copy-outline"
                variant="secondary"
                onPress={() => router.push({ pathname: '/manage/event-form', params: { copyFrom: e.id } })}
              />
              <Button style={{ flex: 1 }} small title={t('CSV')} icon="share-outline" variant="secondary" onPress={exportCsv} />
            </View>
            {all.length > 8 && (
              <View style={[styles.search, { backgroundColor: c.fill }]}>
                <Icon name="search" size={16} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('Find by name or email')}
                  placeholderTextColor={c.textSecondary}
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 8 }}
                />
              </View>
            )}
            <ChipRow>
              <Chip label={t('All')} selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={t('Checked in')} selected={filter === 'in'} onPress={() => setFilter('in')} />
              <Chip label={t('Not arrived')} selected={filter === 'not-in'} onPress={() => setFilter('not-in')} />
              <Chip label={t('Waitlist')} selected={filter === 'waitlist'} onPress={() => setFilter('waitlist')} />
            </ChipRow>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg }} />
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleCheckIn(item)}
            disabled={item.status !== 'confirmed'}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!item.checked_in_at, disabled: item.status !== 'confirmed' }}
            accessibilityHint={item.status === 'confirmed' ? t('Tap to check in or undo') : undefined}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.card }]}>
            <Icon
              name={item.checked_in_at ? 'checkmark-circle' : item.status === 'waitlisted' ? 'hourglass-outline' : 'ellipse-outline'}
              size={24}
              color={item.checked_in_at ? c.success : c.textSecondary}
            />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[type.body, { color: c.text }]}>{item.display_name || item.email}</Text>
              <Text style={[type.footnote, { color: c.textSecondary }]}>
                {item.email}
                {item.college ? ` · ${t(item.college)}` : ''}
              </Text>
              {!!item.answer && (
                <Text style={[type.footnote, { color: c.text, fontStyle: 'italic' }]} numberOfLines={2}>
                  “{item.answer}”
                </Text>
              )}
            </View>
            {item.checked_in_at ? (
              <Text style={{ color: c.success, fontSize: 13 }}>{formatTime(item.checked_in_at)}</Text>
            ) : item.status === 'waitlisted' ? (
              <Pill label={t('Waitlist')} tone="warning" />
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState icon="people-outline" title={t('No one here yet')} body={t('Share your event so people can sign up.')} />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
});
