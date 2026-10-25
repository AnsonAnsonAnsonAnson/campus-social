import * as Calendar from 'expo-calendar/legacy';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActionSheetIOS, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';
import { FollowButton } from '@/components/SocietyRow';
import { TicketQR } from '@/components/TicketCard';
import { toast } from '@/components/Toast';
import { Artwork, Button, ErrorView, Field, Icon, Pill, SocietyAvatar, type IconName } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { availability, formatWhen } from '@/lib/format';
import { offerNotifications, refreshReminders } from '@/lib/notifications';
import { radius, space, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, requireSignIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');

  const q = useQuery(async () => {
    const [event, registration, mine] = await Promise.all([api.getEvent(id), api.myRegistration(id), api.mySocieties()]);
    const position = registration?.status === 'waitlisted' ? await api.waitlistPosition(id) : 0;
    const isCommittee = !!event && mine.some((s) => s.id === event.society_id);
    return { event, registration, position, isCommittee };
  }, [id, user?.id]);

  if (q.loading) return <EventSkeleton />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const event = q.data?.event;
  if (!event) return <ErrorView message={t('This event is no longer available.')} />;

  const reg = q.data?.registration;
  const active = reg && reg.status !== 'cancelled';
  const avail = availability(event);
  const past = event.ends_at < new Date().toISOString();

  const startRegister = () => {
    if (!requireSignIn()) return;
    if (event.signup_question) setAsking(true);
    else register();
  };

  const register = async () => {
    setBusy(true);
    try {
      const r = await api.register(event.id, answer);
      setAsking(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      toast(
        r.status === 'confirmed' ? t("You're in! Your QR ticket is ready.") : t("You're on the waitlist. We'll move you up automatically."),
        {
          icon: r.status === 'confirmed' ? 'ticket' : 'hourglass',
        },
      );
      await offerNotifications();
      refreshReminders();
    } catch (e) {
      showAlert(t('Could not register'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    showAlert(
      reg?.status === 'waitlisted' ? t('Leave the waitlist?') : t('Cancel your spot?'),
      t('Your spot will go to the next person on the waitlist.'),
      [
        { text: t('Keep it'), style: 'cancel' },
        {
          text: reg?.status === 'waitlisted' ? t('Leave waitlist') : t('Cancel spot'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.cancelRegistration(event.id);
              invalidate();
              toast(reg?.status === 'waitlisted' ? t('You left the waitlist') : t('Your spot was cancelled'), { tone: 'info' });
              refreshReminders();
            } catch (e) {
              showAlert(t('Could not cancel'), errorMessage(e));
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
      showAlert(t('Could not open calendar'), errorMessage(e));
    }
  };

  const openMap = () => {
    // Society locations are short ("LT1, YIA"), so search for them on campus.
    const query = encodeURIComponent(`${event.location}, CUHK, Sha Tin`);
    Linking.openURL(
      Platform.OS === 'ios' ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`,
    );
  };

  const share = () =>
    Share.share({
      message: `${event.title} · ${formatWhen(event.starts_at, event.ends_at)} @ ${event.location}\n${Linking.createURL(`/event/${event.id}`)}`,
    });

  const more = () => {
    const options = [t('Add to calendar'), t('Share'), t('Report event'), t('Cancel')];
    const run = (i: number) => {
      if (i === 0) addToCalendar();
      if (i === 1) share();
      if (i === 2 && requireSignIn()) router.push({ pathname: '/report', params: { type: 'event', id: event.id, name: event.title } });
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, destructiveButtonIndex: 2 }, run);
    } else {
      showAlert(event.title, undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: options[2], onPress: () => run(2) },
        { text: t('Cancel'), style: 'cancel' },
      ]);
    }
  };

  let primary: React.ReactNode;
  if (event.removed_at) primary = <Button title={t('Removed by moderators')} disabled onPress={() => {}} />;
  else if (event.status === 'cancelled') primary = <Button title={t('This event was cancelled')} disabled onPress={() => {}} />;
  else if (past) primary = <Button title={t('This event has ended')} disabled onPress={() => {}} />;
  else if (active)
    primary = (
      <Button
        title={reg.status === 'waitlisted' ? t('Leave waitlist') : t('Cancel my spot')}
        variant="secondary"
        loading={busy}
        onPress={cancel}
      />
    );
  else if (avail.kind === 'open' || avail.kind === 'few')
    primary = <Button title={t('Register')} icon="ticket-outline" loading={busy} onPress={startRegister} />;
  else if (avail.kind === 'waitlist')
    primary = <Button title={t('Join waitlist')} icon="hourglass-outline" loading={busy} onPress={startRegister} />;
  else if (avail.kind === 'drop-in') primary = <Button title={t('Add to calendar')} icon="calendar-outline" onPress={addToCalendar} />;
  else primary = <Button title={avail.label} disabled onPress={() => {}} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={more} hitSlop={12} accessibilityLabel={t('More options')} style={styles.headerButton}>
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
            <Pill label={t(event.category)} tone="brand" />
            {event.status === 'draft' && <Pill label={t('Draft')} tone="warning" />}
            {event.status === 'cancelled' && <Pill label={t('Cancelled')} tone="danger" />}
            {!!event.removed_at && <Pill label={t('Hidden by moderators')} tone="danger" />}
          </View>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
            {event.title}
          </Text>

          <Pressable onPress={() => router.push(`/society/${event.society_id}`)} style={[styles.societyRow, { backgroundColor: c.card }]}>
            <SocietyAvatar name={event.society.name} uri={event.society.logo_url} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('Hosted by')}</Text>
              <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                {event.society.name}
              </Text>
            </View>
            <FollowButton societyId={event.society_id} />
          </Pressable>

          <View style={[styles.infoCard, { backgroundColor: c.card }]}>
            <Info
              icon="time-outline"
              title={formatWhen(event.starts_at, event.ends_at)}
              onPress={addToCalendar}
              hint={t('Add to calendar')}
            />
            <Info
              icon="location-outline"
              title={event.location || t('Location TBC')}
              onPress={event.location ? openMap : undefined}
              hint={event.location ? t('Open in Maps') : undefined}
            />
            <Info icon="cash-outline" title={event.price_text || t('Free')} />
            {event.registration_required && (
              <Info
                icon="people-outline"
                title={
                  event.capacity
                    ? t('{n}/{capacity} going', { n: event.confirmed_count, capacity: event.capacity }) +
                      (event.waitlist_count ? ` · ${t('{n} on waitlist', { n: event.waitlist_count })}` : '')
                    : t('{n} going', { n: event.confirmed_count })
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
                    {reg.checked_in_at ? t('Checked in ✓') : t("You're going")}
                  </Text>
                  <TicketQR code={reg.ticket_code} size={200} />
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Show this QR code at the door')}</Text>
                  {!!reg.answer && <YourAnswer question={event.signup_question} answer={reg.answer} />}
                </>
              ) : (
                <>
                  <Text style={{ color: c.warning, fontWeight: '700', fontSize: 17 }}>
                    {t('You’re #{n} on the waitlist', { n: q.data?.position || '?' })}
                  </Text>
                  <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
                    {t('If someone cancels, you’ll be moved up automatically and your ticket will appear here.')}
                  </Text>
                  {!!reg.answer && <YourAnswer question={event.signup_question} answer={reg.answer} />}
                </>
              )}
            </View>
          )}

          <Text style={[styles.h2, { color: c.text }]}>{t('About')}</Text>
          <Text style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{event.description || t('No description yet.')}</Text>
        </View>
      </ScrollView>

      <View
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.card, borderTopColor: c.border }]}>
        {q.data?.isCommittee && (
          <Button
            small
            variant="secondary"
            title={t('Manage')}
            icon="settings-outline"
            onPress={() => router.push({ pathname: '/manage/attendees', params: { eventId: event.id } })}
          />
        )}
        <View style={{ flex: 1 }}>{primary}</View>
      </View>

      <Modal visible={asking} transparent animationType="slide" onRequestClose={() => setAsking(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAsking(false)} accessibilityLabel={t('Close')} />
          <View style={[styles.sheet, { backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
            <Text style={[type.title, { color: c.text }]}>{t('One quick question')}</Text>
            <Text style={[type.subhead, { color: c.textSecondary }]}>
              {t('{society} asks everyone who signs up:', { society: event.society.name })}
            </Text>
            <Text style={[type.headline, { color: c.text }]}>{event.signup_question}</Text>
            <Field
              label={t('Your answer')}
              value={answer}
              onChangeText={setAnswer}
              maxLength={500}
              multiline
              autoFocus
              placeholder={t('Your answer (optional)')}
              style={{ minHeight: 90 }}
            />
            <Button
              title={avail.kind === 'waitlist' ? t('Join waitlist') : t('Confirm registration')}
              icon="ticket-outline"
              loading={busy}
              onPress={register}
            />
            <Button title={t('Not now')} variant="plain" onPress={() => setAsking(false)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function YourAnswer({ question, answer }: { question: string | null; answer: string }) {
  const c = useColors();
  return (
    <View
      style={{ alignSelf: 'stretch', gap: 2, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
      <Text style={[type.footnote, { color: c.textSecondary }]}>{question ?? t('Your answer')}</Text>
      <Text style={[type.subhead, { color: c.text }]}>{answer}</Text>
    </View>
  );
}

function EventSkeleton() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }} accessibilityLabel={t('Loading')}>
      <Skeleton height={260} round={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Skeleton width={80} height={20} round={10} />
        <Skeleton width="90%" height={28} />
        <Skeleton width="60%" height={28} />
        <Skeleton height={64} round={radius.lg} />
        <Skeleton height={150} round={radius.lg} />
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
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
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
