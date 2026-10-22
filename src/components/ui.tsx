import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { artFor, radius, space, useColors } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name={name} size={size} color={color ?? c.textSecondary} />;
}

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'plain';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }: ButtonProps) {
  const c = useColors();
  const bg = variant === 'primary' ? c.tint : variant === 'secondary' ? c.fill : variant === 'destructive' ? c.danger : 'transparent';
  const fg = variant === 'primary' ? c.onTint : variant === 'destructive' ? '#fff' : variant === 'plain' ? c.tint : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[styles.chip, { backgroundColor: selected ? c.tint : c.card, borderColor: selected ? c.tint : c.border }]}>
      {icon && <Ionicons name={icon} size={14} color={selected ? c.onTint : c.text} />}
      <Text style={{ color: selected ? c.onTint : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }) {
  const c = useColors();
  const color = { neutral: c.textSecondary, success: c.success, warning: c.warning, danger: c.danger, brand: c.tint }[tone];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={{ color: c.tint, fontSize: 15, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card }, style]}>{children}</View>;
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={c.textSecondary} />
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      {body && <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{body}</Text>}
      {action}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Something went wrong"
      body={message}
      action={onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    />
  );
}

/** Logo for a society: image if present, otherwise initials on brand art. */
export function SocietyAvatar({ name, uri, size = 44 }: { name: string; uri?: string | null; size?: number }) {
  const [a, b] = artFor(name);
  const initials = name
    .replace(/^(CUHK|CU)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const shape = { width: size, height: size, borderRadius: size * 0.28 };
  if (uri) return <Image source={{ uri }} style={shape} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[shape, styles.avatarCenter]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>
    </LinearGradient>
  );
}

/** Event or banner artwork: image if present, otherwise a branded gradient. */
export function Artwork({
  seed,
  uri,
  style,
  children,
}: {
  seed: string;
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [a, b] = artFor(seed);
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
      {children}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textSecondary}
        {...props}
        style={[
          styles.input,
          { backgroundColor: c.card, color: c.text, borderColor: c.border },
          props.multiline && { minHeight: 110, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint && <Text style={{ color: c.textSecondary, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  value,
  onPress,
  destructive,
}: {
  icon?: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? c.fill : c.card }]}>
      {icon && <Ionicons name={icon} size={20} color={destructive ? c.danger : c.tint} />}
      <Text style={{ flex: 1, fontSize: 16, color: destructive ? c.danger : c.text }}>{title}</Text>
      {value != null && <Text style={{ color: c.textSecondary, fontSize: 15 }}>{value}</Text>}
      {onPress && !destructive && <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />}
    </Pressable>
  );
}

export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {title && (
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: space.lg, textTransform: 'uppercase' }}>
          {title}
        </Text>
      )}
      <View style={[styles.listGroup, { backgroundColor: c.card }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 34, paddingHorizontal: space.md, borderRadius: 17 },
  buttonText: { fontSize: 17, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: radius.lg, padding: space.lg },
  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, flexGrow: 1, minHeight: 280 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarCenter: { alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 50 },
  listGroup: { borderRadius: radius.md, overflow: 'hidden', marginHorizontal: space.lg },
});
