import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Field, Icon, Loading, SegmentedControl } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { ProductStatus } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type VariantDraft = { name: string; stock: string };

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
      orders: orders.filter((o) => o.product_id === productId).length,
      hasPayment: !!payment?.fps_id || !!payment?.payme_link,
    };
  }, [societyId, productId]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [memberPrice, setMemberPrice] = useState('');
  const [sized, setSized] = useState(true);
  const [variants, setVariants] = useState<VariantDraft[]>(['S', 'M', 'L', 'XL'].map((name) => ({ name, stock: '' })));
  const [oneStock, setOneStock] = useState('');
  const [maxPerOrder, setMaxPerOrder] = useState('5');
  const [windowHours, setWindowHours] = useState('48');
  const [pickupNote, setPickupNote] = useState('');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = q.data?.product;
    if (!p) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setImageUrl(p.image_url);
    setTitle(p.title);
    setDescription(p.description);
    setPrice(String(p.price_hkd));
    setMemberPrice(p.member_price_hkd != null ? String(p.member_price_hkd) : '');
    const oneSize = p.variants.length === 1 && p.variants[0].name === '';
    setSized(!oneSize);
    if (oneSize) setOneStock(p.variants[0].stock != null ? String(p.variants[0].stock) : '');
    else setVariants(p.variants.map((v) => ({ name: v.name, stock: v.stock != null ? String(v.stock) : '' })));
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
        .map((v) => ({ name: v.name.trim(), stock: v.stock.trim() ? Math.max(0, Math.floor(Number(v.stock))) : null }))
    : [{ name: '', stock: oneStock.trim() ? Math.max(0, Math.floor(Number(oneStock))) : null }];
  const variantError =
    sized && !cleanVariants.length
      ? t('Add at least one size')
      : new Set(cleanVariants.map((v) => v.name.toLowerCase())).size !== cleanVariants.length
        ? t('Each size needs a different name')
        : cleanVariants.some((v) => v.stock != null && !Number.isFinite(v.stock))
          ? t('Stock must be a number, or empty for no limit')
          : null;
  const maxN = Number(maxPerOrder);
  const hoursN = Number(windowHours);
  const valid =
    title.trim().length >= 2 &&
    Number.isFinite(priceN) &&
    !priceError &&
    !memberError &&
    !variantError &&
    maxN >= 1 &&
    maxN <= 50 &&
    hoursN >= 1 &&
    hoursN <= 336;

  const pickImage = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadImage([1, 1]);
      if (url) setImageUrl(url);
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const existing = q.data?.product;
      await api.saveProduct({
        id: productId,
        society_id: societyId,
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl,
        price_hkd: priceN,
        member_price_hkd: memberPrice.trim() ? memberN : null,
        variants: cleanVariants,
        opens_at: existing?.opens_at ?? null,
        closes_at: existing?.closes_at ?? null,
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
        <Pressable
          onPress={pickImage}
          accessibilityRole="button"
          accessibilityLabel={imageUrl ? t('Change photo') : t('Add a photo')}
          style={[styles.image, { backgroundColor: c.fill }]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Icon name="image-outline" size={32} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 15 }}>{uploading ? t('Uploading…') : t('Add a photo')}</Text>
            </View>
          )}
        </Pressable>

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
                <Text style={[styles.variantHead, { color: c.textSecondary, width: 96 }]}>{t('Stock')}</Text>
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
                    style={[styles.variantInput, { color: c.text, flex: 1 }]}
                  />
                  <TextInput
                    value={v.stock}
                    onChangeText={(stock) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, stock } : x)))}
                    placeholder={t('No limit')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                    accessibilityLabel={t('Stock for {size}', { size: v.name || t('Size {n}', { n: i + 1 }) })}
                    style={[styles.variantInput, { color: c.text, width: 96 }]}
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
                  onPress={() => setVariants((all) => [...all, { name: '', stock: '' }])}
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
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Leave stock empty for pre-orders with no limit.')}</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Max per order')} value={maxPerOrder} onChangeText={setMaxPerOrder} keyboardType="number-pad" />
          </View>
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
          label={t('Pickup')}
          value={pickupNote}
          onChangeText={setPickupNote}
          maxLength={300}
          placeholder={t('e.g. Collect at the society room, Tue and Thu 1–2pm')}
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
  image: {
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  variants: { borderRadius: radius.lg, overflow: 'hidden' },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 48 },
  variantHead: { fontSize: 13, fontWeight: '600' },
  variantInput: { fontSize: 16, height: 44 },
});
