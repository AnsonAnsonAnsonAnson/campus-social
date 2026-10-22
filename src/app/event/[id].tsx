import * as Calendar from 'expo-calendar/legacy';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FollowButton } from '@/components/SocietyRow';
import { TicketQR } from '@/components/TicketCard';
import { Artwork, Button, ErrorView, Icon, Loading, Pill, SocietyAvatar, type IconName } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { availability, formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import * as Haptics from 'expo-haptics';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, requireSignIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [event, registration, mine] = await Promise.all([api.getEvent(id), api.myRegistration(id), api.mySocieties()]);
    const position = registration?.status === 'waitlisted' ? await api.waitlistPosition(id) : 0;
    const isCommittee = !!event && mine.some((s) => s.id === event.society_id);
    return { event, registration, position, isCommittee };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const event = q.data?.event;
  if (!event) return <ErrorView message="This event is no longer available." />;

  const reg = q.data?.registration;
  const active = reg && reg.status !== 'cancelled';
  const avail = availability(event);
  const past = event.ends_at < new Date().toISOString();

  const register = async () => {
    if (!requireSignIn()) return;
    setBusy(true);
    try {
      const r = await api.register(event.id);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      Alert.alert(
        r.status === 'confirmed' ? "You're in! 🎉" : "You're on the waitlist",
        r.status === 'confirmed'
          ? 'Your QR ticket is saved in the Tickets tab.'
          : "We'll move you up automatically if a spot opens. Check the Tickets tab for your status.",
      );
    } catch (e) {
      Alert.alert('Could not register', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    Alert.alert(
      reg?.status === 'waitlisted' ? 'Leave the waitlist?' : 'Cancel your spot?',
      'Your spot will go to the next person on the waitlist.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: reg?.status === 'waitlisted' ? 'Leave waitlist' : 'Cancel spot',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.cancelRegistration(event.id);
              invalidate();
            } catch (e) {
              Alert.alert('Could not cancel', errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const addToCalendar = async () => {
    try {
      await Calendar.createEventInCalendarAsync({
        title: event.title,
        startDate: new Date(event.starts_at),
        endDate: new Date(event.ends_at),
        location: event.location,
        notes: `${event.society.name}\n\n${event.description}`,
        timeZone: 'Asia/Hong_Kong',
      });
    } catch (e) {
      Alert.alert('Could not open calendar', errorMessage(e));
    }
  };

  const share = () =>
    Share.share({
      message: `${event.title} · ${formatWhen(event.starts_at, event.ends_at)} @ ${event.location}\n${Linking.createURL(`/event/${event.id}`)}`,
    });

  const more = () => {
    const options = ['Add to calendar', 'Share', 'Report event', 'Cancel'];
    const run = (i: number) => {
      if (i === 0) addToCalendar();
      if (i === 1) share();
      if (i === 2 && requireSignIn()) router.push({ pathname: '/report', params: { type: 'event', id: event.id, name: event.title } });
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, destructiveButtonIndex: 2 }, run);
    } else {
      Alert.alert(event.title, undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: options[2], onPress: () => run(2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  let primary: React.ReactNode;
  if (event.status === 'cancelled') primary = <Button title="This event was cancelled" disabled onPress={() => {}} />;
  else if (past) primary = <Button title="This event has ended" disabled onPress={() => {}} />;
  else if (active)
    primary = (
      <Button
        title={reg.status === 'waitlisted' ? 'Leave waitlist' : 'Cancel my spot'}
        variant="secondary"
        loading={busy}
        onPress={cancel}
      />
    );
  else if (avail.kind === 'open' || avail.kind === 'few')
    primary = <Button title="Register" icon="ticket-outline" loading={busy} onPress={register} />;
  else if (avail.kind === 'waitlist') primary = <Button title="Join waitlist" icon="hourglass-outline" loading={busy} onPress={register} />;
  else if (avail.kind === 'drop-in') primary = <Button title="Add to calendar" icon="calendar-outline" onPress={addToCalendar} />;
  else primary = <Button title={avail.label} disabled onPress={() => {}} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={more} hitSlop={12} accessibilityLabel="More options" style={styles.headerButton}>
              <Icon name="ellipsis-horizontal" size={20} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Artwork seed={event.id} uri={event.cover_url} style={{ height: 240 + insets.top * 0.5 }}>
          <View style={styles.heroScrim} />
        </Artwork>

        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Pill label={event.category} tone="brand" />
            {event.status === 'draft' && <Pill label="Draft" tone="warning" />}
            {event.status === 'cancelled' && <Pill label="Cancelled" tone="danger" />}
          </View>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
            {event.title}
          </Text>

          <Pressable onPress={() => router.push(`/society/${event.society_id}`)} style={[styles.societyRow, { backgroundColor: c.card }]}>
            <SocietyAvatar name={event.society.name} uri={event.society.logo_url} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>Hosted by</Text>
              <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                {event.society.name}
              </Text>
            </View>
            <FollowButton societyId={event.society_id} />
          </Pressable>

          <View style={[styles.infoCard, { backgroundColor: c.card }]}>
            <Info icon="time-outline" title={formatWhen(event.starts_at, event.ends_at)} onPress={addToCalendar} hint="Add to calendar" />
            <Info icon="location-outline" title={event.location || 'Location TBC'} />
            <Info icon="cash-outline" title={event.price_text || 'Free'} />
            {event.registration_required && (
              <Info
                icon="people-outline"
                title={
                  event.capacity
                    ? `${event.confirmed_count}/${event.capacity} going${event.waitlist_count ? ` · ${event.waitlist_count} on waitlist` : ''}`
                    : `${event.confirmed_count} going`
                }
                hint={avail.label}
              />
            )}
          </View>

          {active && (
            <View style={[styles.ticket, { backgroundColor: c.card }]}>
              {reg.status === 'confirmed' ? (
                <>
                  <Text style={{ color: c.success, fontWeight: '700', fontSize: 17 }}>
                    {reg.checked_in_at ? 'Checked in ✓' : "You're going"}
                  </Text>
                  <TicketQR code={reg.ticket_code} size={200} />
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>Show this QR code at the door</Text>
                </>
              ) : (
                <>
                  <Text style={{ color: c.warning, fontWeight: '700', fontSize: 17 }}>
                    You're #{q.data?.position || '?'} on the waitlist
                  </Text>
                  <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
                    If someone cancels, you'll be moved up automatically and your ticket will appear here.
                  </Text>
                </>
              )}
            </View>
          )}

          <Text style={[styles.h2, { color: c.text }]}>About</Text>
          <Text style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{event.description || 'No description yet.'}</Text>
        </View>
      </ScrollView>

      <View
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.card, borderTopColor: c.border }]}>
        {q.data?.isCommittee && (
          <Button
            small
            variant="secondary"
            title="Manage"
            icon="settings-outline"
            onPress={() => router.push({ pathname: '/manage/attendees', params: { eventId: event.id } })}
          />
        )}
        <View style={{ flex: 1 }}>{primary}</View>
      </View>
    </View>
  );
}

function Info({ icon, title, hint, onPress }: { icon: IconName; title: string; hint?: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.info}>
      <Icon name={icon} size={20} color={c.tint} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '500' }}>{title}</Text>
        {hint && <Text style={{ color: onPress ? c.tint : c.textSecondary, fontSize: 13 }}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.15)' },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  h2: { fontSize: 20, fontWeight: '700', marginTop: space.sm },
  societyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  infoCard: { borderRadius: radius.lg, paddingVertical: space.xs },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  ticket: { alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
