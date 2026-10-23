import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';

type ToastMessage = { id: number; text: string; icon: IconName; tone: 'success' | 'error' | 'info' };

const listeners = new Set<(t: ToastMessage) => void>();
let counter = 0;

/** Brief confirmation shown above the tab bar, e.g. toast(t('Event saved')). */
export function toast(text: string, opts: { icon?: IconName; tone?: ToastMessage['tone'] } = {}) {
  const tone = opts.tone ?? 'success';
  const icon = opts.icon ?? (tone === 'error' ? 'alert-circle' : tone === 'info' ? 'information-circle' : 'checkmark-circle');
  const message = { id: ++counter, text, icon, tone };
  listeners.forEach((l) => l(message));
  AccessibilityInfo.announceForAccessibility(text);
}

const VISIBLE_MS = 2400;

export function ToastHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (t: ToastMessage) => {
      clearTimeout(timer);
      setMessage(t);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      timer = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMessage((m) => (m?.id === t.id ? null : m));
        });
      }, VISIBLE_MS);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, [anim]);

  if (!message) return null;
  const color = message.tone === 'error' ? c.danger : message.tone === 'info' ? c.tint : c.success;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 64,
          backgroundColor: c.toast,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}>
      <Ionicons name={message.icon} size={20} color={color} />
      <Text style={[styles.text, { color: c.onToast }]} numberOfLines={2}>
        {message.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
