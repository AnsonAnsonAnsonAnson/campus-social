import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ReceiptButton } from '@/components/Receipt';
import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { Button, Chip, ChipRow, EmptyState, ErrorView, Icon, InfoRow, Pill, Sheet } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { isExpired, itemCount, itemsSummary, methodLabel, orderStatus, productionSummary, toCsv } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatDay, formatTime, todayHK } from '@/lib/format';
import { shareCsv } from '@/lib/shareFile';
import { radius, space, useColors } from '@/lib/theme';
import type { OrderStatus, PickupSlot, SocietyOrder } from '@/lib/types';
import { slotWhen } from '@/components/ShopParts';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type Filter = 'check' | 'unpaid' | 'handout' | 'done' | 'all' | 'summary' | 'picklist';
type Change = Exclude<OrderStatus, 'payment_claimed'>;

/** Orders someone still has to collect: paid, ready, or cash to take at the desk. */
const toCollect = (o: SocietyOrder) =>
  !o.event_id &&
  !isExpired(o) &&
  (['paid', 'ready'].includes(o.status) || (o.status === 'awaiting_payment' && o.payment_method === 'cash'));

function bucket(o: SocietyOrder): Exclude<Filter, 'all' | 'summary' | 'picklist'> {
  if (isExpired(o)) return 'done';
  if (o.status === 'payment_claimed') return 'check';
  if (o.status === 'awaiting_payment') return 'unpaid';
  // Tickets are checked in at the event, so a paid ticket is done here.
  if ((o.status === 'paid' && !o.event_id) || o.status === 'ready') return 'handout';
  return 'done';
}

