import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventRow } from '@/components/EventCard';
import { EmptyState, Icon, PageHeader, SegmentedControl, tap } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addDays, formatDay, formatDayRange, formatLongDay, formatTime, hkDate, todayHK } from '@/lib/format';
import { coverFor, palette, radius, space, useColors, useIsDark } from '@/lib/theme';
import type { CampusDate, EventWithSociety } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { getLang, t } from '@/lib/i18n';

type Filter = 'all' | 'following' | 'going';

const KIND_ICON = {
  university: 'school-outline',
  college: 'home-outline',
  holiday: 'sunny-outline',
  term: 'book-outline',
  exam: 'create-outline',
  deadline: 'alarm-outline',
} as const;

export default function CalendarScreen() {
  const c = useColors();
  const dark = useIsDark();
  const zh = getLang() === 'zh-Hant';
  const { user, followIds, hiddenIds, profile } = useAuth();
  const [selected, setSelected] = useState(todayHK());
  const [month, setMonth] = useState(todayHK().slice(0, 7));
  const [filter, setFilter] = useState<Filter>('all');

  const data = useQuery(async () => {
    const first = `${month}-01`;
    const from = addDays(first, -7);
    const to = addDays(first, 42);
    const [events, campusDates, tickets] = await Promise.all([
      api.listEvents({ from: new Date(`${from}T00:00:00+08:00`).toISOString(), to: new Date(`${to}T23:59:59+08:00`).toISOString() }),
      api.listCampusDates(from, to),
      api.myTickets(),
    ]);
    return { events, campusDates, goingIds: new Set(tickets.map((t) => t.event_id)) };
  }, [month, user?.id]);

  const events = useMemo(() => {
    const all = (data.data?.events ?? []).filter((e) => !hiddenIds.has(e.society_id) || data.data?.goingIds.has(e.id));
    if (filter === 'following') return all.filter((e) => followIds.has(e.society_id));
    if (filter === 'going') return all.filter((e) => data.data?.goingIds.has(e.id));
    return all;
  }, [data.data, filter, followIds, hiddenIds]);

  // Show university-wide dates plus the student's own college.
  const college = profile?.college;
  const campusDates = useMemo(
    () => (data.data?.campusDates ?? []).filter((d) => !d.college || !college || d.college === college),
    [data.data, college],
  );

  // Per day: how many events, whether you're going, and any campus date.
  const days = useMemo(() => {
    const m: Record<string, { count: number; going: boolean; campus?: CampusDate }> = {};
    const at = (day: string) => (m[day] ??= { count: 0, going: false });
    for (const e of events) {
      const d = at(hkDate(e.starts_at));
      d.count += 1;
      if (data.data?.goingIds.has(e.id)) d.going = true;
    }
    for (const cd of campusDates) for (let day = cd.starts_on; day <= cd.ends_on; day = addDays(day, 1)) at(day).campus ??= cd;
    return m;
  }, [events, campusDates, data.data]);

  const highlights = useMemo(() => {
    const today = todayHK();
    const all = (data.data?.events ?? []).filter(
      (e) => e.status === 'published' && hkDate(e.starts_at) >= today && !hiddenIds.has(e.society_id),
    );
    const next = all.find((e) => data.data?.goingIds.has(e.id));
    const popular = all
      .filter((e) => e.id !== next?.id && hkDate(e.starts_at) <= addDays(today, 30))
      .sort((a, b) => b.confirmed_count - a.confirmed_count)[0];
    const campus = campusDates.find((d) => d.starts_on > today);
    return { next, popular, campus };
  }, [data.data, campusDates, hiddenIds]);

  const dayEvents = events.filter((e) => hkDate(e.starts_at) <= selected && hkDate(e.ends_at) >= selected);
  const dayDates = campusDates.filter((d) => d.starts_on <= selected && d.ends_on >= selected);

  const goToday = () => {
    setSelected(todayHK());
    setMonth(todayHK().slice(0, 7));
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} />}>
      <PageHeader title={t('Calendar')}>
        <Pressable
          onPress={goToday}
          accessibilityRole="button"
          accessibilityLabel={t('Go to today')}
          style={({ pressed }) => [styles.todayButton, { borderColor: c.border, backgroundColor: pressed ? c.fill : c.backgroundPlain }]}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{t('Today')}</Text>
        </Pressable>
      </PageHeader>

      {(highlights.next || highlights.popular || highlights.campus) && (
        <View style={{ gap: space.sm, marginBottom: space.lg }}>
          <Text style={[styles.kicker, { color: c.textSecondary }]}>{t('Coming up · countdown')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 10 }}>
            {highlights.next && (
              <Countdown
                day={hkDate(highlights.next.starts_at)}
                tag={t('Your next event')}
                title={highlights.next.title}
                sub={`${formatTime(highlights.next.starts_at)} · ${t('Ticket saved')}`}
                bg={c.ink}
                fg={c.onInk}
                tagColor={palette.tangerine[300]}
                onPress={() => router.push(`/event/${highlights.next!.id}`)}
              />
            )}
            {highlights.popular && (
              <Countdown
                day={hkDate(highlights.popular.starts_at)}
                tag={t('Most popular')}
                title={highlights.popular.title}
                sub={t('{n} going', { n: highlights.popular.confirmed_count })}
                bg={coverFor(highlights.popular.category, highlights.popular.id, dark).color}
                fg="#fff"
                onPress={() => router.push(`/event/${highlights.popular!.id}`)}
              />
            )}
            {highlights.campus && (
              <Countdown
                day={highlights.campus.starts_on}
                tag={t('Campus date')}
                title={(zh && highlights.campus.title_zh) || highlights.campus.title}
                sub={formatDayRange(highlights.campus.starts_on, highlights.campus.ends_on)}
                bg={c.accentSoft}
                fg={dark ? c.accentText : palette.tangerine[800]}
              />
            )}
          </ScrollView>
        </View>
      )}

      <SegmentedControl
        style={{ marginHorizontal: space.lg }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('All events') },
          { value: 'following', label: t('Following') },
          { value: 'going', label: t('Signed up') },
        ]}
      />

      <MonthGrid month={month} onMonth={setMonth} selected={selected} onSelect={setSelected} days={days} />

      <View style={styles.legend}>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[c.fill, '#DCE4FF', palette.cobalt[200]].map((col) => (
            <View key={col} style={{ width: 8, height: 12, borderRadius: 2, backgroundColor: dark ? c.tintSoft : col }} />
          ))}
        </View>
        <Text style={[styles.legendText, { color: c.textSecondary }]}>{t('More events, darker day')}</Text>
        <Icon name="checkmark-circle" size={13} color={c.tint} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>{t('Signed up')}</Text>
        <View style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>{t('Campus dates')}</Text>
      </View>

      <View style={styles.dayHead}>
        <Text style={[styles.dayTitle, { color: c.text }]}>
          {formatLongDay(selected)}
          {selected === todayHK() || selected === addDays(todayHK(), 1) ? ` · ${formatDay(`${selected}T12:00:00+08:00`)}` : ''}
        </Text>
        {dayEvents.length > 0 && <Text style={{ color: c.textSecondary, fontSize: 14 }}>{t('{n} events', { n: dayEvents.length })}</Text>}
      </View>

      {dayDates.map((d) => (
        <CampusDateRow key={d.id} item={d} />
      ))}

      <View style={{ gap: space.lg }}>
        {dayEvents.map((e: EventWithSociety) => (
          <EventRow key={e.id} event={e} compact />
        ))}
      </View>

      {!dayEvents.length && !dayDates.length && !data.loading && (
        <EmptyState
          icon="calendar-clear-outline"
          title={t('Nothing on this day')}
          body={t('Pick another date, or switch to All events.')}
        />
      )}
    </ScrollView>
  );
}

