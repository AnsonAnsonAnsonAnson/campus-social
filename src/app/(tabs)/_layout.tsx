import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { useColors } from '@/lib/theme';
import { t } from '@/lib/i18n';

// The web preview draws the tab bar as a pill floating over the top of the
// page; leave room for it so it doesn't cover screen headers.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '[class*="tabContent"] { padding-top: 64px; box-sizing: border-box; }';
  document.head.appendChild(style);
}

export default function TabsLayout() {
  const c = useColors();
  return (
    <NativeTabs tintColor={c.tint}>
      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Label>{t('Discover')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>{t('Calendar')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="societies">
        <NativeTabs.Trigger.Label>{t('Societies')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tickets">
        <NativeTabs.Trigger.Label>{t('Tickets')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'ticket', selected: 'ticket.fill' }} md="confirmation_number" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('Profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
