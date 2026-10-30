import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';

import { ticketPayment } from '@/lib/commerce';
import { TICKET_QR_PREFIX } from '@/lib/constants';
import { formatHkd } from '@/lib/fps';
import { formatLongDay, formatTime, formatWhen, hkDate } from '@/lib/format';
import { coverFor, palette, radius, space, useColors, useIsDark } from '@/lib/theme';
import { TICKET_STEP_SECONDS, secondsLeftInStep, ticketStep, ticketToken } from '@/lib/ticketToken';
import type { Ticket } from '@/lib/types';
import { getLang, t } from '@/lib/i18n';

import { Glyph } from './Glyph';
import { Icon, Pill, SocietyAvatar } from './ui';

/** Re-renders every `ms`, for the QR countdown. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The live ticket QR. It holds a signed token that changes every 30 seconds
 * (src/lib/ticketToken.ts), made on the phone so it works with no signal; a
 * screenshot stops scanning after a minute or two.
 */
export function LiveTicketQR({ registrationId, code, size = 200 }: { registrationId: string; code: string; size?: number }) {
  const c = useColors();
  const now = useNow(1000);
  const step = ticketStep(now);
  const value = useMemo(
    () => TICKET_QR_PREFIX + ticketToken(registrationId, code, step * TICKET_STEP_SECONDS * 1000),
    [registrationId, code, step],
  );
  const left = secondsLeftInStep(now);
  const mark = Math.round(size * 0.2);
  return (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <View style={styles.qrWrap} accessible accessibilityLabel={t('Ticket QR code. Show this at the door.')}>
        {/* High error correction leaves room for the mark in the middle. */}
        <QRCode value={value} size={size} ecl="H" backgroundColor="#fff" color="#0A0A0B" quietZone={0} />
        <View
          style={[styles.qrMark, { width: mark, height: mark, marginLeft: -mark / 2, marginTop: -mark / 2, borderRadius: mark * 0.28 }]}>
          <View style={[styles.qrMarkInner, { borderRadius: mark * 0.22 }]}>
            <Glyph name="ticket" size={mark * 0.6} color="#fff" strokeWidth={2.2} />
          </View>
        </View>
      </View>
      <View style={[styles.live, { width: size + 16 }]} accessibilityLabel={t('Live code · refreshes in {n}s', { n: left })}>
        <View style={styles.liveRow}>
          <PulseDot color={c.success} />
          <Text style={[styles.liveText, { color: c.textSecondary }]}>{t('Live code · refreshes in {n}s', { n: left })}</Text>
        </View>
        <View style={[styles.liveTrack, { backgroundColor: c.fill }]}>
          <View style={[styles.liveFill, { width: `${(left / TICKET_STEP_SECONDS) * 100}%`, backgroundColor: c.success }]} />
        </View>
      </View>
    </View>
  );
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => setReduce(false));
  }, []);
  return reduce;
}

function PulseDot({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.25, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o, reduce]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: o }]} />;
}

