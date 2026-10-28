/**
 * Design system v2 (see docs/design-handoff.md). Neutral surfaces, one brand colour for the
 * primary action, the current tab, selected filters and links, a warm accent for dates, and
 * vivid flat colours for event covers.
 *
 * The brand is picked in one place, `BRAND` below. Every screen reads it through `useColors()`
 * (`tint`, `tintSoft`, `tintText`, `accent`...) or `palette.brand` / `palette.accent`, so a new
 * brand needs no screen changes. The icon, splash and notification colour come from
 * scripts/make-icons.py and app.json and must be regenerated to match.
 */
const BRANDS = {
  /** Lion Rock violet with campus gold: a nod to CUHK purple and gold, brighter and more digital. */
  violet: {
    brand: {
      50: '#F4F0FF',
      100: '#EBE3FF',
      200: '#D3C2FF',
      300: '#B497FF',
      400: '#9466FF',
      500: '#7A3FF5',
      600: '#6A2BE0',
      700: '#5420B8',
      800: '#3F1890',
      900: '#24104A',
      950: '#160A30',
    },
    accent: {
      50: '#FFF8E6',
      100: '#FFEFC2',
      200: '#FFDF85',
      300: '#FFCB47',
      400: '#FFB81A',
      500: '#F5A400',
      600: '#C98500',
      700: '#8A5A00',
      800: '#6B4500',
      900: '#3A2500',
    },
  },
  /** Harbour jade with tangerine: Hong Kong jade and green hills, far from other uni apps. */
  jade: {
    brand: {
      50: '#E8F7F2',
      100: '#D2F0E6',
      200: '#9EE0CB',
      300: '#62C9A9',
      400: '#2BAF88',
      500: '#009670',
      600: '#00795A',
      700: '#006349',
      800: '#004D39',
      900: '#013326',
      950: '#011F17',
    },
    accent: {
      50: '#FFF4EC',
      100: '#FFE4D1',
      200: '#FFC8A3',
      300: '#FFA66B',
      400: '#FF8A3D',
      500: '#FF6F0F',
      600: '#E05A00',
      700: '#B34700',
      800: '#853500',
      900: '#3A1A04',
    },
  },
  /** Electric cobalt with tangerine: the v2 design colours, used loudly. */
  cobalt: {
    brand: {
      50: '#EEF2FF',
      100: '#E6ECFF',
      200: '#B9C8FF',
      300: '#8FA6FF',
      400: '#6283FF',
      500: '#3D63FF',
      600: '#2450F0',
      700: '#1A3CC4',
      800: '#152F96',
      900: '#0E1A4D',
      950: '#0A1033',
    },
    accent: {
      50: '#FFF4EC',
      100: '#FFE4D1',
      200: '#FFC8A3',
      300: '#FFA66B',
      400: '#FF8A3D',
      500: '#FF6F0F',
      600: '#E05A00',
      700: '#B34700',
      800: '#853500',
      900: '#3A1A04',
    },
  },
} as const;

export type BrandName = keyof typeof BRANDS;
export const BRAND: BrandName =
  (process.env.EXPO_PUBLIC_BRAND as BrandName) in BRANDS ? (process.env.EXPO_PUBLIC_BRAND as BrandName) : 'violet';
const { brand, accent } = BRANDS[BRAND];

/** "#6A2BE0", 0.24 -> "rgba(106,43,224,0.24)" */
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const palette = {
  brand,
  accent,
  /** Deprecated names from v2, now the brand and accent scales. */
  cobalt: brand,
  tangerine: accent,
  neutral: {
    0: '#FFFFFF',
    50: '#F5F5F7',
    100: '#EDEDF0',
    200: '#E0E0E5',
    300: '#C7C7CC',
    400: '#A1A1A6',
    450: '#8E8E93',
    500: '#76767C',
    600: '#6E6E73',
    700: '#48484A',
    750: '#38383A',
    800: '#2C2C2E',
    850: '#1C1C1E',
    900: '#0A0A0B',
    1000: '#000000',
  },
} as const;

