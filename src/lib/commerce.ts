// Shared rules for member cards and shop orders: what state a membership or an
// order is in, what is left in stock, and the spreadsheet formats committees
// import and export. Kept here (not in screens) so they can be unit tested.
import { todayHK } from './format';
import { t } from './i18n';
import type { ImportRow, Membership, MembershipPlan, Order, OrderStatus, ProductWithStock } from './types';

export const MEMBER_QR_PREFIX = 'campussocial:member:';
export const ORDER_QR_PREFIX = 'campussocial:order:';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'ink';

/** What a membership means right now. Expiry comes from the plan's dates, not a stored status. */
export function membershipState(m: Pick<Membership, 'status' | 'paid_at' | 'claimed_paid_at'>, plan: Pick<MembershipPlan, 'valid_until' | 'price_hkd'>) {
  if (m.status === 'active') {
    return plan.valid_until < todayHK()
      ? { key: 'expired' as const, label: t('Expired'), tone: 'neutral' as Tone }
      : { key: 'active' as const, label: t('Active'), tone: 'success' as Tone };
  }
  if (m.status === 'pending') {
    if (plan.price_hkd > 0 && !m.paid_at && !m.claimed_paid_at) return { key: 'unpaid' as const, label: t('Waiting for payment'), tone: 'warning' as Tone };
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

/** Units left of each variant; null means no limit. */
export function stockLeft(p: Pick<ProductWithStock, 'variants' | 'sold'>) {
  return Object.fromEntries(p.variants.map((v) => [v.name, v.stock == null ? null : Math.max(0, v.stock - (p.sold[v.name] ?? 0))]));
}

export function isSoldOut(p: Pick<ProductWithStock, 'variants' | 'sold'>) {
  return Object.values(stockLeft(p)).every((n) => n === 0);
}

/** "M ×2, L ×1" ("×3" for one-size items). */
export function itemsSummary(items: Order['items']) {
  return items.map((i) => `${i.variant ? `${i.variant} ` : ''}×${i.qty}`).join(', ');
}

/** Totals by variant across orders that hold stock, for the supplier. */
export function productionSummary(orders: Pick<Order, 'product_title' | 'items' | 'status' | 'expires_at'>[]) {
  const totals = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'refunded' || isExpired(o)) continue;
    const byVariant = totals.get(o.product_title) ?? new Map<string, number>();
    for (const i of o.items) byVariant.set(i.variant, (byVariant.get(i.variant) ?? 0) + i.qty);
    totals.set(o.product_title, byVariant);
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
