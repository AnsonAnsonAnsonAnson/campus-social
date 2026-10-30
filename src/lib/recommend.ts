import type { Society } from './types';

export type Suggestion = {
  society: Society;
  /** Why it's suggested: one of your interests, your college, or just popular on campus. */
  reason: 'interest' | 'college' | 'popular';
};

/**
 * Societies to suggest following, best first. Matches on your interests rank
 * above your college, which ranks above the rest; follower count breaks ties.
 * Pads with popular societies so there are always `min` suggestions (when that
 * many exist), and stops at `max`.
 */
export function recommendSocieties(
  societies: Society[],
  { interests, college, exclude }: { interests: Iterable<string>; college?: string | null; exclude?: Set<string> },
  { min = 5, max = 8 }: { min?: number; max?: number } = {},
): Suggestion[] {
  const liked = new Set(interests);
  const ranked = societies
    .filter((s) => !exclude?.has(s.id))
    .map((s): Suggestion => ({
      society: s,
      reason: liked.has(s.category) ? 'interest' : college && s.college === college ? 'college' : 'popular',
    }))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        // Inside your interests, a society that also matches your college comes first.
        Number(!!college && b.society.college === college) - Number(!!college && a.society.college === college) ||
        b.society.follower_count - a.society.follower_count ||
        a.society.name.localeCompare(b.society.name),
    );
  const matched = ranked.filter((s) => s.reason !== 'popular').length;
  return ranked.slice(0, Math.min(max, Math.max(min, matched)));
}

const rank = (s: Suggestion) => ({ interest: 0, college: 1, popular: 2 })[s.reason];
