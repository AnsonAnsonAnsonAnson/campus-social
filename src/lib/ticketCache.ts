import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Ticket } from './types';

// The last ticket list is kept on the device so QR codes still show with no
// signal (basement lecture theatres, Wi-Fi drops at the door).
const KEY = 'tickets.saved';

type Saved = { userId: string; savedAt: string; tickets: Ticket[] };

export async function saveTickets(userId: string, tickets: Ticket[]) {
  const saved: Saved = { userId, savedAt: new Date().toISOString(), tickets };
  await AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => undefined);
}

/** Tickets saved for this person, or null if there are none. */
export async function loadSavedTickets(userId: string): Promise<Saved | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    return saved?.userId === userId ? saved : null;
  } catch {
    return null;
  }
}

export async function clearSavedTickets() {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

/**
 * Loads tickets from the server and saves them. If the server can't be
 * reached, falls back to the saved copy (`offline` is then true).
 */
export async function ticketsWithFallback(userId: string, fetch: () => Promise<Ticket[]>) {
  try {
    const tickets = await fetch();
    await saveTickets(userId, tickets);
    return { tickets, offline: false, savedAt: null as string | null };
  } catch (e) {
    const saved = await loadSavedTickets(userId);
    if (!saved) throw e;
    return { tickets: saved.tickets, offline: true, savedAt: saved.savedAt };
  }
}
