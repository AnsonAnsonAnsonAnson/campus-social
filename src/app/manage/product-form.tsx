import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { SizeChart } from '@/components/ShopParts';
import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Field, Icon, Loading, SegmentedControl } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { orderHasProduct, parseSizeChart } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { ProductStatus } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type VariantDraft = { name: string; stock: string; extra: string };

const MAX_PHOTOS = 7;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const money = (s: string) => (s.trim() ? Number(s) : NaN);

export default function ProductForm() {
  const { societyId, productId } = useLocalSearchParams<{ societyId: string; productId?: string }>();
  const c = useColors();

  const q = useQuery(async () => {
    const [products, orders, payment] = await Promise.all([
      api.listProducts(societyId),
      productId ? api.listOrders(societyId) : Promise.resolve([]),
      api.getPaymentSettings(societyId),
    ]);
    return {
      product: products.find((p) => p.id === productId) ?? null,
      orders: productId ? orders.filter((o) => orderHasProduct(o, productId)).length : 0,
      hasPayment: !!payment?.fps_id || !!payment?.payme_link,
    };
  }, [societyId, productId]);

  // The first photo is the cover (image_url); the rest go in `images`.
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [memberPrice, setMemberPrice] = useState('');
  const [sized, setSized] = useState(true);
  const [variants, setVariants] = useState<VariantDraft[]>(['S', 'M', 'L', 'XL'].map((name) => ({ name, stock: '', extra: '' })));
  const [oneStock, setOneStock] = useState('');
  const [sizeChart, setSizeChart] = useState('');
  const [goal, setGoal] = useState('');
  const [readyOn, setReadyOn] = useState('');
  const [opensAt, setOpensAt] = useState<Date | null>(null);
  const [closesAt, setClosesAt] = useState<Date | null>(null);
  const [maxPerBuyer, setMaxPerBuyer] = useState('');
  const [maxPerOrder, setMaxPerOrder] = useState('5');
  const [windowHours, setWindowHours] = useState('48');
  const [pickupNote, setPickupNote] = useState('');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = q.data?.product;
    if (!p) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPhotos([p.image_url, ...p.images].filter((u): u is string => !!u));
    setTitle(p.title);
    setDescription(p.description);
    setPrice(String(p.price_hkd));
    setMemberPrice(p.member_price_hkd != null ? String(p.member_price_hkd) : '');
    const oneSize = p.variants.length === 1 && p.variants[0].name === '';
    setSized(!oneSize);
    if (oneSize) setOneStock(p.variants[0].stock != null ? String(p.variants[0].stock) : '');
    else
      setVariants(
        p.variants.map((v) => ({
          name: v.name,
          stock: v.stock != null ? String(v.stock) : '',
          extra: v.extra_hkd ? String(v.extra_hkd) : '',
        })),
      );
    setSizeChart(p.size_chart ?? '');
    setGoal(p.goal_qty ? String(p.goal_qty) : '');
    setReadyOn(p.ready_on ?? '');
    setOpensAt(p.opens_at ? new Date(p.opens_at) : null);
    setClosesAt(p.closes_at ? new Date(p.closes_at) : null);
    setMaxPerBuyer(p.max_per_buyer ? String(p.max_per_buyer) : '');
    setMaxPerOrder(String(p.max_per_order));
    setWindowHours(String(p.payment_window_hours));
    setPickupNote(p.pickup_note ?? '');
    setStatus(p.status);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data?.product]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;

  const priceN = money(price);
  const memberN = money(memberPrice);
  const priceError = price.trim() && !(priceN >= 0 && priceN <= 10000) ? t('Enter an amount in HK$, like 120') : null;
  const memberError =
    memberPrice.trim() && !(memberN >= 0 && memberN <= 10000)
      ? t('Enter an amount in HK$, like 100')
      : memberPrice.trim() && memberN >= priceN
        ? t('Should be less than the normal price')
        : null;
  const cleanVariants = sized
    ? variants
        .filter((v) => v.name.trim())
        .map((v) => ({
          name: v.name.trim(),
          stock: v.stock.trim() ? Math.max(0, Math.floor(Number(v.stock))) : null,
          ...(v.extra.trim() ? { extra_hkd: Number(v.extra) } : {}),
        }))
    : [{ name: '', stock: oneStock.trim() ? Math.max(0, Math.floor(Number(oneStock))) : null }];
  const variantError =
    sized && !cleanVariants.length
      ? t('Add at least one size')
      : new Set(cleanVariants.map((v) => v.name.toLowerCase())).size !== cleanVariants.length
        ? t('Each size needs a different name')
        : cleanVariants.some((v) => v.stock != null && !Number.isFinite(v.stock))
          ? t('Stock must be a number, or empty for no limit')
          : cleanVariants.some((v) => v.extra_hkd != null && !(v.extra_hkd >= 0 && v.extra_hkd <= 1000))
            ? t('Extra charge must be between HK$0 and HK$1,000')
            : null;
  const maxN = Number(maxPerOrder);
  const hoursN = Number(windowHours);
  const goalN = goal.trim() ? Math.floor(Number(goal)) : null;
  const buyerN = maxPerBuyer.trim() ? Math.floor(Number(maxPerBuyer)) : null;
  const goalError = goalN != null && !(goalN >= 1 && goalN <= 10000) ? t('Enter a number, like 40') : null;
  const readyError = readyOn.trim() && !DAY.test(readyOn.trim()) ? t('Use the format 2026-12-01') : null;
  const buyerError = buyerN != null && !(buyerN >= 1 && buyerN <= 50) ? t('Between 1 and 50') : null;
  const windowError = opensAt && closesAt && closesAt <= opensAt ? t('Orders must close after they open') : null;
  const chartError = sizeChart.trim() && !parseSizeChart(sizeChart) ? t('Add a header line and at least one size') : null;
  const valid =
    title.trim().length >= 2 &&
    Number.isFinite(priceN) &&
    !priceError &&
    !memberError &&
    !variantError &&
    maxN >= 1 &&
    maxN <= 50 &&
    hoursN >= 1 &&
    hoursN <= 336 &&
    !goalError &&
    !readyError &&
    !buyerError &&
    !windowError &&
    !chartError;

  const pickImage = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadImage([1, 1]);
      if (url) setPhotos((all) => [...all, url].slice(0, MAX_PHOTOS));
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.saveProduct({
        id: productId,
        society_id: societyId,
        title: title.trim(),
        description: description.trim(),
        image_url: photos[0] ?? null,
        images: photos.slice(1),
        price_hkd: priceN,
        member_price_hkd: memberPrice.trim() ? memberN : null,
        variants: cleanVariants,
        size_chart: sized && sizeChart.trim() ? sizeChart.trim() : null,
        goal_qty: goalN,
        ready_on: readyOn.trim() || null,
        max_per_buyer: buyerN,
        opens_at: opensAt?.toISOString() ?? null,
        closes_at: closesAt?.toISOString() ?? null,
        pickup_note: pickupNote.trim() || null,
        max_per_order: Math.floor(maxN),
        payment_window_hours: Math.floor(hoursN),
        status,
      });
      invalidate();
      router.back();
      toast(status === 'published' ? t('On sale now') : t('Saved'));
    } catch (e) {
      showAlert(t('Could not save product'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!productId) return;
    const ok = await confirmAsync(t('Delete this product?'), t('No one has ordered it, so nothing else changes.'), t('Delete'), true);
    if (!ok) return;
    try {
      await api.deleteProduct(productId);
      invalidate();
      router.back();
      toast(t('Product deleted'));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: productId ? t('Edit product') : t('Add a product') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!q.data!.hasPayment && (
          <Banner
            tone="warning"
            icon="alert-circle-outline"
            text={t('Add your FPS or PayMe details before you start selling, so buyers can pay you.')}
          />
        )}
        <View style={{ gap: space.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((uri, i) => (
              <View key={uri + i} style={[styles.photo, { backgroundColor: c.fill }]}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {i === 0 && (
                  <View style={[styles.coverTag, { backgroundColor: c.ink }]}>
                    <Text style={{ color: c.onInk, fontSize: 11, fontWeight: '700' }}>{t('Cover')}</Text>
                  </View>
                )}
                <View style={styles.photoTools}>
                  {i > 0 && (
                    <Pressable
                      onPress={() => setPhotos((all) => [all[i], ...all.filter((_, j) => j !== i)])}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('Make cover')}
                      style={[styles.photoTool, { backgroundColor: c.elevated }]}>
                      <Icon name="star-outline" size={16} color={c.text} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove photo')}
                    style={[styles.photoTool, { backgroundColor: c.elevated }]}>
                    <Icon name="trash-outline" size={16} color={c.dangerText} />
                  </Pressable>
                </View>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable
                onPress={pickImage}
                accessibilityRole="button"
                accessibilityLabel={t('Add a photo')}
                style={[styles.photo, styles.addPhoto, { backgroundColor: c.fill, borderColor: c.border }]}>
                <Icon name="camera-outline" size={28} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  {uploading ? t('Uploading…') : photos.length ? t('Add another') : t('Add a photo')}
                </Text>
              </Pressable>
            )}
          </ScrollView>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {t('Up to {n} photos. Show the front, the back and someone wearing it.', { n: MAX_PHOTOS })}
          </Text>
        </View>

        <Field label={t('Name')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('e.g. Society hoodie 2026')} />
        <Field label={t('Description')} value={description} onChangeText={setDescription} multiline maxLength={2000} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Price (HK$)')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={priceError} />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t('Member price')}
              value={memberPrice}
              onChangeText={setMemberPrice}
              keyboardType="decimal-pad"
              placeholder={t('Optional')}
              error={memberError}
            />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <View style={styles.toggle}>
            <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{t('Comes in sizes or colours')}</Text>
            <Switch value={sized} onValueChange={setSized} trackColor={{ true: c.tint }} />
          </View>
          {sized ? (
            <View style={[styles.variants, { backgroundColor: c.card }]}>
              <View style={styles.variantRow}>
                <Text style={[styles.variantHead, { color: c.textSecondary, flex: 1 }]}>{t('Size')}</Text>
                <Text style={[styles.variantHead, { color: c.textSecondary, width: 80 }]}>{t('Stock')}</Text>
                <Text style={[styles.variantHead, { color: c.textSecondary, width: 64 }]}>{t('Extra $')}</Text>
                <View style={{ width: 32 }} />
              </View>
              {variants.map((v, i) => (
                <View key={i} style={[styles.variantRow, { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <TextInput
                    value={v.name}
                    onChangeText={(name) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, name } : x)))}
                    placeholder={t('Size')}
                    placeholderTextColor={c.textTertiary}
                    maxLength={20}
                    accessibilityLabel={t('Size {n}', { n: i + 1 })}
                    style={[styles.variantInput, { color: c.text, flex: 1, minWidth: 0 }]}
                  />
                  <TextInput
                    value={v.stock}
                    onChangeText={(stock) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, stock } : x)))}
                    placeholder={t('No limit')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                    accessibilityLabel={t('Stock for {size}', { size: v.name || t('Size {n}', { n: i + 1 }) })}
                    style={[styles.variantInput, { color: c.text, width: 80 }]}
                  />
                  <TextInput
                    value={v.extra}
                    onChangeText={(extra) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, extra } : x)))}
                    placeholder="0"
                    placeholderTextColor={c.textTertiary}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t('Extra charge for {size}', { size: v.name || t('Size {n}', { n: i + 1 }) })}
                    style={[styles.variantInput, { color: c.text, width: 64 }]}
                  />
                  <Pressable
                    onPress={() => setVariants((all) => all.filter((_, j) => j !== i))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove')}
                    style={{ width: 32, alignItems: 'center' }}>
                    <Icon name="remove-circle-outline" size={20} color={c.dangerText} />
                  </Pressable>
                </View>
              ))}
              {variants.length < 12 && (
                <Pressable
                  onPress={() => setVariants((all) => [...all, { name: '', stock: '', extra: '' }])}
                  accessibilityRole="button"
                  style={[styles.variantRow, { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Icon name="add-circle-outline" size={20} color={c.tintText} />
                  <Text style={{ color: c.tintText, fontSize: 15, fontWeight: '600' }}>{t('Add a size')}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Field
              label={t('Stock')}
              hint={t('Leave empty for pre-orders with no limit')}
              value={oneStock}
              onChangeText={setOneStock}
              keyboardType="number-pad"
            />
          )}
          {variantError && <Text style={{ color: c.dangerText, fontSize: 13 }}>{variantError}</Text>}
          {sized && !variantError && (
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('Leave stock empty for pre-orders with no limit. Extra $ is added to the price, e.g. 20 for XXL.')}
            </Text>
          )}
        </View>

        {sized && (
          <View style={{ gap: space.sm }}>
            <Field
              label={t('Size guide')}
              hint={t('One line per size, commas between columns. The first line is the header.')}
              value={sizeChart}
              onChangeText={setSizeChart}
              multiline
              maxLength={1500}
              autoCapitalize="none"
              placeholder={'Size, Chest (cm), Length (cm)\nS, 52, 68\nM, 55, 71'}
              error={chartError}
            />
            <SizeChart text={sizeChart} />
          </View>
        )}

        <View style={{ gap: space.md }}>
          <Text style={[styles.groupTitle, { color: c.text }]}>{t('When it sells')}</Text>
          <View style={styles.toggle}>
            <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{t('Orders open later')}</Text>
            <Switch
              value={!!opensAt}
              onValueChange={(on) => setOpensAt(on ? new Date(Date.now() + 86400_000) : null)}
              trackColor={{ true: c.tint }}
            />
          </View>
          {opensAt && <DateTimeField label={t('Sale opens')} value={opensAt} onChange={setOpensAt} />}
          {opensAt && (
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: -6 }}>
              {t('Buyers see a countdown and can set a reminder. Good for limited drops.')}
            </Text>
          )}
          <View style={styles.toggle}>
            <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{t('Orders close on a date')}</Text>
            <Switch
              value={!!closesAt}
              onValueChange={(on) => setClosesAt(on ? new Date((opensAt?.getTime() ?? Date.now()) + 14 * 86400_000) : null)}
              trackColor={{ true: c.tint }}
            />
          </View>
          {closesAt && <DateTimeField label={t('Sale closes')} value={closesAt} onChange={setClosesAt} />}
          {windowError && <Text style={{ color: c.dangerText, fontSize: 13 }}>{windowError}</Text>}
        </View>

        <View style={{ gap: space.md }}>
          <Text style={[styles.groupTitle, { color: c.text }]}>{t('Pre-order')}</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('Goal')}
                hint={t('Units you need to go ahead')}
                value={goal}
                onChangeText={setGoal}
                keyboardType="number-pad"
                placeholder={t('Optional')}
                error={goalError}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t('Expected ready')}
                hint={t('Shown to buyers')}
                value={readyOn}
                onChangeText={setReadyOn}
                placeholder="2026-12-01"
                autoCapitalize="none"
                error={readyError}
              />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Max per order')} value={maxPerOrder} onChangeText={setMaxPerOrder} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t('Max per person')}
              hint={t('Across all their orders')}
              value={maxPerBuyer}
              onChangeText={setMaxPerBuyer}
              keyboardType="number-pad"
              placeholder={t('No limit')}
              error={buyerError}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field
              label={t('Hours to pay')}
              hint={t('Unpaid FPS and PayMe orders free their stock after this')}
              value={windowHours}
              onChangeText={setWindowHours}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Field
          label={t('Pickup note')}
          hint={t('Buyers book a time from your Pickup times. Use this for anything else they should know.')}
          value={pickupNote}
          onChangeText={setPickupNote}
          maxLength={300}
          placeholder={t('e.g. Bring your student card')}
        />
        <Button
          variant="secondary"
          icon="calendar-outline"
          title={t('Pickup times')}
          onPress={() => router.push({ pathname: '/manage/pickup-times', params: { societyId } })}
        />

        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('Status')}</Text>
          <SegmentedControl
            grey
            value={status}
            onChange={setStatus}
            options={[
              { value: 'draft', label: t('Draft') },
              { value: 'published', label: t('On sale') },
              { value: 'closed', label: t('Closed') },
            ]}
          />
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {status === 'draft'
              ? t('Only your committee can see drafts.')
              : status === 'published'
                ? t('Shown on your society page and Discover.')
                : t('Still visible, but no new orders.')}
          </Text>
        </View>

        <Button title={productId ? t('Save changes') : t('Save product')} loading={busy} disabled={!valid || uploading} onPress={save} />
        {productId &&
          (q.data!.orders === 0 ? (
            <Button title={t('Delete product')} variant="destructive" disabled={busy} onPress={remove} />
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {t('This product has orders, so it can’t be deleted. Set it to Closed to stop sales.')}
            </Text>
          ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photo: { width: 112, height: 112, borderRadius: radius.lg, overflow: 'hidden' },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    padding: space.sm,
  },
  coverTag: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  photoTools: { position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', gap: 6 },
  photoTool: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontSize: 17, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  variants: { borderRadius: radius.lg, overflow: 'hidden' },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 48 },
  variantHead: { fontSize: 13, fontWeight: '600' },
  variantInput: { fontSize: 16, height: 44 },
});
