import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { isSoldOut } from '@/lib/commerce';
import { formatHkd } from '@/lib/fps';
import { radius, space, useColors } from '@/lib/theme';
import type { ProductWithStock } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Artwork, Pill } from './ui';

/** Merch tile for shop rows (society page, Discover). */
export function ProductCard({ product: p, showSociety }: { product: ProductWithStock; showSociety?: boolean }) {
  const c = useColors();
  const soldOut = isSoldOut(p);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/shop/[id]', params: { id: p.id, societyId: p.society_id } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <Artwork seed={p.id} uri={p.image_url} category={p.society.category} style={styles.art}>
        {p.status === 'draft' && (
          <View style={styles.tag}>
            <Pill label={t('Draft')} tone="neutral" icon="pencil" />
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
        <Text style={{ color: soldOut ? c.textTertiary : c.text, fontSize: 15 }}>{soldOut ? t('Sold out') : formatHkd(p.price_hkd)}</Text>
        {p.member_price_hkd != null && !soldOut && (
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
  card: { width: 150 },
  art: { width: 150, height: 150, borderRadius: radius.lg },
  tag: { position: 'absolute', left: space.sm, top: space.sm },
});
