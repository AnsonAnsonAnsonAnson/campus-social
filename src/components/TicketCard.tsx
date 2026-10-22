import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TICKET_QR_PREFIX } from '@/lib/constants';
import { formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { Ticket } from '@/lib/types';

import { Artwork, Icon, Pill } from './ui';

export function TicketQR({ code, size = 180 }: { code: string; size?: number }) {
  return (
    <View style={styles.qrWrap} accessible accessibilityLabel="Ticket QR code. Show this at the door.">
      <QRCode value={TICKET_QR_PREFIX + code} size={size} backgroundColor="#fff" color="#000" />
    </View>
  );
}

export function TicketCard({ ticket, showQR }: { ticket: Ticket; showQR: boolean }) {
  const c = useColors();
  const e = ticket.event;
  const status = ticket.checked_in_at ? (
    <Pill label="Checked in" tone="success" />
  ) : ticket.status === 'confirmed' ? (
    <Pill label="Confirmed" tone="success" />
  ) : (
    <Pill label="Waitlist" tone="warning" />
  );

  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)} style={[styles.card, { backgroundColor: c.card }]}>
      <Artwork seed={e.id} uri={e.cover_url} style={styles.art}>
        <View style={styles.artScrim} />
        <View style={{ padding: space.md, gap: 2 }}>
          <Text style={styles.artSociety}>{e.society.short_name ?? e.society.name}</Text>
          <Text style={styles.artTitle} numberOfLines={2}>
            {e.title}
          </Text>
        </View>
      </Artwork>
      <View style={{ padding: space.md, gap: 6 }}>
        <View style={styles.line}>
          <Icon name="time-outline" size={16} />
          <Text style={{ color: c.text, flex: 1 }}>{formatWhen(e.starts_at, e.ends_at)}</Text>
        </View>
        <View style={styles.line}>
          <Icon name="location-outline" size={16} />
          <Text style={{ color: c.text, flex: 1 }}>{e.location}</Text>
        </View>
        <View style={[styles.line, { justifyContent: 'space-between' }]}>
          {status}
          {e.status === 'cancelled' && <Pill label="Event cancelled" tone="danger" />}
        </View>
      </View>
      {showQR && ticket.status === 'confirmed' && e.status !== 'cancelled' && (
        <View style={[styles.qrSection, { borderTopColor: c.border }]}>
          <TicketQR code={ticket.ticket_code} />
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            Show this at the door · #{ticket.ticket_code.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', marginHorizontal: space.lg },
  art: { height: 110, justifyContent: 'flex-end' },
  artScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  artSociety: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  artTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrSection: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  qrWrap: { padding: 12, backgroundColor: '#fff', borderRadius: radius.md },
});
