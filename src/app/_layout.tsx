import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/lib/auth';
import { useColors } from '@/lib/theme';

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
        </Stack>
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
