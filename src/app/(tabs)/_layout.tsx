import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { t } from '@/lib/i18n';

// One bottom tab bar on every platform, drawn to match the design file.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="discover" options={{ title: t('Discover') }} />
      <Tabs.Screen name="calendar" options={{ title: t('Calendar') }} />
      <Tabs.Screen name="societies" options={{ title: t('Societies') }} />
      <Tabs.Screen name="tickets" options={{ title: t('Tickets') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profile') }} />
    </Tabs>
  );
}
