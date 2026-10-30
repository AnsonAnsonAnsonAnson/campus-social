import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SaveButton, ShareButton } from '@/components/EventCard';
import { ListSkeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { StackTabBar } from '@/components/TabBar';
import {
  Artwork,
  Button,
  Chip,
  DropChip,
  EmptyState,
  Icon,
  OptionSheet,
  Pill,
  SearchField,
  SectionHeader,
  Sheet,
  type PillTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES, EVENT_CATEGORIES } from '@/lib/constants';
import { availability, formatWhen } from '@/lib/format';
import { formatHkd } from '@/lib/fps';
import { byBuzz } from '@/lib/ranking';
import { coverFor, radius, space, type, useColors, useIsDark } from '@/lib/theme';
import type { EventWithSociety } from '@/lib/types';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const DAY = 86400_000;
type When = 'any' | 'today' | 'week' | 'weekend' | 'month';
type Price = 'any' | 'free' | 'paid';
type Sort = 'date' | 'popular';
type Menu = 'filters' | 'when' | 'price' | 'category' | 'college' | 'sort' | null;

/** Hong Kong calendar date (YYYY-MM-DD) and weekday of an instant. */
function hkDay(ms: number) {
  const d = new Date(ms + 8 * 3600_000);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

function matchesWhen(iso: string, when: When, now: number) {
  if (when === 'any') return true;
  const at = new Date(iso).getTime();
  const day = hkDay(at);
  if (when === 'today') return day.date === hkDay(now).date;
  if (when === 'week') return at <= now + 7 * DAY;
  if (when === 'month') return at <= now + 31 * DAY;
  return at <= now + 7 * DAY && (day.weekday === 0 || day.weekday === 6);
}

/** Search and browse every upcoming event, with the design's filter menus. Opened from Discover. */
export default function Search() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { hiddenIds, user } = useAuth();
  const [text, setText] = useState(params.q ?? '');
  const [category, setCategory] = useState<string>(params.category ?? 'any');
  const [when, setWhen] = useState<When>('any');
  const [price, setPrice] = useState<Price>('any');
  const [college, setCollege] = useState<string>('any');
  const [sort, setSort] = useState<Sort>('date');
  const [menu, setMenu] = useState<Menu>(null);
  const query = useDebouncedValue(text.trim(), 250);

  const results = useQuery(async () => {
    const searching = query.length > 1;
    const [events, societies, tickets] = await Promise.all([
      api.listEvents({ from: new Date().toISOString(), search: searching ? query : undefined, limit: 200 }),
      searching ? api.listSocieties({ search: query }) : Promise.resolve([]),
      user ? api.myTickets().catch(() => []) : Promise.resolve([]),
    ]);
    const going = new Set(tickets.filter((tk) => tk.status === 'confirmed').map((tk) => tk.event.id));
    return { events, societies, going, now: Date.now() };
  }, [query, user?.id]);

  const events = useMemo(() => {
    const now = results.data?.now ?? 0;
    const searching = query.length > 1;
    const list = (results.data?.events ?? [])
      .filter((e) => searching || !hiddenIds.has(e.society_id))
      .filter((e) => category === 'any' || e.category === category)
      .filter((e) => price === 'any' || (price === 'free' ? !(e.price_hkd ?? 0) : (e.price_hkd ?? 0) > 0))
      .filter((e) => college === 'any' || e.society.college === college)
      .filter((e) => matchesWhen(e.starts_at, when, now));
    return sort === 'popular' ? [...list].sort(byBuzz) : list;
  }, [results.data, category, price, college, when, sort, hiddenIds, query]);

  const whenOptions: { value: When; label: string }[] = [
    { value: 'any', label: t('Any time') },
    { value: 'today', label: t('Today') },
    { value: 'week', label: t('This week') },
    { value: 'weekend', label: t('This weekend') },
    { value: 'month', label: t('This month') },
  ];
  const priceOptions: { value: Price; label: string }[] = [
    { value: 'any', label: t('Any price') },
    { value: 'free', label: t('Free') },
    { value: 'paid', label: t('Paid') },
  ];
  const categoryOptions = [
    { value: 'any', label: t('All categories') },
    ...EVENT_CATEGORIES.map((v) => ({ value: v as string, label: t(v) })),
  ];
  const collegeOptions = [{ value: 'any', label: t('All colleges') }, ...COLLEGES.map((v) => ({ value: v as string, label: t(v) }))];
  const sortOptions: { value: Sort; label: string }[] = [
    { value: 'date', label: t('Sort by date') },
    { value: 'popular', label: t('Most popular') },
  ];
  const labelOf = <T extends string>(opts: { value: T; label: string }[], v: T) => opts.find((o) => o.value === v)?.label ?? '';

  const countLabel =
    query.length > 1
      ? t('{n} events', { n: events.length })
      : when === 'any'
        ? t('{n} upcoming events', { n: events.length })
        : `${labelOf(whenOptions, when)} ${t('{n} events', { n: events.length })}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/discover'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          style={styles.back}>
          <Icon name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: -space.lg }}>
          <SearchField placeholder={t('Events, societies, places')} value={text} onChangeText={setText} autoFocus={!params.category} />
        </View>
      </View>
      <View style={{ flexShrink: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <DropChip label={t('Filters')} icon="options-outline" onPress={() => setMenu('filters')} />
          <DropChip
            label={when === 'any' ? t('Date') : labelOf(whenOptions, when)}
            selected={when !== 'any'}
            onPress={() => setMenu('when')}
          />
          <DropChip
            label={price === 'any' ? t('Price') : labelOf(priceOptions, price)}
            selected={price !== 'any'}
            onPress={() => setMenu('price')}
          />
          <DropChip
            label={category === 'any' ? t('Category') : t(category)}
            selected={category !== 'any'}
            onPress={() => setMenu('category')}
          />
          <DropChip label={college === 'any' ? t('College') : t(college)} selected={college !== 'any'} onPress={() => setMenu('college')} />
        </ScrollView>
      </View>
      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
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
            <View style={styles.countRow}>
              <Text style={[styles.count, { color: c.text }]}>{countLabel}</Text>
              <Pressable onPress={() => setMenu('sort')} accessibilityRole="button" hitSlop={8} style={styles.sort}>
                <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600' }}>{labelOf(sortOptions, sort)}</Text>
                <Icon name="chevron-down" size={15} color={c.textSecondary} />
              </Pressable>
            </View>
            {events.length ? (
              <View style={{ gap: 24, paddingHorizontal: space.lg }}>
                {events.map((e) => (
                  <EventCardWide key={e.id} event={e} going={!!results.data?.going.has(e.id)} />
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
      <StackTabBar current="discover" />

      <OptionSheet
        visible={menu === 'when'}
        title={t('Date')}
        options={whenOptions}
        value={when}
        onChange={setWhen}
        onClose={() => setMenu(null)}
      />
      <OptionSheet
        visible={menu === 'price'}
        title={t('Price')}
        options={priceOptions}
        value={price}
        onChange={setPrice}
        onClose={() => setMenu(null)}
      />
      <OptionSheet
        visible={menu === 'category'}
        title={t('Category')}
        options={categoryOptions}
        value={category}
        onChange={setCategory}
        onClose={() => setMenu(null)}
      />
      <OptionSheet
        visible={menu === 'college'}
        title={t('College')}
        options={collegeOptions}
        value={college}
        onChange={setCollege}
        onClose={() => setMenu(null)}
      />
      <OptionSheet
        visible={menu === 'sort'}
        title={t('Sort')}
        options={sortOptions}
        value={sort}
        onChange={setSort}
        onClose={() => setMenu(null)}
      />
      <Sheet visible={menu === 'filters'} onClose={() => setMenu(null)}>
        <Text style={[type.headline, { color: c.text }]} accessibilityRole="header">
          {t('Filters')}
        </Text>
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: space.lg }}>
          <FilterGroup title={t('Date')} options={whenOptions} value={when} onChange={setWhen} />
          <FilterGroup title={t('Price')} options={priceOptions} value={price} onChange={setPrice} />
          <FilterGroup title={t('Category')} options={categoryOptions} value={category} onChange={setCategory} />
          <FilterGroup title={t('College')} options={collegeOptions} value={college} onChange={setCollege} />
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            variant="secondary"
            title={t('Clear')}
            style={{ flex: 1 }}
            onPress={() => {
              setWhen('any');
              setPrice('any');
              setCategory('any');
              setCollege('any');
            }}
          />
          <Button title={t('Show {n} events', { n: events.length })} style={{ flex: 2 }} onPress={() => setMenu(null)} />
        </View>
      </Sheet>
    </View>
  );
}

function FilterGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.label, { color: c.textSecondary }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Search result card from the design: big cover with category, share and save on it. */
function EventCardWide({ event, going }: { event: EventWithSociety; going: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const a = availability(event);
  const price = (event.price_hkd ?? 0) > 0 ? formatHkd(event.price_hkd ?? 0) : event.price_text || t('Free');
  const tone: PillTone = going
    ? 'brand'
    : a.kind === 'open'
      ? 'success'
      : a.kind === 'drop-in'
        ? 'brand'
        : a.kind === 'full' || a.kind === 'cancelled' || a.kind === 'closed'
          ? 'danger'
          : 'warning';
  return (
    <View>
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={styles.cover}>
          {!!event.category && (
            <View style={styles.badge}>
              <Icon name={coverFor(event.category, event.id, dark).icon} size={14} color="#FFFFFF" />
              <Text style={styles.badgeText}>{t(event.category)}</Text>
            </View>
          )}
        </Artwork>
        <View style={{ gap: 3, marginTop: 10, paddingHorizontal: 2 }}>
          <Text style={{ color: c.text, fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 }} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={{ color: c.accentText, fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{formatWhen(event.starts_at)}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 21 }} numberOfLines={1}>
            {event.location} · {event.society.short_name ?? event.society.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{price}</Text>
            <Pill label={going ? t('Signed up') : a.label} tone={tone} icon={going ? 'checkmark' : undefined} />
          </View>
        </View>
      </Pressable>
      <View style={[styles.coverActions, { pointerEvents: 'box-none' }]}>
        <View style={styles.coverButton}>
          <ShareButton event={event} size={19} color="#0A0A0B" />
        </View>
        <View style={styles.coverButton}>
          <SaveButton eventId={event.id} size={19} color="#0A0A0B" />
        </View>
      </View>
    </View>
  );
}

const COVER = 196;

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: space.lg, gap: space.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: 14, paddingBottom: 4 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginTop: 10,
    marginBottom: 14,
  },
  count: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  cover: { height: COVER, borderRadius: 18 },
  badge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  coverActions: { position: 'absolute', right: 12, top: COVER - 12 - 42, flexDirection: 'row', gap: 10 },
  coverButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