/** A light sweeping across the ticket, so a live ticket looks different from a still screenshot. */
function Sheen() {
  const reduce = useReduceMotion();
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(1600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, reduce]);
  if (reduce) return null;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-180, 560] });
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View style={[styles.sheen, { transform: [{ translateX }, { rotate: '18deg' }] }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// Fine wave lines, like the security printing on a banknote or a concert ticket.
const GUILLOCHE = Array.from({ length: 16 }, (_, k) => {
  const pts: string[] = [];
  for (let x = 0; x <= 360; x += 5) {
    const y = 110 + 78 * Math.sin(x / 34 + k * 0.4) * Math.cos(x / 91 - k * 0.22);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
});

function Guilloche() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="none">
        {GUILLOCHE.map((d, i) => (
          <Path key={i} d={d} stroke="#fff" strokeOpacity={0.12} strokeWidth={0.8} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function TicketStatus({ ticket }: { ticket: Ticket }) {
  if (ticket.event.status === 'cancelled') return <Pill label={t('Event cancelled')} tone="danger" />;
  if (ticket.checked_in_at) return <Pill label={t('Checked in')} tone="ink" />;
  const pay = ticketPayment(ticket).key;
  if (pay === 'unpaid') return <Pill label={t('Pay to get your ticket')} tone="warning" icon="card-outline" />;
  if (pay === 'claimed') return <Pill label={t('Payment being checked')} tone="info" icon="hourglass-outline" />;
  if (pay === 'expired') return <Pill label={t('Not paid in time')} tone="danger" />;
  if (ticket.status === 'confirmed') return <Pill label={t('Going')} tone="brand" icon="checkmark" />;
  return <Pill label={t('Waitlist')} tone="warning" />;
}

/** Dashed tear line with half-circle notches cut out on both sides. */
function Perforation({ notch }: { notch: string }) {
  const c = useColors();
  return (
    <View style={styles.perf}>
      <View style={[styles.notch, { left: -11, backgroundColor: notch }]} />
      <View style={[styles.dash, { borderColor: c.border }]} />
      <View style={[styles.notch, { right: -11, backgroundColor: notch }]} />
    </View>
  );
}

function Field({
  label,
  value,
  light,
  flex = 1,
  lines = 2,
}: {
  label: string;
  value: string;
  light?: boolean;
  flex?: number;
  lines?: number;
}) {
  const c = useColors();
  return (
    <View style={{ flex, gap: 2 }}>
      <Text style={[styles.fieldLabel, { color: light ? 'rgba(255,255,255,0.7)' : c.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.fieldValue, { color: light ? '#fff' : c.text }]} numberOfLines={lines}>
        {value}
      </Text>
    </View>
  );
}

/** Whether the ticket should show its QR now. */
export function ticketShowsQR(ticket: Ticket) {
  const pay = ticketPayment(ticket).key;
  return ticket.status === 'confirmed' && ticket.event.status !== 'cancelled' && (pay === 'none' || pay === 'paid');
}

/**
 * The full ticket: event band with security print, holder details, then the
 * live QR (or what to do next when there's no QR yet).
 */
export function TicketPass({
  ticket,
  holder,
  size = 'card',
  notch,
}: {
  ticket: Ticket;
  holder: string | null;
  size?: 'card' | 'full';
  /** Colour behind the ticket, for the perforation notches. */
  notch: string;
}) {
  const c = useColors();
  const dark = useIsDark();
  const e = ticket.event;
  const cover = e.status === 'cancelled' ? '#76767C' : coverFor(e.category, e.id, dark).color;
  const pay = ticketPayment(ticket);
  const qr = ticketShowsQR(ticket) && !ticket.checked_in_at;
  const order = ticket.order;
  const sameDay = hkDate(e.starts_at) === hkDate(e.ends_at);
  const entry = order ? `${order.member_price ? t('Member') : t('General')} · ${formatHkd(order.total_hkd)}` : t('Free entry');
  const society = e.society.short_name ?? e.society.name;

  return (
    <View style={[styles.pass, { backgroundColor: c.card }, size === 'card' && { backgroundColor: c.background }]}>
      <View style={[styles.band, { backgroundColor: cover }]}>
        <Guilloche />
        {qr && <Sheen />}
        <View style={styles.bandTop}>
          <SocietyAvatar name={e.society.name} uri={e.society.logo_url} size={26} />
          <Text style={styles.bandSociety} numberOfLines={1}>
            {society}
          </Text>
          <View style={styles.admit}>
            <Text style={styles.admitText}>{t('Admit one')}</Text>
          </View>
        </View>
        <Text style={[styles.bandTitle, size === 'full' && { fontSize: 24, lineHeight: 30 }]} numberOfLines={3}>
          {e.title}
        </Text>
        <View style={styles.fields}>
          <Field light label={t('Date')} value={formatLongDay(e.starts_at)} />
          <Field
            light
            label={t('Time')}
            value={sameDay ? `${formatTime(e.starts_at)}–${formatTime(e.ends_at)}` : formatTime(e.starts_at)}
          />
        </View>
        <Field light label={t('Venue')} value={e.location || t('To be announced')} />
      </View>

      <Perforation notch={notch} />

      <View style={styles.bottom}>
        <View style={styles.fields}>
          <Field label={t('Holder')} value={holder || '—'} flex={1.3} lines={1} />
          <Field label={t('Entry')} value={entry} />
        </View>

        {qr ? (
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <LiveTicketQR registrationId={ticket.id} code={ticket.ticket_code} size={size === 'full' ? 248 : 176} />
          </View>
        ) : ticket.checked_in_at ? (
          <View style={styles.admitted}>
            <View style={[styles.admittedIcon, { backgroundColor: c.successSoft }]}>
              <Icon name="checkmark" size={30} color={c.successText} />
            </View>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{t('Admitted')}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {t('Checked in at {time}', { time: formatTime(ticket.checked_in_at) })}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            {ticket.status === 'waitlisted' && (
              <Text style={[styles.note, { color: c.textSecondary }]}>{t('If someone cancels, you’ll be moved up automatically.')}</Text>
            )}
            {pay.key === 'unpaid' && (
              <Text style={[styles.note, { color: c.textSecondary }]}>
                {pay.order.expires_at
                  ? t('{amount} · Pay by {when}, or your place goes to the next person.', {
                      amount: formatHkd(pay.order.total_hkd),
                      when: formatWhen(pay.order.expires_at),
                    })
                  : t('{amount} · Pay in cash before the event.', { amount: formatHkd(pay.order.total_hkd) })}
              </Text>
            )}
            {pay.key === 'claimed' && (
              <Text style={[styles.note, { color: c.textSecondary }]}>
                {t('Your QR ticket appears here once the society confirms your payment.')}
              </Text>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <TicketStatus ticket={ticket} />
          <Text style={[styles.serial, { color: c.textTertiary }]} numberOfLines={1}>
            {/* Not a code anyone can type: just tells two tickets apart. */}
            {t('No. {n}', { n: ticket.id.replace(/-/g, '').slice(-6).toUpperCase() })}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The next ticket on the Tickets tab: the full pass; tap for full screen. */
export function TicketCard({ ticket, holder }: { ticket: Ticket; holder: string | null }) {
  const c = useColors();
  const pay = ticketPayment(ticket);
  return (
    <Pressable
      onPress={() =>
        router.push(
          pay.key === 'unpaid' ? `/order/${pay.order.id}` : ticketShowsQR(ticket) ? `/ticket/${ticket.id}` : `/event/${ticket.event.id}`,
        )
      }
      accessibilityRole="button"
      accessibilityHint={ticketShowsQR(ticket) ? t('Opens the ticket full screen') : undefined}
      style={({ pressed }) => ({ marginHorizontal: space.lg, opacity: pressed ? 0.94 : 1 })}>
      <TicketPass ticket={ticket} holder={holder} notch={c.backgroundPlain} />
    </Pressable>
  );
}

/** Later tickets: a stub with the date on the right. */
export function TicketStub({ ticket }: { ticket: Ticket }) {
  const c = useColors();
  const dark = useIsDark();
  const e = ticket.event;
  const cover = e.status === 'cancelled' ? '#76767C' : coverFor(e.category, e.id, dark).color;
  const [, month, day] = hkDate(e.starts_at).split('-');
  const monthLabel =
    getLang() === 'en'
      ? new Date(`${hkDate(e.starts_at)}T12:00:00+08:00`).toLocaleString('en', { month: 'short' }).toUpperCase()
      : `${Number(month)}月`;
  return (
    <Pressable
      onPress={() => router.push(ticketShowsQR(ticket) && !ticket.checked_in_at ? `/ticket/${ticket.id}` : `/event/${e.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.stub,
        { backgroundColor: c.background === c.backgroundPlain ? c.card : c.background, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={{ flex: 1, padding: space.md, gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
          {e.title}
        </Text>
        <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
          {formatWhen(e.starts_at)}
        </Text>
        <TicketStatus ticket={ticket} />
      </View>
      <View style={[styles.stubDash, { borderColor: c.border }]} />
      <View style={[styles.stubDate, { backgroundColor: cover }]}>
        <Guilloche />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{monthLabel}</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>{Number(day)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pass: { borderRadius: 22, overflow: 'hidden' },
  band: { padding: space.lg, paddingBottom: space.lg + 2, gap: space.md, overflow: 'hidden' },
  bandTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bandSociety: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  admit: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  admitText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  bandTitle: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  fields: { flexDirection: 'row', gap: space.lg },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  fieldValue: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  perf: { height: 22, justifyContent: 'center' },
  notch: { position: 'absolute', width: 22, height: 22, borderRadius: 11, top: 0 },
  dash: { marginHorizontal: 18, borderTopWidth: 1.5, borderStyle: 'dashed' },
  bottom: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  note: { fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  serial: { fontSize: 12, fontWeight: '600', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  admitted: { alignItems: 'center', gap: 4, paddingVertical: space.lg },
  admittedIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  qrWrap: { padding: 10, backgroundColor: '#fff', borderRadius: radius.md },
  qrMark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    backgroundColor: '#fff',
    padding: 3,
  },
  qrMarkInner: { flex: 1, backgroundColor: palette.cobalt[600], alignItems: 'center', justifyContent: 'center' },
  live: { gap: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  liveText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  liveFill: { height: 3, borderRadius: 2 },
  sheen: { position: 'absolute', top: -60, bottom: -60, width: 110 },
  stub: { flexDirection: 'row', borderRadius: radius.lg, overflow: 'hidden', marginHorizontal: space.lg },
  stubDash: { borderLeftWidth: 1.5, borderStyle: 'dashed', marginVertical: space.sm },
  stubDate: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 0, overflow: 'hidden' },
});
