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
  /** Brat lime with ink and pop pink: lime fills, ink text and icons on top, pink dates. */
  lime: {
    brand: {
      50: '#F9FEEE',
      100: '#F4FDDE',
      200: '#E6FAB6',
      300: '#D8F78C',
      400: '#C8F35C',
      500: '#BFF243',
      600: '#B8F02E',
      700: '#97C526',
      800: '#769A1D',
      900: '#4A6012',
      950: '#2E3C0C',
    },
    accent: {
      50: '#FDEDF3',
      100: '#FADAE8',
      200: '#F4AECD',
      300: '#EE80B0',
      400: '#E74B8F',
      500: '#E32F7D',
      600: '#E0186F',
      700: '#B8145B',
      800: '#8F0F47',
      900: '#5A0A2C',
    },
    roles: {
      fill: '#B8F02E',
      onFill: '#0A0A0B',
      tint: '#0A0A0B',
      tintPressed: '#2C2C2E',
      soft: '#D8F78C',
      text: '#4A6012',
      accentText: '#BE1C64',
    },
  },
  /** Lamine tomato + cobalt (from Lamine sofa & rug). */
  tomato: {
    brand: {
      50: '#FBEFEC',
      100: '#F6E0DA',
      200: '#EBBAAD',
      300: '#E0937F',
      400: '#D36649',
      500: '#CD4F2D',
      600: '#C73B16',
      700: '#A33012',
      800: '#7F260E',
      900: '#501809',
      950: '#320F06',
    },
    accent: {
      50: '#EDF0F9',
      100: '#DCE1F3',
      200: '#B2BDE5',
      300: '#8798D6',
      400: '#546CC5',
      500: '#3A56BC',
      600: '#2443B5',
      700: '#1E3794',
      800: '#172B74',
      900: '#0E1B48',
      950: '#09112D',
    },
    roles: {
      fill: '#C73B16',
      onFill: '#FFFFFF',
      tint: '#C73B16',
      text: '#C73B16',
      soft: '#EDCBBC',
      accentText: '#2443B5',
      covers: ['#C73B16', '#2443B5', '#2A1A12'],
    },
  },
  /** Ultramarine + tangerine (from Lamine rug & armchair). */
  ultramarine: {
    brand: {
      50: '#EDF0FB',
      100: '#DCE0F6',
      200: '#B2BCEC',
      300: '#8696E1',
      400: '#536AD4',
      500: '#3953CE',
      600: '#2340C8',
      700: '#1D34A4',
      800: '#162980',
      900: '#0E1A50',
      950: '#091032',
    },
    accent: {
      50: '#FEF3EE',
      100: '#FDE7DD',
      200: '#FACBB4',
      300: '#F7AD89',
      400: '#F38B57',
      500: '#F2793E',
      600: '#F06A28',
      700: '#C55721',
      800: '#9A441A',
      900: '#602A10',
      950: '#3C1A0A',
    },
    roles: {
      fill: '#2340C8',
      onFill: '#FFFFFF',
      tint: '#2340C8',
      text: '#2340C8',
      soft: '#CACBE0',
      accentText: '#A84A1C',
      covers: ['#2340C8', '#F06A28', '#14183A'],
    },
  },
  /** Rocket cherry + butter (from Rocket 'Meet wet food'). */
  cherry: {
    brand: {
      50: '#F9EEED',
      100: '#F4DDDB',
      200: '#E6B4B0',
      300: '#D88983',
      400: '#C8574F',
      500: '#BF3E34',
      600: '#B8281D',
      700: '#972118',
      800: '#761A13',
      900: '#4A100C',
      950: '#2E0A07',
    },
    accent: {
      50: '#FEFAF1',
      100: '#FDF5E3',
      200: '#FAEAC1',
      300: '#F8DD9E',
      400: '#F5CF75',
      500: '#F3C860',
      600: '#F2C24E',
      700: '#C69F40',
      800: '#9B7C32',
      900: '#614E1F',
      950: '#3C3014',
    },
    roles: {
      fill: '#B8281D',
      onFill: '#FFFFFF',
      tint: '#B8281D',
      text: '#B8281D',
      soft: '#EAC7BB',
      accentText: '#796127',
      covers: ['#B8281D', '#3A120D'],
    },
  },
  /** Periwinkle + tomato (from Taily Tales / Rocket blue). */
  periwinkle: {
    brand: {
      50: '#EFF2FA',
      100: '#E0E5F6',
      200: '#BAC7EB',
      300: '#93A7E0',
      400: '#6682D3',
      500: '#4F6FCC',
      600: '#3B5FC6',
      700: '#304EA2',
      800: '#263D7F',
      900: '#18264F',
      950: '#0F1832',
    },
    accent: {
      50: '#FDF1EE',
      100: '#FAE3DD',
      200: '#F5C2B4',
      300: '#EFA08A',
      400: '#E87859',
      500: '#E5633F',
      600: '#E2522A',
      700: '#B94322',
      800: '#91341B',
      900: '#5A2111',
      950: '#38140A',
    },
    roles: {
      fill: '#3B5FC6',
      onFill: '#FFFFFF',
      tint: '#3B5FC6',
      text: '#3B5FC6',
      soft: '#CAD5EF',
      accentText: '#C04624',
      covers: ['#3B5FC6', '#E2522A', '#1C2440'],
    },
  },
  /** Deep teal + rust (from Rocket husky sofa). */
  teal: {
    brand: {
      50: '#ECF1F2',
      100: '#D9E3E5',
      200: '#ACC2C6',
      300: '#7D9FA5',
      400: '#477680',
      500: '#2B626C',
      600: '#13505C',
      700: '#10424B',
      800: '#0C333B',
      900: '#082025',
      950: '#051417',
    },
    accent: {
      50: '#FBF1EE',
      100: '#F6E4DD',
      200: '#ECC4B4',
      300: '#E1A28A',
      400: '#D47B59',
      500: '#CE673F',
      600: '#C8562A',
      700: '#A44722',
      800: '#80371B',
      900: '#502211',
      950: '#32160A',
    },
    roles: {
      fill: '#13505C',
      onFill: '#FFFFFF',
      tint: '#13505C',
      text: '#13505C',
      soft: '#C6CCC6',
      accentText: '#AA4924',
      covers: ['#13505C', '#C8562A', '#0B2328'],
    },
  },
  /** Butter + cobalt (from Rocket poolside). */
  butter: {
    brand: {
      50: '#FEFBF1',
      100: '#FDF6E2',
      200: '#FAECC0',
      300: '#F8E19D',
      400: '#F5D573',
      500: '#F3CE5E',
      600: '#F2C94C',
      700: '#C6A53E',
      800: '#9B8131',
      900: '#61501E',
      950: '#3C3213',
    },
    accent: {
      50: '#EDF0F9',
      100: '#DCE1F3',
      200: '#B2BDE5',
      300: '#8798D6',
      400: '#546CC5',
      500: '#3A56BC',
      600: '#2443B5',
      700: '#1E3794',
      800: '#172B74',
      900: '#0E1B48',
      950: '#09112D',
    },
    roles: {
      fill: '#F2C94C',
      onFill: '#14110F',
      tint: '#2B2414',
      text: '#856F2A',
      soft: '#F9EDCA',
      accentText: '#2443B5',
      tintPressed: '#4B4537',
      covers: ['#2443B5', '#2B2414'],
    },
  },
  /** Pool blue + lemon (from Rocket poolside / YOA). */
  pool: {
    brand: {
      50: '#EDF3FA',
      100: '#DBE8F5',
      200: '#B1CDE9',
      300: '#84B0DC',
      400: '#508FCE',
      500: '#357DC6',
      600: '#1F6FC0',
      700: '#195B9D',
      800: '#14477B',
      900: '#0C2C4D',
      950: '#081C30',
    },
    accent: {
      50: '#FEFBF0',
      100: '#FDF7E1',
      200: '#FBEFBE',
      300: '#F8E599',
      400: '#F6DA6F',
      500: '#F4D558',
      600: '#F3D046',
      700: '#C7AB39',
      800: '#9C852D',
      900: '#61531C',
      950: '#3D3412',
    },
    roles: {
      fill: '#1F6FC0',
      onFill: '#FFFFFF',
      tint: '#1F6FC0',
      text: '#1F6FC0',
      soft: '#C8DBEE',
      accentText: '#7A6823',
      covers: ['#1F6FC0', '#0F2A45'],
    },
  },
  /** Oxblood + oat (from Rocket red, Lamine cream). */
  oxblood: {
    brand: {
      50: '#F5EDEC',
      100: '#EADBD9',
      200: '#D1B0AD',
      300: '#B7837E',
      400: '#994F48',
      500: '#89342C',
      600: '#7C1D14',
      700: '#661810',
      800: '#4F130D',
      900: '#320C08',
      950: '#1F0705',
    },
    accent: {
      50: '#FCF8F3',
      100: '#F9F0E7',
      200: '#F2DFCB',
      300: '#EACDAD',
      400: '#E1B88B',
      500: '#DDAD79',
      600: '#D9A46A',
      700: '#B28657',
      800: '#8B6944',
      900: '#57422A',
      950: '#36291A',
    },
    roles: {
      fill: '#7C1D14',
      onFill: '#FFFFFF',
      tint: '#7C1D14',
      text: '#7C1D14',
      soft: '#DDC3B7',
      accentText: '#826240',
      covers: ['#7C1D14', '#2A0E0A'],
    },
  },
  /** Strawberry milk + sky (from YOA milk). */
  strawberry: {
    brand: {
      50: '#FCF1F4',
      100: '#F9E3EA',
      200: '#F2C2D0',
      300: '#EAA0B6',
      400: '#E17897',
      500: '#DD6387',
      600: '#D9527A',
      700: '#B24364',
      800: '#8B344E',
      900: '#572131',
      950: '#36141E',
    },
    accent: {
      50: '#F2F6FC',
      100: '#E5EDF9',
      200: '#C6D8F2',
      300: '#A5C1EA',
      400: '#7FA8E1',
      500: '#6B9ADD',
      600: '#5B8FD9',
      700: '#4B75B2',
      800: '#3A5C8B',
      900: '#243957',
      950: '#172436',
    },
    roles: {
      fill: '#D9527A',
      onFill: '#14110F',
      tint: '#3A1622',
      text: '#B84668',
      soft: '#F4D1DB',
      accentText: '#446BA3',
      tintPressed: '#583943',
      covers: ['#D9527A', '#5B8FD9', '#3A1622'],
    },
  },
  /** Cobalt + cherry (from Lamine + Rocket). */
  cobaltcherry: {
    brand: {
      50: '#EEF0F9',
      100: '#DDE0F2',
      200: '#B4BCE3',
      300: '#8A95D3',
      400: '#5969C1',
      500: '#3F52B7',
      600: '#2A3FAF',
      700: '#223490',
      800: '#1B2870',
      900: '#111946',
      950: '#0A102C',
    },
    accent: {
      50: '#F9EEED',
      100: '#F3DDDB',
      200: '#E4B4B1',
      300: '#D48A84',
      400: '#C25950',
      500: '#B93F35',
      600: '#B12A1F',
      700: '#912219',
      800: '#711B14',
      900: '#47110C',
      950: '#2C0A08',
    },
    roles: {
      fill: '#2A3FAF',
      onFill: '#FFFFFF',
      tint: '#2A3FAF',
      text: '#2A3FAF',
      soft: '#CCCDDE',
      accentText: '#B12A1F',
      covers: ['#2A3FAF', '#B12A1F', '#141A3A'],
    },
  },
  /** Electric cobalt with tangerine: the v2 design colours. */
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
    roles: {},
  },
} as const;