function Countdown({
  day,
  tag,
  title,
  sub,
  bg,
  fg,
  tagColor,
  onPress,
}: {
  day: string;
  tag: string;
  title: string;
  sub: string;
  bg: string;
  fg: string;
  tagColor?: string;
  onPress?: () => void;
}) {
  const n = Math.round((new Date(`${day}T12:00:00+08:00`).getTime() - new Date(`${todayHK()}T12:00:00+08:00`).getTime()) / 86400_000);
  const big = n <= 0 ? t('Today') : n === 1 ? t('Tomorrow') : t('In {n} days', { n });
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.countdown, { backgroundColor: bg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm }}>
        <Text style={{ color: fg, fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 }}>{big}</Text>
        <Text style={{ color: tagColor ?? fg, fontSize: 12, fontWeight: '600', opacity: tagColor ? 1 : 0.9 }} numberOfLines={1}>
          {tag}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: fg, fontSize: 12, opacity: 0.75 }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

type DayInfo = { count: number; going: boolean; campus?: CampusDate };

/** Month grid from the design: busier days are a deeper blue, your days get a tick, campus dates an orange bar. */
function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  days,
}: {
  month: string;
  onMonth: (m: string) => void;
  selected: string;
  onSelect: (d: string) => void;
  days: Record<string, DayInfo>;
}) {
  const c = useColors();
  const dark = useIsDark();
  const zh = getLang() === 'zh-Hant';
  const first = `${month}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = addDays(first, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: cells[35].slice(0, 7) === month ? 6 : 5 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const today = todayHK();
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    onMonth(d.toISOString().slice(0, 7));
  };
  const title = new Intl.DateTimeFormat(zh ? 'zh-HK' : 'en-GB', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${first}T12:00:00Z`),
  );
  const weekdays = zh ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const heat = (n: number) =>
    n <= 0
      ? 'transparent'
      : dark
        ? [c.tintSoft, palette.cobalt[800], palette.cobalt[700]][Math.min(n, 3) - 1]
        : [c.fill, '#DCE4FF', palette.cobalt[200]][Math.min(n, 3) - 1];

  return (
    <View style={{ paddingHorizontal: 13, marginTop: space.lg }}>
      <View style={styles.monthHead}>
        <Text style={{ color: c.text, fontSize: 20, lineHeight: 28, fontWeight: '600' }} accessibilityRole="header">
          {title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel={t('Previous month')} style={styles.arrow}>
            <Icon name="chevron-back" size={20} color={c.tint} />
          </Pressable>
          <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel={t('Next month')} style={styles.arrow}>
            <Icon name="chevron-forward" size={20} color={c.tint} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {weekdays.map((w, i) => (
          <Text key={i} style={[styles.weekday, { color: palette.neutral[450] }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={{ flexDirection: 'row' }}>
          {week.map((day) => {
            const info = days[day];
            const out = day.slice(0, 7) !== month;
            const isSel = day === selected;
            const isToday = day === today;
            const label =
              info?.campus && (info.campus.starts_on === day || day.endsWith('-01') || new Date(`${day}T12:00:00Z`).getUTCDay() === 0);
            return (
              <Pressable
                key={day}
                onPress={() => {
                  tap();
                  onSelect(day);
                  if (out) onMonth(day.slice(0, 7));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${formatLongDay(day)}${info?.count ? `, ${t('{n} events', { n: info.count })}` : ''}${info?.going ? `, ${t('Going')}` : ''}`}
                style={styles.cell}>
                <View style={[styles.cellBox, { backgroundColor: isSel ? c.ink : heat(info?.count ?? 0) }]}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: isSel || isToday ? '700' : '500',
                      color: isSel ? c.onInk : out ? c.disabledText : isToday ? c.tintText : c.text,
                      fontVariant: ['tabular-nums'],
                    }}>
                    {Number(day.slice(8))}
                  </Text>
                  {isToday && !isSel && (
                    <Text style={{ fontSize: 9, fontWeight: '700', color: c.tintText, marginTop: -2 }}>{t('Today')}</Text>
                  )}
                  {info?.going && (
                    <View style={[styles.tick, { backgroundColor: c.tint, borderColor: c.backgroundPlain }]}>
                      <Icon name="checkmark" size={9} color="#fff" />
                    </View>
                  )}
                </View>
                {info?.campus && (
                  <View style={[styles.campusBar, { backgroundColor: c.accentSoft }]}>
                    {label && (
                      <Text style={{ fontSize: 9, fontWeight: '700', color: c.accentText }} numberOfLines={1}>
                        {(zh && info.campus.title_zh) || info.campus.title}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function CampusDateRow({ item }: { item: CampusDate }) {
  const c = useColors();
  return (
    <View style={[styles.campusRow, { backgroundColor: c.card, borderLeftColor: c.gold }]}>
      <Icon name={KIND_ICON[item.kind]} size={20} color={c.gold} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{(getLang() === 'zh-Hant' && item.title_zh) || item.title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          {item.college ? `${t('{college} College', { college: t(item.college) })} · ` : ''}
          {formatDayRange(item.starts_on, item.ends_on)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  todayButton: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 15, lineHeight: 22, fontWeight: '600', paddingHorizontal: space.lg },
  countdown: { width: 226, height: 112, padding: 12, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'space-between' },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  cell: { flex: 1, height: 56 },
  cellBox: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 2,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    top: -4,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campusBar: { position: 'absolute', left: 0, right: 0, top: 43, height: 11, justifyContent: 'center', paddingHorizontal: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: space.lg, marginTop: space.xs },
  legendText: { fontSize: 12, marginRight: space.sm },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  dayTitle: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  campusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderLeftWidth: 4,
  },
});
