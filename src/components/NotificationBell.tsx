import { router } from 'expo-router';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

import { CircleButton } from './ui';

/** Round header button that opens the inbox, with a red dot for unread. */
export function NotificationBell() {
  const { user } = useAuth();
  const unread = useQuery(() => api.unreadNotificationCount(), [user?.id]);
  if (!user) return null;
  const n = unread.data ?? 0;
  return (
    <CircleButton
      icon="notifications-outline"
      dot={n > 0}
      label={n ? t('Notifications, {n} unread', { n }) : t('Notifications')}
      onPress={() => router.push('/notifications')}
    />
  );
}