export type BrandName = keyof typeof BRANDS;
export const BRAND: BrandName =
  (process.env.EXPO_PUBLIC_BRAND as BrandName) in BRANDS ? (process.env.EXPO_PUBLIC_BRAND as BrandName) : 'lime';
const { brand, accent } = BRANDS[BRAND];
/**
 * Most brands are dark enough to carry white text and to draw icons and links on white, so one
 * colour does both. A light brand (lime) splits them: `fill` paints buttons, chips and the
 * current tab, with `onFill` on top, and `tint` (icons, borders, links) is a dark colour.
 */
const roles: {
  fill?: string;
  onFill?: string;
  tint?: string;
  tintPressed?: string;
  soft?: string;
  text?: string;
  accentText?: string;
  /** Flat cover and logo colours, drawn from the palette, instead of the per-category colours. */
  covers?: readonly string[];
  /** Warm paper instead of white for feed screens, with matching grouped, fill, border and tab bar. */
  paper?: string;
  grouped?: string;
  surfaceFill?: string;
  surfaceBorder?: string;
  tabBar?: string;
} = BRANDS[BRAND].roles;

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

  /** Primary button, selected filter chip, current-tab pill, progress bars. */
  brand: roles.fill ?? (brand[600] as string),
  brandPressed: brand[700] as string,
  onBrand: roles.onFill ?? '#FFFFFF',
  /** Brand-coloured icons, borders, switches and the focus ring on white. */
  tint: roles.tint ?? (brand[600] as string),
  tintPressed: roles.tintPressed ?? (brand[700] as string),
  onTint: '#FFFFFF',
  /** Follow button, "Going" pill, bell-on. */
  tintSoft: roles.soft ?? (brand[100] as string),
  /** Links, plain buttons, text on tintSoft. */
  tintText: roles.text ?? (brand[600] as string),
  /** Brand-filled hero surfaces (sign-in, welcome, splash). */
  brandStrong: brand[700] as string,

  /** Campus-date markers, "New" dot. */
  accent: accent[500] as string,
  accentSoft: accent[100] as string,
  /** Event dates in lists, campus labels. */
  accentText: roles.accentText ?? (accent[700] as string),

  /** Grouped screens (Profile, Manage, forms). */
  background: roles.grouped ?? '#F5F5F7',
  /** Feed screens (Discover, Search, Tickets, Calendar, Societies, Event). */
  backgroundPlain: roles.paper ?? '#FFFFFF',
  card: '#FFFFFF',
  /** Sheets, menus, bottom action bar. */
  elevated: '#FFFFFF',
  text: '#0A0A0B',
  textSecondary: '#6E6E73',
  /** Placeholders, timestamps. */
  textTertiary: '#76767C',
  border: roles.surfaceBorder ?? '#E0E0E5',
  /** Search field, secondary buttons, icon tiles. */
  fill: roles.surfaceFill ?? '#F2F2F5',
  /** Neutral pills, segmented-control track. */
  fillStrong: roles.surfaceBorder ?? '#EDEDF0',
  /** "Checked in", toast, step markers. */
  ink: '#0A0A0B',
  onInk: '#FFFFFF',

  disabledFill: '#EDEDF0',
  disabledText: '#A1A1A6',
  /** 3pt halo outside a 2pt tint border. */
  focusRing: alpha(roles.fill ?? brand[600], 0.35),

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
  tabBar: roles.tabBar ?? 'rgba(255,255,255,0.94)',
};

