import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useColors } from '@/lib/theme';

export default function Layout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'systemMaterial',
        headerTintColor: c.tint,
        headerLargeTitleShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'My Tickets' }} />
    </Stack>
  );
}
