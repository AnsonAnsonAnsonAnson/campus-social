import { describe, expect, it } from '@jest/globals';

import {
  amountsIn,
  guessColumns,
  liveTicketOrder,
  matchStatement,
  receiptPath,
  ticketPayment,
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
import type { Order, TicketOrder } from '../types';

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

describe('paid tickets', () => {
  const order = (o: Partial<TicketOrder>): TicketOrder => ({
    id: 'o1',
    ref: 'TKS-1234',
    status: 'awaiting_payment',
    total_hkd: 180,
    expires_at: '2099-01-01T00:00:00Z',
    payment_method: 'fps',
    member_price: false,
    receipt_at: null,
    created_at: '2026-10-27T00:00:00Z',
    ...o,
  });

  it('uses the newest order that is still live', () => {
    const old = order({ id: 'old', status: 'refunded', created_at: '2026-10-01T00:00:00Z' });
    const live = order({ id: 'live' });
    expect(liveTicketOrder([old, live])?.id).toBe('live');
    expect(liveTicketOrder([old])).toBeNull();
    expect(liveTicketOrder(undefined)).toBeNull();
  });

  it('only shows the QR once paid', () => {
    expect(ticketPayment({ status: 'confirmed', order: null }).key).toBe('none');
    expect(ticketPayment({ status: 'confirmed', order: order({}) }).key).toBe('unpaid');
    expect(ticketPayment({ status: 'confirmed', order: order({ status: 'payment_claimed' }) }).key).toBe('claimed');
    expect(ticketPayment({ status: 'confirmed', order: order({ status: 'paid' }) }).key).toBe('paid');
    expect(ticketPayment({ status: 'confirmed', order: order({ expires_at: '2020-01-01T00:00:00Z' }) }).key).toBe('expired');
    expect(ticketPayment({ status: 'waitlisted', order: null }).key).toBe('none');
  });

  it('puts each receipt at one fixed path per record', () => {
    expect(receiptPath('order', 's1', 'o1')).toBe('s1/order/o1.jpg');
    expect(receiptPath('membership', 's1', 'm1')).toBe('s1/membership/m1.jpg');
  });
});

describe('matchStatement', () => {
  const waiting = [
    { kind: 'order' as const, id: 'a', ref: 'SSM-4821', amount: 540, name: 'Chan' },
    { kind: 'order' as const, id: 'b', ref: 'SSM-0007', amount: 120, name: 'Lee' },
    { kind: 'membership' as const, id: 'c', ref: 'M-3F9A2C', amount: 50, name: 'Wong' },
  ];

  it('reads amounts with commas and currency signs', () => {
    expect(amountsIn('HK$1,234.50 and 80')).toEqual([1234.5, 80]);
  });

  it('finds references however the bank writes them, and checks the amount', () => {
    const text = [
      'Date,Description,Amount',
      '27/10/2026,FPS CHAN T** M** ssm4821,540.00',
      '27/10/2026,PAYME m-3f9a2c,HK$40.00',
      '27/10/2026,FPS SOMEONE ELSE,99.00',
    ].join('\n');
    const found = matchStatement(text, waiting);
    expect(found.map((f) => [f.id, f.amountMatches])).toEqual([
      ['a', true],
      ['c', false],
    ]);
  });

  it('prefers the line whose amount agrees when a reference appears twice', () => {
    const found = matchStatement('SSM-0007 10.00\nSSM 0007 120.00', waiting);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'b', amountMatches: true, line: 'SSM 0007 120.00' });
  });

  it('does not read the reference digits as the amount', () => {
    expect(matchStatement('SSM-0120', [{ ...waiting[1], ref: 'SSM-0120' }])[0].amountMatches).toBe(false);
  });
});
