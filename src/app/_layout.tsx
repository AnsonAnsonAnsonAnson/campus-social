import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { ToastHost } from '@/components/Toast';
import { api } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { eventIdFrom, notificationsSupported, refreshReminders, registerForPush } from '@/lib/notifications';
import { useColors, useIsDark } from '@/lib/theme';
import { loadLang, t, takeReturnRoute, useLang } from '@/lib/i18n';

/**
 * Opens the event when a reminder or push is tapped, and keeps reminders, the
 * push token and the profile's language (which notifications are written in)
 * current.
 */
function NotificationRouting() {
  const { user, profile } = useAuth();
  const lang = useLang();

  useEffect(() => {
    if (profile && profile.locale !== lang) api.updateProfile({ locale: lang }).catch(() => undefined);
  }, [profile, lang]);

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

/** After a language change remounts the app, reopens the screen the person was on. */
function ReturnAfterLanguageChange() {
  const ready = !!useRootNavigationState()?.key;
  useEffect(() => {
    if (!ready) return;
    const to = takeReturnRoute();
    if (to) router.navigate(to as never);
  }, [ready]);
  return null;
}

export default function RootLayout() {
  const dark = useIsDark();
  const c = useColors();
  const lang = useLang();
  const [langLoaded, setLangLoaded] = useState(false);
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.tint, background: c.background, card: c.card } };

  useEffect(() => {
    loadLang().finally(() => setLangLoaded(true));
  }, []);

  // The splash screen stays up for the few milliseconds this takes.
  if (!langLoaded) return null;

  // Keyed on language: screens read text when they render, so a language
  // change remounts the app rather than leaving half the screens untranslated.
  return (
    <ThemeProvider value={theme} key={lang}>
      <AuthProvider>
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: c.tint }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="society/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: t('Sign in') }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: t('Edit profile') }} />
          <Stack.Screen name="new-society" options={{ presentation: 'modal', title: t('Register a society') }} />
          <Stack.Screen name="report" options={{ presentation: 'formSheet', title: t('Report'), sheetAllowedDetents: [0.6, 1] }} />
          <Stack.Screen name="manage/[societyId]" options={{ title: t('Manage') }} />
          <Stack.Screen name="manage/event-form" options={{ presentation: 'modal', title: t('Event') }} />
          <Stack.Screen name="manage/promote" options={{ presentation: 'modal', title: t('Promote event') }} />
          <Stack.Screen name="manage/attendees" options={{ title: t('Attendees') }} />
          <Stack.Screen name="manage/scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="admin/index" options={{ title: t('Review queue') }} />
          <Stack.Screen name="notifications" options={{ title: '' }} />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen name="manage/members" options={{ title: t('Committee') }} />
          <Stack.Screen name="manage/edit-society" options={{ presentation: 'modal', title: t('Edit society') }} />
          <Stack.Screen name="manage/roster" options={{ title: t('Members') }} />
          <Stack.Screen name="manage/plan-form" options={{ presentation: 'modal', title: t('Membership plan') }} />
          <Stack.Screen name="manage/import" options={{ presentation: 'modal', title: t('Import members') }} />
          <Stack.Screen name="manage/orders" options={{ title: t('Orders') }} />
          <Stack.Screen name="manage/match" options={{ title: t('Match bank statement') }} />
          <Stack.Screen name="manage/product-form" options={{ presentation: 'modal', title: t('Product') }} />
          <Stack.Screen name="manage/payment-settings" options={{ presentation: 'modal', title: t('Payment details') }} />
          <Stack.Screen name="membership/join" options={{ presentation: 'modal', title: t('Join') }} />
          <Stack.Screen name="membership/[id]" options={{ title: t('Member card') }} />
          <Stack.Screen name="shop/[id]" options={{ title: '' }} />
          <Stack.Screen name="order/[id]" options={{ title: t('Order') }} />
          <Stack.Screen name="welcome" options={{ presentation: 'modal', title: t('Welcome'), gestureEnabled: false }} />
        </Stack>
        <NotificationRouting />
        <ReturnAfterLanguageChange />
        <ToastHost />
        <StatusBar style={dark ? 'light' : 'dark'} />
      </AuthProvider>
    </ThemeProvider>
  );
}
