import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlotPicker, Stepper } from '@/components/ShopParts';
import { toast } from '@/components/Toast';
import { Artwork, Button, EmptyState, ErrorView, Field, Icon, Loading, SegmentedControl, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bagKey, clearBag, setBagQty, useBag } from '@/lib/bag';
import { checkBag, membershipState, slotState, unitPrice } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatWhen } from '@/lib/format';
import { payOnline } from '@/lib/payments';
import { radius, space, useColors } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

/**
 * Checkout for one society: everything in the bag becomes one order with one
 * payment reference and one pickup QR. Stock, prices and limits are checked
 * again here, so problems show before paying.
 */
export default function BagScreen() {
  // `fairId`: the bag for this society's booth at a fair (collected there, so no pickup time).
  const { societyId, fairId } = useLocalSearchParams<{ societyId: string; fairId?: string }>();
  const key = bagKey(societyId, fairId);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, requireSignIn } = useAuth();
  const lines = useBag(key);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [society, products, settings, slots, memberships, online, fair] = await Promise.all([
      api.getSociety(societyId),
      api.listProducts(societyId),
      api.getPaymentSettings(societyId),
      fairId ? Promise.resolve([]) : api.listPickupSlots(societyId).catch(() => []),
      api.myMemberships(),
      api.onlinePaymentsReady(societyId).catch(() => false),
      fairId ? api.getFair(fairId).catch(() => null) : Promise.resolve(null),
    ]);
    const isMember = memberships.some((m) => m.society_id === societyId && membershipState(m, m.plan).key === 'active');
    const booth = fair?.booths.find((b) => b.society_id === societyId && b.status === 'approved') ?? null;
    return { society, products, settings, slots: slots.filter((s) => slotState(s).key !== 'past'), isMember, online, fair, booth };
  }, [societyId, fairId, user?.id]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const d = q.data!;

  if (!lines.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center' }}>
        <EmptyState
          icon="bag-handle-outline"
          title={t('Your bag is empty')}
          body={t('Add items from the society’s shop. You pay once for everything in the bag.')}
          action={
            <Button
              variant="secondary"
              title={t('Back to the shop')}
              onPress={() => (fairId ? router.replace(`/fair/${fairId}`) : router.replace({ pathname: '/shop', params: { societyId } }))}
            />
          }
        />
      </View>
    );
  }

  const bag = checkBag(lines, d.products, d.isMember);
  const fullPrice = bag.rows
    .filter((r) => !r.problem && r.product)
    .reduce((n, r) => n + unitPrice(r.product!, r.line.variant, false) * r.line.qty, 0);
  const saved = fullPrice - bag.total;
  const methods: { value: PaymentMethod; label: string }[] = [
    ...(d.online ? [{ value: 'online' as const, label: t('Card / Alipay') }] : []),
    ...(d.settings?.fps_id ? [{ value: 'fps' as const, label: 'FPS 轉數快' }] : []),
    ...(d.settings?.payme_link ? [{ value: 'payme' as const, label: 'PayMe' }] : []),
  ];
  // Presale is paid ahead (on the day booths take cash as usual), unless the booth has no other way to be paid.
  if (!d.fair || !methods.length) methods.push({ value: 'cash', label: d.fair ? t('Cash at the booth') : t('Cash at pickup') });
  const chosenMethod = method ?? methods[0].value;
  const openSlots = d.slots.filter((s) => slotState(s).key === 'open');
  const chosenSlot = slotId && d.slots.some((s) => s.id === slotId) ? slotId : null;
  const pickupNotes = [...new Set(bag.rows.map((r) => r.product?.pickup_note).filter((n): n is string => !!n))];

  const hint = bag.hasProblems
    ? t('Fix the items marked in red first')
    : !d.fair && openSlots.length && !chosenSlot
      ? t('Choose a pickup time')
      : undefined;

  const removeUnavailable = () => {
    for (const r of bag.rows) {
      if (!r.problem) continue;
      setBagQty(key, r.line.product_id, r.line.variant, Math.min(r.line.qty, r.max));
    }
  };

  const place = async () => {
    if (!requireSignIn()) return;
    setBusy(true);
    try {
      const o = await api.placeBagOrder(societyId, lines, chosenMethod, d.fair ? null : chosenSlot, note);
      clearBag(key);
      invalidate();
      router.replace(`/order/${o.id}`);
      if (chosenMethod === 'online' && o.status === 'awaiting_payment') {
        // The order page offers "Pay now" again if this page is closed or fails.
        const paid = await payOnline(o.id).catch((e) => {
          showAlert(t('Could not open the payment page'), errorMessage(e));
          return false;
        });
        invalidate();
        if (paid) toast(t('Paid. We will tell you when it is ready.'));
      }
    } catch (e) {
      q.refresh();
      showAlert(t('Could not place order'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Your bag') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 170 }} keyboardShouldPersistTaps="handled">
        {d.society && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <SocietyAvatar name={d.society.name} uri={d.society.logo_url} category={d.society.category} size={28} />
            <Text style={{ color: c.textSecondary, fontSize: 15, flex: 1 }} numberOfLines={1}>
              {t('Paid to {name}', { name: d.settings?.payee_name ?? d.society.name })}
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: c.card }]}>
          {bag.rows.map((r, i) => {
            const p = r.product;
            const label = `${p?.title ?? ''}${r.line.variant ? ` ${r.line.variant}` : ''}`;
            return (
              <View
                key={`${r.line.product_id}|${r.line.variant}`}
                style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                <Pressable
                  onPress={() => p && router.push({ pathname: '/shop/[id]', params: { id: p.id, societyId } })}
                  accessibilityRole="button"
                  accessibilityLabel={label}>
                  <Artwork seed={r.line.product_id} uri={p?.image_url} category={p?.society.category} style={styles.thumb} />
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                    {p?.title ?? t('No longer on sale')}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                    {[r.line.variant || null, p ? formatHkd(r.unit) : null].filter(Boolean).join(' · ')}
                  </Text>
                  {r.problem && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="alert-circle" size={14} color={c.dangerText} />
                      <Text style={{ color: c.dangerText, fontSize: 13, fontWeight: '600' }}>{r.problem}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs }}>
                    <Stepper
                      value={r.line.qty}
                      max={r.problem ? r.line.qty : r.max}
                      onChange={(v) => setBagQty(key, r.line.product_id, r.line.variant, v)}
                      label={label}
                    />
                    <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {formatHkd(r.unit * r.line.qty)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          {bag.hasProblems && (
            <Button small variant="secondary" icon="construct-outline" title={t('Fix my bag')} onPress={removeUnavailable} />
          )}
        </View>

        {d.fair ? (
          <View style={{ gap: space.sm }}>
            <Text style={[styles.heading, { color: c.text }]}>{t('At the fair')}</Text>
            <View style={[styles.card, { backgroundColor: c.card, gap: 4 }]}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                {d.booth?.label ? t('Booth {booth}, {fair}', { booth: d.booth.label, fair: d.fair.name }) : d.fair.name}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {formatWhen(d.fair.starts_at, d.fair.ends_at)} · {d.fair.venue}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                {bag.vouchers
                  ? t('Show your order QR at the booth. Use your vouchers all at once or a few at a time.')
                  : t('Show your order QR at the booth to collect.')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Text style={[styles.heading, { color: c.text }]}>{t('Pickup time')}</Text>
            {d.slots.length ? (
              <>
                <SlotPicker slots={d.slots} value={chosenSlot} onChange={setSlotId} />
                <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  {t('You can change it later from your order. We’ll remind you an hour before.')}
                </Text>
              </>
            ) : (
              <View style={[styles.card, { backgroundColor: c.card }]}>
                <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>
                  {pickupNotes.length ? pickupNotes.join('\n') : t('The society will tell you when and where to collect.')}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <Text style={[styles.heading, { color: c.text }]}>{t('How will you pay?')}</Text>
          <SegmentedControl options={methods} value={chosenMethod} onChange={setMethod} />
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {chosenMethod === 'online'
              ? t(
                  'Pay now by card, Apple Pay, Google Pay, Alipay or WeChat Pay on a secure Stripe page. Your items are held for 30 minutes.',
                )
              : chosenMethod === 'cash'
                ? t('Bring the exact amount when you collect.')
                : t('Next you’ll see a QR with the amount and reference filled in. Pay within {n} hours or the items go back on sale.', {
                    n: bag.windowHours,
                  })}
          </Text>
        </View>

        <Field
          label={t('Note for the committee')}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          placeholder={t('Optional, e.g. collecting for a friend')}
        />

        <View style={[styles.card, { backgroundColor: c.card, gap: space.sm }]}>
          <View style={styles.sumRow}>
            <Text style={{ color: c.textSecondary, fontSize: 15, flex: 1 }}>{t('{n} items', { n: bag.count })}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 15, fontVariant: ['tabular-nums'] }}>{formatHkd(fullPrice)}</Text>
          </View>
          {saved > 0 && (
            <View style={styles.sumRow}>
              <Text style={{ color: c.successText, fontSize: 15, flex: 1 }}>{t('Member price')}</Text>
              <Text style={{ color: c.successText, fontSize: 15, fontVariant: ['tabular-nums'] }}>−{formatHkd(saved)}</Text>
            </View>
          )}
          <View style={[styles.sumRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: space.sm }]}>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{t('Total')}</Text>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatHkd(bag.total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.elevated, borderTopColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatHkd(bag.total)}</Text>
          <Text style={{ color: hint ? c.warningText : c.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {hint ?? t('One reference, one pickup QR')}
          </Text>
        </View>
        <Button
          title={chosenMethod === 'online' ? t('Pay now') : t('Place order')}
          icon={chosenMethod === 'online' ? 'lock-closed-outline' : 'checkmark'}
          loading={busy}
          disabled={!!hint}
          onPress={place}
          style={{ minWidth: 150 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg },
  line: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  heading: { fontSize: 17, fontWeight: '600' },
  sumRow: { flexDirection: 'row', alignItems: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
