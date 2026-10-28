import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { priceRange, saleState, stockLeft, unitsOrdered } from '@/lib/commerce';
import { formatHkd } from '@/lib/fps';
import { formatDay } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { ProductWithStock } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Artwork, Pill } from './ui';

/** Merch tile for shop rows (society page, Discover) and the shop grid. */
export function ProductCard({
  product: p,
  showSociety,
  width = 150,
  member = false,
}: {
  product: ProductWithStock;
  showSociety?: boolean;
  width?: number;
  member?: boolean;
}) {
  const c = useColors();
  const state = saleState(p);
  const range = priceRange(p, member);
  const left = Object.values(stockLeft(p)).filter((n): n is number => n != null);
  const low = state === 'open' && left.length > 0 && left.reduce((a, b) => a + b, 0) <= 5;
  const tag =
    state === 'draft'
      ? { label: t('Draft'), tone: 'neutral' as const, icon: 'pencil' as const }
      : state === 'upcoming'
        ? {
            label: t('Opens {when}', { when: formatDay(p.opens_at!) }),
            tone: 'ink' as const,
            icon: 'alarm-outline' as const,
          }
        : state === 'sold_out'
          ? { label: t('Sold out'), tone: 'neutral' as const, icon: null }
          : low
            ? { label: t('Almost gone'), tone: 'warning' as const, icon: 'flame-outline' as const }
            : p.goal_qty
              ? {
                  label: t('{n}/{goal} ordered', { n: unitsOrdered(p), goal: p.goal_qty }),
                  tone: 'brand' as const,
                  icon: 'people-outline' as const,
                }
              : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/shop/[id]', params: { id: p.id, societyId: p.society_id } })}
      accessibilityRole="button"
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <Artwork
        seed={p.id}
        uri={p.image_url}
        category={p.society.category}
        style={[styles.art, { width, height: width, opacity: state === 'sold_out' ? 0.6 : 1 }]}>
        {tag && (
          <View style={styles.tag}>
            <Pill label={tag.label} tone={tag.tone} icon={tag.icon} />
          </View>
        )}
      </Artwork>
      <View style={{ gap: 2, paddingTop: space.sm }}>
        {showSociety && (
          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
            {p.society.short_name ?? p.society.name}
          </Text>
        )}
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
          {p.title}
        </Text>
        <Text style={{ color: state === 'sold_out' ? c.textTertiary : c.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>
          {range.max > range.min ? t('From {price}', { price: formatHkd(range.min) }) : formatHkd(range.min)}
        </Text>
        {p.member_price_hkd != null && !member && state !== 'sold_out' && (
          <Text style={{ color: c.successText, fontSize: 12, fontWeight: '600' }}>
            {t('Members {price}', { price: formatHkd(p.member_price_hkd) })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function ProductRow({ products, showSociety }: { products: ProductWithStock[]; showSociety?: boolean }) {
  return (
    <FlatList
      horizontal
      data={products}
      keyExtractor={(p) => p.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
      renderItem={({ item }) => <ProductCard product={item} showSociety={showSociety} />}
    />
  );
}

const styles = StyleSheet.create({
  art: { borderRadius: radius.lg },
  tag: { position: 'absolute', left: space.sm, top: space.sm, right: space.sm, flexDirection: 'row' },
});
