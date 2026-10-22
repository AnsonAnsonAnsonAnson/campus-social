import type { Backend } from './backend';
import { demoBackend } from './demo';
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

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
