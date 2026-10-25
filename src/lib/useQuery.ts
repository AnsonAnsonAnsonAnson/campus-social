import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { errorMessage, onInvalidate } from './api';

/**
 * Minimal data hook: loads on mount and whenever `deps` change, reloads when
 * the screen regains focus or when any mutation calls invalidate().
 * Pull-to-refresh via `refresh`. `loading` is true until the current deps
 * have loaded once; later reloads keep showing the previous data.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const key = JSON.stringify(deps);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  const requestId = useRef(0);

  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = key;
  });

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    const forKey = keyRef.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) {
        setLoadedKey(forKey);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Fetching when the inputs change is what this hook is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [key, load]);

  useEffect(() => onInvalidate(() => load('silent')), [load]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load('silent');
    }, [load]),
  );

  const refresh = useCallback(() => load('refresh'), [load]);
  return { data, error, loading: loadedKey !== key, refreshing, refresh };
}
