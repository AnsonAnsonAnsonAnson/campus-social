import RawIonicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
  elevation,
  familyFor,
  initialsFor,
  radius,
  space,
  textStyle,
  type,
  useColors,
  useIsDark,
} from '@/lib/theme';
import { t, useLang } from '@/lib/i18n';

import { BrandMark } from './BrandMark';
import { FilledHeart, Glyph, IONICON_TO_GLYPH } from './Glyph';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type IconName = ComponentProps<typeof RawIonicons>['name'];

/** Ionicons names, drawn with the design's own line glyph when it has one. */
function Ionicons({ name, size = 18, color, style }: { name: IconName; size?: number; color: string; style?: object }) {
  if (name === 'heart') return <FilledHeart size={size} color={color} />;
  const glyph = IONICON_TO_GLYPH[name];
  if (glyph) return <Glyph name={glyph} size={size} color={color} style={style} />;
  return <RawIonicons name={name} size={size} color={color} style={style} />;
}

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
    primary: [c.brand, c.onBrand, c.brandPressed],
    secondary: [c.fill, c.text, c.fillStrong],
    tinted: [c.brand, c.onBrand, c.brandPressed],
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
      {loading ? <ActivityIndicator color={fg} /> : icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
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

/** Filter chip. Selected chips take the brand colour. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  const fg = selected ? c.onBrand : c.text;
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
        { backgroundColor: selected ? c.brand : c.card, borderColor: selected ? c.brand : c.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      {icon && <Ionicons name={icon} size={14} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Grey filter pill that opens a menu (Search): label plus a chevron; brand colour when a value is picked. */
export function DropChip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const c = useColors();
  const fg = selected ? c.onBrand : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.dropChip,
        icon ? { paddingLeft: 12, paddingRight: 12, gap: 6 } : null,
        { backgroundColor: selected ? c.brand : pressed ? c.fillStrong : c.fill },
      ]}>
      {icon && <Ionicons name={icon} size={17} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
      {!icon && <Ionicons name="chevron-down" size={15} color={fg} />}
    </Pressable>
  );
}

/** Bottom sheet with a title and a list of choices, the current one ticked. */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onClose: () => void;
}) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[type.headline, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      <View>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                tap();
                onChange(o.value);
                onClose();
              }}
              style={({ pressed }) => [styles.option, { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ flex: 1, color: c.text, fontSize: 17, fontWeight: selected ? '600' : '400' }}>{o.label}</Text>
              {selected && <Ionicons name="checkmark" size={20} color={c.tint} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
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
  success: 'radio-button-on-outline',
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
    brand: [c.brand, c.onBrand],
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
  const lang = useLang();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[textStyle('title2', lang), { color: c.text, flex: 1 }]} accessibilityRole="header">
        {title}
      </Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={styles.sectionAction}>
          <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600' }}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={c.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

/** Content card: white with a soft shadow in light mode, a lighter surface in dark mode. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const dark = useIsDark();
  return <View style={[styles.card, { backgroundColor: c.card }, !dark && elevation.e1, style]}>{children}</View>;
}

/** Empty or signed-out screen: a tinted icon, what's going on, and one clear next step. */
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.tintSoft }]}>
        <Ionicons name={icon} size={34} color={c.tintText} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      {body && <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{body}</Text>}
      {action && <View style={{ marginTop: space.sm, alignSelf: 'stretch', alignItems: 'center' }}>{action}</View>}
    </View>
  );
}