const dark: typeof light = {
  purple: brand[500],
  purpleLight: brand[300],
  gold: accent[400],

  brand: roles.fill ?? brand[500],
  brandPressed: brand[400],
  onBrand: roles.onFill ?? '#FFFFFF',
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
  Orientation: { cover: roles.tint ?? brand[600], coverDark: brand[500], icon: 'compass-outline' },
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
  Cobalt: { light: [brand[100], roles.text ?? brand[600]], dark: [brand[900], brand[300]], cover: roles.tint ?? brand[600] },
  Slate: { light: ['#EDEDF0', '#48484A'], dark: ['#2C2C2E', '#C7C7CC'], cover: '#52525B' },
};

// A palette with its own cover colours paints society logos solid in them too, with white initials.
if (roles.covers?.length) {
  const covers = roles.covers;
  (Object.keys(avatarArt) as AvatarFamily[]).forEach((f, i) => {
    const color = covers[i % covers.length];
    avatarArt[f] = { light: [color, '#FFFFFF'], dark: [color, '#FFFFFF'], cover: color };
  });
}

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
  if (roles.covers?.length) {
    const icon = event?.icon ?? ((category && SOCIETY_ICONS[category]) || 'sparkles-outline');
    return { color: roles.covers[hash(category || seed) % roles.covers.length], icon };
  }
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
