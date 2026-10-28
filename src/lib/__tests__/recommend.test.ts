import { expect, it } from '@jest/globals';

import { recommendSocieties } from '../recommend';
import type { Society } from '../types';

const society = (id: string, category: string, follower_count: number, college: string | null = null): Society => ({
  id,
  name: id,
  short_name: null,
  description: '',
  category,
  college,
  logo_url: null,
  cover_url: null,
  instagram: null,
  website: null,
  contact_email: null,
  status: 'approved',
  verified: false,
  follower_count,
});

const all = [
  society('choir', 'Music', 50),
  society('band', 'Music', 900),
  society('hiking', 'Sports', 300),
  society('coding', 'Tech', 1200),
  society('chung-chi', 'College', 400, 'Chung Chi'),
  society('debate', 'Academic', 100),
  society('volunteers', 'Service', 80),
  society('art', 'Arts', 20),
  society('drama', 'Arts', 10),
];

const ids = (s: { society: Society }[]) => s.map((x) => x.society.id);

it('puts your interests first, then your college, then popular societies', () => {
  const s = recommendSocieties(all, { interests: ['Music', 'Sports'], college: 'Chung Chi' });
  expect(ids(s)).toEqual(['band', 'hiking', 'choir', 'chung-chi', 'coding']);
  expect(s.map((x) => x.reason)).toEqual(['interest', 'interest', 'interest', 'college', 'popular']);
});

it('always suggests at least five, padding with popular societies', () => {
  expect(ids(recommendSocieties(all, { interests: [] }))).toEqual(['coding', 'band', 'chung-chi', 'hiking', 'debate']);
  expect(recommendSocieties(all.slice(0, 3), { interests: [] })).toHaveLength(3);
});

it('shows every match up to the maximum', () => {
  const s = recommendSocieties(all, { interests: ['Music', 'Sports', 'Tech', 'Academic', 'Service', 'Arts'] });
  expect(s).toHaveLength(8);
  expect(s.every((x) => x.reason === 'interest')).toBe(true);
});

it('skips societies you already follow', () => {
  expect(ids(recommendSocieties(all, { interests: ['Music'], exclude: new Set(['band']) }))).not.toContain('band');
});
