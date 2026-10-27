import { describe, expect, it } from '@jest/globals';

import { crc16, formatHkd, fpsPayload, parseFpsProxy } from '../fps';

describe('FPS QR', () => {
  it('uses CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reads mobile numbers, emails and FPS IDs', () => {
    expect(parseFpsProxy('9123 4567')).toEqual({ kind: 'mobile', value: '+852-91234567' });
    expect(parseFpsProxy('+852 6123-4567')).toEqual({ kind: 'mobile', value: '+852-61234567' });
    expect(parseFpsProxy('treasurer@example.com')).toEqual({ kind: 'email', value: 'treasurer@example.com' });
    expect(parseFpsProxy('1234567')).toEqual({ kind: 'fpsId', value: '1234567' });
    expect(parseFpsProxy('hello')).toBeNull();
    expect(parseFpsProxy('2123 4567')).toEqual({ kind: 'fpsId', value: '21234567' });
  });

  it('builds a payload with amount, reference and checksum', () => {
    const p = fpsPayload({ proxy: '91234567', amount: 120, reference: 'CSM-4821' })!;
    expect(p.startsWith('000201010212')).toBe(true);
    expect(p).toContain('26' + '33' + '0012hk.com.hkicl' + '0313+852-91234567');
    expect(p).toContain('5303344');
    expect(p).toContain('5403120');
    expect(p).toContain('62120508CSM-4821');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it('formats decimal amounts', () => {
    expect(fpsPayload({ proxy: 'a@b.co', amount: 49.5 })).toContain('540449.5');
    expect(formatHkd(49.5)).toBe('HK$49.50');
    expect(formatHkd(120)).toBe('HK$120');
  });

  it('refuses bad input', () => {
    expect(fpsPayload({ proxy: 'nope', amount: 10 })).toBeNull();
    expect(fpsPayload({ proxy: '91234567', amount: 0 })).toBeNull();
  });
});

describe('cross-check with hkqr-fps (independent HKICL implementation)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FPS } = require('hkqr-fps');
  it.each([
    ['91234567', '26', '03', '+852-91234567'],
    ['1234567', '26', '02', '1234567'],
    ['treasurer@cucs.org.hk', '26', '04', 'treasurer@cucs.org.hk'],
  ])('reads back what we generate for %s', (proxy, tag, sub, value) => {
    const payload = fpsPayload({ proxy, amount: 88.5, reference: 'SSM-1234' })!;
    const fps = new FPS();
    fps.parse(payload);
    const data = fps.extract().data;
    expect(data[tag][sub]).toBe(value);
    expect(Number(data['54'])).toBe(88.5);
    expect(data['62']['05']).toBe('SSM-1234');
    expect(data['63']).toBe(payload.slice(-4));
  });
});
