import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Card, EmptyState, Icon, ListGroup, ListRow, Pill, SocietyAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/constants';
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
import { space, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, LANGUAGES, t, useLang } from '@/lib/i18n';

export default function Profile() {
  const c = useColors();
  const { user, profile } = useAuth();
  const societies = useQuery(() => api.mySocieties(), [user?.id]);
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
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48, gap: space.xl, paddingTop: space.md }}>
      {api.isDemo && (
        <Card style={{ marginHorizontal: space.lg, gap: 6 }}>
          <Pill label={t('Demo mode')} tone="brand" />
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {t('You are seeing sample data. Sign in with any CUHK email and code 123456. Connect Supabase (see README) to go live.')}
          </Text>
        </Card>
      )}

      {user ? (
        <Card style={[styles.header]}>
          <SocietyAvatar name={profile?.display_name || user.email} uri={profile?.avatar_url} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }} numberOfLines={1}>
              {profile?.display_name || user.email.split('@')[0]}
            </Text>
            <Text style={{ color: c.textSecondary }} numberOfLines={1}>
              {user.email}
            </Text>
            {!!profile?.college && (
              <Text style={{ color: c.tint, fontWeight: '600' }}>{t('{college} College', { college: t(profile.college) })}</Text>
            )}
          </View>
          <Button small variant="secondary" title={t('Edit')} onPress={() => router.push('/edit-profile')} />
        </Card>
      ) : (
        <EmptyState
          icon="person-circle-outline"
          title={t('Sign in with your CUHK email')}
          body={t('Follow societies, register for events and keep your tickets in one place.')}
          action={<Button title={t('Sign in')} onPress={() => router.push('/sign-in')} />}
        />
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

      {user && (
        <ListGroup title={t('Notifications')}>
          <ListRow
            icon="notifications-outline"
            title={t('Inbox')}
            value={unread.data ? t('{n} new', { n: unread.data }) : undefined}
            onPress={() => router.push('/notifications')}
          />
          {notificationsSupported && notif.data && (
            <View style={[styles.switchRow, { backgroundColor: c.card }]}>
              <Icon name="alarm-outline" size={20} color={c.tint} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{t('Event reminders')}</Text>
                <Text style={[type.footnote, { color: c.textSecondary }]}>{t('An hour before events you’re going to')}</Text>
              </View>
              <Switch
                value={notif.data.reminders && notif.data.permission === 'granted'}
                disabled={notif.data.permission === 'denied'}
                onValueChange={toggleReminders}
                trackColor={{ true: c.tint }}
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
        <ListRow icon="mail-outline" title={t('Contact support')} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
});
