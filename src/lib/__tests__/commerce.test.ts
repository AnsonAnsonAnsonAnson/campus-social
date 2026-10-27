import { describe, expect, it } from '@jest/globals';

import {
  guessColumns,
  isSoldOut,
  itemsSummary,
  membershipState,
  parseCsv,
  productionSummary,
  rowsToImport,
  stockLeft,
  studentIdFromEmail,
  toCsv,
} from '../commerce';
import { setLang } from '../i18n';
import type { Order } from '../types';

setLang('en');

describe('membershipState', () => {
  const plan = { valid_until: '2999-08-31', price_hkd: 50 };
  it('follows payment and approval', () => {
    expect(membershipState({ status: 'pending', paid_at: null, claimed_paid_at: null }, plan).key).toBe('unpaid');
    expect(membershipState({ status: 'pending', paid_at: null, claimed_paid_at: 'x' }, plan).key).toBe('claimed');
    expect(membershipState({ status: 'pending', paid_at: null, claimed_paid_at: null }, { ...plan, price_hkd: 0 }).key).toBe('pending');
    expect(membershipState({ status: 'active', paid_at: 'x', claimed_paid_at: null }, plan).key).toBe('active');
  });
  it('expires with the plan', () => {
    expect(membershipState({ status: 'active', paid_at: 'x', claimed_paid_at: null }, { ...plan, valid_until: '2000-08-31' }).key).toBe(
      'expired',
    );
  });
});

describe('stock', () => {
  const p = {
    variants: [
      { name: 'M', stock: 3 },
      { name: 'L', stock: null },
    ],
    sold: { M: 3, L: 40 },
  };
  it('counts what is left', () => {
    expect(stockLeft(p)).toEqual({ M: 0, L: null });
    expect(isSoldOut(p)).toBe(false);
    expect(isSoldOut({ ...p, variants: [{ name: 'M', stock: 3 }] })).toBe(true);
  });
});

describe('orders', () => {
  const o = (status: Order['status'], items: Order['items'], expires_at: string | null = null) =>
    ({ product_title: 'Hoodie', status, items, expires_at }) as Order;
  it('summarises items', () => {
    expect(
      itemsSummary([
        { variant: 'M', qty: 2, unit_price: 1 },
        { variant: '', qty: 1, unit_price: 1 },
      ]),
    ).toBe('M ×2, ×1');
  });
  it('totals production, skipping cancelled and expired orders', () => {
    const summary = productionSummary([
      o('paid', [{ variant: 'M', qty: 2, unit_price: 1 }]),
      o('payment_claimed', [
        { variant: 'M', qty: 1, unit_price: 1 },
        { variant: 'L', qty: 1, unit_price: 1 },
      ]),
      o('cancelled', [{ variant: 'L', qty: 5, unit_price: 1 }]),
      o('awaiting_payment', [{ variant: 'L', qty: 5, unit_price: 1 }], '2000-01-01T00:00:00Z'),
    ]);
    expect(summary).toEqual([
      {
        title: 'Hoodie',
        total: 4,
        variants: [
          { name: 'M', qty: 3 },
          { name: 'L', qty: 1 },
        ],
      },
    ]);
  });
});

describe('spreadsheets', () => {
  it('round-trips quotes, commas and Chinese', () => {
    const csv = toCsv([
      ['姓名', 'Note'],
      ['陳大文', 'says "hi", ok'],
    ]);
    expect(parseCsv(csv)).toEqual([
      ['姓名', 'Note'],
      ['陳大文', 'says "hi", ok'],
    ]);
  });
  it('reads tab-separated text pasted from Excel', () => {
    expect(parseCsv('Name\tSID\nChan\t1155000001\n\n')).toEqual([
      ['Name', 'SID'],
      ['Chan', '1155000001'],
    ]);
  });
  it('guesses columns from common headers', () => {
    expect(guessColumns(['姓名', 'Student ID', 'Email address', '書院', 'Programme', 'WhatsApp', 'Size'])).toEqual([
      'full_name',
      'student_id',
      'email',
      'college',
      'major',
      'phone',
      null,
    ]);
  });
  it('keeps rows with a name and an email or student ID', () => {
    const rows = rowsToImport(
      [
        ['Chan', '1155000001', ''],
        ['', '1155000002', ''],
        ['Wong', '', ''],
        ['Lee', '', 'lee@link.cuhk.edu.hk'],
      ],
      ['full_name', 'student_id', 'email'],
    );
    expect(rows.map((r) => r.full_name)).toEqual(['Chan', 'Lee']);
  });
  it('reads student IDs from student emails only', () => {
    expect(studentIdFromEmail('1155123456@link.cuhk.edu.hk')).toBe('1155123456');
    expect(studentIdFromEmail('chan.tm@link.cuhk.edu.hk')).toBe('');
  });
});
