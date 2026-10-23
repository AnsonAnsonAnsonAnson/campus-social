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

export default function Profile() {
  const c = useColors();
  const { user, profile } = useAuth();
  const societies = useQuery(() => api.mySocieties(), [user?.id]);
  const unread = useQuery(() => api.unreadNotificationCount(), [user?.id]);
  const notif = useQuery(async () => ({ permission: await permissionState(), reminders: await remindersEnabled() }));

  const toggleReminders = async (on: boolean) => {
    if (on && notif.data?.permission === 'undetermined' && !(await requestPermission())) {
      notif.refresh();
      return;
    }
    await setRemindersEnabled(on);
    if (on) registerForPush();
    notif.refresh();
    toast(on ? "Reminders on. We'll nudge you an hour before." : 'Reminders off', { tone: 'info' });
  };

  const signOut = async () => {
    await unregisterForPush();
    await api.signOut();
    toast('Signed out', { tone: 'info' });
  };

  const confirmDelete = () =>
    showAlert(
      'Delete your account?',
      'This permanently deletes your profile, follows and tickets. Society events you created stay with the society. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            unregisterForPush()
              .then(() => api.deleteAccount())
              .then(() => toast('Your account was deleted', { tone: 'info' }))
              .catch((e) => showAlert('Could not delete account', errorMessage(e))),
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
          <Pill label="Demo mode" tone="brand" />
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
            You are seeing sample data. Sign in with any CUHK email and code 123456. Connect Supabase (see README) to go live.
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
            {!!profile?.college && <Text style={{ color: c.tint, fontWeight: '600' }}>{profile.college} College</Text>}
          </View>
          <Button small variant="secondary" title="Edit" onPress={() => router.push('/edit-profile')} />
        </Card>
      ) : (
        <EmptyState
          icon="person-circle-outline"
          title="Sign in with your CUHK email"
          body="Follow societies, register for events and keep your tickets in one place."
          action={<Button title="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      )}

      {user && (
        <ListGroup title="Societies you help run">
          {(societies.data ?? []).map((s) => (
            <ListRow
              key={s.id}
              icon={s.status === 'approved' ? 'people' : 'hourglass-outline'}
              title={s.name}
              value={s.status === 'approved' ? s.role : 'Pending review'}
              onPress={() => router.push(`/manage/${s.id}`)}
            />
          ))}
          <ListRow icon="add-circle-outline" title="Register a society" onPress={() => router.push('/new-society')} />
        </ListGroup>
      )}

      {user && (
        <ListGroup title="Notifications">
          <ListRow
            icon="notifications-outline"
            title="Inbox"
            value={unread.data ? `${unread.data} new` : undefined}
            onPress={() => router.push('/notifications')}
          />
          {notificationsSupported && notif.data && (
            <View style={[styles.switchRow, { backgroundColor: c.card }]}>
              <Icon name="alarm-outline" size={20} color={c.tint} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>Event reminders</Text>
                <Text style={[type.footnote, { color: c.textSecondary }]}>An hour before events you’re going to</Text>
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
            <ListRow icon="settings-outline" title="Allow notifications in Settings" onPress={() => Linking.openSettings()} />
          )}
        </ListGroup>
      )}

      {profile?.is_platform_admin && (
        <ListGroup title="Admin">
          <ListRow icon="shield-checkmark-outline" title="Review queue" onPress={() => router.push('/admin')} />
        </ListGroup>
      )}

      <ListGroup title="About">
        <ListRow icon="lock-closed-outline" title="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        <ListRow icon="document-text-outline" title="Terms of use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
        <ListRow icon="mail-outline" title="Contact support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <ListRow icon="information-circle-outline" title="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
      </ListGroup>

      {user && (
        <ListGroup>
          <ListRow icon="log-out-outline" title="Sign out" onPress={signOut} />
          <ListRow icon="trash-outline" title="Delete account" destructive onPress={confirmDelete} />
        </ListGroup>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58 },
});
