import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useColors } from '@/lib/theme';

/** The stack inside each tab: large iOS titles, blurred translucent header. */
export function TabStack({ title }: { title: string }) {
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
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
