import { beforeAll, describe, expect, it } from '@jest/globals';

import { addDays, availability, compactNumber, formatAgo, formatTime, hkDate, hkDayBounds } from '../format';
import { setLang } from '../i18n';

// These check the English wording; i18n.test.ts covers Chinese.
beforeAll(() => setLang('en'));

const base = {
  status: 'published',
  registration_required: true,
  capacity: 100 as number | null,
  confirmed_count: 0,
  waitlist_enabled: true,
  registration_opens_at: null as string | null,
  registration_closes_at: null as string | null,
  starts_at: new Date(Date.now() + 86400_000).toISOString(),
};

describe('Hong Kong time helpers', () => {
  it('uses Hong Kong dates whatever the device timezone', () => {
    // 20:30 UTC is already the next morning in Hong Kong.
    expect(hkDate('2026-10-22T20:30:00Z')).toBe('2026-10-23');
    expect(formatTime('2026-10-22T20:30:00Z')).toBe('4:30am');
  });

  it('gives day bounds in HK time', () => {
    expect(hkDayBounds('2026-10-23')).toEqual({ from: '2026-10-22T16:00:00.000Z', to: '2026-10-23T15:59:59.000Z' });
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats relative times for the inbox', () => {
    const now = Date.parse('2026-10-23T12:00:00+08:00');
    expect(formatAgo(new Date(now - 20_000).toISOString(), now)).toBe('Just now');
    expect(formatAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m');
    expect(formatAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3h');
    expect(formatAgo('2026-10-22T09:00:00+08:00', now)).toBe('Yesterday');
    expect(formatAgo('2026-10-01T09:00:00+08:00', now)).toMatch(/1 Oct/);
  });

  it('shortens big numbers', () => {
    expect(compactNumber(999)).toBe('999');
    expect(compactNumber(1200)).toBe('1.2k');
    expect(compactNumber(25000)).toBe('25k');
  });
});

describe('availability', () => {
  it('reports open, few, waitlist and full', () => {
    expect(availability(base)).toEqual({ kind: 'open', label: '100 spots left' });
    expect(availability({ ...base, confirmed_count: 97 }).kind).toBe('few');
    expect(availability({ ...base, confirmed_count: 99 }).label).toBe('1 spot left');
    expect(availability({ ...base, confirmed_count: 100 }).kind).toBe('waitlist');
    expect(availability({ ...base, confirmed_count: 100, waitlist_enabled: false }).kind).toBe('full');
    expect(availability({ ...base, capacity: null }).label).toBe('Open');
  });

  it('respects the sign-up window and status', () => {
    const later = new Date(Date.now() + 3600_000).toISOString();
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    expect(availability({ ...base, registration_opens_at: later }).kind).toBe('not-open');
    expect(availability({ ...base, registration_closes_at: earlier }).kind).toBe('closed');
    expect(availability({ ...base, starts_at: earlier }).kind).toBe('closed');
    expect(availability({ ...base, status: 'cancelled' }).kind).toBe('cancelled');
    expect(availability({ ...base, registration_required: false }).kind).toBe('drop-in');
  });
});
