// "Most anticipated" (this week / month) on Discover. Ranked in the app from numbers
// every student can already see, so Supabase and the demo agree:
//
//   - Major events (featured by Student Affairs / app admins) always lead.
//   - Then buzz: one point per sign-up or waitlist place, one per save.
//   - Ties go to whichever is sooner.
//
// Events with no buzz and no feature don't make the list: a quiet week shows
// a short list rather than padding it with random events.
import type { CampusEvent } from './types';

const DAY = 86400_000;

export type TopRange = 'week' | 'month';

export const TOP_RANGE_DAYS: Record<TopRange, number> = { week: 7, month: 30 };

type Rankable = Pick<CampusEvent, 'status' | 'starts_at' | 'ends_at' | 'confirmed_count' | 'waitlist_count' | 'save_count' | 'featured_at'>;

export function buzz(e: Rankable) {
  return e.confirmed_count + e.waitlist_count + e.save_count;
}

/** Most popular first. Also used by Search's "Most popular" sort. */
export function byBuzz(a: Rankable, b: Rankable) {
  return Number(!!b.featured_at) - Number(!!a.featured_at) || buzz(b) - buzz(a) || a.starts_at.localeCompare(b.starts_at);
}

/** The top events still to come (or on now) in the next week or month. */
export function topEvents<T extends Rankable>(events: T[], range: TopRange, now = Date.now(), limit = 5): T[] {
  const from = new Date(now).toISOString();
  const to = new Date(now + TOP_RANGE_DAYS[range] * DAY).toISOString();
  return events
    .filter((e) => e.status !== 'cancelled' && e.ends_at >= from && e.starts_at < to)
    .filter((e) => e.featured_at || buzz(e) > 0)
    .sort(byBuzz)
    .slice(0, limit);
}
