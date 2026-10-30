// Rotating QR tickets.
//
// The QR on a ticket is not the ticket code itself but a short-lived token:
//   <registration id>.<time step>.<signature>
// The signature is HMAC-SHA256 of "<id>.<step>" keyed with the ticket's secret
// code, so only the ticket holder's phone can make one, and it works offline
// (the code is saved with the ticket). A new token is made every 30 seconds
// and the server only accepts recent ones, so a screenshot passed around the
// group chat stops working within a minute or two. The SQL side is
// public.check_in (supabase/migrations/20261030030000_v07_rotating_tickets.sql).

/** Seconds each QR token is shown for. */
export const TICKET_STEP_SECONDS = 30;
/** Steps either side of now the scanner still accepts, for phone clocks that are a little off. */
export const TICKET_STEPS_BEFORE = 2;
export const TICKET_STEPS_AFTER = 1;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(s: string) {
  return new TextEncoder().encode(s);
}

/** SHA-256 (FIPS 180-4). Small and synchronous, so it runs the same on iOS, Android and web. */
export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((x, i) => outView.setUint32(i * 4, x));
  return out;
}

/** HMAC-SHA256 (RFC 2104) of two UTF-8 strings, as lowercase hex. */
export function hmacSha256Hex(key: string, message: string) {
  let k: Uint8Array = utf8(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64 + utf8(message).length);
  const opad = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    ipad[i] = (k[i] ?? 0) ^ 0x36;
    opad[i] = (k[i] ?? 0) ^ 0x5c;
  }
  ipad.set(utf8(message), 64);
  opad.set(sha256(ipad), 64);
  return Array.from(sha256(opad), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function ticketStep(now = Date.now()) {
  return Math.floor(now / 1000 / TICKET_STEP_SECONDS);
}

/** Seconds until the token on screen is replaced. */
export function secondsLeftInStep(now = Date.now()) {
  return TICKET_STEP_SECONDS - (Math.floor(now / 1000) % TICKET_STEP_SECONDS);
}

/** Registration ids go into the token without dashes (uuid → 32 hex). */
function compactId(id: string) {
  return id.replace(/-/g, '').toLowerCase();
}

function signature(id: string, step: number, code: string) {
  // 96 bits is plenty for a token that's only valid for a minute or two.
  return hmacSha256Hex(code, `${id}.${step}`).slice(0, 24);
}

/** The token to put in the QR right now (without the "campussocial:ticket:" prefix). */
export function ticketToken(registrationId: string, ticketCode: string, now = Date.now()) {
  const id = compactId(registrationId);
  const step = ticketStep(now);
  return `${id}.${step}.${signature(id, step, ticketCode)}`;
}

export type ParsedToken = { id: string; step: number; sig: string };

/** Splits a scanned token, or returns null if it isn't one (e.g. a typed 8-character code). */
export function parseTicketToken(raw: string): ParsedToken | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^([0-9a-z-]{8,64})\.(\d{1,12})\.([0-9a-f]{24})$/);
  return m ? { id: m[1], step: Number(m[2]), sig: m[3] } : null;
}

export type TokenCheck = 'ok' | 'bad' | 'expired';

/** Same rule as the SQL: right signature, and made within the last minute or so. */
export function checkTicketToken(token: ParsedToken, ticketCode: string, now = Date.now()): TokenCheck {
  if (signature(token.id, token.step, ticketCode) !== token.sig) return 'bad';
  const step = ticketStep(now);
  if (token.step < step - TICKET_STEPS_BEFORE || token.step > step + TICKET_STEPS_AFTER) return 'expired';
  return 'ok';
}

/** Matches a registration id against the id in a token. */
export function tokenIdMatches(token: ParsedToken, registrationId: string) {
  return compactId(registrationId) === token.id;
}

/** "a1b2c3d4" → "A1B2 C3D4": the backup code door staff can type. */
export function backupCode(ticketCode: string) {
  const s = ticketCode.slice(0, 8).toUpperCase();
  return `${s.slice(0, 4)} ${s.slice(4)}`;
}
