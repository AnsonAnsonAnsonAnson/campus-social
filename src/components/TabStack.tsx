import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

/** The stack inside each tab. Tab screens draw their own large title (PageHeader). */
export function TabStack({ title }: { title: string }) {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, headerTintColor: c.tint, contentStyle: { backgroundColor: c.backgroundPlain } }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
