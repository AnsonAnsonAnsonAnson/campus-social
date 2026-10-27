import { describe, expect, it } from '@jest/globals';

import { coverFor, coverVariant, familyFor, initialsFor, textStyle, type } from '../theme';

describe('initialsFor', () => {
  it.each([
    ['CUHK Debate Society', 'DS'],
    ['CU Hiking Club', 'HC'],
    ['Chung Chi College Lion Dance Team', 'CC'],
    ['中大合唱團', '合'],
    ['中大合唱團 CU Chorus', '合'],
    ['tech', 'T'],
  ])('%s → %s', (name, expected) => expect(initialsFor(name)).toBe(expected));
});

describe('covers', () => {
  it('uses the event category colour and icon', () => {
    expect(coverFor('Workshop', 'e1', false)).toEqual({ color: '#C94700', icon: 'construct-outline' });
    expect(coverFor('Career', 'e1', true).color).toBe('#3A3A3F');
  });

  it('maps society categories to their family cover', () => {
    expect(coverFor('Academic', 's1', false).color).toBe('#0072A3');
    expect(familyFor('Faith', 'x')).toBe('Slate');
  });

  it('is stable for unknown categories and seeds', () => {
    expect(coverFor(null, 'same-seed', false)).toEqual(coverFor(undefined, 'same-seed', false));
    expect(coverVariant('abc')).toBe(coverVariant('abc'));
  });
});

describe('textStyle', () => {
  it('applies Chinese overrides only for zh', () => {
    expect(textStyle('largeTitle', 'zh-Hant')).toMatchObject({ fontSize: 34, lineHeight: 46, fontWeight: '600' });
    expect(textStyle('largeTitle', 'en')).toBe(type.largeTitle);
  });
});
