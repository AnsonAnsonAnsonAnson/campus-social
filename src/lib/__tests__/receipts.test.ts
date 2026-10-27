import { describe, expect, it } from '@jest/globals';

import { fitWithin } from '../receipts';

describe('fitWithin', () => {
  it('shrinks the long side and keeps small images as they are', () => {
    expect(fitWithin(1170, 2532, 1000)).toEqual({ height: 1000 });
    expect(fitWithin(4032, 3024, 1000)).toEqual({ width: 1000 });
    expect(fitWithin(800, 600, 1000)).toBeNull();
  });
});
