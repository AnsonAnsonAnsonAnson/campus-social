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
import { space, textStyle, type, useColors } from '@/lib/theme';
import type { AppNotification, NotificationKind } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

const ICONS: Record<NotificationKind, IconName> = {
  waitlist_promoted: 'ticket',
  event_cancelled: 'close-circle',
  event_updated: 'time',
  new_event: 'sparkles',
  society_approved: 'shield-checkmark',
  committee_added: 'people',
  membership_active: 'card',
  membership_renewal: 'refresh',
  order_update: 'bag-handle',
  payment_settings_changed: 'warning',
};

/** The button under each message, as in the design. Same tap target as the row. */
const ACTIONS: Partial<Record<NotificationKind, string>> = {
  waitlist_promoted: 'View ticket',
  event_updated: 'View event',
  new_event: 'View event',
  membership_active: 'Show card',
  order_update: 'View order',
};

export default function Notifications() {
  const c = useColors();
  const lang = useLang();
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
      { title: t('Today'), data: all.filter((n) => hkDate(n.created_at) === today) },
      { title: t('Earlier'), data: all.filter((n) => hkDate(n.created_at) !== today) },
    ].filter((s) => s.data.length);
  }, [q.data]);

  const open = (n: AppNotification) => {
    if (n.event_id) router.push(`/event/${n.event_id}`);
    else if (n.kind === 'membership_active') router.navigate({ pathname: '/tickets', params: { tab: 'cards' } });
    else if (n.kind === 'order_update') router.navigate({ pathname: '/tickets', params: { tab: 'orders' } });
    else if (n.kind === 'payment_settings_changed' && n.society_id)
      router.push({ pathname: '/manage/payment-settings', params: { societyId: n.society_id } });
    else if (n.kind === 'committee_added' && n.society_id) router.push(`/manage/${n.society_id}`);
    else if (n.society_id) router.push(`/society/${n.society_id}`);
  };

  const remove = async (n: AppNotification) => {
    if (!(await confirmAsync(t('Delete notification?'), n.title, t('Delete'), true))) return;
    try {
      await api.deleteNotification(n.id);
      invalidate();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: '', headerShadowVisible: false, headerStyle: { backgroundColor: c.backgroundPlain } }} />
      {q.loading && !q.data ? (
        <ListSkeleton rows={5} />
      ) : q.error && !q.data ? (
        <ErrorView message={q.error} onRetry={q.refresh} />
      ) : (
        <SectionList
          style={{ backgroundColor: c.backgroundPlain }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <Text style={[textStyle('largeTitle', lang), styles.bigTitle, { color: c.text }]} accessibilityRole="header">
              {t('Inbox')}
            </Text>
          }
          refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title={t("You're all caught up")}
              body={t(
                'We’ll let you know when you get off a waitlist, an event you joined changes, or a society you follow posts something new.',
              )}
            />
          }
          renderSectionHeader={({ section }) => <Text style={[styles.section, { color: c.textSecondary }]}>{section.title}</Text>}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: c.border }]} />}
          renderItem={({ item }) => {
            const unread = unreadOnOpen.current?.has(item.id) ?? !item.read_at;
            const tappable = !!(item.event_id || item.society_id);
            return (
              <Pressable
                onPress={tappable ? () => open(item) : undefined}
                onLongPress={() => remove(item)}
                accessibilityRole={tappable ? 'button' : undefined}
                accessibilityLabel={`${unread ? t('Unread. ') : ''}${item.title}. ${item.body}. ${formatAgo(item.created_at)}`}
                accessibilityHint={t('Long press to delete')}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : 'transparent' }]}>
                <View style={[styles.icon, { backgroundColor: item.kind === 'event_cancelled' ? c.dangerSoft : c.tintSoft }]}>
                  <Icon name={ICONS[item.kind]} size={20} color={item.kind === 'event_cancelled' ? c.dangerText : c.tintText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text style={[type.headline, { color: c.text, flex: 1, fontWeight: unread ? '700' : '500' }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[type.footnote, { color: c.textSecondary }]}>{formatAgo(item.created_at)}</Text>
                  </View>
                  <Text style={[type.subhead, { color: c.textSecondary, lineHeight: 20 }]} numberOfLines={3}>
                    {item.body}
                  </Text>
                  {ACTIONS[item.kind] && tappable && (
                    <View style={[styles.action, { backgroundColor: item.kind === 'waitlist_promoted' ? c.ink : c.fill }]}>
                      <Text style={{ color: item.kind === 'waitlist_promoted' ? c.onInk : c.text, fontSize: 14, fontWeight: '600' }}>
                        {t(ACTIONS[item.kind]!)}
                      </Text>
                    </View>
                  )}
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
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 40 + space.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  bigTitle: { marginHorizontal: space.lg, marginTop: space.xs },
  action: { alignSelf: 'flex-start', marginTop: space.sm, paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center' },
});
