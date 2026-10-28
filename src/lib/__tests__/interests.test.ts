import { expect, it } from '@jest/globals';

import { SOCIETY_CATEGORIES } from '../constants';
import { categoriesFor, revealRelated, startingTopics, TOPICS } from '../interests';

it('maps every topic to a society category', () => {
  for (const topic of TOPICS) expect(SOCIETY_CATEGORIES).toContain(topic.category);
});

it('starts with a couple of topics from each category', () => {
  const start = startingTopics();
  expect(start.slice(0, 3)).toEqual(['Hiking and camping', 'Band', 'Photography']);
  expect(start).toContain('Basketball');
  expect(start).not.toContain('Swimming');
});

it('reveals related topics right after the one you pick', () => {
  const shown = revealRelated(['Hiking and camping', 'Band', 'Basketball'], 'Band');
  expect(shown).toEqual(['Hiking and camping', 'Band', 'Choir', 'A cappella', 'Orchestra', 'Basketball']);
  expect(revealRelated(shown, 'Band')).toEqual(shown);
});

it('saves the categories behind the picks', () => {
  expect(categoriesFor(['Choir', 'Hiking and camping', 'Band'])).toEqual(['Sports', 'Music']);
});
