// Opening the payment provider's pages (checkout, payout setup) from the app.
// The provider sends the browser to docs/return.html, which reopens the app
// with campussocial://..., and that closes the in-app browser.
import * as WebBrowser from 'expo-web-browser';

import { api } from './api';

/** Opens a provider page and resolves when the buyer or treasurer comes back. */
export async function openProviderPage(url: string) {
  await WebBrowser.openAuthSessionAsync(url, 'campussocial://');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pays an online order: opens the payment page, then waits a few seconds for the
 * provider's confirmation to reach the server. Returns true once the order is paid.
 */
export async function payOnline(orderId: string) {
  const url = await api.startOnlinePayment(orderId);
  if (url) await openProviderPage(url);
  for (let i = 0; i < 6; i++) {
    const o = (await api.myOrders()).find((x) => x.id === orderId);
    if (o && o.status !== 'awaiting_payment') return o.status === 'paid';
    if (!url) return false;
    await sleep(1500);
  }
  return false;
}
