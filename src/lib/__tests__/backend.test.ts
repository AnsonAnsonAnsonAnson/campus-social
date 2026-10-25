import { describe, expect, it } from '@jest/globals';

import { isCuhkEmail } from '../backend';

describe('isCuhkEmail', () => {
  it.each(['1155123456@link.cuhk.edu.hk', 'staff@cuhk.edu.hk', 'someone@ie.cuhk.edu.hk', '  Mixed@LINK.CUHK.EDU.HK '])('accepts %s', (e) =>
    expect(isCuhkEmail(e)).toBe(true),
  );
  it.each(['me@gmail.com', 'cuhk.edu.hk@gmail.com', 'me@notcuhk.edu.hk', 'me@cuhk.edu.hk.evil.com'])('rejects %s', (e) =>
    expect(isCuhkEmail(e)).toBe(false),
  );
});
