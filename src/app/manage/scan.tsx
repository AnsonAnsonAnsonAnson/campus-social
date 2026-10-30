import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { MEMBER_QR_PREFIX, ORDER_QR_PREFIX } from '@/lib/commerce';
import { LEGACY_TICKET_QR_PREFIX, TICKET_QR_PREFIX } from '@/lib/constants';
import { formatHkd } from '@/lib/fps';
import { formatLongDay, formatTime } from '@/lib/format';
import { elevation, space } from '@/lib/theme';
import type { MemberCardResult, PickupResult } from '@/lib/types';
import { t } from '@/lib/i18n';

const SAME_CODE_COOLDOWN_MS = 3000;
// Only read when a code is scanned, never while rendering.
const clock = () => Date.now();

type Mode = 'event' | 'member' | 'pickup';
type Result = (MemberCardResult & PickupResult) & { ok: boolean };

// Bright fills with dark text, readable at arm's length in a dark room.
const TONES = {
  ok: { bg: '#30D158', fg: '#04210F', icon: 'checkmark' },
  warn: { bg: '#FF9F0A', fg: '#2B1700', icon: 'alert' },
  bad: { bg: '#FF453A', fg: '#2B0503', icon: 'close' },
} as const;

// Repeat scans and "not yet" are warnings; wrong event or unknown codes are errors.
const WARNINGS = [
  'Already checked in',
  'Already collected',
  'All vouchers used',
  'How many vouchers?',
  'Not that many vouchers left',
  'Not paid yet',
  'Take cash',
  'This membership has expired',
  'This membership is not active',
];

const PREFIXES: Record<Mode, string[]> = {
  event: [TICKET_QR_PREFIX, LEGACY_TICKET_QR_PREFIX],
  member: [MEMBER_QR_PREFIX],
  pickup: [ORDER_QR_PREFIX],
};

