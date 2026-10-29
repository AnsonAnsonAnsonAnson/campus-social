import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { BagBar, slotWhen } from '@/components/ShopParts';
import { EmptyState, ErrorView, InfoRow, Loading, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBag } from '@/lib/bag';
import { checkBag, membershipState, saleState, slotState } from '@/lib/commerce';
import { space, textStyle, useColors } from '@/lib/theme';
import type { ProductWithStock } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

/** A society's whole shop: on sale now, coming soon, sold out. */
export default function ShopScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const lang = useLang();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const bag = useBag(societyId);

  const q = useQuery(async () => {
    const [society, products, slots, memberships] = await Promise.all([
      api.getSociety(societyId),
      api.listProducts(societyId),
      api.listPickupSlots(societyId).catch(() => []),
      api.myMemberships(),
    ]);
    const isMember = memberships.some((m) => m.society_id === societyId && membershipState(m, m.plan).key === 'active');
    return { society, products, slots: slots.filter((s) => slotState(s).key !== 'past'), isMember };
  }, [societyId, user?.id]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const d = q.data!;

  // Fair presale sells from the fair's own bag, so it gets its own section.
  const everyday = d.products.filter((p) => !p.fair_id);
  const groups: { title: string; items: ProductWithStock[] }[] = [
    { title: t('On sale'), items: everyday.filter((p) => saleState(p) === 'open' || saleState(p) === 'draft') },
    { title: t('Coming soon'), items: everyday.filter((p) => saleState(p) === 'upcoming') },
    { title: t('Sold out'), items: everyday.filter((p) => saleState(p) === 'sold_out') },
    { title: t('Presale at fairs'), items: d.products.filter((p) => p.fair_id && saleState(p) !== 'closed') },
  ].filter((g) => g.items.length);
  const tile = (width - space.lg * 2 - space.md) / 2;
  const next = d.slots[0];
  const total = checkBag(bag, d.products, d.isMember).total;

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ title: t('Shop') }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
        {d.society && (
          <View style={styles.head}>
            <SocietyAvatar name={d.society.name} uri={d.society.logo_url} category={d.society.category} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[textStyle('title2', lang), { color: c.text }]} numberOfLines={2}>
                {d.society.name}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {d.isMember ? t('You get member prices') : t('Members get lower prices on some items')}
              </Text>
            </View>
          </View>
        )}
        {next && (
          <View style={{ paddingHorizontal: space.lg }}>
            <InfoRow
              icon="location-outline"
              title={t('Next pickup {when}', { when: slotWhen(next) })}
              sub={`${next.location}${d.slots.length > 1 ? ` · ${t('{n} more times', { n: d.slots.length - 1 })}` : ''}`}
            />
          </View>
        )}
        {groups.length ? (
          groups.map((g) => (
            <View key={g.title} style={{ marginTop: space.lg }}>
              <SectionHeader title={g.title} />
              <View style={styles.grid}>
                {g.items.map((p) => (
                  <ProductCard key={p.id} product={p} width={tile} member={d.isMember} />
                ))}
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="pricetag-outline"
            title={t('Nothing on sale right now')}
            body={t('Follow the society to hear about the next drop.')}
          />
        )}
      </ScrollView>
      <BagBar societyId={societyId} total={total} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg, rowGap: space.lg },
});