/** Two to four options in a pill track; the selected one is a raised card. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  grey,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  /** On grey (grouped) screens the track is a shade darker. */
  grey?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: grey ? c.fillStrong : c.fill }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: c.card }]]}>
            <Text style={[styles.segmentText, { color: selected ? c.text : c.textSecondary }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text tabs with an underline under the active one, and an optional count. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number; urgent?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.tabsRow, { borderBottomColor: c.border }]} accessibilityRole="tablist">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
        {tabs.map((tb) => {
          const active = tb.value === value;
          return (
            <Pressable
              key={tb.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (active) return;
                tap();
                onChange(tb.value);
              }}
              style={[styles.tab, { borderBottomColor: active ? c.text : 'transparent' }]}>
              <Text style={[styles.tabText, { color: active ? c.text : c.textSecondary }]}>{tb.label}</Text>
              {!!tb.count && (
                <View style={[styles.tabCount, { backgroundColor: tb.urgent ? c.danger : c.fillStrong }]}>
                  <Text style={{ color: tb.urgent ? '#fff' : c.textSecondary, fontSize: 12, fontWeight: '700' }}>{tb.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A number with a label, for dashboards. */
export function StatTile({
  value,
  label,
  tone,
  onPress,
  style,
}: {
  value: string;
  label: string;
  tone?: 'success' | 'warning';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const [bg, fg] =
    tone === 'success' ? [c.successSoft, c.successText] : tone === 'warning' ? [c.warningSoft, c.warningText] : [c.card, c.text];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.stat, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }, style]}>
      <Text style={[styles.statValue, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ color: tone ? fg : c.textSecondary, fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Event page detail line: icon tile, main text, sub text, optional trailing action. */
export function InfoRow({
  icon,
  title,
  sub,
  subColor,
  action,
  onAction,
  children,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  subColor?: string;
  action?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: c.fill }]}>
        <Ionicons name={icon} size={20} color={c.text} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{title}</Text>
        {sub && (
          <Text style={{ color: subColor ?? c.textSecondary, fontSize: 14, lineHeight: 19, fontWeight: subColor ? '600' : '400' }}>
            {sub}
          </Text>
        )}
        {children}
      </View>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.tintText, fontSize: 15, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Thin progress bar (capacity, stock). */
export function ProgressBar({ value, tone = 'success' }: { value: number; tone?: 'success' | 'warning' }) {
  const c = useColors();
  return (
    <View style={[styles.progress, { backgroundColor: c.fillStrong }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: tone === 'warning' ? c.warning : c.success,
        }}
      />
    </View>
  );
}

/** Bottom sheet: grabber, rounded top, tap outside to close. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheetBackdrop, { backgroundColor: c.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Close')} />
        <View style={[styles.sheet, elevation.e3, { backgroundColor: c.elevated, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Notice inside a screen (offline, pending review): tinted, with an icon. Not a toast. */
export function Banner({ icon, text, tone = 'info' }: { icon: IconName; text: string; tone?: 'info' | 'warning' | 'success' | 'danger' }) {
  const c = useColors();
  const [bg, fg] = {
    info: [c.infoSoft, c.infoText],
    warning: [c.warningSoft, c.warningText],
    success: [c.successSoft, c.successText],
    danger: [c.dangerSoft, c.dangerText],
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="text">
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={{ color: fg, flex: 1, fontSize: 14, lineHeight: 20 }}>{text}</Text>
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
    <View
      style={[shape, styles.avatarCenter, { backgroundColor: bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
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
  mark,
  children,
}: {
  seed: string;
  /** Small category icon in the top-left corner, as on list thumbnails. */
  mark?: boolean;
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
            opacity: 0.28,
            right: place.right * iconSize,
            ...('top' in place ? { top: place.top * iconSize } : { bottom: place.bottom * iconSize }),
            transform: [{ rotate: place.rotate }],
          }}
        />
      )}
      {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
      {mark && !uri && (
        <View style={styles.artMark} pointerEvents="none">
          <Ionicons name={cover.icon} size={16} color="#FFFFFF" />
        </View>
      )}
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
  subtitle,
  value,
  badge,
  onPress,
  destructive,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  /** Red count on the right (Inbox). */
  badge?: number;
  onPress?: () => void;
  destructive?: boolean;
  /** Replaces the value and chevron, e.g. a Switch. */
  right?: ReactNode;
}) {
  const c = useColors();
  const fg = destructive ? c.dangerText : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, subtitle ? { minHeight: 58 } : null, { backgroundColor: pressed ? c.fill : c.card }]}>
      {icon && <Ionicons name={icon} size={20} color={destructive ? c.dangerText : c.textSecondary} />}
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text style={{ fontSize: 16, color: fg }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 1 }}>{subtitle}</Text>}
      </View>
      {right ?? (
        <>
          {value != null && (
            <Text style={{ color: c.textSecondary, fontSize: 15, maxWidth: '45%' }} numberOfLines={1}>
              {value}
            </Text>
          )}
          {!!badge && (
            <View style={[styles.badge, { backgroundColor: c.danger }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{badge}</Text>
            </View>
          )}
          {onPress && !destructive && <Ionicons name="chevron-forward" size={14} color={c.textTertiary} />}
        </>
      )}
    </Pressable>
  );
}

export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  const c = useColors();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      {title && <Text style={[type.label, { color: c.textSecondary, marginLeft: space.lg + space.xs }]}>{title}</Text>}
      <View style={[styles.listGroup, { backgroundColor: c.card }]}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: c.border }]} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Large page title drawn in the content, as in the design: 34pt, with round
 * buttons on the right. Tab screens use it instead of a navigation bar.
 * `brand` puts the app's mark before the title (Discover, the home tab).
 */
