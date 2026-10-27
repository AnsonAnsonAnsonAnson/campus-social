import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { itemsSummary, MEMBER_QR_PREFIX, membershipState, orderStatus } from '@/lib/commerce';
import { formatHkd } from '@/lib/fps';
import { formatLongDay } from '@/lib/format';
import { palette, radius, space, useColors } from '@/lib/theme';
import type { MyMembership, MyOrder } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Icon, Pill, SocietyAvatar } from './ui';

/** Digital member card: replaces paper cards and stickers. Works offline from the saved copy. */
export function MemberCard({
  membership: m,
  showQR = true,
  onPress,
}: {
  membership: MyMembership;
  showQR?: boolean;
  onPress?: () => void;
}) {
  const state = membershipState(m, m.plan);
  const live = state.key === 'active';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.cardTop}>
        <SocietyAvatar name={m.society.name} uri={m.society.logo_url} category={m.society.category} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardSociety} numberOfLines={1}>
            {m.society.name}
          </Text>
          <Text style={styles.cardKind}>{m.plan.name}</Text>
        </View>
        {!live && <Pill label={state.label} tone={state.tone} />}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.cardName} numberOfLines={1}>
          {m.full_name}
        </Text>
        <Text style={styles.cardMeta}>
          {m.member_no != null ? `${t('Member no. {n}', { n: String(m.member_no).padStart(4, '0') })} · ` : ''}
          {t('Valid until {date}', { date: formatLongDay(m.plan.valid_until) })}
        </Text>
      </View>
      {showQR && live && (
        <View style={styles.cardQrRow}>
          <View style={styles.qr} accessible accessibilityLabel={t('Member card QR code. Show this at events and the shop.')}>
            <QRCode value={MEMBER_QR_PREFIX + m.card_code} size={112} backgroundColor="#fff" color="#0A0A0B" />
          </View>
          <Text style={[styles.cardMeta, { flex: 1 }]}>
            {t('Show this at events and the society shop for member prices and member-only entry.')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** One shop order in Tickets. */
export function OrderRow({ order: o }: { order: MyOrder }) {
  const c = useColors();
  const s = orderStatus(o);
  return (
    <Pressable
      onPress={() => router.push(`/order/${o.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.order, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
      <View style={[styles.orderIcon, { backgroundColor: c.card }]}>
        <Icon name="bag-handle-outline" size={22} color={c.text} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
          {o.product_title}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
          {o.society.short_name ?? o.society.name} · {o.ref} · {itemsSummary(o.items)} · {formatHkd(o.total_hkd)}
        </Text>
        <Pill label={s.label} tone={s.tone} />
      </View>
      <Icon name="chevron-forward" size={14} color={c.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.neutral[900], borderRadius: 20, padding: space.lg, gap: space.md, marginHorizontal: space.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardSociety: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardKind: { color: palette.tangerine[300], fontSize: 13, fontWeight: '600' },
  cardName: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '600' },
  cardMeta: { color: palette.neutral[400], fontSize: 13, lineHeight: 18 },
  cardQrRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  qr: { padding: 8, backgroundColor: '#fff', borderRadius: radius.md },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    marginHorizontal: space.lg,
  },
  orderIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
