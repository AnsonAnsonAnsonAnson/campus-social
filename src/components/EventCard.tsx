import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { availability, formatDay, formatTime, formatWhen } from '@/lib/format';
import { palette, radius, space, useColors, useIsDark } from '@/lib/theme';
import type { EventWithSociety, Ticket } from '@/lib/types';
import { t } from '@/lib/i18n';

import { toast } from './Toast';
import { Artwork, Icon, Pill, tap } from './ui';

function availabilityTone(event: EventWithSociety) {
  const a = availability(event);
  const tone =
    a.kind === 'few' || a.kind === 'waitlist'
      ? ('warning' as const)
      : a.kind === 'full' || a.kind === 'cancelled' || a.kind === 'closed'
        ? ('danger' as const)
        : a.kind === 'drop-in'
          ? ('brand' as const)
          : ('success' as const);
  return { ...a, tone };
}

function AvailabilityPill({ event }: { event: EventWithSociety }) {
  const a = availabilityTone(event);
  return <Pill label={a.label} tone={a.tone} />;
}

const shareEvent = (e: EventWithSociety) => Share.share({ message: `${e.title}\n${Linking.createURL(`/event/${e.id}`)}` });

/** Large card for horizontal carousels. */
export function EventCardLarge({ event, width = 280 }: { event: EventWithSociety; width?: number }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.large, { width, opacity: pressed ? 0.85 : 1 }]}>
      <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={styles.largeArt} />
      <View style={{ paddingTop: space.sm, gap: 3 }}>
        <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
          {formatWhen(event.starts_at)}
        </Text>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
          {event.location} · {event.society.short_name ?? event.society.name}
        </Text>
        <View style={{ marginTop: 4, flexDirection: 'row' }}>
          <AvailabilityPill event={event} />
        </View>
      </View>
    </Pressable>
  );
}

/** Heart: save an event for later. Lives in Tickets › Saved. */
export function SaveButton({ eventId, size = 21, color }: { eventId: string; size?: number; color?: string }) {
  const c = useColors();
  const { savedIds, toggleSave } = useAuth();
  const saved = savedIds.includes(eventId);
  const onPress = () => {
    tap();
    toggleSave(eventId)
      .then(() => toast(saved ? t('Removed from saved') : t('Saved. Find it in Tickets.'), { icon: saved ? 'heart-outline' : 'heart' }))
      .catch((e) => toast(errorMessage(e), { tone: 'error' }));
  };
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={saved ? t('Saved event') : t('Save event')}
      accessibilityState={{ selected: saved }}
      style={styles.rowAction}>
      <Icon name={saved ? 'heart' : 'heart-outline'} size={size} color={saved ? c.danger : (color ?? c.text)} />
    </Pressable>
  );
}

export function ShareButton({ event, size = 20, color }: { event: EventWithSociety; size?: number; color?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => shareEvent(event)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('Share')}
      style={styles.rowAction}>
      <Icon name="share-outline" size={size} color={color ?? c.text} />
    </Pressable>
  );
}

/**
 * List row from the design: square cover, date, title, venue, then the place
 * count with share and save. `compact` drops the buttons for society pages.
 */
export function EventRow({ event, compact }: { event: EventWithSociety; compact?: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const a = availabilityTone(event);
  const toneColor = { warning: c.warningText, danger: c.dangerText, brand: c.tintText, success: c.successText }[a.tone];
  const thumb = compact ? 64 : 104;
  const quiet = dark ? c.textSecondary : palette.neutral[700];
  // The buttons sit beside the row link, not inside it: nested buttons are invalid on web
  // and VoiceOver can't reach the inner one.
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.rowLink, { opacity: pressed ? 0.7 : 1 }]}>
        <Artwork
          seed={event.id}
          uri={event.cover_url}
          category={event.category}
          style={{ width: thumb, height: thumb, borderRadius: compact ? 12 : 14 }}
        />
        <View style={{ flex: 1, gap: 2, minHeight: thumb }}>
          <Text style={{ color: c.accentText, fontSize: 13, lineHeight: 19, fontWeight: '600' }} numberOfLines={1}>
            {formatWhen(event.starts_at)}
          </Text>
          <Text style={{ color: c.text, fontSize: compact ? 16 : 17, lineHeight: 22, fontWeight: '600' }} numberOfLines={2}>
            {event.status === 'cancelled' ? t('Cancelled: {title}', { title: event.title }) : event.title}
          </Text>
          {!compact && (
            <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
              {event.location}
            </Text>
          )}
          <Text
            style={{
              color: toneColor,
              fontSize: 13,
              lineHeight: compact ? 18 : 36,
              fontWeight: '600',
              marginTop: 'auto',
              paddingRight: compact ? 0 : 80,
            }}
            numberOfLines={1}>
            {a.label}
          </Text>
        </View>
      </Pressable>
      {!compact && (
        <View style={styles.rowActions}>
          <ShareButton event={event} color={quiet} />
          <SaveButton eventId={event.id} color={quiet} />
        </View>
      )}
    </View>
  );
}

/** Top of Discover when you have a ticket coming up. */
export function NextEventCard({ ticket }: { ticket: Ticket }) {
  const c = useColors();
  const e = ticket.event;
  return (
    <View style={[styles.next, { backgroundColor: c.ink }]}>
      <Pressable
        onPress={() => router.push(`/event/${e.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.nextLink, { opacity: pressed ? 0.8 : 1 }]}>
        <Artwork seed={e.id} uri={e.cover_url} category={e.category} style={styles.nextArt} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: palette.tangerine[300], fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
            {t('Your next event · {when}', { when: `${formatDay(e.starts_at)} ${formatTime(e.starts_at)}` })}
          </Text>
          <Text style={{ color: c.onInk, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {e.title}
          </Text>
          <Text style={{ color: palette.neutral[400], fontSize: 13 }} numberOfLines={1}>
            {e.location}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.navigate('/tickets')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.nextButton, { backgroundColor: c.onInk, opacity: pressed ? 0.8 : 1 }]}>
        <Icon name="qr-code-outline" size={15} color={c.ink} />
        <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>{t('Ticket')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  large: { borderRadius: radius.lg },
  largeArt: { height: 140, borderRadius: 16 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  row: { marginHorizontal: space.lg },
  rowLink: { flexDirection: 'row', gap: 14 },
  rowActions: { position: 'absolute', right: -8, bottom: 0, flexDirection: 'row', gap: 2 },
  rowAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  next: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 12, borderRadius: 18 },
  nextLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  nextArt: { width: 56, height: 56, borderRadius: 12 },
  nextButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: radius.pill },
});
