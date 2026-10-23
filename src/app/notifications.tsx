import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { EmptyState, ErrorView, Icon, type IconName } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAsync } from '@/lib/dialog';
import { formatAgo, hkDate, todayHK } from '@/lib/format';
import { radius, space, type, useColors } from '@/lib/theme';
import type { AppNotification, NotificationKind } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

const ICONS: Record<NotificationKind, IconName> = {
  waitlist_promoted: 'ticket',
  event_cancelled: 'close-circle',
  event_updated: 'time',
  new_event: 'sparkles',
  society_approved: 'shield-checkmark',
  committee_added: 'people',
};

export default function Notifications() {
  const c = useColors();
  const { user } = useAuth();
  const q = useQuery(() => api.listNotifications(), [user?.id]);
  // Remember what was unread when the screen opened, so the dots stay visible
  // while the person reads, even though everything is marked read right away.
  const unreadOnOpen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!q.data || unreadOnOpen.current) return;
    unreadOnOpen.current = new Set(q.data.filter((n) => !n.read_at).map((n) => n.id));
    if (unreadOnOpen.current.size) api.markAllNotificationsRead().then(invalidate, () => undefined);
  }, [q.data]);

  const sections = useMemo(() => {
    const today = todayHK();
    const all = q.data ?? [];
    return [
      { title: 'Today', data: all.filter((n) => hkDate(n.created_at) === today) },
      { title: 'Earlier', data: all.filter((n) => hkDate(n.created_at) !== today) },
    ].filter((s) => s.data.length);
  }, [q.data]);

  const open = (n: AppNotification) => {
    if (n.event_id) router.push(`/event/${n.event_id}`);
    else if (n.kind === 'committee_added' && n.society_id) router.push(`/manage/${n.society_id}`);
    else if (n.society_id) router.push(`/society/${n.society_id}`);
  };

  const remove = async (n: AppNotification) => {
    if (!(await confirmAsync('Delete notification?', n.title, 'Delete', true))) return;
    try {
      await api.deleteNotification(n.id);
      invalidate();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      {q.loading && !q.data ? (
        <ListSkeleton rows={5} />
      ) : q.error && !q.data ? (
        <ErrorView message={q.error} onRetry={q.refresh} />
      ) : (
        <SectionList
          style={{ backgroundColor: c.background }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="You're all caught up"
              body="We'll let you know when you get off a waitlist, an event you joined changes, or a society you follow posts something new."
            />
          }
          renderSectionHeader={({ section }) => <Text style={[styles.section, { color: c.textSecondary }]}>{section.title}</Text>}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          renderItem={({ item }) => {
            const unread = unreadOnOpen.current?.has(item.id) ?? !item.read_at;
            const tappable = !!(item.event_id || item.society_id);
            return (
              <Pressable
                onPress={tappable ? () => open(item) : undefined}
                onLongPress={() => remove(item)}
                accessibilityRole={tappable ? 'button' : undefined}
                accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.body}. ${formatAgo(item.created_at)}`}
                accessibilityHint="Long press to delete"
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.card }]}>
                <View style={[styles.icon, { backgroundColor: item.kind === 'event_cancelled' ? c.danger : c.tint }]}>
                  <Icon name={ICONS[item.kind]} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text style={[type.headline, { color: c.text, flex: 1 }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[type.footnote, { color: c.textSecondary }]}>{formatAgo(item.created_at)}</Text>
                  </View>
                  <Text style={[type.subhead, { color: c.textSecondary, lineHeight: 20 }]} numberOfLines={3}>
                    {item.body}
                  </Text>
                </View>
                {unread && <View style={[styles.dot, { backgroundColor: c.tint }]} />}
              </Pressable>
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { ...type.overline, marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
});
