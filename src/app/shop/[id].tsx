import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork, Button, ErrorView, Icon, InfoRow, Loading, Pill, SegmentedControl, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isSoldOut, membershipState, stockLeft } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatWhen } from '@/lib/format';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

/** A merch item: pick sizes and quantities, then order and pay the society directly. */
export default function ProductScreen() {
  const { id, societyId } = useLocalSearchParams<{ id: string; societyId: string }>();
  const c = useColors();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { user, requireSignIn } = useAuth();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [products, settings, memberships] = await Promise.all([
      api.listProducts(societyId),
      api.getPaymentSettings(societyId),
      api.myMemberships(),
    ]);
    const isMember = memberships.some((m) => m.society_id === societyId && membershipState(m, m.plan).key === 'active');
    return { product: products.find((p) => p.id === id) ?? null, settings, isMember };
  }, [id, societyId, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const p = q.data?.product;
  if (!p) return <ErrorView message={t('This item is not on sale')} />;

  const left = stockLeft(p);
  const oneSize = p.variants.length === 1 && p.variants[0].name === '';
  const memberPrice = q.data!.isMember && p.member_price_hkd != null;
  const unit = memberPrice ? p.member_price_hkd! : p.price_hkd;
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const now = new Date().toISOString();
  const notOpen = !!p.opens_at && now < p.opens_at;
  const closed = p.status !== 'published' || (!!p.closes_at && now > p.closes_at);
  const soldOut = isSoldOut(p);
  const methods: { value: PaymentMethod; label: string }[] = [
    ...(q.data?.settings?.fps_id ? [{ value: 'fps' as const, label: 'FPS 轉數快' }] : []),
    ...(q.data?.settings?.payme_link ? [{ value: 'payme' as const, label: 'PayMe' }] : []),
    { value: 'cash', label: t('Cash at pickup') },
  ];
  const chosen = method ?? methods[0].value;

  const change = (variant: string, delta: number) =>
    setQty((cur) => {
      const n = Math.max(0, (cur[variant] ?? 0) + delta);
      const cap = left[variant];
      if (delta > 0 && (count >= p.max_per_order || (cap != null && n > cap))) return cur;
      return { ...cur, [variant]: n };
    });

  const order = async () => {
    if (!requireSignIn()) return;
    setBusy(true);
    try {
      const o = await api.placeOrder(
        p.id,
        Object.entries(qty).map(([variant, n]) => ({ variant, qty: n })),
        chosen,
      );
      invalidate();
      router.replace(`/order/${o.id}`);
    } catch (e) {
      showAlert(t('Could not place order'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const hint = closed
    ? t('Orders have closed')
    : notOpen
      ? t('Orders open {when}', { when: formatWhen(p.opens_at!) })
      : soldOut
        ? t('Sold out')
        : count === 0
          ? oneSize
            ? t('Choose how many')
            : t('Choose a size')
          : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <Artwork seed={p.id} uri={p.image_url} category={p.society.category} style={{ height: 260 }} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text style={[textStyle('title1', lang), { color: c.text }]}>{p.title}</Text>
          <Pressable
            onPress={() => router.push(`/society/${p.society_id}`)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <SocietyAvatar name={p.society.name} uri={p.society.logo_url} category={p.society.category} size={28} />
            <Text style={{ color: c.textSecondary, fontSize: 15, flex: 1 }} numberOfLines={1}>
              {p.society.name}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: '700' }}>{formatHkd(unit)}</Text>
            {memberPrice && (
              <Text style={{ color: c.textSecondary, fontSize: 15, textDecorationLine: 'line-through' }}>{formatHkd(p.price_hkd)}</Text>
            )}
            {memberPrice ? (
              <Pill label={t('Member price')} tone="success" icon="card-outline" />
            ) : (
              p.member_price_hkd != null && <Pill label={t('Members {price}', { price: formatHkd(p.member_price_hkd) })} tone="brand" icon="card-outline" />
            )}
          </View>
          {!!p.description && <Text style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{p.description}</Text>}

          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{oneSize ? t('Quantity') : t('Sizes')}</Text>
            {p.variants.map((v) => {
              const n = qty[v.name] ?? 0;
              const l = left[v.name];
              const out = l === 0;
              return (
                <View key={v.name} style={[styles.variant, { backgroundColor: c.fill }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: out ? c.disabledText : c.text, fontSize: 16, fontWeight: '600' }}>{v.name || t('One size')}</Text>
                    <Text style={{ color: out ? c.dangerText : l != null && l <= 5 ? c.warningText : c.textSecondary, fontSize: 13 }}>
                      {out ? t('Sold out') : l == null ? t('Pre-order') : t('{n} left', { n: l })}
                    </Text>
                  </View>
                  <Stepper value={n} disabled={out || closed || notOpen} onChange={(d) => change(v.name, d)} label={v.name || t('One size')} />
                </View>
              );
            })}
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Up to {n} per order.', { n: p.max_per_order })}</Text>
          </View>

          <View style={{ marginTop: space.sm }}>
            {p.closes_at && <InfoRow icon="time-outline" title={t('Order by {when}', { when: formatWhen(p.closes_at) })} />}
            {p.pickup_note && <InfoRow icon="location-outline" title={t('Pickup')} sub={p.pickup_note} />}
            <InfoRow
              icon="shield-checkmark-outline"
              title={t('You pay the society directly')}
              sub={t('By FPS, PayMe or cash. Campus Social never holds your money.')}
            />
          </View>

          {!closed && !soldOut && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{t('How will you pay?')}</Text>
              <SegmentedControl options={methods} value={chosen} onChange={setMethod} />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.elevated, borderTopColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{formatHkd(count * unit)}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {hint ?? t('{n} items', { n: count })}
          </Text>
        </View>
        <Button
          title={t('Order')}
          icon="bag-handle-outline"
          loading={busy}
          disabled={!!hint}
          onPress={order}
          style={{ minWidth: 150 }}
        />
      </View>
    </View>
  );
}

function Stepper({ value, onChange, disabled, label }: { value: number; onChange: (delta: number) => void; disabled?: boolean; label: string }) {
  const c = useColors();
  const btn = (delta: number, icon: 'remove' | 'add') => (
    <Pressable
      onPress={() => onChange(delta)}
      disabled={disabled || (delta < 0 && value === 0)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? t('Add') : t('Remove')} ${label}`}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: c.card, opacity: disabled || (delta < 0 && value === 0) ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {btn(-1, 'remove')}
      <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {btn(1, 'add')}
    </View>
  );
}

const styles = StyleSheet.create({
  variant: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderRadius: radius.md, gap: space.md },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
