import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, invalidate } from './api';
import { clearSavedTickets } from './ticketCache';
import type { AuthUser } from './backend';
import type { Profile } from './types';

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  profile: Profile | null;
  followIds: Set<string>;
  /** Societies hidden from Discover and the calendar. */
  hiddenIds: Set<string>;
  setHidden: (societyId: string, hidden: boolean) => Promise<void>;
  /** Events saved for later, newest first. */
  savedIds: string[];
  toggleSave: (eventId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  toggleFollow: (societyId: string) => Promise<void>;
  /** Returns true when signed in; otherwise opens the sign-in sheet. */
  requireSignIn: () => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const loadUserData = useCallback(async (u: AuthUser | null) => {
    setUser(u);
    if (!u) {
      clearSavedTickets();
      setProfile(null);
      setFollowIds(new Set());
      setHiddenIds(new Set());
      setSavedIds([]);
      return;
    }
    const [p, f, h, sv] = await Promise.all([api.getProfile(), api.myFollowIds(), api.myHiddenSocietyIds(), api.mySavedEventIds()]);
    setProfile(p);
    setFollowIds(new Set(f));
    setHiddenIds(new Set(h));
    setSavedIds(sv);
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .getUser()
      .then((u) => (alive ? loadUserData(u) : undefined))
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    const unsubscribe = api.onAuthChange((u) => {
      loadUserData(u).finally(invalidate);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loadUserData]);

  const refreshProfile = useCallback(async () => {
    setProfile(await api.getProfile());
  }, []);

  const requireSignIn = useCallback(() => {
    if (user) return true;
    router.push('/sign-in');
    return false;
  }, [user]);

  const toggleFollow = useCallback(
    async (societyId: string) => {
      if (!requireSignIn()) return;
      const follow = !followIds.has(societyId);
      // Optimistic update, rolled back on failure.
      setFollowIds((prev) => {
        const next = new Set(prev);
        if (follow) next.add(societyId);
        else next.delete(societyId);
        return next;
      });
      try {
        await api.setFollow(societyId, follow);
        invalidate();
      } catch (e) {
        setFollowIds((prev) => {
          const next = new Set(prev);
          if (follow) next.delete(societyId);
          else next.add(societyId);
          return next;
        });
        throw e;
      }
    },
    [followIds, requireSignIn],
  );

  const setHidden = useCallback(
    async (societyId: string, hidden: boolean) => {
      if (!requireSignIn()) return;
      await api.setSocietyHidden(societyId, hidden);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (hidden) next.add(societyId);
        else next.delete(societyId);
        return next;
      });
      // Hiding also unfollows (on the server too).
      if (hidden) {
        setFollowIds((prev) => {
          const next = new Set(prev);
          next.delete(societyId);
          return next;
        });
      }
      invalidate();
    },
    [requireSignIn],
  );

  const toggleSave = useCallback(
    async (eventId: string) => {
      if (!requireSignIn()) return;
      const save = !savedIds.includes(eventId);
      const before = savedIds;
      // Optimistic, like follow.
      setSavedIds(save ? [eventId, ...before] : before.filter((id) => id !== eventId));
      try {
        await api.setEventSaved(eventId, save);
      } catch (e) {
        setSavedIds(before);
        throw e;
      }
    },
    [savedIds, requireSignIn],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      profile,
      followIds,
      hiddenIds,
      setHidden,
      savedIds,
      toggleSave,
      refreshProfile,
      toggleFollow,
      requireSignIn,
    }),
    [ready, user, profile, followIds, hiddenIds, setHidden, savedIds, toggleSave, refreshProfile, toggleFollow, requireSignIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