export default function Scan() {
  const {
    mode: modeParam,
    eventId,
    societyId,
    title,
  } = useLocalSearchParams<{ mode?: Mode; eventId?: string; societyId?: string; title?: string }>();
  const mode: Mode = modeParam ?? 'event';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState('');
  const [typing, setTyping] = useState(false);
  const [torch, setTorch] = useState(false);
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);

  const check = (code: string, cash = false): Promise<Result> =>
    mode === 'member'
      ? api.checkMemberCard(societyId!, code)
      : mode === 'pickup'
        ? api.collectOrder(societyId!, code, cash)
        : api.checkIn(eventId!, code);

  // Food vouchers at a fair booth: use some now, the rest later.
  const redeemVouchers = async (n: number) => {
    const code = last.current?.code;
    if (!code || busy.current) return;
    busy.current = true;
    try {
      const r = await api.collectOrder(societyId!, code, false, n);
      setResult(r);
      if (r.ok) setCount((x) => x + 1);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      }
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  // Unpaid cash order at the desk: the committee takes the money and hands it over in one tap.
  const takeCash = async () => {
    const code = last.current?.code;
    if (!code || busy.current) return;
    busy.current = true;
    try {
      const r = await check(code, true);
      setResult(r);
      if (r.ok) setCount((n) => n + 1);
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  const handle = async (raw: string) => {
    const prefix = PREFIXES[mode].find((p) => raw.startsWith(p));
    // Typed codes can have the space shown on the ticket ("A1B2 C3D4").
    const code = prefix ? raw.slice(prefix.length) : raw.replace(/\s+/g, '');
    const now = clock();
    if (busy.current || (last.current?.code === code && now - last.current.at < SAME_CODE_COOLDOWN_MS)) return;
    busy.current = true;
    last.current = { code, at: now };
    try {
      const r = await check(code);
      setResult(r);
      if (r.ok) setCount((n) => n + 1);
      if (r.ok && typing) setManual('');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      }
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  const close = () => {
    invalidate();
    router.back();
  };

  const tone = result ? (result.ok ? TONES.ok : WARNINGS.some((w) => result.message.startsWith(w)) ? TONES.warn : TONES.bad) : null;
  const counter =
    mode === 'member'
      ? t('{n} cards checked', { n: count })
      : mode === 'pickup'
        ? t('{n} handed out', { n: count })
        : t('{n} checked in this session', { n: count });
  const meta = result && resultMeta(mode, result);

  return (
    <View style={styles.root}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handle(data)}
        />
      ) : (
        <View style={styles.permission}>
          <Icon name="camera-outline" size={48} color="#fff" />
          <Text style={styles.permissionText}>
            {mode === 'member'
              ? t('Allow camera access to scan member cards.')
              : mode === 'pickup'
                ? t('Allow camera access to scan pickup QR codes.')
                : t('Allow camera access to scan attendees’ QR tickets.')}
          </Text>
          {permission &&
            (permission.canAskAgain ? (
              <Button title={t('Allow camera')} onPress={requestPermission} />
            ) : (
              // iOS only asks once; after a "Don't Allow" the switch is in Settings.
              <Button title={t('Open Settings')} icon="settings-outline" onPress={() => Linking.openSettings()} />
            ))}
        </View>
      )}

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('Close scanner')} style={styles.roundButton}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {title ?? (mode === 'member' ? t('Member cards') : mode === 'pickup' ? t('Pickup') : t('Check-in'))}
          </Text>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{counter}</Text>
          </View>
        </View>
        {permission?.granted && Platform.OS !== 'web' ? (
          <Pressable
            onPress={() => setTorch((v) => !v)}
            hitSlop={12}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel={t('Torch')}
            style={[styles.roundButton, torch && { backgroundColor: '#fff' }]}>
            <Icon name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color={torch ? '#000' : '#fff'} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {permission?.granted && <Viewfinder color={tone?.bg ?? '#fff'} />}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
        {result && tone && (
          <View style={[styles.result, elevation.e3, { backgroundColor: tone.bg }]} accessibilityLiveRegion="polite">
            <View style={[styles.resultIcon, { backgroundColor: tone.fg }]}>
              <Icon name={tone.icon} size={32} color={tone.bg} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.resultTitle, { color: tone.fg }]}>{t(result.message)}</Text>
              {result.name && <Text style={[styles.resultName, { color: tone.fg }]}>{result.name}</Text>}
              {meta && <Text style={[styles.resultMeta, { color: tone.fg }]}>{meta}</Text>}
            </View>
          </View>
        )}
        {result?.message === 'How many vouchers?' && !!result.vouchers_left && (
          <View style={styles.voucherRow}>
            {[1, 2, 3, 4]
              .filter((n) => n <= result.vouchers_left!)
              .map((n) => (
                <Pressable
                  key={n}
                  onPress={() => redeemVouchers(n)}
                  accessibilityRole="button"
                  accessibilityLabel={t('Use {n}', { n })}
                  style={({ pressed }) => [styles.voucherButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={styles.voucherNumber}>{n}</Text>
                </Pressable>
              ))}
            {result.vouchers_left > 1 && (
              <Pressable
                onPress={() => redeemVouchers(result.vouchers_left!)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.voucherButton, styles.voucherAll, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.voucherNumber, { color: '#000' }]}>{t('All {n}', { n: result.vouchers_left })}</Text>
              </Pressable>
            )}
          </View>
        )}
        {result?.message === 'Take cash' && result.total_hkd != null && (
          <Button
            variant="ink"
            icon="cash-outline"
            title={t('Took {amount} cash, hand over', { amount: formatHkd(result.total_hkd) })}
            onPress={takeCash}
          />
        )}
        {typing ? (
          <View style={styles.manual}>
            <TextInput
              value={manual}
              onChangeText={setManual}
              autoFocus
              placeholder={
                mode === 'member'
                  ? t('Member no., e.g. 12')
                  : mode === 'pickup'
                    ? t('Order ref, e.g. SSM-1234')
                    : t('Or type the backup code')
              }
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoCapitalize={mode === 'pickup' ? 'characters' : 'none'}
              autoCorrect={false}
              keyboardType={mode === 'member' ? 'number-pad' : 'default'}
              style={styles.manualInput}
              onSubmitEditing={() => manual && handle(manual)}
              returnKeyType="done"
            />
            <Button small title={t('Check')} disabled={!manual} onPress={() => handle(manual)} />
          </View>
        ) : (
          <Pressable onPress={() => setTyping(true)} accessibilityRole="button" style={styles.typeButton}>
            <Icon name="keypad-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {mode === 'member' ? t('Type a member number') : mode === 'pickup' ? t('Type an order ref') : t('Type the backup code')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function resultMeta(mode: Mode, r: Result) {
  if (mode === 'member') {
    return [
      r.member_no != null ? t('Member no. {n}', { n: String(r.member_no).padStart(4, '0') }) : null,
      r.plan,
      r.valid_until ? t('Valid until {date}', { date: formatLongDay(r.valid_until) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (mode === 'pickup') {
    return [
      r.ref,
      r.items,
      r.message === 'Take cash' && r.total_hkd != null ? t('{amount} cash', { amount: formatHkd(r.total_hkd) }) : null,
      r.slot ? t('Booked {slot}', { slot: r.slot }) : null,
      r.cash_taken && r.total_hkd != null ? t('{amount} cash taken', { amount: formatHkd(r.total_hkd) }) : null,
      r.used_now ? t('{n} used now', { n: r.used_now }) : null,
      r.vouchers_total ? t('{left} of {total} vouchers left', { left: r.vouchers_left ?? 0, total: r.vouchers_total }) : null,
      r.collected_at ? t('Collected at {time}', { time: formatTime(r.collected_at) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  // Unpaid ticket: the ref to look up (or mark paid after taking cash) in Orders.
  if (r.ref) return t('Order {ref}. Take payment, mark it paid in Orders, then scan again.', { ref: r.ref });
  return null;
}

/** Four corner brackets that take the result colour. */
function Viewfinder({ color }: { color: string }) {
  const corner = (pos: object, borders: object) => <View style={[styles.corner, pos, borders, { borderColor: color }]} />;
  return (
    <View style={styles.frame} pointerEvents="none">
      {corner({ top: 0, left: 0 }, { borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 })}
      {corner({ top: 0, right: 0 }, { borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 })}
      {corner({ bottom: 0, left: 0 }, { borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 18 })}
      {corner({ bottom: 0, right: 0 }, { borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 18 })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  voucherRow: { flexDirection: 'row', gap: space.sm },
  voucherButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  voucherAll: { flex: 1.6, backgroundColor: '#fff' },
  voucherNumber: { color: '#fff', fontSize: 20, fontWeight: '700' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  permissionText: { color: '#fff', fontSize: 17, textAlign: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  counter: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  frame: { position: 'absolute', alignSelf: 'center', top: '28%', width: 240, height: 240 },
  corner: { position: 'absolute', width: 44, height: 44 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, gap: space.md },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: 22, paddingHorizontal: 20, borderRadius: 26 },
  resultIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: 30, lineHeight: 34, fontWeight: '800' },
  resultName: { fontSize: 21, fontWeight: '600' },
  resultMeta: { fontSize: 16, fontWeight: '600' },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    padding: space.sm,
  },
  manualInput: { flex: 1, color: '#fff', fontSize: 16, paddingHorizontal: space.sm, height: 40 },
});
