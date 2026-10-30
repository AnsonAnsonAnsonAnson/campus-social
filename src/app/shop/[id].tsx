import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoalMeter, SizeChart, slotWhen, Stepper } from '@/components/ShopParts';
import { toast } from '@/components/Toast';
import { Artwork, Banner, Button, ErrorView, Icon, InfoRow, Loading, Pill, Sheet, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addToBag, bagCount, bagKey, useBag } from '@/lib/bag';
import { fairState, membershipState, priceRange, saleState, slotState, stockLeft, unitPrice, unitsOrdered } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatWhen } from '@/lib/format';
import { hasDropReminder, notificationsSupported, setDropReminder } from '@/lib/notifications';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

/** A merch item: photos, sizes with stock, size guide, then add to the society's bag. */
export default function ProductScreen() {
  const { id, societyId } = useLocalSearchParams<{ id: string; societyId: string }>();
  const c = useColors();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, requireSignIn } = useAuth();
  const [variant, setVariant] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [guide, setGuide] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [products, memberships, slots] = await Promise.all([
      api.listProducts(societyId),
      api.myMemberships(),
      api.listPickupSlots(societyId).catch(() => []),
    ]);
    const isMember = memberships.some((m) => m.society_id === societyId && membershipState(m, m.plan).key === 'active');
    const product = products.find((p) => p.id === id) ?? null;
    // Fair presale: collected at the booth, so the fair's dates and booth number matter more than pickup times.
    const fair = product?.fair_id ? await api.getFair(product.fair_id).catch(() => null) : null;
    return { product, isMember, slots, fair };
  }, [id, societyId, user?.id]);
  const key = bagKey(societyId, q.data?.product?.fair_id);
  const bag = useBag(key);

  const p = q.data?.product;
  useEffect(() => {
    if (p?.opens_at) hasDropReminder(p.id).then(setReminder, () => undefined);
  }, [p?.id, p?.opens_at]);

  const photos = useMemo(() => (p ? [p.image_url, ...p.images].filter((u): u is string => !!u) : []), [p]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  if (!p) return <ErrorView message={t('This item is not on sale')} />;

  const member = q.data!.isMember;
  const left = stockLeft(p);
  const oneSize = p.variants.length === 1 && p.variants[0].name === '';
  const chosen = oneSize ? '' : variant;
  const state = saleState(p);
  const canBuy = state === 'open';
  const range = priceRange(p, member);
  const memberPrice = member && p.member_price_hkd != null;
  const unit = chosen != null ? unitPrice(p, chosen, member) : range.min;
  const inBag = bag.filter((l) => l.product_id === p.id).reduce((n, l) => n + l.qty, 0);
  const inBagThisSize = chosen != null ? (bag.find((l) => l.product_id === p.id && l.variant === chosen)?.qty ?? 0) : 0;
  const sizeLeft = chosen != null ? left[chosen] : null;
  const limit = Math.min(p.max_per_order, p.max_per_buyer ?? Infinity);
  const max = Math.max(0, Math.min(limit - inBag, sizeLeft == null ? Infinity : sizeLeft - inBagThisSize));
  const upcomingSlots = (q.data!.slots ?? []).filter((s) => slotState(s).key !== 'past');
  const n = bagCount(bag);
  const fair = q.data!.fair;
  const booth = fair?.booths.find((b) => b.society_id === p.society_id && b.status === 'approved') ?? null;
  const presaleOver = !!fair && !fairState(fair).presaleOpen;
  const voucher = p.kind === 'voucher';

  const hint = presaleOver
    ? t('Presale for this fair has closed')
    : state === 'closed'
      ? t('Orders have closed')
      : state === 'upcoming'
        ? t('Orders open {when}', { when: formatWhen(p.opens_at!) })
        : state === 'sold_out'
          ? t('Sold out')
          : chosen == null
            ? t('Choose a size')
            : max === 0
              ? inBag
                ? t('Already in your bag')
                : t('Sold out')
              : undefined;

  const add = () => {
    if (chosen == null) return;
    addToBag(key, { product_id: p.id, variant: chosen, qty: Math.min(qty, max) });
    setQty(1);
    toast(t('Added to bag'), { icon: 'bag-check-outline' });
  };

  const toggleAlert = async () => {
    if (!requireSignIn()) return;
    setBusy(true);
    try {
      await api.setProductAlert(p.id, !p.alert);
      invalidate();
      toast(p.alert ? t('Alert turned off') : t('We’ll tell you when it’s back'), { icon: 'notifications-outline' });
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleReminder = async () => {
    const ok = await setDropReminder(p, !reminder);
    if (!ok) {
      showAlert(t('Turn on notifications'), t('Allow notifications for Campus Social in Settings to get a reminder.'));
      return;
    }
    setReminder(!reminder);
    toast(reminder ? t('Reminder removed') : t('We’ll remind you when orders open'), { icon: 'alarm-outline' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {photos.length > 1 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / width))}
              accessibilityLabel={t('Photos')}>
              {photos.map((uri, i) => (
                <Artwork key={i} seed={p.id + i} uri={uri} category={p.society.category} style={{ width, height: width * 0.9 }} />
              ))}
            </ScrollView>
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === photo ? '#fff' : 'rgba(255,255,255,0.5)' }]} />
              ))}
            </View>
          </View>
        ) : (
          <Artwork seed={p.id} uri={photos[0]} category={p.society.category} style={{ height: Math.min(width * 0.9, 380) }} />
        )}

        <View style={{ padding: space.lg, gap: space.md }}>
          <Pressable
            onPress={() => router.push(`/society/${p.society_id}`)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <SocietyAvatar name={p.society.name} uri={p.society.logo_url} category={p.society.category} size={24} />
            <Text style={{ color: c.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {p.society.name}
            </Text>
          </Pressable>
          <Text style={[textStyle('title1', lang), { color: c.text }]}>{p.title}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {chosen == null && range.max > range.min ? `${formatHkd(range.min)}–${formatHkd(range.max)}` : formatHkd(unit)}
            </Text>
            {memberPrice && (
              <Text style={{ color: c.textSecondary, fontSize: 15, textDecorationLine: 'line-through' }}>
                {formatHkd(chosen != null ? unitPrice(p, chosen, false) : p.price_hkd)}
              </Text>
            )}
            {voucher && <Pill label={t('Food voucher')} tone="ink" icon="fast-food-outline" />}
            {voucher && p.voucher_value_hkd != null && p.voucher_value_hkd > p.price_hkd && (
              <Pill label={t('Worth {price}', { price: formatHkd(p.voucher_value_hkd) })} tone="success" />
            )}
            {memberPrice ? (
              <Pill label={t('Member price')} tone="success" icon="card-outline" />
            ) : (
              p.member_price_hkd != null && (
                <Pill label={t('Members {price}', { price: formatHkd(p.member_price_hkd) })} tone="brand" icon="card-outline" />
              )
            )}
          </View>

          {state === 'upcoming' && (
            <View style={[styles.notice, { backgroundColor: c.accentSoft }]}>
              <Icon name="alarm-outline" size={20} color={c.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                  {t('Orders open {when}', { when: formatWhen(p.opens_at!) })}
                </Text>
                {p.max_per_buyer != null && (
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Limit {n} per person.', { n: p.max_per_buyer })}</Text>
                )}
              </View>
              {notificationsSupported && (
                <Button
                  small
                  variant={reminder ? 'secondary' : 'ink'}
                  icon={reminder ? 'checkmark' : 'notifications-outline'}
                  title={reminder ? t('Reminder set') : t('Remind me')}
                  onPress={toggleReminder}
                />
              )}
            </View>
          )}
          {state === 'sold_out' && (
            <View style={[styles.notice, { backgroundColor: c.fill }]}>
              <Icon name="notifications-outline" size={20} color={c.text} />
              <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>
                {p.alert ? t('We’ll tell you if more are added.') : t('Sold out. Get a notification if more are added.')}
              </Text>
              <Button
                small
                variant={p.alert ? 'secondary' : 'ink'}
                loading={busy}
                title={p.alert ? t('Turn off') : t('Notify me')}
                onPress={toggleAlert}
              />
            </View>
          )}
          {state === 'closed' && <Banner icon="lock-closed-outline" text={t('Orders have closed')} />}

          <GoalMeter ordered={unitsOrdered(p)} goal={p.goal_qty} readyOn={p.ready_on} />

          {!!p.description && <Text style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{p.description}</Text>}

          {!oneSize && (
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', flex: 1 }}>{t('Size')}</Text>
                {!!p.size_chart && (
                  <Pressable onPress={() => setGuide(true)} hitSlop={8} accessibilityRole="button" style={styles.guideLink}>
                    <Icon name="resize-outline" size={16} color={c.tintText} />
                    <Text style={{ color: c.tintText, fontSize: 15, fontWeight: '600' }}>{t('Size guide')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.sizes}>
                {p.variants.map((v) => {
                  const l = left[v.name];
                  const out = l === 0;
                  const selected = variant === v.name;
                  const extra = v.extra_hkd ?? 0;
                  return (
                    <Pressable
                      key={v.name}
                      onPress={() => {
                        setVariant(v.name);
                        setQty(1);
                      }}
                      disabled={out || !canBuy}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: out || !canBuy }}
                      accessibilityLabel={`${v.name}${out ? `, ${t('Sold out')}` : ''}`}
                      style={({ pressed }) => [
                        styles.size,
                        {
                          backgroundColor: selected ? c.ink : c.card,
                          borderColor: selected ? c.ink : c.border,
                          opacity: out ? 0.45 : pressed ? 0.8 : 1,
                        },
                      ]}>
                      <Text
                        style={{
                          color: selected ? c.onInk : out ? c.disabledText : c.text,
                          fontSize: 16,
                          fontWeight: '600',
                          textDecorationLine: out ? 'line-through' : 'none',
                        }}>
                        {v.name}
                      </Text>
                      <Text
                        style={{
                          color: selected ? c.onInk : out ? c.disabledText : l != null && l <= 5 ? c.warningText : c.textSecondary,
                          fontSize: 11,
                        }}>
                        {out
                          ? t('Sold out')
                          : l != null && l <= 5
                            ? t('{n} left', { n: l })
                            : extra
                              ? `+${formatHkd(extra)}`
                              : l == null
                                ? t('Pre-order')
                                : ' '}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {canBuy && (
            <View style={styles.qtyRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{t('Quantity')}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                  {oneSize && sizeLeft != null && sizeLeft <= 10
                    ? t('{n} left', { n: sizeLeft })
                    : p.max_per_buyer != null
                      ? t('Limit {n} per person.', { n: p.max_per_buyer })
                      : t('Up to {n} per order.', { n: p.max_per_order })}
                </Text>
              </View>
              <Stepper
                value={Math.min(qty, Math.max(max, 1))}
                max={max}
                disabled={max === 0}
                onChange={(v) => setQty(Math.max(1, v))}
                label={p.title}
              />
            </View>
          )}

          <View style={{ marginTop: space.sm }}>
            {p.closes_at && state !== 'closed' && (
              <InfoRow icon="time-outline" title={t('Order by {when}', { when: formatWhen(p.closes_at) })} />
            )}
            {fair ? (
              <InfoRow
                icon="storefront-outline"
                title={
                  booth?.label
                    ? voucher
                      ? t('Use at booth {booth}, {fair}', { booth: booth.label, fair: fair.name })
                      : t('Collect at booth {booth}, {fair}', { booth: booth.label, fair: fair.name })
                    : voucher
                      ? t('Use at the booth, {fair}', { fair: fair.name })
                      : t('Collect at the booth, {fair}', { fair: fair.name })
                }
                sub={`${formatWhen(fair.starts_at, fair.ends_at)} · ${fair.venue}`}
                action={t('See the fair')}
                onAction={() => router.push(`/fair/${fair.id}`)}
              />
            ) : upcomingSlots.length > 0 ? (
              <InfoRow
                icon="location-outline"
                title={t('Pick up at a time you choose')}
                sub={upcomingSlots
                  .slice(0, 3)
                  .map((s) => `${slotWhen(s)} · ${s.location}`)
                  .join('\n')}
              />
            ) : (
              p.pickup_note && <InfoRow icon="location-outline" title={t('Pickup')} sub={p.pickup_note} />
            )}
            <InfoRow
              icon="shield-checkmark-outline"
              title={t('You pay the society directly')}
              sub={t('One payment for everything in your bag, by FPS, PayMe or cash. Campus Social never holds your money.')}
            />
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.elevated, borderTopColor: c.border }]}>
        {n > 0 && (
          <Pressable
            onPress={() => router.push({ pathname: '/shop/bag', params: p.fair_id ? { societyId, fairId: p.fair_id } : { societyId } })}
            accessibilityRole="button"
            accessibilityLabel={t('{n} items in your bag', { n })}
            style={({ pressed }) => [styles.bagButton, { backgroundColor: c.fill, opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="bag-handle-outline" size={22} color={c.text} />
            <View style={[styles.badge, { backgroundColor: c.danger }]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{n}</Text>
            </View>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {formatHkd(unit * (hint ? 1 : Math.min(qty, max)))}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {hint ?? (inBag ? t('{n} already in your bag', { n: inBag }) : t('Pay once for your whole bag'))}
          </Text>
        </View>
        <Button title={t('Add to bag')} icon="bag-add-outline" disabled={!!hint} onPress={add} style={{ minWidth: 140 }} />
      </View>

      <Sheet visible={guide} onClose={() => setGuide(false)}>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{t('Size guide')}</Text>
          <SizeChart text={p.size_chart} />
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('Measured flat, in the units the society gave. Between sizes? Ask the committee before you order.')}
          </Text>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: 'absolute', bottom: space.md, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  guideLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  sizes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  size: {
    minWidth: 68,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
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
  bagButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
