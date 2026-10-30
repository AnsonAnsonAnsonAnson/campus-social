import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/components/Toast';
import { Button, Card, EmptyState, Icon, ListGroup, ListRow, Pill, SocietyAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import {
  notificationsSupported,
  permissionState,
  registerForPush,
  remindersEnabled,
  requestPermission,
  setRemindersEnabled,
  unregisterForPush,
} from '@/lib/notifications';
import { radius, space, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, LANGUAGES, t, useLang } from '@/lib/i18n';

export default function Profile() {
  const c = useColors();
  const { user, profile, followIds, savedIds } = useAuth();
  const insets = useSafeAreaInsets();
  const societies = useQuery(() => api.mySocieties(), [user?.id]);
  const stats = useQuery(async () => {
    if (!user) return null;
    const now = new Date().toISOString();
    const [tickets, memberships] = await Promise.all([api.myTickets(), api.myMemberships()]);
    return { tickets: tickets.filter((tk) => tk.event.ends_at >= now).length, cards: memberships.length };
  }, [user?.id]);
  const unread = useQuery(() => api.unreadNotificationCount(), [user?.id]);
  const notif = useQuery(async () => ({ permission: await permissionState(), reminders: await remindersEnabled() }));
  const lang = useLang();

  const pickLanguage = () =>
    showAlert('語言 · Language', undefined, [
      ...LANGUAGES.map((l) => ({ text: l.label, onPress: () => changeLanguage(l.code, '/profile') })),
      { text: t('Cancel'), style: 'cancel' as const },
    ]);

  const toggleReminders = async (on: boolean) => {
    if (on && notif.data?.permission === 'undetermined' && !(await requestPermission())) {
      notif.refresh();
      return;
    }
    await setRemindersEnabled(on);
    if (on) registerForPush();
    notif.refresh();
    toast(on ? t("Reminders on. We'll nudge you an hour before.") : t('Reminders off'), { tone: 'info' });
  };

  const signOut = async () => {
    await unregisterForPush();
    await api.signOut();
    toast(t('Signed out'), { tone: 'info' });
  };

  const confirmDelete = () =>
    showAlert(
      t('Delete your account?'),
      t(
        'This permanently deletes your profile, follows and tickets. Society events you created stay with the society. This cannot be undone.',
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete account'),
          style: 'destructive',
          onPress: () =>
            unregisterForPush()
              .then(() => api.deleteAccount())
              .then(() => toast(t('Your account was deleted'), { tone: 'info' }))
              .catch((e) => showAlert(t('Could not delete account'), errorMessage(e))),
        },
      ],
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48, gap: space.xl, paddingTop: insets.top + space.xl }}>
      {api.isDemo && (
        <Card style={{ marginHorizontal: space.lg, gap: 6 }}>
          <Pill label={t('Demo mode')} tone="brand" />
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {t('You are seeing sample data. Sign in with any CUHK email and code 123456. Connect Supabase (see README) to go live.')}
          </Text>
        </Card>
      )}

      {user ? (
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: c.tint }]}>
            {profile?.avatar_url ? (
              <SocietyAvatar name={profile.display_name || user.email} uri={profile.avatar_url} size={88} />
            ) : profile?.display_name ? (
              <Text style={styles.avatarText}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>
            ) : (
              <Icon name="person" size={40} color="#fff" />
            )}
          </View>
          <Pressable onPress={() => router.push('/edit-profile')} accessibilityRole="button" style={styles.nameRow}>
            <Text style={{ color: profile?.display_name ? c.text : c.tintText, fontSize: 22, fontWeight: '700' }} numberOfLines={1}>
              {profile?.display_name || t('Add your name')}
            </Text>
            <Icon name="pencil" size={15} color={c.textSecondary} />
          </Pressable>
          <Text style={{ color: c.textSecondary, fontSize: 15 }} numberOfLines={1}>
            {user.email}
          </Text>
          {!!profile?.college && <Pill label={t('{college} College', { college: t(profile.college) })} tone="brand" icon={null} />}
          <View style={[styles.stats, { backgroundColor: c.card }]}>
            <Stat
              value={savedIds.length}
              label={t('Saved events')}
              onPress={() => router.navigate({ pathname: '/tickets', params: { tab: 'saved' } })}
            />
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <Stat value={stats.data?.tickets} label={t('Tickets')} onPress={() => router.navigate('/tickets')} />
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <Stat value={followIds.size} label={t('Following')} onPress={() => router.navigate('/societies')} />
          </View>
        </View>
      ) : (
        <EmptyState
          icon="person-circle-outline"
          title={t('Sign in with your CUHK email')}
          body={t('Follow societies, register for events and keep your tickets in one place.')}
          action={<Button title={t('Sign in')} onPress={() => router.push('/sign-in')} />}
        />
      )}

      {user && (
        <ListGroup>
          <ListRow icon="notifications-outline" title={t('Inbox')} badge={unread.data ?? 0} onPress={() => router.push('/notifications')} />
          <ListRow
            icon="card-outline"
            title={t('Member cards')}
            value={stats.data ? String(stats.data.cards) : undefined}
            onPress={() => router.navigate({ pathname: '/tickets', params: { tab: 'cards' } })}
          />
        </ListGroup>
      )}

      {user && (
        <ListGroup title={t('Societies you help run')}>
          {(societies.data ?? []).map((s) => (
            <ListRow
              key={s.id}
              icon={s.status === 'approved' ? 'people' : 'hourglass-outline'}
              title={s.name}
              value={s.status === 'approved' ? t(s.role) : t('Pending review')}
              onPress={() => router.push(`/manage/${s.id}`)}
            />
          ))}
          <ListRow icon="add-circle-outline" title={t('Register a society')} onPress={() => router.push('/new-society')} />
        </ListGroup>
      )}

      {user && notificationsSupported && (
        <ListGroup title={t('Settings')}>
          {notificationsSupported && notif.data && (
            <View style={[styles.switchRow, { backgroundColor: c.card }]}>
              <Icon name="alarm-outline" size={20} color={c.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{t('Event reminders')}</Text>
                <Text style={[type.footnote, { color: c.textSecondary }]}>{t('An hour before events you’re going to')}</Text>
              </View>
              <Switch
                value={notif.data.reminders && notif.data.permission === 'granted'}
                disabled={notif.data.permission === 'denied'}
                onValueChange={toggleReminders}
                trackColor={{ true: c.success }}
              />
            </View>
          )}
          {notificationsSupported && notif.data?.permission === 'denied' && (
            <ListRow icon="settings-outline" title={t('Allow notifications in Settings')} onPress={() => Linking.openSettings()} />
          )}
        </ListGroup>
      )}

      {profile?.is_platform_admin && (
        <ListGroup title={t('Admin')}>
          <ListRow icon="shield-checkmark-outline" title={t('Review queue')} onPress={() => router.push('/admin')} />
        </ListGroup>
      )}

      <ListGroup>
        <ListRow
          icon="language-outline"
          title={t('Language')}
          value={LANGUAGES.find((l) => l.code === lang)?.label}
          onPress={pickLanguage}
        />
      </ListGroup>

      <ListGroup title={t('About')}>
        <ListRow icon="lock-closed-outline" title={t('Privacy policy')} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        <ListRow icon="document-text-outline" title={t('Terms of use')} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
        <ListRow icon="mail-outline" title={t('Contact support')} onPress={() => WebBrowser.openBrowserAsync(SUPPORT_URL)} />
        <ListRow icon="information-circle-outline" title={t('Version')} value={Constants.expoConfig?.version ?? '1.0.0'} />
      </ListGroup>

      {user && (
        <ListGroup>
          <ListRow icon="log-out-outline" title={t('Sign out')} onPress={signOut} />
          <ListRow icon="trash-outline" title={t('Delete account')} destructive onPress={confirmDelete} />
        </ListGroup>
      )}
    </ScrollView>
  );
}

function Stat({ value, label, onPress }: { value: number | undefined; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.stat}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value ?? '–'}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, marginHorizontal: space.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: space.md,
    borderRadius: radius.lg,
    paddingVertical: space.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.xs },
  statDivider: { width: StyleSheet.hairlineWidth * 2, height: 36 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
});
