import { describe, expect, it } from '@jest/globals';

import { topEvents } from '../ranking';

const DAY = 86400_000;
const now = Date.parse('2026-10-28T04:00:00Z');
const iso = (days: number) => new Date(now + days * DAY).toISOString();

function ev(id: string, days: number, o: { going?: number; saves?: number; featured?: boolean; cancelled?: boolean } = {}) {
  return {
    id,
    status: o.cancelled ? ('cancelled' as const) : ('published' as const),
    starts_at: iso(days),
    ends_at: iso(days + 0.1),
    confirmed_count: o.going ?? 0,
    waitlist_count: 0,
    save_count: o.saves ?? 0,
    featured_at: o.featured ? iso(-1) : null,
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('topEvents', () => {
  it('ranks by sign-ups plus saves, major events first', () => {
    const events = [ev('small', 1, { going: 5 }), ev('big', 2, { going: 50, saves: 10 }), ev('major', 3, { featured: true })];
    expect(ids(topEvents(events, 'week', now))).toEqual(['major', 'big', 'small']);
  });

  it('keeps to the week or month', () => {
    const events = [
      ev('soon', 2, { going: 1 }),
      ev('later', 20, { going: 99 }),
      ev('past', -2, { going: 99 }),
      ev('far', 40, { going: 99 }),
    ];
    expect(ids(topEvents(events, 'week', now))).toEqual(['soon']);
    expect(ids(topEvents(events, 'month', now))).toEqual(['later', 'soon']);
  });

  it('includes events on now, drops cancelled and quiet ones', () => {
    const events = [ev('now', -0.05, { saves: 1 }), ev('off', 1, { going: 80, cancelled: true }), ev('quiet', 1)];
    expect(ids(topEvents(events, 'week', now))).toEqual(['now']);
  });

  it('breaks ties by date and caps the list', () => {
    const events = [3, 1, 2, 5, 4, 6].map((d) => ev(`d${d}`, d, { saves: 2 }));
    expect(ids(topEvents(events, 'week', now))).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
  });
});
