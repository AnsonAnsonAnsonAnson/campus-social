import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';

import { BannerCarousel } from '@/components/BannerCarousel';
import { EventCardLarge, EventRow, NextEventCard } from '@/components/EventCard';
import { NotificationBell } from '@/components/NotificationBell';
import { ProductRow } from '@/components/ProductCard';
import { FeedSkeleton, ListSkeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Chip, ChipRow, EmptyState, ErrorView, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const DAY = 86400_000;

export default function Discover() {
  const c = useColors();
  const { followIds, hiddenIds, user } = useAuth();
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
    return { banners, events, products, next, weekEnd: new Date(now + 7 * DAY).toISOString() };
  }, [user?.id]);

  const sections = useMemo(() => {
    // Hidden societies drop out of the feed but still show in search.
    const visible = <T extends { society_id: string }>(xs: T[]) => xs.filter((x) => !hiddenIds.has(x.society_id));
    const events = visible(feed.data?.events ?? []);
    const weekEnd = feed.data?.weekEnd ?? '';
    return {
      following: events.filter((e) => followIds.has(e.society_id)).slice(0, 10),
      thisWeek: events.filter((e) => e.starts_at <= weekEnd).slice(0, 10),
      upcoming: events.filter((e) => !category || e.category === category),
      banners: visible(feed.data?.banners ?? []),
      products: visible(feed.data?.products ?? []),
    };
  }, [feed.data, followIds, hiddenIds, category]);

  const query = useDebouncedValue(search.trim(), 250);
  const searching = query.length > 1;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <NotificationBell />,
          headerSearchBarOptions: {
            placeholder: t('Events, societies, places'),
            hideWhenScrolling: true,
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
          },
        }}
      />
      {searching ? (
        <SearchResults query={query} />
      ) : feed.loading ? (
        <FeedSkeleton />
      ) : feed.error && !feed.data ? (
        <ErrorView message={feed.error} onRetry={feed.refresh} />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: c.backgroundPlain }}
          contentContainerStyle={{ paddingBottom: 40, paddingTop: space.sm }}
          refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} />}>
          {feed.data?.next && (
            <View style={{ marginHorizontal: space.lg, marginBottom: space.md }}>
              <NextEventCard ticket={feed.data.next} />
            </View>
          )}
          <BannerCarousel banners={sections.banners} />

          {sections.following.length > 0 && (
            <>
              <SectionHeader title={t('From societies you follow')} />
              <HorizontalEvents events={sections.following} />
            </>
          )}

          {sections.thisWeek.length > 0 && (
            <>
              <SectionHeader title={t('This week')} />
              <HorizontalEvents events={sections.thisWeek} />
            </>
          )}

          {!!sections.products.length && (
            <>
              <SectionHeader title={t('Society merch')} />
              <ProductRow products={sections.products.slice(0, 10)} showSociety />
            </>
          )}

          <SectionHeader title={t('Upcoming')} />
          <ChipRow>
            <Chip label={t('All')} selected={!category} onPress={() => setCategory(null)} />
            {EVENT_CATEGORIES.map((cat) => (
              <Chip key={cat} label={t(cat)} selected={category === cat} onPress={() => setCategory(cat === category ? null : cat)} />
            ))}
          </ChipRow>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {sections.upcoming.length ? (
              sections.upcoming.map((e) => <EventRow key={e.id} event={e} />)
            ) : (
              <EmptyState
                icon="calendar-outline"
                title={t('Nothing here yet')}
                body={t('No upcoming events in this category. Check back soon!')}
              />
            )}
          </View>
        </ScrollView>
      )}
    </>
  );
}

function HorizontalEvents({ events }: { events: Parameters<typeof EventCardLarge>[0]['event'][] }) {
  return (
    <FlatList
      horizontal
      data={events}
      keyExtractor={(e) => e.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
      renderItem={({ item }) => <EventCardLarge event={item} />}
    />
  );
}

function SearchResults({ query }: { query: string }) {
  const c = useColors();
  const results = useQuery(async () => {
    const [events, societies] = await Promise.all([
      api.listEvents({ from: new Date().toISOString(), search: query, limit: 30 }),
      api.listSocieties({ search: query }),
    ]);
    return { events, societies };
  }, [query]);
  const empty = results.data && !results.data.events.length && !results.data.societies.length;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.backgroundPlain }} keyboardDismissMode="on-drag">
      {results.loading && !results.data ? (
        <ListSkeleton rows={4} />
      ) : empty ? (
        <EmptyState
          icon="search"
          title={t('No results for “{query}”', { query })}
          body={t('Try a society name, an event or a building.')}
        />
      ) : (
        <>
          {!!results.data?.societies.length && (
            <>
              <SectionHeader title={t('Societies')} />
              {results.data.societies.slice(0, 5).map((s) => (
                <SocietyRow key={s.id} society={s} />
              ))}
            </>
          )}
          {!!results.data?.events.length && (
            <>
              <SectionHeader title={t('Events')} />
              <View style={{ gap: space.sm }}>
                {results.data.events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </View>
            </>
          )}
          <Text style={{ height: 40 }} />
        </>
      )}
    </ScrollView>
  );
}
