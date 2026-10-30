import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { TicketCard, TicketStub } from '@/components/TicketCard';
import { EventRow } from '@/components/EventCard';
import { Banner, Button, EmptyState, ErrorView, Icon, PageHeader, UnderlineTabs } from '@/components/ui';
import { MemberCard, OrderRow } from '@/components/Wallet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isExpired } from '@/lib/commerce';
import { formatDay, formatTime } from '@/lib/format';
import { syncReminders } from '@/lib/notifications';
import type { Order } from '@/lib/types';
import { ticketsWithFallback, walletWithFallback } from '@/lib/ticketCache';
import { space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type Tab = 'upcoming' | 'saved' | 'cards' | 'orders' | 'past';

export default function Tickets() {
  const c = useColors();
  const { user, profile, savedIds } = useAuth();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'upcoming');
  useEffect(() => {
    // Opened from a notification ("Your member card is in Tickets").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.tab) setTab(params.tab);
  }, [params.tab]);

  const q = useQuery(async () => {
    if (!user) return null;
    const [tickets, wallet] = await Promise.all([
      ticketsWithFallback(user.id, () => api.myTickets()),
      walletWithFallback(user.id, async () => {
        const [memberships, orders] = await Promise.all([api.myMemberships(), api.myOrders()]);
        return { memberships, orders };
      }),
    ]);
    return { tickets, wallet };
  }, [user?.id]);
  const saved = useQuery(async () => (user && savedIds.length ? api.listEvents({ ids: savedIds }) : []), [user?.id, savedIds.join()]);
  const savedEvents = useMemo(() => {
    // Upcoming first, soonest first; then past ones.
    const now = new Date().toISOString();
    const xs = saved.data ?? [];
    return [...xs.filter((e) => e.ends_at >= now), ...xs.filter((e) => e.ends_at < now).reverse()];
  }, [saved.data]);
  const offline = !!q.data?.tickets.offline;
  const savedAt = q.data?.tickets.savedAt;

  // Tickets just loaded fresh from the server: a good moment to fix up reminders.
  useEffect(() => {
    if (q.data && !q.data.tickets.offline) syncReminders(q.data.tickets.tickets).catch(() => undefined);
  }, [q.data]);

  const { upcoming, past, cards, orders } = useMemo(() => {
    const now = new Date().toISOString();
    const all = q.data?.tickets.tickets ?? [];
    const allOrders = q.data?.wallet.orders ?? [];
    return {
      upcoming: all.filter((tk) => tk.event.ends_at >= now).sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at)),
      past: all.filter((tk) => tk.event.ends_at < now).sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at)),
      cards: q.data?.wallet.memberships ?? [],
      // Open orders first, then finished ones.
      orders: [...allOrders].sort((a, b) => Number(isDone(a)) - Number(isDone(b))),
    };
  }, [q.data]);

  if (!user) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ backgroundColor: c.backgroundPlain }}
        contentContainerStyle={{ flexGrow: 1 }}>
        <PageHeader title={t('Tickets')} />
        <EmptyState
          icon="ticket-outline"
          title={t('Your tickets live here')}
          body={t('Sign in with your CUHK email to register for events and get QR tickets.')}
          action={<Button title={t('Sign in')} onPress={() => router.push('/sign-in')} />}
        />
      </ScrollView>
    );
  }

  const openOrders = orders.filter((o) => !isDone(o)).length;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <PageHeader title={t('Tickets')} />
      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'upcoming', label: t('Upcoming'), count: upcoming.length },
          { value: 'saved', label: t('Saved events'), count: savedIds.length },
          { value: 'cards', label: t('Member cards'), count: cards.length },
          { value: 'orders', label: t('Orders'), count: openOrders },
          { value: 'past', label: t('Past') },
        ]}
      />
      {offline && savedAt ? (
        <View style={{ marginTop: space.md }}>
          <Banner
            icon="cloud-done-outline"
            text={t('Offline. Showing tickets saved {when}. QR codes still work at the door.', {
              when: `${formatDay(savedAt)} ${formatTime(savedAt)}`,
            })}
          />
        </View>
      ) : (
        (tab === 'upcoming' || tab === 'cards') &&
        (upcoming.length > 0 || cards.length > 0) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: space.lg, marginTop: space.md }}>
            <Icon name="cloud-done-outline" size={16} color={c.success} />
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Saved on this phone, works with no signal')}</Text>
          </View>
        )
      )}

      {q.loading && !q.data ? (
        <ListSkeleton rows={3} />
      ) : q.error && !q.data ? (
        <ErrorView message={q.error} onRetry={q.refresh} />
      ) : tab === 'upcoming' ? (
        upcoming.length ? (
          <View style={{ gap: space.md, marginTop: space.md }}>
            <TicketCard ticket={upcoming[0]} holder={profile?.display_name || user.email} />
            {upcoming.length > 1 && (
              <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', marginHorizontal: space.lg, marginTop: space.sm }}>
                {t('Later')}
              </Text>
            )}
            {/* Each stub opens its full ticket, which also works offline. */}
            {upcoming.slice(1).map((tk) => (
              <TicketStub key={tk.id} ticket={tk} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="ticket-outline"
            title={t('No upcoming tickets')}
            body={t('Find something fun on Discover and sign up in one tap.')}
            action={<Button title={t('Discover events')} onPress={() => router.navigate('/discover')} />}
          />
        )
      ) : tab === 'saved' ? (
        savedEvents.length ? (
          <View style={{ gap: 20, marginTop: space.lg }}>
            {savedEvents.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </View>
        ) : saved.loading ? (
          <ListSkeleton rows={2} />
        ) : (
          <EmptyState
            icon="heart-outline"
            title={t('Nothing saved yet')}
            body={t('Tap the heart on any event to keep it here for later. Saving doesn’t sign you up.')}
            action={<Button title={t('Discover events')} onPress={() => router.navigate('/discover')} />}
          />
        )
      ) : tab === 'cards' ? (
        cards.length ? (
          <View style={{ gap: space.md, marginTop: space.md }}>
            {cards.map((m) => (
              <MemberCard key={m.id} membership={m} onPress={() => router.push(`/membership/${m.id}`)} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="card-outline"
            title={t('No member cards yet')}
            body={t('Join a society from its page and your member card will be here, ready to show at events.')}
            action={<Button title={t('Browse societies')} onPress={() => router.navigate('/societies')} />}
          />
        )
      ) : tab === 'orders' ? (
        orders.length ? (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="bag-handle-outline"
            title={t('No orders yet')}
            body={t('Society merch you order shows up here with its payment and pickup QR.')}
          />
        )
      ) : past.length ? (
        <View style={{ gap: space.md, marginTop: space.md }}>
          {past.map((tk) => (
            <TicketStub key={tk.id} ticket={tk} />
          ))}
        </View>
      ) : (
        <EmptyState icon="time-outline" title={t('No past events yet')} />
      )}
    </ScrollView>
  );
}

function isDone(o: Pick<Order, 'status' | 'expires_at'>) {
  return ['collected', 'cancelled', 'refunded'].includes(o.status) || isExpired(o);
}
