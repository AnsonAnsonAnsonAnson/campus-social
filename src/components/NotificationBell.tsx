import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

import { Icon } from './ui';

/** Header button that opens the inbox, with an unread badge. */
export function NotificationBell() {
  const c = useColors();
  const { user } = useAuth();
  const unread = useQuery(() => api.unreadNotificationCount(), [user?.id]);
  if (!user) return null;
  const n = unread.data ?? 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={n ? `Notifications, ${n} unread` : 'Notifications'}
      style={styles.button}>
      <Icon name={n ? 'notifications' : 'notifications-outline'} size={24} color={c.tint} />
      {n > 0 && (
        <View style={[styles.badge, { backgroundColor: c.danger, borderColor: c.background }]}>
          <Text style={styles.badgeText}>{n > 9 ? '9+' : n}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
