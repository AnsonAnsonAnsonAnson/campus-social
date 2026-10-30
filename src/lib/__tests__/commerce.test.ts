import { describe, expect, it } from '@jest/globals';

import {
  fairState,
  vouchersLeft,
  amountsIn,
  checkBag,
  parseSizeChart,
  priceRange,
  saleState,
  slotState,
  unitPrice,
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
import type { Order, PickupSlot, ProductWithStock, TicketOrder } from '../types';

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
  it('names each product on a mixed bag, and totals by product', () => {
    const items = [
      { product_id: 'h', title: 'Hoodie', variant: 'M', qty: 1, unit_price: 200 },
      { product_id: 't', title: 'Tote', variant: '', qty: 2, unit_price: 60 },
    ];
    expect(itemsSummary(items)).toBe('Hoodie M ×1, Tote ×2');
    expect(productionSummary([{ ...o('paid', items), product_title: 'Hoodie, Tote' }]).map((p) => [p.title, p.total])).toEqual([
      ['Hoodie', 1],
      ['Tote', 2],
    ]);
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

describe('shop bag', () => {
  const product = (id: string, p: Partial<ProductWithStock> = {}): ProductWithStock =>
    ({
      id,
      society_id: 's',
      title: id,
      price_hkd: 200,
      member_price_hkd: 160,
      variants: [
        { name: 'M', stock: 3 },
        { name: 'XXL', stock: null, extra_hkd: 20 },
      ],
      sold: { M: 1 },
      opens_at: null,
      closes_at: null,
      status: 'published',
      max_per_order: 5,
      max_per_buyer: null,
      payment_window_hours: 48,
      ...p,
    }) as ProductWithStock;

  it('adds size charges to the (member) price', () => {
    const p = product('hoodie');
    expect(unitPrice(p, 'M', false)).toBe(200);
    expect(unitPrice(p, 'XXL', false)).toBe(220);
    expect(unitPrice(p, 'XXL', true)).toBe(180);
    expect(priceRange(p, false)).toEqual({ min: 200, max: 220 });
  });

  it('knows when a product sells', () => {
    const now = '2026-11-01T00:00:00Z';
    expect(saleState(product('a', { opens_at: '2026-11-02T00:00:00Z' }), now)).toBe('upcoming');
    expect(saleState(product('a', { closes_at: '2026-10-01T00:00:00Z' }), now)).toBe('closed');
    expect(saleState(product('a', { variants: [{ name: '', stock: 1 }], sold: { '': 1 } }), now)).toBe('sold_out');
    expect(saleState(product('a'), now)).toBe('open');
  });

  it('totals a bag and flags lines that cannot be ordered', () => {
    const bag = checkBag(
      [
        { product_id: 'hoodie', variant: 'M', qty: 2 },
        { product_id: 'hoodie', variant: 'M', qty: 1 },
        { product_id: 'hoodie', variant: 'XXL', qty: 1 },
        { product_id: 'gone', variant: '', qty: 1 },
      ],
      [product('hoodie')],
      false,
    );
    expect(bag.rows.map((r) => r.problem)).toEqual([null, 'Sold out', null, 'No longer on sale']);
    expect(bag.total).toBe(2 * 200 + 220);
    expect(bag.count).toBe(3);
    expect(bag.hasProblems).toBe(true);
  });

  it('applies the per-order limit across sizes', () => {
    const bag = checkBag(
      [
        { product_id: 'p', variant: 'XXL', qty: 2 },
        { product_id: 'p', variant: 'XXL', qty: 1 },
      ],
      [product('p', { max_per_order: 2 })],
      false,
    );
    expect(bag.rows[1].problem).toBe('Up to 2 per order.');
  });
});

describe('pickup times', () => {
  const slot = (p: Partial<PickupSlot>): PickupSlot => ({
    id: 'x',
    society_id: 's',
    starts_at: '2026-11-02T05:00:00Z',
    ends_at: '2026-11-02T06:00:00Z',
    location: 'Room 1009',
    capacity: null,
    booked: 0,
    ...p,
  });
  it('is open, full or past', () => {
    const now = '2026-11-01T00:00:00Z';
    expect(slotState(slot({}), now)).toEqual({ key: 'open', left: null });
    expect(slotState(slot({ capacity: 3, booked: 1 }), now)).toEqual({ key: 'open', left: 2 });
    expect(slotState(slot({ capacity: 3, booked: 3 }), now).key).toBe('full');
    expect(slotState(slot({}), '2026-11-03T00:00:00Z').key).toBe('past');
  });
});

describe('size guide', () => {
  it('reads comma-separated lines and pads short rows', () => {
    expect(parseSizeChart('Size, Chest, Length\nS, 52, 68\nM, 55')).toEqual({
      header: ['Size', 'Chest', 'Length'],
      rows: [
        ['S', '52', '68'],
        ['M', '55', ''],
      ],
    });
    expect(parseSizeChart('Size, Chest')).toBeNull();
  });
});

describe('fairs', () => {
  const fair = { starts_at: '2026-12-20T03:00:00Z', ends_at: '2026-12-21T10:00:00Z', presale_closes_at: '2026-12-19T15:59:00Z' };
  it('knows before, during and after, and when presale closes', () => {
    expect(fairState(fair, '2026-12-01T00:00:00Z')).toMatchObject({ key: 'upcoming', presaleOpen: true });
    expect(fairState(fair, '2026-12-19T16:00:00Z')).toMatchObject({ key: 'upcoming', presaleOpen: false });
    expect(fairState(fair, '2026-12-20T05:00:00Z')).toMatchObject({ key: 'on', presaleOpen: false });
    expect(fairState({ ...fair, presale_closes_at: null }, '2026-12-20T05:00:00Z')).toMatchObject({ key: 'on', presaleOpen: true });
    expect(fairState(fair, '2026-12-22T00:00:00Z').key).toBe('over');
  });
  it('counts vouchers left', () => {
    expect(vouchersLeft({ vouchers_total: 3, vouchers_used: 1 })).toBe(2);
    expect(vouchersLeft({})).toBe(0);
  });
});
