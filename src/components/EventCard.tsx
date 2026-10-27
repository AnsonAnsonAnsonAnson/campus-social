import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { availability, formatDay, formatTime, formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { EventWithSociety } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Artwork, Icon, Pill } from './ui';

function AvailabilityPill({ event }: { event: EventWithSociety }) {
  const a = availability(event);
  const tone =
    a.kind === 'few' || a.kind === 'waitlist'
      ? 'warning'
      : a.kind === 'full' || a.kind === 'cancelled' || a.kind === 'closed'
        ? 'danger'
        : a.kind === 'drop-in'
          ? 'brand'
          : 'success';
  return <Pill label={a.label} tone={tone} />;
}

/** Large card for horizontal carousels. */
export function EventCardLarge({ event, width = 280 }: { event: EventWithSociety; width?: number }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.large, { width, backgroundColor: c.card, opacity: pressed ? 0.85 : 1 }]}>
      <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={styles.largeArt}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeText}>{formatDay(event.starts_at)}</Text>
        </View>
      </Artwork>
      <View style={{ padding: space.md, gap: 4 }}>
        <Text style={[styles.society, { color: c.tint }]} numberOfLines={1}>
          {event.society.short_name ?? event.society.name}
        </Text>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 14 }} numberOfLines={1}>
          {formatTime(event.starts_at)} · {event.location}
        </Text>
        <View style={{ marginTop: 4 }}>
          <AvailabilityPill event={event} />
        </View>
      </View>
    </Pressable>
  );
}

/** Compact list row. */
export function EventRow({ event }: { event: EventWithSociety }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.card }]}>
      <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={styles.rowArt} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.tint, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
          {formatWhen(event.starts_at)}
        </Text>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
          {event.status === 'cancelled' ? t('Cancelled: {title}', { title: event.title }) : event.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="location-outline" size={13} />
          <Text style={{ color: c.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {event.society.short_name ?? event.society.name} · {event.location}
          </Text>
        </View>
        <AvailabilityPill event={event} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  large: { borderRadius: radius.lg, overflow: 'hidden' },
  largeArt: { height: 140 },
  dateBadge: {
    position: 'absolute',
    left: space.md,
    top: space.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  society: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, marginHorizontal: space.lg },
  rowArt: { width: 84, height: 84, borderRadius: radius.md },
});