const light = {
  // Deprecated v1 names, kept until every screen has moved to the role tokens below.
  purple: brand[600] as string,
  purpleLight: brand[500] as string,
  gold: accent[500] as string,

  /** Primary action, current tab, selected filter chip. */
  tint: brand[600] as string,
  tintPressed: brand[700] as string,
  onTint: '#FFFFFF',
  /** Follow button, "Going" pill, bell-on, current tab pill. */
  tintSoft: brand[100] as string,
  /** Links, plain buttons, verified tick. */
  tintText: brand[600] as string,
  /** Brand-filled hero surfaces (sign-in, welcome, splash). */
  brandStrong: brand[700] as string,

  /** Campus-date markers, "New" dot. */
  accent: accent[500] as string,
  accentSoft: accent[100] as string,
  /** Event dates in lists, campus labels. */
  accentText: accent[700] as string,

  /** Grouped screens (Profile, Manage, forms). */
  background: '#F5F5F7',
  /** Feed screens (Discover, Search, Tickets, Calendar, Societies, Event). */
  backgroundPlain: '#FFFFFF',
  card: '#FFFFFF',
  /** Sheets, menus, bottom action bar. */
  elevated: '#FFFFFF',
  text: '#0A0A0B',
  textSecondary: '#6E6E73',
  /** Placeholders, timestamps. */
  textTertiary: '#76767C',
  border: '#E0E0E5',
  /** Search field, secondary buttons, icon tiles. */
  fill: '#F2F2F5',
  /** Neutral pills, segmented-control track. */
  fillStrong: '#EDEDF0',
  /** "Checked in", toast, step markers. */
  ink: '#0A0A0B',
  onInk: '#FFFFFF',

  disabledFill: '#EDEDF0',
  disabledText: '#A1A1A6',
  /** 3pt halo outside a 2pt tint border. */
  focusRing: alpha(brand[600], 0.24),

  success: '#078040',
  successSoft: '#E3F7EA',
  successText: '#066B35',
  warning: '#C25400',
  warningSoft: '#FFF1E0',
  warningText: '#9A4300',
  /** Also the unread badge and the saved heart. */
  danger: '#E0201B',
  dangerSoft: '#FFE8E7',
  dangerText: '#B8150F',
  info: '#0A7EA4',
  infoSoft: '#E2F4FA',
  infoText: '#075F7D',

  toast: '#0A0A0B',
  onToast: '#FFFFFF',
  scrim: 'rgba(10,10,11,0.45)',
  tabBar: 'rgba(255,255,255,0.94)',
};

const dark: typeof light = {
  purple: brand[500],
  purpleLight: brand[300],
  gold: accent[400],

  tint: brand[500],
  tintPressed: brand[400],
  onTint: '#FFFFFF',
  tintSoft: brand[900],
  tintText: brand[300],
  brandStrong: brand[800],

  accent: accent[400],
  accentSoft: accent[900],
  accentText: accent[300],

  background: '#000000',
  backgroundPlain: '#000000',
  card: '#1C1C1E',
  elevated: '#2C2C2E',
  text: '#F5F5F7',
  textSecondary: '#A1A1A6',
  textTertiary: '#8E8E93',
  border: '#38383A',
  fill: '#2C2C2E',
  fillStrong: '#2C2C2E',
  ink: '#F5F5F7',
  onInk: '#0A0A0B',

  disabledFill: '#2C2C2E',
  disabledText: '#636366',
  focusRing: alpha(brand[500], 0.45),

  success: '#30D158',
  successSoft: '#0E2E19',
  successText: '#5BE07E',
  warning: '#FF9F0A',
  warningSoft: '#3A2400',
  warningText: '#FFB547',
  danger: '#FF453A',
  dangerSoft: '#3D0F0C',
  dangerText: '#FF6B61',
  info: '#64D2FF',
  infoSoft: '#062B38',
  infoText: '#7FDBFF',

  toast: '#F5F5F7',
  onToast: '#0A0A0B',
  scrim: 'rgba(0,0,0,0.6)',
  tabBar: 'rgba(28,28,30,0.94)',
};

