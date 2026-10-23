// Bilingual UI: Traditional Chinese (Hong Kong) first, English second.
//
// Strings are written in English at the call site, t('Sign in'), and the
// English text is the lookup key into src/i18n/zh-Hant.ts. A unit test checks
// that every t('...') in the app has a Chinese translation. Placeholders use
// {name}: t('{n} spots left', { n: 3 }).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import zhHant from '../i18n/zh-Hant';

export type Lang = 'zh-Hant' | 'en';

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'en', label: 'English' },
];

const STORAGE_KEY = 'settings.language';
const DEFAULT_LANG: Lang = 'zh-Hant';

let current: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

export function getLang() {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => undefined);
  listeners.forEach((l) => l());
}

let returnRoute: string | null = null;

/**
 * Switches language from a settings screen. The root layout remounts the app
 * so every screen picks up the new text, then reopens `returnTo`.
 */
export function changeLanguage(lang: Lang, returnTo?: string) {
  if (lang === current) return;
  returnRoute = returnTo ?? null;
  setLang(lang);
}

/** The screen to reopen after a language change (read once). */
export function takeReturnRoute() {
  const r = returnRoute;
  returnRoute = null;
  return r;
}

/** Restores the saved choice; call once at startup. */
export async function loadLang() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-Hant') setLang(saved);
  } catch {
    // Keep the default.
  }
}

/** Calls `cb` now and after every language change, for libraries with their own locale setting. */
export function onLanguageChange(cb: (lang: Lang) => void) {
  cb(current);
  return subscribe(() => cb(current));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Re-renders the caller when the language changes. */
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

export type Params = Record<string, string | number>;

export function t(text: string, params?: Params) {
  const template = current === 'en' ? text : ((zhHant as Record<string, string>)[text] ?? text);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Locale for Intl date formatting. */
export function intlLocale() {
  return current === 'en' ? 'en-HK' : 'zh-HK';
}
