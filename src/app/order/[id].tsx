import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PaymentPanel } from '@/components/Payment';
import { ReceiptUpload } from '@/components/Receipt';
import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Icon, Loading, Pill, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isExpired, ORDER_QR_PREFIX, orderStatus } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatWhen } from '@/lib/format';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import { walletWithFallback } from '@/lib/ticketCache';
import type { OrderStatus } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

const STEPS: { key: OrderStatus[]; label: () => string }[] = [
  { key: ['awaiting_payment', 'payment_claimed'], label: () => t('Ordered') },
  { key: ['paid'], label: () => t('Paid') },
  { key: ['ready'], label: () => t('Ready') },
  { key: ['collected'], label: () => t('Collected') },
];

// Event tickets: no pickup, the QR in Tickets works once paid.
const TICKET_STEPS: { key: OrderStatus[]; label: () => string }[] = [
  { key: ['awaiting_payment'], label: () => t('Signed up') },
  { key: ['payment_claimed'], label: () => t('Payment to check') },
  { key: ['paid'], label: () => t('Paid') },
];

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const lang = useLang();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const q = useQuery(async () => {
    if (!user) return null;
    const wallet = await walletWithFallback(user.id, async () => {
      const [memberships, orders] = await Promise.all([api.myMemberships(), api.myOrders()]);
      return { memberships, orders };
    });
    const order = wallet.orders.find((o) => o.id === id) ?? null;
    const settings = order && !wallet.offline ? await api.getPaymentSettings(order.society_id) : null;
    return { order, settings, offline: wallet.offline };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const o = q.data?.order;
  if (!o) return <ErrorView message={t('Order not found')} />;

  const status = orderStatus(o);
  const expired = isExpired(o);
  const ticket = !!o.event_id;
  const steps = ticket ? TICKET_STEPS : STEPS;
  const stepIndex = steps.findIndex((s) => s.key.includes(o.status));
  const live = !['cancelled', 'refunded'].includes(o.status) && !expired;

  const claim = async () => {
    setBusy(true);
    try {
      await api.claimOrderPaid(o.id);
      invalidate();
      toast(t('Thanks! The treasurer will check and confirm.'));
    } catch (e) {
      showAlert(t('Could not update'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (
      !(await confirmAsync(
        ticket ? t('Give up your place?') : t('Cancel this order?'),
        ticket
          ? t('Your place goes to the next person on the waitlist. If you already paid, contact the society for a refund.')
          : t('If you already paid, contact the society for a refund.'),
        ticket ? t('Give up place') : t('Cancel order'),
        true,
      ))
    )
      return;
    try {
      await api.cancelMyOrder(o.id);
      invalidate();
      router.back();
    } catch (e) {
      showAlert(t('Could not cancel'), errorMessage(e));
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: o.ref }} />

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <SocietyAvatar name={o.society.name} uri={o.society.logo_url} category={o.society.category} size={28} />
          <Text style={{ color: c.textSecondary, fontSize: 15, flex: 1 }} numberOfLines={1}>
            {o.society.name}
          </Text>
        </View>
        <Text style={[textStyle('title1', lang), { color: c.text }]}>{o.product_title}</Text>
        <Pill label={status.label} tone={status.tone} />
      </View>

      {live && (
        <View style={styles.steps} accessibilityLabel={status.label}>
          {steps.map((s, i) => {
            const done = i <= stepIndex;
            return (
              <View key={i} style={{ flex: 1, gap: 6 }}>
                <View style={[styles.stepBar, { backgroundColor: done ? c.ink : c.fillStrong }]} />
                <Text style={{ color: done ? c.text : c.textTertiary, fontSize: 12, fontWeight: '600' }}>{s.label()}</Text>
              </View>
            );
          })}
        </View>
      )}

      {q.data?.offline && <Banner icon="cloud-done-outline" text={t('Offline. Showing the copy saved on this phone.')} />}
      {expired && (
        <Banner
          tone="warning"
          icon="time-outline"
          text={
            ticket
              ? t('This ticket was not paid in time, so the place is being given to someone else. Sign up again if there is still room.')
              : t('This order expired before it was paid, so the items were released. Order again if you still want them.')
          }
        />
      )}
      {o.status === 'payment_claimed' && (
        <Banner
          icon="hourglass-outline"
          text={t('Thanks! The treasurer will check your payment against the reference {ref}.', { ref: o.ref })}
        />
      )}

      {ticket && o.status === 'paid' && (
        <View style={[styles.pickup, { backgroundColor: c.card }]}>
          <Icon name="ticket" size={32} color={c.success} />
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{t('Paid. Your QR ticket is ready.')}</Text>
          <Button small variant="ink" icon="ticket-outline" title={t('Show ticket')} onPress={() => router.push(`/event/${o.event_id}`)} />
        </View>
      )}

      {!ticket && (o.status === 'paid' || o.status === 'ready') && (
        <View style={[styles.pickup, { backgroundColor: c.card }]}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>
            {o.status === 'ready' ? t('Ready for pickup') : t('Paid. We will tell you when it is ready.')}
          </Text>
          <View style={styles.qr} accessible accessibilityLabel={t('Pickup QR code. Show this to collect your order.')}>
            <QRCode value={ORDER_QR_PREFIX + o.pickup_code} size={180} backgroundColor="#fff" color="#0A0A0B" />
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Show this when you collect')}</Text>
        </View>
      )}

      {o.status === 'awaiting_payment' && !expired && (
        <View style={{ gap: space.md }}>
          <PaymentPanel settings={q.data?.settings ?? null} amount={o.total_hkd} reference={o.ref} method={o.payment_method} />
          {o.expires_at && (
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {ticket
                ? t('Pay by {when}, or your place goes to the next person.', { when: formatWhen(o.expires_at) })
                : t('Pay by {when}, or the items go back on sale.', { when: formatWhen(o.expires_at) })}
            </Text>
          )}
          {o.payment_method !== 'cash' && <Button title={t("I've paid")} icon="checkmark" loading={busy} onPress={claim} />}
        </View>
      )}

      {o.payment_method !== 'cash' &&
        (o.status === 'awaiting_payment' || o.status === 'payment_claimed') &&
        !expired &&
        !q.data?.offline && <ReceiptUpload kind="order" record={o} />}

      <View style={[styles.items, { backgroundColor: c.card }]}>
        {o.items.map((i, n) => (
          <View key={n} style={styles.itemRow}>
            <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>
              {ticket ? t('Ticket') : `${i.variant || t('One size')} × ${i.qty}`}
            </Text>
            <Text style={{ color: c.text, fontSize: 16, fontVariant: ['tabular-nums'] }}>{formatHkd(i.qty * i.unit_price)}</Text>
          </View>
        ))}
        <View style={[styles.itemRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: space.sm }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{t('Total')}</Text>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatHkd(o.total_hkd)}</Text>
        </View>
        {o.member_price && (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Icon name="card-outline" size={14} color={c.successText} />
            <Text style={{ color: c.successText, fontSize: 13 }}>{t('Member price applied')}</Text>
          </View>
        )}
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Ordered {when}', { when: formatWhen(o.created_at) })}</Text>
      </View>

      {(o.status === 'awaiting_payment' || o.status === 'payment_claimed') && !expired && (
        <Button variant="dangerText" title={ticket ? t('Give up my place') : t('Cancel order')} onPress={cancel} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: space.sm },
  stepBar: { height: 4, borderRadius: 2 },
  pickup: { alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  qr: { padding: 12, backgroundColor: '#fff', borderRadius: radius.md },
  items: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
});
