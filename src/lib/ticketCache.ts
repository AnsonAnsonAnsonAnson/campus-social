import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MyMembership, MyOrder, Ticket } from './types';

// The last ticket list, member cards and orders are kept on the device so QR
// codes still show with no signal (basement lecture theatres, Wi-Fi drops at
// the door, the pickup booth).
const KEY = 'tickets.saved';
const WALLET_KEY = 'wallet.saved';

type Saved<T> = { userId: string; savedAt: string } & T;
type TicketList = { tickets: Ticket[] };
export type Wallet = { memberships: MyMembership[]; orders: MyOrder[] };

async function save<T extends object>(key: string, userId: string, data: T) {
  const saved: Saved<T> = { userId, savedAt: new Date().toISOString(), ...data };
  await AsyncStorage.setItem(key, JSON.stringify(saved)).catch(() => undefined);
}

async function load<T extends object>(key: string, userId: string): Promise<Saved<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as Saved<T>) : null;
    return saved?.userId === userId ? saved : null;
  } catch {
    return null;
  }
}

/** Loads from the server and saves a copy; if the server can't be reached, returns the copy with `offline` true. */
async function withFallback<T extends object>(key: string, userId: string, fetch: () => Promise<T>) {
  try {
    const data = await fetch();
    await save(key, userId, data);
    return { ...data, offline: false, savedAt: null as string | null };
  } catch (e) {
    const saved = await load<T>(key, userId);
    if (!saved) throw e;
    const { userId: _u, savedAt, ...data } = saved;
    return { ...(data as unknown as T), offline: true, savedAt };
  }
}

export async function saveTickets(userId: string, tickets: Ticket[]) {
  await save<TicketList>(KEY, userId, { tickets });
}

/** Tickets saved for this person, or null if there are none. */
export async function loadSavedTickets(userId: string) {
  return load<TicketList>(KEY, userId);
}

export async function clearSavedTickets() {
  await AsyncStorage.multiRemove([KEY, WALLET_KEY]).catch(() => undefined);
}

/**
 * Loads tickets from the server and saves them. If the server can't be
 * reached, falls back to the saved copy (`offline` is then true).
 */
export async function ticketsWithFallback(userId: string, fetch: () => Promise<Ticket[]>) {
  return withFallback<TicketList>(KEY, userId, async () => ({ tickets: await fetch() }));
}

/** Member cards and shop orders, with the same offline fallback as tickets. */
export async function walletWithFallback(userId: string, fetch: () => Promise<Wallet>) {
  return withFallback<Wallet>(WALLET_KEY, userId, fetch);
}
