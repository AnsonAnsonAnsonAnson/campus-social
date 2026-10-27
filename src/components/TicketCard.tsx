import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ticketPayment } from '@/lib/commerce';
import { TICKET_QR_PREFIX } from '@/lib/constants';
import { formatHkd } from '@/lib/fps';
import { formatWhen, hkDate } from '@/lib/format';
import { coverFor, palette, radius, space, useColors, useIsDark } from '@/lib/theme';
import type { Ticket } from '@/lib/types';
import { getLang, t } from '@/lib/i18n';

import { Pill } from './ui';

export function TicketQR({ code, size = 180 }: { code: string; size?: number }) {
  return (
    <View style={styles.qrWrap} accessible accessibilityLabel={t('Ticket QR code. Show this at the door.')}>
      <QRCode value={TICKET_QR_PREFIX + code} size={size} backgroundColor="#fff" color="#0A0A0B" />
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
      <View style={[styles.notch, { left: -10, backgroundColor: notch }]} />
      <View style={[styles.dash, { borderColor: c.border }]} />
      <View style={[styles.notch, { right: -10, backgroundColor: notch }]} />
    </View>
  );
}

/** The next ticket: big, with its QR ready to show at the door. */
export function TicketCard({ ticket, showQR }: { ticket: Ticket; showQR: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const e = ticket.event;
  const cover = e.status === 'cancelled' ? '#76767C' : coverFor(e.category, e.id, dark).color;
  const pay = ticketPayment(ticket);
  const qr = showQR && ticket.status === 'confirmed' && e.status !== 'cancelled' && (pay.key === 'none' || pay.key === 'paid');
  return (
    <Pressable
      onPress={() => router.push(pay.key === 'unpaid' ? `/order/${pay.order.id}` : `/event/${e.id}`)}
      accessibilityRole="button"
      style={[styles.hero, { backgroundColor: c.background === c.backgroundPlain ? c.card : c.background }]}>
      <View style={[styles.band, { backgroundColor: cover }]}>
        <Text style={styles.bandDate}>{formatWhen(e.starts_at, e.ends_at)}</Text>
        <Text style={styles.bandTitle} numberOfLines={2}>
          {e.title}
        </Text>
        <Text style={styles.bandMeta} numberOfLines={1}>
          {e.location} · {e.society.short_name ?? e.society.name}
        </Text>
      </View>
      <Perforation notch={c.backgroundPlain} />
      <View style={styles.heroBottom}>
        {qr ? (
          <>
            <TicketQR code={ticket.ticket_code} size={120} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Show this QR code at the door')}</Text>
              <Text style={[styles.code, { color: c.text }]}>{ticket.ticket_code.slice(0, 8).toUpperCase()}</Text>
              <TicketStatus ticket={ticket} />
            </View>
          </>
        ) : (
          <View style={{ gap: 6, flex: 1 }}>
            <TicketStatus ticket={ticket} />
            {ticket.status === 'waitlisted' && (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('If someone cancels, you’ll be moved up automatically.')}</Text>
            )}
            {pay.key === 'unpaid' && (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {pay.order.expires_at
                  ? t('{amount} · Pay by {when}, or your place goes to the next person.', {
                      amount: formatHkd(pay.order.total_hkd),
                      when: formatWhen(pay.order.expires_at),
                    })
                  : t('{amount} · Pay in cash before the event.', { amount: formatHkd(pay.order.total_hkd) })}
              </Text>
            )}
            {pay.key === 'claimed' && (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {t('Your QR ticket appears here once the society confirms your payment.')}
              </Text>
            )}
          </View>
        )}
      </View>
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
      onPress={() => router.push(`/event/${e.id}`)}
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
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{monthLabel}</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>{Number(day)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, overflow: 'hidden', marginHorizontal: space.lg },
  band: { padding: space.lg, gap: 4 },
  bandDate: { color: palette.tangerine[300], fontSize: 13, fontWeight: '600' },
  bandTitle: { color: '#fff', fontSize: 20, lineHeight: 26, fontWeight: '600' },
  bandMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  perf: { height: 20, justifyContent: 'center' },
  notch: { position: 'absolute', width: 20, height: 20, borderRadius: 10, top: 0 },
  dash: { marginHorizontal: 18, borderTopWidth: 1.5, borderStyle: 'dashed' },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, paddingTop: space.sm },
  code: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  qrWrap: { padding: 8, backgroundColor: '#fff', borderRadius: radius.md },
  stub: { flexDirection: 'row', borderRadius: radius.lg, overflow: 'hidden', marginHorizontal: space.lg },
  stubDash: { borderLeftWidth: 1.5, borderStyle: 'dashed', marginVertical: space.sm },
  stubDate: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 0 },
});
