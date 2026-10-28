// Shared rules for member cards and shop orders: what state a membership or an
// order is in, what is left in stock, and the spreadsheet formats committees
// import and export. Kept here (not in screens) so they can be unit tested.
import { todayHK } from './format';
import { t } from './i18n';
import type {
  ImportRow,
  Membership,
  MembershipPlan,
  MyRegistration,
  BagLine,
  Order,
  OrderItem,
  OrderStatus,
  PickupSlot,
  Product,
  ProductWithStock,
  ReceiptKind,
  TicketOrder,
} from './types';

export const MEMBER_QR_PREFIX = 'campussocial:member:';
export const ORDER_QR_PREFIX = 'campussocial:order:';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'ink';

/** What a membership means right now. Expiry comes from the plan's dates, not a stored status. */
export function membershipState(
  m: Pick<Membership, 'status' | 'paid_at' | 'claimed_paid_at'>,
  plan: Pick<MembershipPlan, 'valid_until' | 'price_hkd'>,
) {
  if (m.status === 'active') {
    return plan.valid_until < todayHK()
      ? { key: 'expired' as const, label: t('Expired'), tone: 'neutral' as Tone }
      : { key: 'active' as const, label: t('Active'), tone: 'success' as Tone };
  }
  if (m.status === 'pending') {
    if (plan.price_hkd > 0 && !m.paid_at && !m.claimed_paid_at)
      return { key: 'unpaid' as const, label: t('Waiting for payment'), tone: 'warning' as Tone };
    if (plan.price_hkd > 0 && m.claimed_paid_at) return { key: 'claimed' as const, label: t('Payment to check'), tone: 'info' as Tone };
    return { key: 'pending' as const, label: t('Waiting for approval'), tone: 'warning' as Tone };
  }
  if (m.status === 'rejected') return { key: 'rejected' as const, label: t('Not approved'), tone: 'danger' as Tone };
  return { key: 'cancelled' as const, label: t('Cancelled'), tone: 'neutral' as Tone };
}

/** Payment reference for a membership fee, shown to the member and on the roster: "M-3F9A2C". */
export function membershipRef(m: Pick<Membership, 'card_code'>) {
  return `M-${m.card_code.slice(0, 6).toUpperCase()}`;
}

/** An unpaid FPS / PayMe order whose payment window has passed no longer holds stock. */
export function isExpired(o: Pick<Order, 'status' | 'expires_at'>, now = new Date().toISOString()) {
  return o.status === 'awaiting_payment' && !!o.expires_at && o.expires_at < now;
}

export function orderStatus(o: Pick<Order, 'status' | 'expires_at'>): { label: string; tone: Tone } {
  if (isExpired(o)) return { label: t('Expired'), tone: 'neutral' };
  const map: Record<OrderStatus, { label: string; tone: Tone }> = {
    awaiting_payment: { label: t('Waiting for payment'), tone: 'warning' },
    payment_claimed: { label: t('Payment to check'), tone: 'info' },
    paid: { label: t('Paid'), tone: 'brand' },
    ready: { label: t('Ready for pickup'), tone: 'success' },
    collected: { label: t('Collected'), tone: 'ink' },
    cancelled: { label: t('Cancelled'), tone: 'danger' },
    refunded: { label: t('Refunded'), tone: 'neutral' },
  };
  return map[o.status];
}

/** Where a payment screenshot lives in the private receipts bucket: one file per record, replaced on re-upload. */
export function receiptPath(kind: ReceiptKind, societyId: string, id: string) {
  return `${societyId}/${kind}/${id}.jpg`;
}