export type Colors = typeof light;

/**
 * The app is light only for launch, as in the design, whatever the phone is set
 * to. The dark palette stays so a dark mode can be switched back on here.
 */
const DARK_MODE = false;

export function useColors(): Colors {
  return DARK_MODE ? dark : light;
}

export function useIsDark(): boolean {
  return DARK_MODE;
}

export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
/** Society logos are squircles: corner radius as a share of the size. */
export const avatarRadius = (size: number) => size * 0.28;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 } as const;

/** Light mode uses shadows; in dark mode use the `elevated` surface instead. */
export const elevation = {
  e0: {},
  e1: { shadowColor: '#16081E', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  e2: { shadowColor: '#16081E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  e3: { shadowColor: '#16081E', shadowOpacity: 0.18, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
} as const;

/** Type scale, roughly the iOS text styles. Use these instead of ad hoc font sizes. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  /** Alias of title2. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  /** Field and group labels: sentence case, never uppercase (it does nothing in Chinese). */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  /** Alias of label, kept for existing screens. */
  overline: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  stat: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
} as const;

/** Chinese overrides: lighter display weights and about 1.45x line height. */
export const typeZh: Partial<Record<keyof typeof type, { lineHeight?: number; fontWeight?: '600' }>> = {
  largeTitle: { lineHeight: 46, fontWeight: '600' },
  title1: { lineHeight: 38, fontWeight: '600' },
  title2: { lineHeight: 31, fontWeight: '600' },
  title: { lineHeight: 31, fontWeight: '600' },
  headline: { lineHeight: 25 },
  body: { lineHeight: 24 },
  subhead: { lineHeight: 22 },
  footnote: { lineHeight: 19 },
  label: { lineHeight: 19 },
  overline: { lineHeight: 19 },
  caption: { lineHeight: 17 },
};

/** A type style with the Chinese overrides applied when `lang` is 'zh'. */
export function textStyle(key: keyof typeof type, lang: string) {
  return lang.startsWith('zh') ? { ...type[key], ...typeZh[key] } : type[key];
}

type IconName =
  | 'people-outline'
  | 'mic-outline'
  | 'construct-outline'
  | 'basketball-outline'
  | 'musical-notes-outline'
  | 'briefcase-outline'
  | 'heart-outline'
  | 'compass-outline'
  | 'sparkles-outline'
  | 'book-outline'
  | 'code-slash-outline'
  | 'color-palette-outline'
  | 'globe-outline'
  | 'leaf-outline'
  | 'school-outline';

/** Event category → flat cover colour (white text and icon, at least 4.5:1) and icon. */
export const categoryArt: Record<string, { cover: string; coverDark: string; icon: IconName }> = {
  Social: { cover: '#E11D74', coverDark: '#E11D74', icon: 'people-outline' },
  Talk: { cover: '#0072A3', coverDark: '#0072A3', icon: 'mic-outline' },
  Workshop: { cover: '#C94700', coverDark: '#C94700', icon: 'construct-outline' },
  Sports: { cover: '#00875A', coverDark: '#00875A', icon: 'basketball-outline' },
  Performance: { cover: '#7C3AED', coverDark: '#7C3AED', icon: 'musical-notes-outline' },
  Career: { cover: '#18181B', coverDark: '#3A3A3F', icon: 'briefcase-outline' },
  Volunteering: { cover: '#D92D20', coverDark: '#D92D20', icon: 'heart-outline' },
  Orientation: { cover: brand[600], coverDark: brand[500], icon: 'compass-outline' },
  Other: { cover: '#52525B', coverDark: '#5A5A63', icon: 'sparkles-outline' },
};

export type AvatarFamily = 'Pink' | 'Ocean' | 'Orange' | 'Green' | 'Violet' | 'Graphite' | 'Red' | 'Cobalt' | 'Slate';

/** Soft tints for society logos without artwork: [background, initials]. */
export const avatarArt: Record<AvatarFamily, { light: readonly [string, string]; dark: readonly [string, string]; cover: string }> = {
  Pink: { light: ['#FDE7F0', '#C0135E'], dark: ['#3A0D20', '#FF7AB3'], cover: '#E11D74' },
  Ocean: { light: ['#E0F2FA', '#00648F'], dark: ['#032636', '#5CC8F5'], cover: '#0072A3' },
  Orange: { light: ['#FFEDE0', '#B03E00'], dark: ['#3A1A04', '#FF9B5C'], cover: '#C94700' },
  Green: { light: ['#DDF5EA', '#00774F'], dark: ['#032B1D', '#4FDBA0'], cover: '#00875A' },
  Violet: { light: ['#EFE7FE', '#6D28D9'], dark: ['#24104A', '#B794FF'], cover: '#7C3AED' },
  Graphite: { light: ['#E8E8EB', '#18181B'], dark: ['#2C2C2E', '#D4D4D8'], cover: '#18181B' },
  Red: { light: ['#FDE8E6', '#B42318'], dark: ['#3D0F0C', '#FF6B61'], cover: '#D92D20' },
  Cobalt: { light: [brand[100], brand[600]], dark: [brand[900], brand[300]], cover: brand[600] },
  Slate: { light: ['#EDEDF0', '#48484A'], dark: ['#2C2C2E', '#C7C7CC'], cover: '#52525B' },
};

/** Society category → avatar family. Faith and Other share Slate; the initials tell them apart. */
export const societyFamily: Record<string, AvatarFamily> = {
  Academic: 'Ocean',
  Tech: 'Graphite',
  Arts: 'Violet',
  Music: 'Pink',
  Culture: 'Orange',
  Sports: 'Green',
  Service: 'Red',
  Faith: 'Slate',
  College: 'Cobalt',
  Other: 'Slate',
};

const SOCIETY_ICONS: Record<string, IconName> = {
  Academic: 'book-outline',
  Tech: 'code-slash-outline',
  Arts: 'color-palette-outline',
  Music: 'musical-notes-outline',
  Culture: 'globe-outline',
  Sports: 'basketball-outline',
  Service: 'heart-outline',
  Faith: 'leaf-outline',
  College: 'school-outline',
  Other: 'sparkles-outline',
};

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const FAMILIES = Object.keys(avatarArt) as AvatarFamily[];

/** Avatar family for a society category, or a stable pick from the name when there is none (people). */
export function familyFor(category: string | null | undefined, seed: string): AvatarFamily {
  return (category && societyFamily[category]) || FAMILIES[hash(seed) % FAMILIES.length];
}

/** Where the big category icon sits on a placeholder cover, so two covers of one category differ. */
export function coverVariant(seed: string): 'corner' | 'topRight' | 'tilted' {
  return (['corner', 'topRight', 'tilted'] as const)[hash(seed) % 3];
}

/**
 * Placeholder cover for an event (event category) or society (society category).
 * Unknown or missing categories fall back to a stable colour from the seed.
 */
export function coverFor(category: string | null | undefined, seed: string, dark: boolean) {
  const event = category ? categoryArt[category] : undefined;
  if (event) return { color: dark ? event.coverDark : event.cover, icon: event.icon };
  const family = familyFor(category, seed);
  return { color: avatarArt[family].cover, icon: (category && SOCIETY_ICONS[category]) || 'sparkles-outline' };
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/** "CUHK Debate Society" → "DS"; "中大合唱團" → "合". */
export function initialsFor(name: string) {
  const trimmed = name
    .trim()
    .replace(/^(CUHK|CU)\s+/i, '')
    .replace(/^中大/, '');
  if (CJK.test(trimmed[0] ?? '')) return trimmed[0];
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
