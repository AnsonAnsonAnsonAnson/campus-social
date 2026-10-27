import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState, type ComponentProps, type ReactNode } from 'react';
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

import {
  avatarArt,
  avatarRadius,
  coverFor,
  coverVariant,
  familyFor,
  initialsFor,
  radius,
  space,
  type,
  useColors,
  useIsDark,
} from '@/lib/theme';
import { t } from '@/lib/i18n';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name={name} size={size} color={color ?? c.textSecondary} />;
}

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

type ButtonVariant =
  /** The one main action on a screen. */
  | 'primary'
  | 'secondary'
  /** Soft brand fill: Follow in lists. */
  | 'tinted'
  /** Hairline outline, quiet: Following in lists. */
  | 'outline'
  | 'plain'
  /** Soft red: delete, reject. */
  | 'destructive'
  /** Solid red: only the final confirm in a dialog or sheet. */
  | 'destructiveStrong'
  /** Near-black: show ticket, approve, keep my spot. */
  | 'ink'
  /** Red text only: "Cancel my spot" in the event bar. */
  | 'dangerText';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Shown under a disabled button to say what's missing. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, hint, style, small }: ButtonProps) {
  const c = useColors();
  const colors: Record<ButtonVariant, [string, string, string]> = {
    // [background, label, pressed background]
    primary: [c.tint, c.onTint, c.tintPressed],
    secondary: [c.fill, c.text, c.fillStrong],
    tinted: [c.tintSoft, c.tintText, c.tintSoft],
    outline: ['transparent', c.textSecondary, 'transparent'],
    plain: ['transparent', c.tintText, 'transparent'],
    destructive: [c.dangerSoft, c.dangerText, c.dangerSoft],
    destructiveStrong: [c.danger, c.onInk, c.danger],
    ink: [c.ink, c.onInk, c.ink],
    dangerText: ['transparent', c.dangerText, 'transparent'],
  };
  const [bg, fg, pressedBg] = disabled ? [c.disabledFill, c.disabledText, c.disabledFill] : colors[variant];
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityHint={disabled ? hint : undefined}
      disabled={disabled || loading}
      hitSlop={small ? 4 : undefined}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'outline' && !disabled && { borderWidth: 1, borderColor: c.border },
        {
          backgroundColor: pressed ? pressedBg : bg,
          opacity: loading ? 0.9 : pressed && pressedBg === bg ? 0.75 : 1,
        },
        hint && disabled ? undefined : style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />
      )}
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: fg }]}>{title}</Text>
    </Pressable>
  );
  if (!(hint && disabled)) return button;
  return (
    <View style={[{ gap: 6 }, style]}>
      {button}
      <View style={styles.hintRow}>
        <Ionicons name="information-circle-outline" size={14} color={c.textSecondary} />
        <Text style={[styles.hintText, { color: c.textSecondary }]}>{hint}</Text>
      </View>
    </View>
  );
}

/** Filter chip. Selected chips use ink, not the brand colour, so the primary action still stands out. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  const fg = selected ? c.onInk : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.ink : c.card, borderColor: selected ? c.ink : c.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      {icon && <Ionicons name={icon} size={14} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
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

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'ink';

// brand and neutral are also used for plain labels (category, role), so they have no default icon.
const PILL_ICON: Record<PillTone, IconName | null> = {
  neutral: null,
  success: 'ellipse',
  warning: 'time-outline',
  danger: 'close',
  brand: null,
  info: 'information-circle-outline',
  ink: 'checkmark-circle',
};

/** Status tag: tinted fill plus an icon, so status never relies on colour alone. */
export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: PillTone; icon?: IconName | null }) {
  const c = useColors();
  const [bg, fg] = {
    neutral: [c.fillStrong, c.textSecondary],
    success: [c.successSoft, c.successText],
    warning: [c.warningSoft, c.warningText],
    danger: [c.dangerSoft, c.dangerText],
    brand: [c.tintSoft, c.tintText],
    info: [c.infoSoft, c.infoText],
    ink: [c.ink, c.onInk],
  }[tone];
  const name = icon === null ? null : (icon ?? PILL_ICON[tone]);
  const dot = name === 'ellipse';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {name && <Ionicons name={name} size={dot ? 7 : 13} color={fg} style={dot ? { marginHorizontal: 2 } : undefined} />}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
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
      title={t('Something went wrong')}
      body={message}
      action={onRetry && <Button title={t('Try again')} variant="secondary" onPress={onRetry} />}
    />
  );
}

