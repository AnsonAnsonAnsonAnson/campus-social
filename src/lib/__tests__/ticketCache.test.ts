import { describe, expect, it } from '@jest/globals';

import { clearSavedTickets, loadSavedTickets, ticketsWithFallback, walletWithFallback } from '../ticketCache';
import type { MyMembership, Ticket } from '../types';

const ticket = { id: 'r1', ticket_code: 'ABCD2345' } as Ticket;
const offline = () => Promise.reject(new Error('Network request failed'));

describe('ticketsWithFallback', () => {
  it('saves fresh tickets and shows them when offline later', async () => {
    const fresh = await ticketsWithFallback('u1', async () => [ticket]);
    expect(fresh.offline).toBe(false);

    const later = await ticketsWithFallback('u1', offline);
    expect(later.offline).toBe(true);
    expect(later.tickets).toEqual([ticket]);
    expect(later.savedAt).toBeTruthy();
  });

  it("never shows someone else's saved tickets", async () => {
    await ticketsWithFallback('u1', async () => [ticket]);
    expect(await loadSavedTickets('u2')).toBeNull();
    await expect(ticketsWithFallback('u2', offline)).rejects.toThrow('Network request failed');
  });

  it('forgets tickets on sign-out', async () => {
    await ticketsWithFallback('u1', async () => [ticket]);
    await clearSavedTickets();
    await expect(ticketsWithFallback('u1', offline)).rejects.toThrow();
  });
});

describe('walletWithFallback', () => {
  const wallet = { memberships: [{ id: 'm1', card_code: 'abc' } as MyMembership], orders: [] };

  it('keeps member cards working offline', async () => {
    await walletWithFallback('u1', async () => wallet);
    const later = await walletWithFallback('u1', offline);
    expect(later.offline).toBe(true);
    expect(later.memberships).toEqual(wallet.memberships);
  });

  it('forgets member cards on sign-out', async () => {
    await walletWithFallback('u1', async () => wallet);
    await clearSavedTickets();
    await expect(walletWithFallback('u1', offline)).rejects.toThrow();
  });
});
