import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';

import { BannerCarousel } from '@/components/BannerCarousel';
import { EventCardLarge, EventRow, NextEventCard, TopEventCard } from '@/components/EventCard';
import { NotificationBell } from '@/components/NotificationBell';
import { ProductRow } from '@/components/ProductCard';
import { FeedSkeleton } from '@/components/Skeleton';
import { Button, Chip, ChipRow, EmptyState, ErrorView, PageHeader, SearchField, SectionHeader, SegmentedControl } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { topEvents, type TopRange } from '@/lib/ranking';
import { space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const DAY = 86400_000;
const PICKS = 8;

export default function Discover() {
  const c = useColors();
  const { followIds, hiddenIds, user } = useAuth();
  const [category, setCategory] = useState<string | null>(null);
  const [range, setRange] = useState<TopRange | null>(null);

  const feed = useQuery(async () => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const [banners, events, products, tickets] = await Promise.all([
      api.listBanners(),
      api.listEvents({ from: nowIso, to: new Date(now + 60 * DAY).toISOString(), limit: 150 }),
      api.listProducts(null).catch(() => []),
      user ? api.myTickets().catch(() => []) : Promise.resolve([]),
    ]);
    const next = tickets
      .filter((tk) => tk.status === 'confirmed' && tk.event.status !== 'cancelled' && tk.event.ends_at >= nowIso)
      .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at))[0];
    return { banners, events, products, next };
  }, [user?.id]);

  const sections = useMemo(() => {
    // Hidden societies drop out of the feed but still show in search.
    const visible = <T extends { society_id: string }>(xs: T[]) => xs.filter((x) => !hiddenIds.has(x.society_id));
    const events = visible(feed.data?.events ?? []).filter((e) => e.status !== 'cancelled');
    const inCategory = events.filter((e) => !category || e.category === category);
    // Picks: societies you follow first, then whatever is soonest.
    const picks = [...inCategory].sort(
      (a, b) => Number(followIds.has(b.society_id)) - Number(followIds.has(a.society_id)) || a.starts_at.localeCompare(b.starts_at),
    );
    return {
      top: { week: topEvents(inCategory, 'week'), month: topEvents(inCategory, 'month') },
      picks: picks.slice(0, PICKS),
      more: picks.length > PICKS,
      following: events.filter((e) => followIds.has(e.society_id)).slice(0, 10),
      banners: visible(feed.data?.banners ?? []),
      products: visible(feed.data?.products ?? []),
    };
  }, [feed.data, followIds, hiddenIds, category]);

  // Week by default; a quiet week opens on the month instead.
  const topRange: TopRange = range ?? (sections.top.week.length ? 'week' : 'month');
  const top = sections.top[topRange];

  const seeAll = () => router.push({ pathname: '/search', params: category ? { category } : {} });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} />}>
      <PageHeader title={t('Discover')}>
        <NotificationBell />
      </PageHeader>
      <SearchField placeholder={t('Events, societies, places')} onPress={() => router.push('/search')} />
      <View style={{ marginTop: 14 }}>
        <ChipRow>
          <Chip label={t('All')} selected={!category} onPress={() => setCategory(null)} />
          {EVENT_CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(cat)} selected={category === cat} onPress={() => setCategory(cat === category ? null : cat)} />
          ))}
        </ChipRow>
      </View>

      {feed.loading ? (
        <FeedSkeleton />
      ) : feed.error && !feed.data ? (
        <ErrorView message={feed.error} onRetry={feed.refresh} />
      ) : (
        <>
          {feed.data?.next && (
            <View style={{ marginHorizontal: space.lg, marginTop: space.lg }}>
              <NextEventCard ticket={feed.data.next} />
            </View>
          )}
          {!category && sections.banners.length > 0 && (
            <View style={{ marginTop: space.lg }}>
              <BannerCarousel banners={sections.banners} />
            </View>
          )}

          {sections.top.month.length > 0 && (
            <>
              <SectionHeader title={t('Most anticipated')} />
              <SegmentedControl
                style={{ marginHorizontal: space.lg, marginBottom: space.md }}
                options={[
                  { value: 'week', label: t('This week') },
                  { value: 'month', label: t('This month') },
                ]}
                value={topRange}
                onChange={setRange}
              />
              {top.length ? (
                <FlatList
                  horizontal
                  data={top}
                  keyExtractor={(e) => e.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
                  renderItem={({ item, index }) => <TopEventCard event={item} rank={index + 1} />}
                />
              ) : (
                <EmptyState icon="flame-outline" title={t('Nothing big this week yet')} body={t('See what’s coming up this month.')} />
              )}
            </>
          )}

          <SectionHeader title={t('Picked for you')} action={t('See all')} onAction={seeAll} />
          {sections.picks.length ? (
            <View style={{ gap: 20 }}>
              {sections.picks.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
              {sections.more && (
                <View style={{ marginHorizontal: space.lg }}>
                  <Button variant="secondary" title={t('See all events')} onPress={seeAll} />
                </View>
              )}
            </View>
          ) : (
            <EmptyState
              icon="calendar-outline"
              title={t('Nothing here yet')}
              body={t('No upcoming events in this category. Check back soon!')}
            />
          )}

          {!category && sections.following.length > 0 && (
            <>
              <SectionHeader title={t('From societies you follow')} />
              <FlatList
                horizontal
                data={sections.following}
                keyExtractor={(e) => e.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
                renderItem={({ item }) => <EventCardLarge event={item} />}
              />
            </>
          )}

          {!category && !!sections.products.length && (
            <>
              <SectionHeader title={t('Society merch')} />
              <ProductRow products={sections.products.slice(0, 10)} showSociety />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