export function PageHeader({ title, brand, children }: { title: string; brand?: boolean; children?: ReactNode }) {
  const c = useColors();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.pageHeader, { paddingTop: insets.top + 10 }]}>
      {brand && <BrandMark />}
      <Text style={[textStyle('largeTitle', lang), { color: c.text, flex: 1 }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {children && <View style={styles.pageHeaderActions}>{children}</View>}
    </View>
  );
}

/** 44pt round grey button for page headers: bell, add, today. Optional red dot. */
export function CircleButton({
  icon,
  label,
  onPress,
  dot,
  text,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  dot?: boolean;
  /** A short word instead of an icon makes it a pill ("Today", "+ Register"). */
  text?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [text ? styles.circlePill : styles.circle, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
      {icon && <Ionicons name={icon} size={text ? 16 : 21} color={c.text} />}
      {text && <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{text}</Text>}
      {dot && <View style={[styles.circleDot, { backgroundColor: c.danger, borderColor: c.fill }]} />}
    </Pressable>
  );
}

/** Round search field. With onPress it is a button that opens the search screen. */
export function SearchField({
  placeholder,
  value,
  onChangeText,
  onPress,
  autoFocus,
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (v: string) => void;
  onPress?: () => void;
  autoFocus?: boolean;
}) {
  const c = useColors();
  const inner = (
    <>
      <Ionicons name="search" size={18} color={c.textSecondary} />
      {onPress ? (
        <Text style={{ flex: 1, color: c.textTertiary, fontSize: 16 }} numberOfLines={1}>
          {placeholder}
        </Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textTertiary}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
          style={[styles.searchInput, { color: c.text }]}
        />
      )}
      {!onPress && !!value && (
        <Pressable onPress={() => onChangeText?.('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Clear')}>
          <Ionicons name="close-circle" size={18} color={c.textTertiary} />
        </Pressable>
      )}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [styles.search, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
      {inner}
    </Pressable>
  ) : (
    <View style={[styles.search, { backgroundColor: c.fill }]}>{inner}</View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  circlePill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDot: { position: 'absolute', top: 9, right: 10, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    marginHorizontal: space.lg,
  },
  searchInput: { flex: 1, fontSize: 16, height: 46, outlineStyle: 'none' } as object,
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
  dropChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: radius.pill,
  },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 44,
    paddingHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  card: { borderRadius: radius.lg, padding: space.lg },
  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, flexGrow: 1, minHeight: 280 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyTitle: { fontSize: 19, fontWeight: '600', textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segment: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segmentSelected: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  tabsRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabsContent: { paddingHorizontal: space.lg, gap: 22 },
  tab: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2.5 },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, borderRadius: 14, paddingVertical: space.md, paddingHorizontal: space.md, gap: 2 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: 4 },
  infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: space.lg, paddingTop: space.sm, gap: space.md, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.xs },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    marginHorizontal: space.lg,
  },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artMark: { position: 'absolute', left: 10, top: 10 },
  avatarCenter: { alignItems: 'center', justifyContent: 'center' },
  inputRing: { borderWidth: 3, borderRadius: radius.md + 3, margin: -3 },
  // The focus ring is drawn by inputRing; turn off the browser's own outline on web.
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingVertical: 12,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
  },
  validIcon: { position: 'absolute', right: 14, top: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 50 },
  listGroup: { borderRadius: radius.md, overflow: 'hidden', marginHorizontal: space.lg },
});