/** The order that decides whether a paid ticket works: the newest one not cancelled or refunded. */
export function liveTicketOrder(orders: TicketOrder[] | null | undefined): TicketOrder | null {
  return (
    [...(orders ?? [])]
      .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/**
 * What a sign-up needs before the QR works at the door. Free events (and tickets
 * free for members) have no order. Unpaid FPS / PayMe tickets past their window
 * lose the place the next time anyone signs up.
 */
export function ticketPayment(reg: Pick<MyRegistration, 'status' | 'order'>, now = new Date().toISOString()) {
  const o = reg.order;
  if (reg.status !== 'confirmed' || !o) return { key: 'none' as const };
  if (o.status === 'paid' || o.status === 'ready' || o.status === 'collected') return { key: 'paid' as const, order: o };
  if (o.status === 'payment_claimed') return { key: 'claimed' as const, order: o };
  if (isExpired(o, now)) return { key: 'expired' as const, order: o };
  return { key: 'unpaid' as const, order: o };
}

// ---------------------------------------------------------------------------
// Bank statement matching. Treasurers paste the transaction list from their
// bank or PayMe business export; any line that mentions an outstanding
// reference is proposed as paid. Banks often drop the hyphen or change the
// case, so "ssm1234" still matches SSM-1234.
// ---------------------------------------------------------------------------

export type PaymentToMatch = { kind: ReceiptKind; id: string; ref: string; amount: number; name: string };
export type StatementMatch = PaymentToMatch & { line: string; amountMatches: boolean };

const refKey = (ref: string) => ref.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Amounts on a statement line: "1,234.50", "HK$180", "180.00". */
export function amountsIn(line: string) {
  return (line.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

export function matchStatement(text: string, outstanding: PaymentToMatch[]): StatementMatch[] {
  const byKey = new Map(outstanding.map((p) => [refKey(p.ref), p]));
  const found = new Map<string, StatementMatch>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const m of line.matchAll(/\b([A-Za-z]{1,3})[-\s]?([0-9A-Fa-f]{4,6})\b/g)) {
      const p = byKey.get(refKey(m[1] + m[2]));
      if (!p) continue;
      const amountMatches = amountsIn(line.replace(m[0], ' ')).some((a) => Math.abs(a - p.amount) < 0.005);
      const prev = found.get(p.id);
      // Keep the line whose amount agrees, if the reference appears more than once.
      if (!prev || (!prev.amountMatches && amountMatches)) found.set(p.id, { ...p, line, amountMatches });
    }
  }
  return [...found.values()];
}

/** Units left of each variant; null means no limit. */
export function stockLeft(p: Pick<ProductWithStock, 'variants' | 'sold'>) {
  return Object.fromEntries(p.variants.map((v) => [v.name, v.stock == null ? null : Math.max(0, v.stock - (p.sold[v.name] ?? 0))]));
}

export function isSoldOut(p: Pick<ProductWithStock, 'variants' | 'sold'>) {
  return Object.values(stockLeft(p)).every((n) => n === 0);
}

/** Units in live orders, for the pre-order goal. */
export function unitsOrdered(p: Pick<ProductWithStock, 'sold'>) {
  return Object.values(p.sold).reduce((a, b) => a + b, 0);
}

/** What one unit of a size costs this buyer: the (member) price plus any charge for the size. */
export function unitPrice(p: Pick<Product, 'price_hkd' | 'member_price_hkd' | 'variants'>, variant: string, member: boolean) {
  const base = member && p.member_price_hkd != null ? p.member_price_hkd : p.price_hkd;
  return base + (p.variants.find((v) => v.name === variant)?.extra_hkd ?? 0);
}

/** Lowest and highest price across sizes, for "HK$200–220". */
export function priceRange(p: Pick<Product, 'price_hkd' | 'member_price_hkd' | 'variants'>, member: boolean) {
  const prices = p.variants.map((v) => unitPrice(p, v.name, member));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export type SaleState = 'draft' | 'upcoming' | 'open' | 'sold_out' | 'closed';

export function saleState(
  p: Pick<ProductWithStock, 'status' | 'opens_at' | 'closes_at' | 'variants' | 'sold'>,
  now = new Date().toISOString(),
): SaleState {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'closed' || (p.closes_at && now > p.closes_at)) return 'closed';
  if (p.opens_at && now < p.opens_at) return 'upcoming';
  return isSoldOut(p) ? 'sold_out' : 'open';
}

export type BagRow = {
  line: BagLine;
  product: ProductWithStock | null;
  unit: number;
  /** Why this line can't be ordered as it is, or null. */
  problem: string | null;
  /** Most of this line that can be ordered right now. */
  max: number;
};

/**
 * Checks a bag against the latest products: prices (with member and size
 * charges), stock, and limits, in the same order the server checks them, so the
 * buyer sees problems before paying rather than an error after.
 */
export function checkBag(lines: BagLine[], products: ProductWithStock[], member: boolean) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const takenBySize = new Map<string, number>();
  const perProduct = new Map<string, number>();
  const rows: BagRow[] = lines.map((line) => {
    const p = byId.get(line.product_id) ?? null;
    if (!p) return { line, product: null, unit: 0, problem: t('No longer on sale'), max: 0 };
    const unit = unitPrice(p, line.variant, member);
    const state = saleState(p);
    if (state === 'closed' || state === 'draft') return { line, product: p, unit, problem: t('Orders have closed'), max: 0 };
    if (state === 'upcoming') return { line, product: p, unit, problem: t('Orders have not opened yet'), max: 0 };
    const variant = p.variants.find((v) => v.name === line.variant);
    if (!variant) return { line, product: p, unit, problem: t('This size is no longer available'), max: 0 };
    const key = `${p.id}|${line.variant}`;
    const taken = takenBySize.get(key) ?? 0;
    const left = variant.stock == null ? Infinity : Math.max(0, variant.stock - (p.sold[line.variant] ?? 0) - taken);
    const used = perProduct.get(p.id) ?? 0;
    const max = Math.max(0, Math.min(left, p.max_per_order - used, (p.max_per_buyer ?? Infinity) - used));
    takenBySize.set(key, taken + line.qty);
    perProduct.set(p.id, used + line.qty);
    const problem =
      left === 0
        ? t('Sold out')
        : line.qty > left
          ? t('Only {n} left', { n: left })
          : line.qty > max
            ? t('Up to {n} per order.', { n: Math.min(p.max_per_order, p.max_per_buyer ?? Infinity) })
            : null;
    return { line, product: p, unit, problem, max };
  });
  const ok = rows.filter((r) => !r.problem);
  return {
    rows,
    total: ok.reduce((n, r) => n + r.unit * r.line.qty, 0),
    count: ok.reduce((n, r) => n + r.line.qty, 0),
    hasProblems: rows.some((r) => r.problem),
    /** The shortest payment window of anything in the bag. */
    windowHours: ok.length ? Math.min(...ok.map((r) => r.product!.payment_window_hours)) : 48,
  };
}

/** Can a buyer still book this pickup time? */
export function slotState(s: PickupSlot, now = new Date().toISOString()) {
  if (s.ends_at < now) return { key: 'past' as const, left: 0 };
  if (s.capacity == null) return { key: 'open' as const, left: null };
  const left = Math.max(0, s.capacity - (s.booked ?? 0));
  return { key: left === 0 ? ('full' as const) : ('open' as const), left };
}

/** A size guide written as comma-separated lines becomes header + rows. */
export function parseSizeChart(text: string | null | undefined) {
  const rows = parseCsv(text ?? '').map((r) => r.map((c) => c.trim()));
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  return { header: pad(rows[0]), rows: rows.slice(1).map(pad) };
}

/** Products on an order: one entry per line, older orders fall back to the order's product. */
export function lineTitle(i: OrderItem, o: Pick<Order, 'product_title'>) {
  return i.title ?? o.product_title;
}

/**
 * "M ×2, L ×1" ("×3" for one-size items). When an order mixes products each line
 * names its product: "Hoodie M ×1, Tote ×2".
 */
export function itemsSummary(items: OrderItem[]) {
  const mixed = new Set(items.map((i) => i.title ?? '')).size > 1;
  return items.map((i) => `${mixed && i.title ? `${i.title} ` : ''}${i.variant ? `${i.variant} ` : ''}×${i.qty}`).join(', ');
}

export function itemCount(items: OrderItem[]) {
  return items.reduce((n, i) => n + i.qty, 0);
}

/** Does this order include the product? */
export function orderHasProduct(o: Pick<Order, 'product_id' | 'items'>, productId: string) {
  return o.product_id === productId || o.items.some((i) => i.product_id === productId);
}

/** Totals by variant across orders that hold stock, for the supplier. */
export function productionSummary(orders: Pick<Order, 'product_title' | 'items' | 'status' | 'expires_at'>[]) {
  const totals = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'refunded' || isExpired(o)) continue;
    for (const i of o.items) {
      const title = lineTitle(i, o);
      const byVariant = totals.get(title) ?? new Map<string, number>();
      byVariant.set(i.variant, (byVariant.get(i.variant) ?? 0) + i.qty);
      totals.set(title, byVariant);
    }
  }
  return [...totals].map(([title, v]) => ({
    title,
    variants: [...v].map(([name, qty]) => ({ name, qty })),
    total: [...v.values()].reduce((a, b) => a + b, 0),
  }));
}

