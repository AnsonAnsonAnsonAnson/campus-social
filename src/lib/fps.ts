// FPS (Hong Kong Faster Payment System) QR codes, written from the public
// EMVCo merchant-presented QR format that HKICL uses. Bank apps that scan one
// fill in the payee, amount and reference, so buyers don't type them.
//
// Not every bank app reads the reference field; the payment screen always
// shows the reference too, so buyers can type it.

/** One EMVCo field: 2-digit id, 2-digit length, value. */
function field(id: string, value: string) {
  return id + String(value.length).padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo requires. */
export function crc16(data: string) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type FpsProxy = { kind: 'mobile' | 'email' | 'fpsId'; value: string };

/**
 * Reads what a treasurer typed as their FPS proxy: a Hong Kong mobile number
 * (8 digits, optionally +852), an email, or a 7 to 9 digit FPS ID.
 */
export function parseFpsProxy(input: string): FpsProxy | null {
  const raw = input.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { kind: 'email', value: raw };
  const digits = raw.replace(/[\s()-]/g, '');
  const mobile = digits.match(/^(?:\+?852)?([4-9]\d{7})$/);
  if (mobile) return { kind: 'mobile', value: `+852-${mobile[1]}` };
  if (/^\d{7,9}$/.test(digits)) return { kind: 'fpsId', value: digits };
  return null;
}

/** Up to 2 decimal places, no trailing zeros: 120 → "120", 49.5 → "49.5". */
function amountText(amount: number) {
  return String(Math.round(amount * 100) / 100);
}

/**
 * The text to put in an FPS QR code. Returns null if the proxy can't be read.
 * `reference` is shown in the payer's bank app and on the payee's statement.
 */
export function fpsPayload({ proxy, amount, reference }: { proxy: string; amount: number; reference?: string }) {
  const p = parseFpsProxy(proxy);
  if (!p || !(amount > 0)) return null;
  const sub = { fpsId: '02', mobile: '03', email: '04' }[p.kind];
  const account = field('00', 'hk.com.hkicl') + field(sub, p.value);
  const body =
    field('00', '01') + // payload format
    field('01', '12') + // dynamic: one payment with a set amount
    field('26', account) +
    field('52', '0000') + // merchant category: not used
    field('53', '344') + // HKD
    field('54', amountText(amount)) +
    field('58', 'HK') +
    field('59', 'NA') +
    field('60', 'HK') +
    (reference ? field('62', field('05', reference.slice(0, 25))) : '') +
    '6304';
  return body + crc16(body);
}

/** "HK$120" / "HK$49.50" */
export function formatHkd(amount: number) {
  return `HK$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
