import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SaveButton, ShareButton } from '@/components/EventCard';
import { ListSkeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Artwork, Chip, ChipRow, EmptyState, Icon, Pill, SearchField, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { availability, formatWhen } from '@/lib/format';
import { formatHkd } from '@/lib/fps';
import { radius, space, useColors } from '@/lib/theme';
import type { EventWithSociety } from '@/lib/types';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const DAY = 86400_000;
type When = 'any' | 'week' | 'weekend';

/** Search and browse every upcoming event, with quick filters. Opened from Discover. */
export default function Search() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { hiddenIds } = useAuth();
  const [text, setText] = useState(params.q ?? '');
  const [category, setCategory] = useState<string | null>(params.category ?? null);
  const [when, setWhen] = useState<When>('any');
  const [freeOnly, setFreeOnly] = useState(false);
  const query = useDebouncedValue(text.trim(), 250);

  const results = useQuery(async () => {
    const searching = query.length > 1;
    const [events, societies] = await Promise.all([
      api.listEvents({ from: new Date().toISOString(), search: searching ? query : undefined, limit: 200 }),
      searching ? api.listSocieties({ search: query }) : Promise.resolve([]),
    ]);
    return { events, societies, weekEnd: new Date(Date.now() + 7 * DAY).toISOString() };
  }, [query]);

  const events = useMemo(() => {
    const weekEnd = results.data?.weekEnd ?? '';
    const searching = query.length > 1;
    return (results.data?.events ?? [])
      .filter((e) => searching || !hiddenIds.has(e.society_id))
      .filter((e) => !category || e.category === category)
      .filter((e) => !freeOnly || !(e.price_hkd ?? 0))
      .filter((e) => when === 'any' || (when === 'week' ? e.starts_at <= weekEnd : isWeekend(e.starts_at, weekEnd)));
  }, [results.data, category, freeOnly, when, hiddenIds, query]);

  const cycleWhen = () => setWhen((w) => (w === 'any' ? 'week' : w === 'week' ? 'weekend' : 'any'));
  const whenLabel = { any: t('Any time'), week: t('This week'), weekend: t('This weekend') }[when];

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/discover'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          style={styles.back}>
          <Icon name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: -space.lg }}>
          <SearchField placeholder={t('Events, societies, places')} value={text} onChangeText={setText} autoFocus={!params.category} />
        </View>
      </View>
      <View style={{ paddingVertical: space.sm }}>
        <ChipRow>
          <Chip label={whenLabel} icon="calendar-outline" selected={when !== 'any'} onPress={cycleWhen} />
          <Chip label={t('Free')} selected={freeOnly} onPress={() => setFreeOnly((f) => !f)} />
          {EVENT_CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(cat)} selected={category === cat} onPress={() => setCategory(cat === category ? null : cat)} />
          ))}
        </ChipRow>
      </View>
      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        {results.loading && !results.data ? (
          <ListSkeleton rows={4} />
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
            <Text style={[styles.count, { color: c.text }]}>
              {query.length > 1 ? t('{n} events', { n: events.length }) : t('{n} upcoming events', { n: events.length })}
            </Text>
            {events.length ? (
              <View style={{ gap: space.xl, paddingHorizontal: space.lg }}>
                {events.map((e) => (
                  <EventCardWide key={e.id} event={e} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="search"
                title={query.length > 1 ? t('No results for “{query}”', { query }) : t('Nothing matches these filters')}
                body={t('Try a society name, an event or a building.')}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function isWeekend(iso: string, before: string) {
  const day = new Date(new Date(iso).getTime() + 8 * 3600_000).getUTCDay(); // Hong Kong time
  return iso <= before && (day === 0 || day === 6);
}

/** Search result card from the design: big cover with category, share and save on it. */
function EventCardWide({ event }: { event: EventWithSociety }) {
  const c = useColors();
  const a = availability(event);
  const price = (event.price_hkd ?? 0) > 0 ? formatHkd(event.price_hkd ?? 0) : event.price_text || t('Free');
  const tone = a.kind === 'open' || a.kind === 'few' ? 'success' : a.kind === 'drop-in' ? 'brand' : 'warning';
  return (
    <View>
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={styles.cover}>
          {!!event.category && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t(event.category)}</Text>
            </View>
          )}
        </Artwork>
        <View style={{ gap: 3, marginTop: space.md }}>
          <Text style={{ color: c.text, fontSize: 19, lineHeight: 25, fontWeight: '600' }} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={{ color: c.accentText, fontSize: 15, fontWeight: '600' }}>{formatWhen(event.starts_at)}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 15 }} numberOfLines={1}>
            {event.location} · {event.society.short_name ?? event.society.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{price}</Text>
            <Pill label={a.label} tone={tone} />
          </View>
        </View>
      </Pressable>
      <View style={[styles.coverActions, { pointerEvents: 'box-none' }]}>
        <View style={[styles.coverButton, { backgroundColor: c.elevated }]}>
          <ShareButton event={event} size={18} />
        </View>
        <View style={[styles.coverButton, { backgroundColor: c.elevated }]}>
          <SaveButton eventId={event.id} size={19} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.sm, paddingRight: 0 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  count: { fontSize: 17, fontWeight: '600', marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.md },
  cover: { height: 180, borderRadius: radius.lg + 2 },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  coverActions: { position: 'absolute', right: 12, top: 180 - 12 - 40, flexDirection: 'row', gap: space.sm },
  coverButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