/** Logo for a society (or a person): image if present, otherwise initials on a soft category tint. */
export function SocietyAvatar({
  name,
  uri,
  size = 44,
  category,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  /** Society category; picks the colour family. Without it the colour is a stable pick from the name. */
  category?: string | null;
}) {
  const dark = useIsDark();
  const shape = { width: size, height: size, borderRadius: avatarRadius(size) };
  if (uri) return <Image source={{ uri }} style={shape} contentFit="cover" accessibilityIgnoresInvertColors />;
  const [bg, ink] = avatarArt[familyFor(category, name)][dark ? 'dark' : 'light'];
  return (
    <View style={[shape, styles.avatarCenter, { backgroundColor: bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={{ color: ink, fontWeight: '700', fontSize: size * 0.36 }} allowFontScaling={false}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const ICON_PLACEMENT = {
  corner: { scale: 1.1, right: -0.18, bottom: -0.26, rotate: '0deg' },
  topRight: { scale: 1.45, right: -0.35, top: -0.3, rotate: '0deg' },
  tilted: { scale: 0.95, right: 0.04, top: 0.02, rotate: '-12deg' },
} as const;

/**
 * Event, society or banner artwork: image if present, otherwise a flat cover in the category colour
 * with a large cropped category icon, placed by `seed` so neighbouring covers differ.
 */
export function Artwork({
  seed,
  uri,
  category,
  style,
  children,
}: {
  seed: string;
  uri?: string | null;
  /** Event or society category; picks the cover colour and icon. */
  category?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const dark = useIsDark();
  const [height, setHeight] = useState(0);
  const cover = coverFor(category, seed, dark);
  const place = ICON_PLACEMENT[coverVariant(seed)];
  const iconSize = Math.round(height * place.scale);
  return (
    <View
      style={[{ overflow: 'hidden', backgroundColor: cover.color }, style]}
      onLayout={uri ? undefined : (e) => setHeight(e.nativeEvent.layout.height)}>
      {!uri && height > 0 && (
        <Ionicons
          name={cover.icon}
          size={iconSize}
          color="#FFFFFF"
          style={{
            position: 'absolute',
            opacity: 0.22,
            right: place.right * iconSize,
            ...('top' in place ? { top: place.top * iconSize } : { bottom: place.bottom * iconSize }),
            transform: [{ rotate: place.rotate }],
          }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
      {children}
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
  /** Says how to fix the value; turns the field red. */
  error?: string | null;
  /** Shows a green check inside the field. */
  valid?: boolean;
};

export function Field({ label, hint, error, valid, onFocus, onBlur, ...props }: FieldProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.danger : focused ? c.tint : c.border;
  const borderWidth = error || focused ? 2 : StyleSheet.hairlineWidth * 2;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: c.textSecondary }]}>{label}</Text>
      <View style={[styles.inputRing, { borderColor: focused && !error ? c.focusRing : 'transparent' }]}>
        <TextInput
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              backgroundColor: c.card,
              color: c.text,
              borderColor,
              borderWidth,
              paddingHorizontal: 16 - borderWidth,
              paddingRight: valid ? 44 : 16 - borderWidth,
            },
            props.multiline && { minHeight: 110, textAlignVertical: 'top' },
            props.style,
          ]}
        />
        {valid && !error && <Ionicons name="checkmark-circle-outline" size={20} color={c.success} style={styles.validIcon} />}
      </View>
      {error ? (
        <View style={styles.hintRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={15} color={c.dangerText} />
          <Text style={[styles.hintText, { color: c.dangerText }]}>{error}</Text>
        </View>
      ) : (
        hint && <Text style={[styles.hintText, { color: c.textSecondary }]}>{hint}</Text>
      )}
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
  buttonSmall: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, gap: 6 },
  buttonText: { ...type.button },
  buttonTextSmall: { fontSize: 15, lineHeight: 20 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  chipRow: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingLeft: 7,
    paddingRight: 9,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { ...type.caption, flexShrink: 1 },
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
  inputRing: { borderWidth: 3, borderRadius: radius.md + 3, margin: -3 },
  // The focus ring is drawn by inputRing; turn off the browser's own outline on web.
  input: { minHeight: 48, borderRadius: radius.md, paddingVertical: 12, fontSize: 16, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },
  validIcon: { position: 'absolute', right: 14, top: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 50 },
  listGroup: { borderRadius: radius.md, overflow: 'hidden', marginHorizontal: space.lg },
});