export default function Orders() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const [filter, setFilter] = useState<Filter>('check');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<SocietyOrder | null>(null);
  const [slotFilter, setSlotFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [orders, mine, slots] = await Promise.all([
      api.listOrders(societyId),
      api.mySocieties(),
      api.listPickupSlots(societyId).catch(() => [] as PickupSlot[]),
    ]);
    const society = mine.find((s) => s.id === societyId);
    return { orders, society, slots, isAdmin: !!society && society.role !== 'editor' };
  }, [societyId]);

  const orders = useMemo(() => q.data?.orders ?? [], [q.data]);
  const counts = useMemo(() => {
    const n: Record<string, number> = { check: 0, unpaid: 0, handout: 0, done: 0 };
    for (const o of orders) n[bucket(o)]++;
    return n;
  }, [orders]);

  const slots = useMemo(() => q.data?.slots ?? [], [q.data]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  // Pick list: the first upcoming time with orders, unless one was picked.
  const pickSlot =
    slotFilter ??
    slots.find((s) => s.ends_at > new Date().toISOString() && orders.some((o) => o.pickup_slot_id === s.id && toCollect(o)))?.id ??
    '';

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (filter === 'picklist') {
      return orders
        .filter((o) => toCollect(o) && (o.pickup_slot_id ?? '') === pickSlot)
        .filter((o) => !needle || [o.ref, o.buyer_name].some((v) => v.toLowerCase().includes(needle)))
        .sort((a, b) => a.ref.localeCompare(b.ref));
    }
    return orders
      .filter((o) => filter === 'all' || bucket(o) === filter)
      .filter((o) => !needle || [o.ref, o.buyer_name, o.buyer_email, o.product_title].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => (a.claimed_at ?? a.created_at).localeCompare(b.claimed_at ?? b.created_at));
  }, [orders, filter, search, pickSlot]);

  const summary = useMemo(() => productionSummary(orders), [orders]);

  const change = async (ids: string[], status: Change, done: string) => {
    setBusy(true);
    try {
      await api.setOrderStatus(ids, status);
      invalidate();
      setOpen(null);
      toast(done);
      q.refresh();
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bulkPaid = async () => {
    // Online orders are confirmed by the payment provider, never by hand.
    const ids = visible.filter((o) => o.payment_method !== 'online').map((o) => o.id);
    if (!ids.length) return;
    const ok = await confirmAsync(
      t('Mark {n} orders paid?', { n: ids.length }),
      t('Only do this for payments you can see in your bank or PayMe app.'),
      t('Mark paid'),
    );
    if (ok) change(ids, 'paid', t('{n} orders marked paid', { n: ids.length }));
  };

  const refund = async (o: SocietyOrder) => {
    const fee = o.platform_fee_hkd ?? 0;
    const ok = await confirmAsync(
      t('Refund {amount} to the buyer?', { amount: formatHkd(o.total_hkd) }),
      t('The money goes back to their card or wallet and is taken from your next payout. The {fee} fee is not returned.', {
        fee: formatHkd(fee),
      }),
      t('Refund'),
      true,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.refundOnlineOrder(o.id);
      invalidate();
      setOpen(null);
      toast(t('{ref} refunded', { ref: o.ref }));
      q.refresh();
    } catch (e) {
      showAlert(t('Could not refund'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bulkReady = async () => {
    const ids = visible.filter((o) => o.status === 'paid').map((o) => o.id);
    const ok = await confirmAsync(
      t('Tell {n} buyers their order is ready?', { n: ids.length }),
      t('Each buyer gets a notification to come and collect.'),
      t('Ready for pickup'),
    );
    if (ok) change(ids, 'ready', t('{n} buyers told', { n: ids.length }));
  };

  const exportCsv = async () => {
    const rows = [
      [
        t('Ref'),
        t('Name'),
        t('Email'),
        t('Product'),
        t('Items'),
        t('Pickup time'),
        t('Total'),
        t('Method'),
        t('Platform fee'),
        t('Status'),
        t('Ordered'),
        t('Paid'),
      ],
      ...(filter === 'picklist' ? visible : orders).map((o) => [
        o.ref,
        o.buyer_name,
        o.buyer_email,
        o.product_title,
        itemsSummary(o.items),
        o.pickup_slot_id && slotById.get(o.pickup_slot_id)
          ? `${slotWhen(slotById.get(o.pickup_slot_id)!)} ${slotById.get(o.pickup_slot_id)!.location}`
          : '',
        o.total_hkd,
        methodLabel(o.payment_method),
        o.platform_fee_hkd ?? '',
        orderStatus(o).label,
        o.created_at.slice(0, 10),
        o.paid_at?.slice(0, 10) ?? '',
      ]),
    ];
    const name = (q.data?.society?.short_name ?? q.data?.society?.name ?? 'shop').replace(/[^\w-]+/g, '-');
    try {
      await shareCsv(`${name}-orders-${todayHK()}.csv`, toCsv(rows));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  if (q.loading && !q.data) return <ListSkeleton rows={6} />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const isAdmin = q.data!.isAdmin;
  const readyable = visible.filter((o) => o.status === 'paid').length;
  const bulk =
    filter === 'check' && isAdmin && visible.length > 1 ? (
      <Button variant="ink" icon="checkmark-done" loading={busy} title={t('Mark all {n} paid', { n: visible.length })} onPress={bulkPaid} />
    ) : filter === 'handout' && readyable > 1 ? (
      <Button
        variant="ink"
        icon="notifications-outline"
        loading={busy}
        title={t('Tell {n} buyers it’s ready', { n: readyable })}
        onPress={bulkReady}
      />
    ) : null;

  const chip = (f: Filter, label: string, n?: number) => (
    <Chip key={f} label={n ? `${label} ${n}` : label} selected={filter === f} onPress={() => setFilter(f)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen
        options={{
          title: t('Orders'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {isAdmin && (
                <Pressable
                  onPress={() => router.push({ pathname: '/manage/match', params: { societyId } })}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('Match bank statement')}
                  style={styles.headerButton}>
                  <Icon name="git-compare-outline" size={22} color={c.tint} />
                </Pressable>
              )}
              <Pressable
                onPress={exportCsv}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('Export orders')}
                style={styles.headerButton}>
                <Icon name="download-outline" size={22} color={c.tint} />
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        data={filter === 'summary' ? [] : visible}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
        contentContainerStyle={{ paddingBottom: bulk ? 120 : 40, flexGrow: 1 }}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ gap: space.sm, paddingTop: space.md, paddingBottom: space.sm }}>
            {filter !== 'summary' && (
              <View style={[styles.search, { backgroundColor: c.fill }]}>
                <Icon name="search" size={18} color={c.textSecondary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('Ref, name or email')}
                  placeholderTextColor={c.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  accessibilityLabel={t('Search orders')}
                  style={[styles.searchInput, { color: c.text }]}
                />
              </View>
            )}
            <ChipRow>
              {chip('check', t('To check'), counts.check)}
              {chip('unpaid', t('Not paid'), counts.unpaid)}
              {chip('handout', t('To hand out'), counts.handout)}
              {chip('done', t('Done'))}
              {chip('all', t('All'))}
              {chip('picklist', t('Pick list'))}
              {chip('summary', t('Totals'))}
            </ChipRow>
            {filter === 'picklist' && (
              <>
                <ChipRow>
                  {slots
                    .filter((s) => s.ends_at > new Date(new Date().getTime() - 86400_000).toISOString())
                    .map((s) => (
                      <Chip
                        key={s.id}
                        icon="calendar-outline"
                        label={slotWhen(s)}
                        selected={pickSlot === s.id}
                        onPress={() => setSlotFilter(s.id)}
                      />
                    ))}
                  <Chip label={t('No time booked')} selected={pickSlot === ''} onPress={() => setSlotFilter('')} />
                </ChipRow>
                <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginHorizontal: space.lg }}>
                  {pickSlot && slotById.get(pickSlot)
                    ? t('{n} orders, {units} items to pack for {where}. Sorted by ref, so label bags with it.', {
                        n: visible.length,
                        units: visible.reduce((n, o) => n + itemCount(o.items), 0),
                        where: slotById.get(pickSlot)!.location,
                      })
                    : t('Paid orders with no pickup time booked.')}
                </Text>
              </>
            )}
            {filter === 'summary' && <Summary summary={summary} />}
          </View>
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: c.border }]} />}
        renderItem={({ item: o }) => {
          const st = orderStatus(o);
          return (
            <Pressable
              onPress={() => setOpen(o)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : 'transparent' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{o.ref}</Text>
                  <Text style={{ color: c.text, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
                    {o.buyer_name}
                  </Text>
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={filter === 'picklist' ? 3 : 1}>
                  {o.event_id
                    ? `${t('Ticket')} · ${o.product_title}`
                    : o.items.some((i) => i.title) && new Set(o.items.map((i) => i.title)).size > 1
                      ? itemsSummary(o.items)
                      : `${o.product_title} · ${itemsSummary(o.items)}`}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                  {formatHkd(o.total_hkd)} · {methodLabel(o.payment_method)}
                  {o.member_price ? ` · ${t('Member price')}` : ''}
                </Text>
                {!!o.receipt_path && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="image-outline" size={14} color={c.infoText} />
                    <Text style={{ color: c.infoText, fontSize: 13 }}>{t('Screenshot attached')}</Text>
                  </View>
                )}
              </View>
              <Pill label={st.label} tone={st.tone} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          filter === 'summary' ? undefined : (
            <EmptyState
              icon={filter === 'check' ? 'checkmark-done-outline' : 'receipt-outline'}
              title={search ? t('No orders match “{q}”', { q: search }) : filter === 'check' ? t('All caught up') : t('No orders here')}
              body={
                filter === 'check' && !search ? t('When a buyer taps “I’ve paid”, their order shows up here for you to check.') : undefined
              }
            />
          )
        }
      />
      {bulk && <View style={[styles.bulk, { backgroundColor: c.backgroundPlain, borderTopColor: c.border }]}>{bulk}</View>}
      <OrderSheet
        order={open}
        slot={open?.pickup_slot_id ? (slotById.get(open.pickup_slot_id) ?? null) : null}
        isAdmin={isAdmin}
        busy={busy}
        onClose={() => setOpen(null)}
        onChange={change}
        onRefund={refund}
      />
    </View>
  );
}

function Summary({ summary }: { summary: ReturnType<typeof productionSummary> }) {
  const c = useColors();
  if (!summary.length) return <EmptyState icon="stats-chart-outline" title={t('No orders yet')} />;
  return (
    <View style={{ gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm }}>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {t('Units in live orders, paid or not. Use this for your supplier order.')}
      </Text>
      {summary.map((p) => (
        <View key={p.title} style={[styles.summaryCard, { backgroundColor: c.card }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{p.title}</Text>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{p.total}</Text>
          </View>
          {p.variants.map((v) => (
            <View key={v.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: c.textSecondary, fontSize: 15 }}>{v.name || t('One size')}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 15, fontVariant: ['tabular-nums'] }}>{v.qty}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function OrderSheet({
  order: o,
  slot,
  isAdmin,
  busy,
  onClose,
  onChange,
  onRefund,
}: {
  order: SocietyOrder | null;
  slot: PickupSlot | null;
  isAdmin: boolean;
  busy: boolean;
  onClose: () => void;
  onChange: (ids: string[], status: Change, done: string) => void;
  onRefund: (o: SocietyOrder) => void;
}) {
  const c = useColors();
  if (!o)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const st = orderStatus(o);
  const expired = isExpired(o);
  const online = o.payment_method === 'online';
  const paidOnline = online && ['paid', 'ready', 'collected'].includes(o.status);
  const confirmThen = async (title: string, body: string, action: string, status: Change, done: string) => {
    if (await confirmAsync(title, body, action, true)) onChange([o.id], status, done);
  };
  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: space.md, paddingHorizontal: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{o.ref}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 14 }} numberOfLines={1}>
              {o.buyer_name} · {o.buyer_email}
            </Text>
          </View>
          <Pill label={st.label} tone={st.tone} />
        </View>
        <View style={{ gap: space.sm }}>
          <InfoRow
            icon={o.event_id ? 'ticket-outline' : 'bag-handle-outline'}
            title={o.product_title}
            sub={o.event_id ? t('Event ticket') : itemsSummary(o.items)}
          />
          <InfoRow
            icon="cash-outline"
            title={`${formatHkd(o.total_hkd)} · ${methodLabel(o.payment_method)}`}
            sub={
              paidOnline && o.paid_at
                ? t('Paid online {date}. You receive {net} after the {fee} fee.', {
                    date: `${formatDay(o.paid_at)} ${formatTime(o.paid_at)}`,
                    net: formatHkd(o.total_hkd - (o.platform_fee_hkd ?? 0)),
                    fee: formatHkd(o.platform_fee_hkd ?? 0),
                  })
                : o.paid_at
                  ? t('Paid {date}', { date: `${formatDay(o.paid_at)} ${formatTime(o.paid_at)}` })
                  : o.claimed_at
                    ? t('Buyer says they paid {date}. Look for {ref} in your account.', {
                        date: `${formatDay(o.claimed_at)} ${formatTime(o.claimed_at)}`,
                        ref: o.ref,
                      })
                    : o.expires_at && !expired
                      ? t('Pay by {date}', { date: `${formatDay(o.expires_at)} ${formatTime(o.expires_at)}` })
                      : undefined
            }
            subColor={o.claimed_at && !o.paid_at ? c.infoText : undefined}
          />
          {slot && <InfoRow icon="calendar-outline" title={slotWhen(slot)} sub={slot.location} />}
          {o.buyer_note && <InfoRow icon="chatbubble-ellipses-outline" title={o.buyer_note} sub={t('Note from buyer')} />}
        </View>
        {isAdmin && <ReceiptButton path={o.receipt_path} at={o.receipt_at} />}

        <View style={{ gap: space.sm }}>
          {isAdmin && !online && (o.status === 'payment_claimed' || (o.status === 'awaiting_payment' && !expired)) && (
            <Button
              variant="ink"
              icon="checkmark"
              loading={busy}
              title={t('Mark paid')}
              onPress={() => onChange([o.id], 'paid', t('{ref} marked paid', { ref: o.ref }))}
            />
          )}
          {isAdmin && o.status === 'payment_claimed' && (
            <Button
              variant="secondary"
              title={t('Payment not received')}
              disabled={busy}
              onPress={() => onChange([o.id], 'awaiting_payment', t('Buyer asked to check their payment'))}
            />
          )}
          {o.status === 'paid' && !o.event_id && (
            <Button
              variant="secondary"
              icon="notifications-outline"
              title={t('Ready for pickup')}
              disabled={busy}
              onPress={() => onChange([o.id], 'ready', t('Buyer told'))}
            />
          )}
          {!o.event_id && (o.status === 'paid' || o.status === 'ready') && (
            <Button
              variant="secondary"
              icon="hand-left-outline"
              title={t('Mark collected')}
              disabled={busy}
              onPress={() => onChange([o.id], 'collected', t('Collected'))}
            />
          )}
          {isAdmin && !paidOnline && ['awaiting_payment', 'payment_claimed', 'paid', 'ready'].includes(o.status) && !expired && (
            <Button
              variant="destructive"
              title={t('Cancel order')}
              disabled={busy}
              onPress={() =>
                confirmThen(
                  t('Cancel {ref}?', { ref: o.ref }),
                  o.paid_at
                    ? t('This order was paid. Refund the buyer yourself, then mark it refunded.')
                    : o.event_id
                      ? t('The buyer is told and their place goes to the next person on the waitlist.')
                      : t('The buyer is told and the stock goes back on sale.'),
                  t('Cancel order'),
                  'cancelled',
                  t('Order cancelled'),
                )
              }
            />
          )}
          {isAdmin && paidOnline && (
            <Button
              variant="destructive"
              icon="arrow-undo-outline"
              title={t('Refund {amount}', { amount: formatHkd(o.total_hkd) })}
              disabled={busy}
              onPress={() => onRefund(o)}
            />
          )}
          {online && o.status === 'awaiting_payment' && !expired && (
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('The buyer is paying online. It is marked paid as soon as the payment goes through.')}
            </Text>
          )}
          {isAdmin && !online && ['paid', 'ready', 'collected'].includes(o.status) && (
            <Button
              variant="plain"
              title={t('Mark refunded')}
              disabled={busy}
              onPress={() =>
                confirmThen(
                  t('Mark {ref} refunded?', { ref: o.ref }),
                  t('Only after you’ve sent the money back. The app doesn’t move money.'),
                  t('Mark refunded'),
                  'refunded',
                  t('Marked refunded'),
                )
              }
            />
          )}
          {!isAdmin && (o.status === 'payment_claimed' || o.status === 'awaiting_payment') && (
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Only society admins can confirm payments.')}</Text>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
  },
  searchInput: { flex: 1, fontSize: 16, height: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  bulk: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryCard: { borderRadius: radius.lg, padding: space.lg, gap: 6 },
});
