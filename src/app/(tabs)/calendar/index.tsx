import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { EventRow } from '@/components/EventCard';
import { EmptyState, Icon, SegmentedControl } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addDays, formatDayRange, formatLongDay, hkDate, todayHK } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { CampusDate, EventWithSociety } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { getLang, onLanguageChange, t } from '@/lib/i18n';

type Filter = 'all' | 'following' | 'going';

// Month and weekday names for the calendar grid. The library's built-in
// default is English; this adds Traditional Chinese.
LocaleConfig.locales['zh-Hant'] = {
  monthNames: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  monthNamesShort: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  dayNames: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
  dayNamesShort: ['日', '一', '二', '三', '四', '五', '六'],
  today: '今日',
};
onLanguageChange((lang) => {
  LocaleConfig.defaultLocale = lang === 'zh-Hant' ? 'zh-Hant' : '';
});

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
  const zh = getLang() === 'zh-Hant';
  const { user, followIds, profile } = useAuth();
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
    const all = data.data?.events ?? [];
    if (filter === 'following') return all.filter((e) => followIds.has(e.society_id));
    if (filter === 'going') return all.filter((e) => data.data?.goingIds.has(e.id));
    return all;
  }, [data.data, filter, followIds]);

  // Show university-wide dates plus the student's own college.
  const college = profile?.college;
  const campusDates = useMemo(
    () => (data.data?.campusDates ?? []).filter((d) => !d.college || !college || d.college === college),
    [data.data, college],
  );

  const marked = useMemo(() => {
    const m: Record<string, { dots: { key: string; color: string }[]; selected?: boolean; selectedColor?: string }> = {};
    const add = (day: string, key: string, color: string) => {
      m[day] ??= { dots: [] };
      if (!m[day].dots.some((d) => d.key === key)) m[day].dots.push({ key, color });
    };
    for (const e of events)
      add(hkDate(e.starts_at), data.data?.goingIds.has(e.id) ? 'going' : 'event', data.data?.goingIds.has(e.id) ? c.success : c.tint);
    for (const d of campusDates) for (let day = d.starts_on; day <= d.ends_on; day = addDays(day, 1)) add(day, 'campus', c.gold);
    m[selected] = { ...(m[selected] ?? { dots: [] }), selected: true, selectedColor: c.tint };
    return m;
  }, [events, campusDates, selected, c, data.data]);

  const dayEvents = events.filter((e) => hkDate(e.starts_at) <= selected && hkDate(e.ends_at) >= selected);
  const dayDates = campusDates.filter((d) => d.starts_on <= selected && d.ends_on >= selected);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} />}>
      <SegmentedControl
        style={{ marginHorizontal: space.lg }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('All events') },
          { value: 'following', label: t('Following') },
          { value: 'going', label: t('Going') },
        ]}
      />

      <View style={[styles.calendarCard, { backgroundColor: c.card }]}>
        <Calendar
          key={c.background}
          current={`${month}-01`}
          monthFormat={zh ? "yyyy'年'M'月'" : 'MMMM yyyy'}
          markingType="multi-dot"
          markedDates={marked}
          onDayPress={(d) => setSelected(d.dateString)}
          onMonthChange={(d) => setMonth(d.dateString.slice(0, 7))}
          enableSwipeMonths
          theme={{
            calendarBackground: c.card,
            dayTextColor: c.text,
            monthTextColor: c.text,
            textSectionTitleColor: c.textSecondary,
            textDisabledColor: c.border,
            todayTextColor: c.tint,
            arrowColor: c.tint,
            selectedDayBackgroundColor: c.tint,
            selectedDayTextColor: c.onTint,
            textMonthFontWeight: '700',
          }}
        />
        <View style={styles.legend}>
          <Legend color={c.tint} label={t('Events')} />
          <Legend color={c.success} label={t('Going')} />
          <Legend color={c.gold} label={t('Campus dates')} />
        </View>
      </View>

      <Text style={[styles.dayTitle, { color: c.text }]}>{formatLongDay(selected)}</Text>

      {dayDates.map((d) => (
        <CampusDateRow key={d.id} item={d} />
      ))}

      <View style={{ gap: space.sm }}>
        {dayEvents.map((e: EventWithSociety) => (
          <EventRow key={e.id} event={e} />
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

function Legend({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{label}</Text>
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
  calendarCard: { marginHorizontal: space.lg, marginTop: space.md, borderRadius: radius.lg, overflow: 'hidden', paddingBottom: space.md },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  dayTitle: { fontSize: 20, fontWeight: '700', marginHorizontal: space.lg, marginTop: space.xl, marginBottom: space.md },
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
