import { createHash, createHmac } from 'crypto';

import { describe, expect, it } from '@jest/globals';

import {
  TICKET_STEP_SECONDS,
  backupCode,
  checkTicketToken,
  hmacSha256Hex,
  parseTicketToken,
  sha256,
  ticketToken,
  tokenIdMatches,
} from '../ticketToken';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('sha256 / hmac', () => {
  it('matches the standard test vectors', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // RFC 4231 test case 2.
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('agrees with node crypto across lengths, including keys longer than a block', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 200]) {
      const s = 'x'.repeat(n) + 'é';
      expect(hex(sha256(new TextEncoder().encode(s)))).toBe(createHash('sha256').update(s).digest('hex'));
      expect(hmacSha256Hex(s, `m${n}`)).toBe(createHmac('sha256', s).update(`m${n}`).digest('hex'));
    }
  });
});

describe('ticket tokens', () => {
  const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
  const code = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const now = Date.UTC(2026, 9, 30, 10, 0, 5);

  it('round-trips and is accepted while fresh', () => {
    const tk = parseTicketToken(ticketToken(id, code, now))!;
    expect(tk.id).toBe('6f1c2a3b4d5e4f608a7b9c0d1e2f3a4b');
    expect(tokenIdMatches(tk, id)).toBe(true);
    expect(checkTicketToken(tk, code, now)).toBe('ok');
    expect(checkTicketToken(tk, code, now + 60_000)).toBe('ok');
  });

  it('changes every step and stops working after a couple of minutes', () => {
    const step = TICKET_STEP_SECONDS * 1000;
    expect(ticketToken(id, code, now)).not.toBe(ticketToken(id, code, now + step));
    const tk = parseTicketToken(ticketToken(id, code, now))!;
    expect(checkTicketToken(tk, code, now + 3 * step)).toBe('expired');
    // A phone clock running ahead is fine up to one step.
    expect(checkTicketToken(parseTicketToken(ticketToken(id, code, now + step))!, code, now)).toBe('ok');
    expect(checkTicketToken(parseTicketToken(ticketToken(id, code, now + 2 * step))!, code, now)).toBe('expired');
  });

  it('rejects tokens signed with another code or edited by hand', () => {
    const tk = parseTicketToken(ticketToken(id, code, now))!;
    expect(checkTicketToken(tk, 'ffff' + code.slice(4), now)).toBe('bad');
    expect(checkTicketToken({ ...tk, step: tk.step + 1 }, code, now)).toBe('bad');
  });

  it('leaves typed codes alone', () => {
    expect(parseTicketToken('a1b2c3d4')).toBeNull();
    expect(parseTicketToken(code)).toBeNull();
  });

  it('formats the backup code', () => {
    expect(backupCode(code)).toBe('A1B2 C3D4');
  });
});
