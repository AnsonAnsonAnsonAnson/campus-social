import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ToastHost } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { eventIdFrom, notificationsSupported, refreshReminders, registerForPush } from '@/lib/notifications';
import { useColors } from '@/lib/theme';

/** Opens the event when a reminder or push is tapped, and keeps reminders and the push token current. */
function NotificationRouting() {
  const { user } = useAuth();

  useEffect(() => {
    if (!notificationsSupported) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const id = eventIdFrom(r);
      if (id) router.push(`/event/${id}`);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshReminders();
    registerForPush();
  }, [user]);

  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.tint, background: c.background, card: c.card } };

  return (
    <ThemeProvider value={theme}>
      <AuthProvider>
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: c.tint }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ title: '', headerTransparent: true, headerTintColor: '#fff' }} />
          <Stack.Screen name="society/[id]" options={{ title: '' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: 'Edit profile' }} />
          <Stack.Screen name="new-society" options={{ presentation: 'modal', title: 'Register a society' }} />
          <Stack.Screen name="report" options={{ presentation: 'formSheet', title: 'Report', sheetAllowedDetents: [0.6, 1] }} />
          <Stack.Screen name="manage/[societyId]" options={{ title: 'Manage' }} />
          <Stack.Screen name="manage/event-form" options={{ presentation: 'modal', title: 'Event' }} />
          <Stack.Screen name="manage/promote" options={{ presentation: 'modal', title: 'Promote event' }} />
          <Stack.Screen name="manage/attendees" options={{ title: 'Attendees' }} />
          <Stack.Screen name="manage/scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="admin/index" options={{ title: 'Review queue' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="manage/members" options={{ title: 'Committee' }} />
          <Stack.Screen name="manage/edit-society" options={{ presentation: 'modal', title: 'Edit society' }} />
          <Stack.Screen name="welcome" options={{ presentation: 'modal', title: 'Welcome', gestureEnabled: false }} />
        </Stack>
        <NotificationRouting />
        <ToastHost />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
