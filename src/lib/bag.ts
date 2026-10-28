// Shopping bags, one per society (each society is paid separately, so a bag
// becomes one order with one reference). Kept on the phone until checkout, so
// browsing needs no account; prices and stock are re-checked at checkout.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { BagLine } from './types';

const STORAGE_KEY = 'shop.bags';
const MAX_LINES = 30;

type Bags = Record<string, BagLine[]>;

let bags: Bags = {};
const listeners = new Set<() => void>();

function commit(next: Bags) {
  bags = next;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bags)).catch(() => undefined);
  listeners.forEach((l) => l());
}

/** Loads saved bags at start-up. */
export async function loadBags() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      bags = JSON.parse(raw) as Bags;
      listeners.forEach((l) => l());
    }
  } catch {
    // A bag is a convenience; start empty if it can't be read.
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: BagLine[] = [];

export function useBag(societyId: string | undefined): BagLine[] {
  return useSyncExternalStore(subscribe, () => (societyId ? (bags[societyId] ?? EMPTY) : EMPTY));
}

export function bagCount(lines: BagLine[]) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Adds units, merging with a line for the same product and size. */
export function addToBag(societyId: string, line: BagLine) {
  const cur = bags[societyId] ?? [];
  const i = cur.findIndex((l) => l.product_id === line.product_id && l.variant === line.variant);
  if (i < 0 && cur.length >= MAX_LINES) return;
  const next = i >= 0 ? cur.map((l, j) => (j === i ? { ...l, qty: l.qty + line.qty } : l)) : [...cur, line];
  commit({ ...bags, [societyId]: next });
}

/** Sets a line's quantity; 0 removes it. */
export function setBagQty(societyId: string, productId: string, variant: string, qty: number) {
  const cur = bags[societyId] ?? [];
  const next = cur.map((l) => (l.product_id === productId && l.variant === variant ? { ...l, qty } : l)).filter((l) => l.qty > 0);
  commit({ ...bags, [societyId]: next });
}

export function clearBag(societyId: string) {
  const { [societyId]: _gone, ...rest } = bags;
  commit(rest);
}
