import { useColorScheme } from 'react-native';

const brand = {
  purple: '#6E2A8C',
  purpleLight: '#B78AD0',
  gold: '#D7A93B',
};

const light = {
  ...brand,
  tint: brand.purple,
  background: '#F2F2F7',
  card: '#FFFFFF',
  text: '#111114',
  textSecondary: '#6B6B73',
  border: '#E3E3E8',
  fill: '#EBEBF0',
  success: '#1F8A4C',
  warning: '#B26A00',
  danger: '#C62828',
  onTint: '#FFFFFF',
  toast: '#1C1C1E',
  onToast: '#FFFFFF',
};

const dark: typeof light = {
  ...brand,
  tint: brand.purpleLight,
  background: '#000000',
  card: '#1C1C1E',
  text: '#F4F4F6',
  textSecondary: '#9C9CA5',
  border: '#2C2C30',
  fill: '#2A2A2E',
  success: '#4CC27E',
  warning: '#F0A33A',
  danger: '#FF6B6B',
  onTint: '#1A0B22',
  toast: '#F4F4F6',
  onToast: '#111114',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** Gradient-ish placeholder colours for events/societies without artwork. */
const ART = [
  ['#6E2A8C', '#D7A93B'],
  ['#1E5AA8', '#46B3A9'],
  ['#B23A48', '#F28F3B'],
  ['#2D6A4F', '#95D5B2'],
  ['#3A0CA3', '#F72585'],
  ['#264653', '#E9C46A'],
] as const;

export function artFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ART[Math.abs(h) % ART.length];
}

/** Type scale, roughly the iOS text styles. Use these instead of ad hoc font sizes. */
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16 },
  subhead: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12, fontWeight: '600' },
  overline: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
} as const;
