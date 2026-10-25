import type { Backend } from './backend';
import { demoBackend } from './demo';
import { t } from './i18n';
import { hasSupabaseConfig, remoteBackend } from './remote';

/**
 * The app talks to Supabase when EXPO_PUBLIC_SUPABASE_URL and a key are set,
 * otherwise it runs on built-in demo data.
 */
export const api: Backend = hasSupabaseConfig ? remoteBackend : demoBackend;

// Lightweight cache invalidation: mutations call invalidate(), useQuery refetches.
const subscribers = new Set<() => void>();

export function invalidate() {
  subscribers.forEach((fn) => fn());
}

export function onInvalidate(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Error text for the person. Server and demo errors are written in English and
 * listed in the Chinese dictionary, so they're shown in the app's language;
 * anything unknown (network errors, Supabase Auth) falls back to English.
 */
export function errorMessage(e: unknown) {
  return t(e instanceof Error ? e.message : String(e));
}
