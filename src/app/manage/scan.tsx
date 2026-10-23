import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { LEGACY_TICKET_QR_PREFIX, TICKET_QR_PREFIX } from '@/lib/constants';
import { radius, space } from '@/lib/theme';
import type { CheckInResult } from '@/lib/types';

const SAME_CODE_COOLDOWN_MS = 3000;

export default function Scan() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [manual, setManual] = useState('');
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);

  const handle = async (raw: string) => {
    const prefix = [TICKET_QR_PREFIX, LEGACY_TICKET_QR_PREFIX].find((p) => raw.startsWith(p));
    const code = prefix ? raw.slice(prefix.length) : raw.trim();
    const now = Date.now();
    if (busy.current || (last.current?.code === code && now - last.current.at < SAME_CODE_COOLDOWN_MS)) return;
    busy.current = true;
    last.current = { code, at: now };
    try {
      const r = await api.checkIn(eventId, code);
      setResult(r);
      if (r.ok) setCount((n) => n + 1);
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

  return (
    <View style={styles.root}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handle(data)}
        />
      ) : (
        <View style={styles.permission}>
          <Icon name="camera-outline" size={48} color="#fff" />
          <Text style={styles.permissionText}>Allow camera access to scan attendees’ QR tickets.</Text>
          {permission && <Button title="Allow camera" onPress={requestPermission} />}
        </View>
      )}

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close scanner" style={styles.close}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {title ?? 'Check-in'}
          </Text>
          <Text style={styles.topSub}>{count} checked in this session</Text>
        </View>
      </View>

      {permission?.granted && <View style={styles.frame} pointerEvents="none" />}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
        {result && (
          <View style={[styles.result, { backgroundColor: result.ok ? '#1F8A4C' : '#C62828' }]} accessibilityLiveRegion="polite">
            <Icon name={result.ok ? 'checkmark-circle' : 'close-circle'} size={28} color="#fff" />
            <View style={{ flex: 1 }}>
              {result.name && <Text style={styles.resultName}>{result.name}</Text>}
              <Text style={styles.resultMsg}>{result.message}</Text>
            </View>
          </View>
        )}
        <View style={styles.manual}>
          <TextInput
            value={manual}
            onChangeText={setManual}
            placeholder="Or type the 8-character code"
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.manualInput}
            onSubmitEditing={() => manual && handle(manual)}
            returnKeyType="done"
          />
          <Button small title="Check in" disabled={!manual} onPress={() => handle(manual)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  topSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 24,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, gap: space.md },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  resultName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  resultMsg: { color: '#fff', fontSize: 15 },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.lg,
    padding: space.sm,
  },
  manualInput: { flex: 1, color: '#fff', fontSize: 16, paddingHorizontal: space.sm, height: 40 },
});