/** Student ID from a CUHK student email (1155xxxxxx@link.cuhk.edu.hk), else ''. */
export function studentIdFromEmail(email: string) {
  return email.match(/^(1155\d{6})@link\.cuhk\.edu\.hk$/i)?.[1] ?? '';
}

// ---------------------------------------------------------------------------
// CSV in and out
// ---------------------------------------------------------------------------

/** Quotes a CSV value when needed. */
function cell(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  // A byte-order mark makes Excel open the file as UTF-8, so Chinese names survive.
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Parses CSV (or tab-separated text pasted from Excel). Handles quotes and blank lines. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export type ImportColumn = keyof ImportRow;

// Header words committees actually use in their spreadsheets, English and Chinese.
const HEADER_HINTS: [ImportColumn, RegExp][] = [
  ['student_id', /student\s*(id|no|number)|sid|學生編號|學號|學生證/i],
  ['email', /e-?mail|電郵|郵箱/i],
  ['phone', /phone|mobile|tel|whatsapp|電話|手機/i],
  ['college', /college|書院/i],
  ['major', /major|programme|program|faculty|department|主修|學系|課程|學院/i],
  ['full_name', /name|姓名|名稱|名字/i],
];

/** Guesses which column holds what from the header row. Returns null for columns to ignore. */
export function guessColumns(header: string[]): (ImportColumn | null)[] {
  const used = new Set<ImportColumn>();
  return header.map((h) => {
    const hit = HEADER_HINTS.find(([col, re]) => !used.has(col) && re.test(h));
    if (!hit) return null;
    used.add(hit[0]);
    return hit[0];
  });
}

/** Turns spreadsheet rows into import rows using a column mapping; skips rows without a name. */
export function rowsToImport(rows: string[][], columns: (ImportColumn | null)[]): ImportRow[] {
  return rows
    .map((r) => {
      const out: ImportRow = { full_name: '' };
      columns.forEach((col, i) => {
        if (col && r[i] != null) out[col] = r[i].trim();
      });
      return out;
    })
    .filter((r) => r.full_name && (r.email || r.student_id));
}

/** The member list in the order OSA's renewal form asks for. */
export function membersCsv(members: Membership[], plans: MembershipPlan[]) {
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  return toCsv([
    [
      t('Member no.'),
      t('Name'),
      t('Student ID'),
      t('College'),
      t('Major'),
      t('Email'),
      t('Phone'),
      t('Plan'),
      t('Status'),
      t('Paid'),
      t('Joined'),
    ],
    ...members.map((m) => [
      m.member_no,
      m.full_name,
      m.student_id,
      m.college ? t(m.college) : '',
      m.major,
      m.email,
      m.phone,
      planName.get(m.plan_id) ?? '',
      t(m.status),
      m.paid_at ? m.paid_at.slice(0, 10) : '',
      m.created_at.slice(0, 10),
    ]),
  ]);
}
