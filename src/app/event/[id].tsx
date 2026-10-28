import * as Calendar from 'expo-calendar/legacy';
import * as Linking from 'expo-linking';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SaveButton } from '@/components/EventCard';
import { VerifiedBadge } from '@/components/Glyph';
import { Skeleton } from '@/components/Skeleton';
import { FollowButton } from '@/components/SocietyRow';
import { LiveTicketQR } from '@/components/TicketCard';
import { toast } from '@/components/Toast';
import {
  Artwork,
  Banner,
  Button,
  ErrorView,
  Field,
  Icon,
  InfoRow,
  Pill,
  ProgressBar,
  SegmentedControl,
  Sheet,
  SocietyAvatar,
  type IconName,
} from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { membershipState, ticketPayment } from '@/lib/commerce';
import { formatHkd } from '@/lib/fps';
import { availability, compactNumber, formatDay, formatTime, formatWhen, hkDate, todayHK } from '@/lib/format';
import { offerNotifications, refreshReminders } from '@/lib/notifications';
import { coverFor, palette, radius, space, type, useColors, useIsDark } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { getLang, t } from '@/lib/i18n';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const dark = useIsDark();
  const { user, requireSignIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);

  const q = useQuery(async () => {
    const [event, registration, mine] = await Promise.all([api.getEvent(id), api.myRegistration(id), api.mySocieties()]);
    const position = registration?.status === 'waitlisted' ? await api.waitlistPosition(id) : 0;
    const isCommittee = !!event && mine.some((s) => s.id === event.society_id);
    // Members-only and member prices: is this person a current member?
    const needsMembership = !!event && (event.members_only || event.member_price_hkd != null);
    const isMember =
      needsMembership &&
      !!user &&
      (await api.myMemberships()).some((m) => m.society_id === event.society_id && membershipState(m, m.plan).key === 'active');
    // The plan to join straight from the event, so the "join first" step is one tap.
    const plan =
      event && needsMembership && !isMember
        ? ((await api.listPlans(event.society_id)).find((p) => p.is_open && p.valid_until >= todayHK()) ?? null)
        : null;
    const settings = event?.price_hkd ? await api.getPaymentSettings(event.society_id) : null;
    const host = event ? await api.getSociety(event.society_id).catch(() => null) : null;
    return { event, registration, position, isCommittee, isMember, plan, settings, host };
  }, [id, user?.id]);

  if (q.loading) return <EventSkeleton />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const event = q.data?.event;
  if (!event) return <ErrorView message={t('This event is no longer available.')} />;

  const reg = q.data?.registration;
  const active = reg && reg.status !== 'cancelled';
  const avail = availability(event);
  const past = event.ends_at < new Date().toISOString();
  // What this person would pay: the member price applies to current members.
  const myPrice = (q.data?.isMember && event.member_price_hkd != null ? event.member_price_hkd : event.price_hkd) ?? 0;
  const settings = q.data?.settings ?? null;
  const methods: { value: PaymentMethod; label: string }[] = [
    ...(settings?.fps_id ? [{ value: 'fps' as const, label: 'FPS 轉數快' }] : []),
    ...(settings?.payme_link ? [{ value: 'payme' as const, label: 'PayMe' }] : []),
    { value: 'cash', label: t('Cash') },
  ];
  const chosen = method ?? methods[0].value;
  const pay = active ? ticketPayment(reg) : { key: 'none' as const };
  const joinPlan = q.data?.plan;

  const startRegister = () => {
    if (!requireSignIn()) return;
    if (event.signup_question || myPrice > 0) setAsking(true);
    else register();
  };

  const join = () => {
    if (!requireSignIn()) return;
    if (joinPlan)
      router.push({ pathname: '/membership/join', params: { planId: joinPlan.id, societyId: event.society_id, eventId: event.id } });
    else router.push(`/society/${event.society_id}`);
  };

  const register = async () => {
    setBusy(true);
    try {
      const r = await api.register(event.id, answer, myPrice > 0 ? chosen : undefined);
      setAsking(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      const order = r.status === 'confirmed' && myPrice > 0 ? (await api.myRegistration(event.id))?.order : null;
      if (order) {
        // Straight to paying: the place is held for the payment window.
        router.push(`/order/${order.id}`);
        toast(t('Your place is held. Pay to get your ticket.'), { icon: 'ticket' });
        return;
      }
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

  // Bottom bar ("EventBar" in the hand-off): what's going on for you on the left, one action on the right.
  const price = myPrice > 0 ? formatHkd(myPrice) : event.price_text || t('Free');
  let bar: { icon?: IconName; iconBg?: string; iconFg?: string; title: string; sub?: string; subColor?: string } | null = null;
  let primary: React.ReactNode = null;
  let notice: string | null = null;
  if (event.removed_at) notice = t('Removed by moderators');
  else if (event.status === 'cancelled') notice = t('This event was cancelled');
  else if (past) {
    bar = { icon: 'flag-outline', iconBg: c.fill, iconFg: c.text, title: t('This event has ended'), sub: formatWhen(event.starts_at) };
    primary = <Button small variant="secondary" title={t('Other events')} onPress={() => router.navigate('/discover')} />;
  } else if (active && reg.status === 'confirmed' && reg.checked_in_at) {
    bar = { icon: 'checkmark-circle', iconBg: c.successSoft, iconFg: c.successText, title: t('Checked in') };
  } else if (active && reg.status === 'confirmed' && pay.key !== 'none' && pay.key !== 'paid') {
    // Paid event: the place is held, the QR only works once the society confirms payment.
    bar = {
      icon: pay.key === 'claimed' ? 'hourglass-outline' : 'card-outline',
      iconBg: pay.key === 'claimed' ? c.infoSoft : c.warningSoft,
      iconFg: pay.key === 'claimed' ? c.infoText : c.warningText,
      title: pay.key === 'claimed' ? t('Payment being checked') : t('Pay to get your ticket'),
      sub: formatHkd(pay.order.total_hkd),
    };
    primary = (
      <Button
        small
        variant={pay.key === 'unpaid' ? 'primary' : 'secondary'}
        title={pay.key === 'unpaid' ? t('Pay now') : t('View payment')}
        onPress={() => router.push(`/order/${pay.order.id}`)}
      />
    );
  } else if (active && reg.status === 'confirmed') {
    bar = {
      icon: 'checkmark',
      iconBg: c.tintSoft,
      iconFg: c.tintText,
      title: t("You're going"),
      sub: t('Your ticket is saved on this phone'),
    };
    primary = <Button small title={t('Cancel my spot')} variant="dangerText" loading={busy} onPress={cancel} />;
  } else if (active) {
    bar = {
      icon: 'time-outline',
      iconBg: c.warningSoft,
      iconFg: c.warningText,
      title: t('You’re #{n} on the waitlist', { n: q.data?.position || '?' }),
      sub: t("We'll let you know if a spot opens"),
    };
    primary = <Button small title={t('Leave waitlist')} variant="secondary" loading={busy} onPress={cancel} />;
  } else {
    const subColor = avail.kind === 'open' ? c.successText : avail.kind === 'drop-in' ? c.textSecondary : c.warningText;
    const going =
      event.registration_required && event.capacity
        ? `${t('{n}/{capacity} going', { n: event.confirmed_count, capacity: event.capacity })} · `
        : '';
    bar = { title: price, sub: `${going}${avail.label}`, subColor };
    if (event.members_only && !q.data?.isMember && !q.data?.isCommittee && ['open', 'few', 'waitlist'].includes(avail.kind)) {
      bar.sub = t('Members only');
      primary = (
        <Button
          title={t('Join {society} to sign up', { society: event.society.short_name ?? event.society.name })}
          icon="card-outline"
          onPress={join}
        />
      );
    } else if (avail.kind === 'open' || avail.kind === 'few')
      primary = <Button title={t('Register')} loading={busy} onPress={startRegister} />;
    else if (avail.kind === 'waitlist') primary = <Button title={t('Join waitlist')} loading={busy} onPress={startRegister} />;
    else if (avail.kind === 'drop-in')
      primary = <Button variant="secondary" title={t('Add to calendar')} icon="calendar-outline" onPress={addToCalendar} />;
    else bar.subColor = c.dangerText;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      {/* White clock and battery over the coloured cover, only while this screen is on top. */}
      {focused && <StatusBar style="light" />}
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Artwork seed={event.id} uri={event.cover_url} category={event.category} style={{ height: 192 + insets.top }}>
          <View style={[styles.floating, { top: insets.top + 6 }]}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.navigate('/discover'))}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Back')}
              style={styles.headerButton}>
              <Icon name="chevron-back" size={20} color="#0A0A0B" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={share} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('Share')} style={styles.headerButton}>
                <Icon name="share-outline" size={19} color="#0A0A0B" />
              </Pressable>
              {event.status !== 'draft' && (
                <View style={styles.headerButton}>
                  <SaveButton eventId={event.id} size={20} color="#0A0A0B" />
                </View>
              )}
              <Pressable
                onPress={more}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('More options')}
                style={styles.headerButton}>
                <Icon name="ellipsis-horizontal" size={20} color="#0A0A0B" />
              </Pressable>
            </View>
          </View>
          <View style={styles.heroBottom}>
            <View style={styles.heroTag}>
              <Icon name={coverFor(event.category, event.id, dark).icon} size={14} color="#FFFFFF" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{t(event.category)}</Text>
            </View>
            <View style={styles.dateBadge} accessibilityElementsHidden importantForAccessibility="no">
              <Text style={{ color: palette.tangerine[700], fontSize: 11, lineHeight: 13, fontWeight: '700' }}>
                {monthShort(event.starts_at)}
              </Text>
              <Text
                style={{
                  color: '#0A0A0B',
                  fontSize: 24,
                  lineHeight: 26,
                  fontWeight: '700',
                  letterSpacing: -0.5,
                  marginTop: 3,
                  marginBottom: 2,
                }}>
                {dayOfMonth(event.starts_at)}
              </Text>
              <Text style={{ color: '#6E6E73', fontSize: 11, lineHeight: 13, fontWeight: '600' }}>{weekdayShort(event.starts_at)}</Text>
            </View>
          </View>
        </Artwork>

        <View style={{ padding: space.lg, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {event.members_only && <Pill label={t('Members only')} tone="ink" icon="card-outline" />}
            {event.status === 'draft' && <Pill label={t('Draft')} tone="warning" />}
            {event.status === 'cancelled' && <Pill label={t('Cancelled')} tone="danger" />}
            {!!event.removed_at && <Pill label={t('Hidden by moderators')} tone="danger" />}
          </View>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
            {event.title}
          </Text>

          {/* Follow sits beside the link, not inside it: nested buttons are invalid on web and unreachable in VoiceOver. */}
          <View style={styles.societyRow}>
            <Pressable onPress={() => router.push(`/society/${event.society_id}`)} accessibilityRole="button" style={styles.hostLink}>
              <SocietyAvatar name={event.society.name} uri={event.society.logo_url} size={40} category={q.data?.host?.category} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: c.text, fontSize: 15, lineHeight: 20, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                    {event.society.name}
                  </Text>
                  {event.society.verified && <VerifiedBadge size={15} color={c.tint} />}
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
                  {q.data?.host
                    ? t('{n} followers', { n: compactNumber(q.data.host.follower_count) })
                    : t('Hosted by {society}', { society: event.society.short_name ?? event.society.name })}
                </Text>
              </View>
            </Pressable>
            <FollowButton societyId={event.society_id} />
          </View>

          <View style={{ gap: 4 }}>
            <InfoRow
              icon="calendar-outline"
              title={formatDay(event.starts_at)}
              sub={timeRange(event.starts_at, event.ends_at)}
              action={past ? undefined : t('Add to calendar')}
              onAction={addToCalendar}
            />
            <InfoRow
              icon="location-outline"
              title={event.location || t('Location TBC')}
              action={event.location ? t('Map') : undefined}
              onAction={openMap}
            />
            {event.price_hkd ? (
              <InfoRow
                icon="ticket-outline"
                title={
                  event.member_price_hkd != null
                    ? t('{price} · Members {member}', {
                        price: formatHkd(event.price_hkd),
                        member: event.member_price_hkd ? formatHkd(event.member_price_hkd) : t('Free'),
                      })
                    : formatHkd(event.price_hkd)
                }
                sub={[event.price_text, t('Pay the society by FPS, PayMe or cash')].filter(Boolean).join(' · ')}
                action={event.member_price_hkd != null && !q.data?.isMember && joinPlan ? t('Join') : undefined}
                onAction={join}
              />
            ) : (
              <InfoRow
                icon="ticket-outline"
                title={event.price_text || t('Free')}
                sub={event.registration_required ? t('Sign-up needed · 1 ticket each') : t('No sign-up needed. Just turn up.')}
              />
            )}

            {event.registration_required && (
              <InfoRow
                icon="people-outline"
                title={
                  event.capacity
                    ? t('{n}/{capacity} going', { n: event.confirmed_count, capacity: event.capacity })
                    : t('{n} going', { n: event.confirmed_count })
                }
                sub={event.waitlist_count ? `${avail.label} · ${t('{n} on waitlist', { n: event.waitlist_count })}` : avail.label}
                subColor={
                  avail.kind === 'few' || avail.kind === 'waitlist'
                    ? c.warningText
                    : avail.kind === 'full' || avail.kind === 'closed'
                      ? c.dangerText
                      : avail.kind === 'open'
                        ? c.successText
                        : undefined
                }>
                {!!event.capacity && (
                  <View style={{ marginTop: 6 }}>
                    <ProgressBar value={event.confirmed_count / event.capacity} tone={avail.kind === 'open' ? 'success' : 'warning'} />
                  </View>
                )}
              </InfoRow>
            )}
          </View>

          {active && (
            <View style={[styles.ticket, { backgroundColor: c.background }]}>
              {reg.status === 'confirmed' && pay.key !== 'none' && pay.key !== 'paid' ? (
                <>
                  <Text style={{ color: pay.key === 'claimed' ? c.info : c.warning, fontWeight: '700', fontSize: 17 }}>
                    {pay.key === 'claimed' ? t('Payment being checked') : t('Pay to get your ticket')}
                  </Text>
                  <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
                    {pay.key === 'claimed'
                      ? t('Your QR ticket appears here once the society confirms your payment.')
                      : pay.key === 'expired'
                        ? t(
                            'This ticket was not paid in time, so the place is being given to someone else. Sign up again if there is still room.',
                          )
                        : pay.order.expires_at
                          ? t('{amount} · Pay by {when}, or your place goes to the next person.', {
                              amount: formatHkd(pay.order.total_hkd),
                              when: formatWhen(pay.order.expires_at),
                            })
                          : t('{amount} · Pay in cash before the event.', { amount: formatHkd(pay.order.total_hkd) })}
                  </Text>
                  <Button
                    small
                    variant={pay.key === 'unpaid' ? 'ink' : 'secondary'}
                    icon="card-outline"
                    title={pay.key === 'unpaid' ? t('Pay now') : t('View payment')}
                    onPress={() => router.push(`/order/${pay.order.id}`)}
                  />
                </>
              ) : reg.status === 'confirmed' ? (
                <>
                  <Text style={{ color: c.success, fontWeight: '700', fontSize: 17 }}>
                    {reg.checked_in_at ? t('Checked in ✓') : t("You're going")}
                  </Text>
                  {!reg.checked_in_at && (
                    <>
                      <LiveTicketQR registrationId={reg.id} code={reg.ticket_code} size={200} />
                      <Button
                        small
                        variant="ink"
                        icon="ticket-outline"
                        title={t('Open ticket')}
                        onPress={() => router.push(`/ticket/${reg.id}`)}
                      />
                    </>
                  )}
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

          <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border }} />
          <Text style={[styles.h2, { color: c.text }]} accessibilityRole="header">
            {t('About')}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 22, marginTop: -6 }}>
            {event.description || t('No description yet.')}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.elevated, borderTopColor: c.border },
        ]}>
        {q.data?.isCommittee && (
          <Button
            small
            variant="secondary"
            title={t('Manage')}
            icon="settings-outline"
            onPress={() => router.push({ pathname: '/manage/attendees', params: { eventId: event.id } })}
          />
        )}
        {notice ? (
          <View style={[styles.notice, { backgroundColor: c.dangerSoft }]}>
            <Icon name="close-circle" size={20} color={c.dangerText} />
            <Text style={{ color: c.dangerText, fontSize: 16, fontWeight: '600', flex: 1 }}>{notice}</Text>
          </View>
        ) : (
          bar && (
            <View style={styles.barStatus}>
              {bar.icon && (
                <View style={[styles.barIcon, { backgroundColor: bar.iconBg }]}>
                  <Icon name={bar.icon} size={18} color={bar.iconFg} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 17, lineHeight: 22, fontWeight: '600' }} numberOfLines={1}>
                  {bar.title}
                </Text>
                {!!bar.sub && (
                  <Text
                    style={{ color: bar.subColor ?? c.textSecondary, fontSize: 13, fontWeight: bar.subColor ? '600' : '400' }}
                    numberOfLines={1}>
                    {bar.sub}
                  </Text>
                )}
              </View>
            </View>
          )
        )}
        {primary && <View style={{ minWidth: q.data?.isCommittee ? 110 : 150 }}>{primary}</View>}
      </View>

      <Sheet visible={asking} onClose={() => setAsking(false)}>
        <View style={{ gap: space.md, paddingHorizontal: space.lg }}>
          {event.signup_question ? (
            <>
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
                autoFocus={myPrice === 0}
                placeholder={t('Your answer (optional)')}
                hint={t('Only the committee sees your answer.')}
                style={{ minHeight: 90 }}
              />
            </>
          ) : (
            <Text style={[type.title, { color: c.text }]}>{t('Sign up for {title}', { title: event.title })}</Text>
          )}
          {myPrice > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { color: c.textSecondary }]}>{t('How will you pay?')}</Text>
              <SegmentedControl grey options={methods} value={chosen} onChange={setMethod} />
              <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
                {avail.kind === 'waitlist'
                  ? t('Nothing to pay unless you get a place. We’ll tell you when you do.')
                  : chosen === 'cash'
                    ? t('Pay {society} in cash before the event. Your QR ticket works once they mark it paid.', {
                        society: event.society.short_name ?? event.society.name,
                      })
                    : t(
                        'Next you’ll see the amount and a reference to pay {society} directly. Your QR ticket works once they confirm it.',
                        {
                          society: event.society.short_name ?? event.society.name,
                        },
                      )}
              </Text>
            </View>
          )}
          {myPrice > 0 && q.data?.isMember && event.member_price_hkd != null && (
            <Banner icon="card-outline" tone="success" text={t('Member price applied')} />
          )}
          <Button
            title={
              avail.kind === 'waitlist'
                ? t('Join waitlist')
                : myPrice > 0
                  ? t('Sign up · {amount}', { amount: formatHkd(myPrice) })
                  : t('Confirm registration')
            }
            icon="ticket-outline"
            loading={busy}
            onPress={register}
          />
          <Button title={t('Not now')} variant="plain" onPress={() => setAsking(false)} />
        </View>
      </Sheet>
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

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  heroBottom: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 9,
    paddingRight: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dateBadge: { width: 58, paddingTop: 7, paddingBottom: 8, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center' },
  // Hand-off: 40pt white circles on the cover.
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: { fontSize: 25, fontWeight: '600', lineHeight: 31, letterSpacing: -0.4, marginTop: -4 },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  societyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  hostLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  barStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 50 },
  barIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
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

/** "6:30pm – 9:30pm", with the end day when it runs past midnight. */
function timeRange(starts: string, ends: string) {
  const end = hkDate(starts) === hkDate(ends) ? formatTime(ends) : `${formatDay(ends)} ${formatTime(ends)}`;
  return `${formatTime(starts)} – ${end}`;
}

const hkParts = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLang() === 'zh-Hant' ? 'zh-HK' : 'en-GB', { timeZone: 'Asia/Hong_Kong', ...opts }).format(new Date(iso));
const monthShort = (iso: string) => hkParts(iso, { month: 'short' }).toUpperCase();
const dayOfMonth = (iso: string) => hkParts(iso, { day: 'numeric' }).replace('日', '');
const weekdayShort = (iso: string) => hkParts(iso, { weekday: 'short' }).toUpperCase();
