// In-memory backend so the app runs with no Supabase project (Expo Go preview,
// App Store screenshots, UI work). Mirrors the rules in the SQL migration.
import type { AuthUser, Backend } from './backend';
import { isCuhkEmail } from './backend';
import { liveTicketOrder, platformFeeHkd, receiptPath, slotState, unitPrice } from './commerce';
import {
  DEMO_DINNER,
  demoPaymentSettings,
  demoSocieties,
  makeDemoBanners,
  makeDemoBooths,
  makeDemoCampusDates,
  makeDemoFairProducts,
  makeDemoFairs,
  makeDemoEvents,
  makeDemoMemberships,
  makeDemoPickupSlots,
  makeDemoPlans,
  makeDemoPosts,
  makeDemoProducts,
  type DemoPost,
} from './demoData';
import { DEMO_RECEIPT_MEMBERSHIP, DEMO_RECEIPT_TICKET } from './demoReceipts';
import { formatDay, formatTime } from './format';
import { t } from './i18n';
import { checkTicketToken, parseTicketToken, tokenIdMatches } from './ticketToken';
import type {
  AppNotification,
  Attendee,
  Banner,
  CampusEvent,
  EventWithSociety,
  Fair,
  FairBooth,
  FairWithCounts,
  Membership,
  MembershipPlan,
  MyRegistration,
  MySociety,
  Order,
  OrderStatus,
  PaymentSettings,
  PayoutAccount,
  PlatformFee,
  PickupSlot,
  Product,
  SocietyOrder,
  NotificationKind,
  OpenReport,
  Profile,
  Registration,
  Society,
  SocietyMember,
  SocietyPost,
  SocietyRole,
  TicketOrder,
} from './types';

export const DEMO_CODE = '123456';

const FAKE_NAMES = [
  'Chan Tai Man',
  'Wong Ka Yan',
  'Lee Hoi Ching',
  'Cheung Chi Ho',
  'Lam Wing Sze',
  'Ng Pak Hei',
  'Ho Sum Yee',
  'Yeung Tsz Kit',
  'Leung Hiu Tung',
  'Tsang Cheuk Lam',
  'Chow Man Kit',
  'Lau Ying Ying',
];

const FAKE_ANSWERS = [
  'A timetable planner for CUHK courses',
  'Something with the campus bus routes',
  'Not sure yet, happy to join any team',
  'A canteen menu app',
  'Game! Anything with physics',
];

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const uid = () => 'demo-' + Math.random().toString(36).slice(2, 10);

const state = {
  user: null as AuthUser | null,
  profile: null as Profile | null,
  societies: demoSocieties.map((s) => ({ ...s })) as Society[],
  events: makeDemoEvents() as CampusEvent[],
  banners: makeDemoBanners() as Banner[],
  campusDates: makeDemoCampusDates(),
  follows: new Set<string>([demoSocieties[0].id, demoSocieties[1].id]),
  hidden: new Set<string>(),
  // Two events already saved, so Tickets › Saved isn't empty in the demo.
  saved: ['20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000008'] as string[],
  registrations: [] as Registration[],
  // In demo mode you help run CU Coding Society, so committee tools are visible.
  members: [{ society_id: demoSocieties[1].id, role: 'owner' as SocietyRole }],
  // Other (simulated) committee members, by society.
  committee: {
    [demoSocieties[1].id]: [
      {
        user_id: 'demo-m1',
        display_name: 'Wong Ka Yan',
        email: 'kayan.wong@link.cuhk.edu.hk',
        role: 'admin',
        created_at: '2026-09-01T02:00:00Z',
      },
      {
        user_id: 'demo-m2',
        display_name: 'Ng Pak Hei',
        email: 'pakhei.ng@link.cuhk.edu.hk',
        role: 'editor',
        created_at: '2026-09-08T02:00:00Z',
      },
    ],
  } as Record<string, SocietyMember[]>,
  checkedInFake: new Map<string, Set<number>>(),
  notifications: [] as AppNotification[],
  reports: [] as (OpenReport & { resolved: boolean })[],
  posts: makeDemoPosts() as DemoPost[],
  // Posts you liked; a couple already, so the hearts show both states.
  liked: new Set<string>(['70000000-0000-4000-8000-000000000002']),
  plans: makeDemoPlans() as MembershipPlan[],
  memberships: makeDemoMemberships() as Membership[],
  paymentSettings: demoPaymentSettings.map((p) => ({ ...p })) as PaymentSettings[],
  // CU Coding Society already takes online payments, so the demo shows both sides.
  payoutAccounts: [
    {
      society_id: demoSocieties[1].id,
      provider: 'stripe',
      account_id: 'acct_demo',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements_due: 0,
      disabled_reason: null,
      updated_at: '2026-10-20T02:00:00Z',
    },
  ] as PayoutAccount[],
  platformFee: { percent: 5, fixed_hkd: 3 } as PlatformFee,
  products: [...makeDemoProducts(), ...makeDemoFairProducts()] as Product[],
  fairs: makeDemoFairs() as Fair[],
  booths: makeDemoBooths() as Omit<FairBooth, 'society'>[],
  pickupSlots: makeDemoPickupSlots() as PickupSlot[],
  // Products the demo user asked to hear about when they're back on sale.
  alerts: new Set<string>(),
  orders: makeDemoOrders() as (Order & { buyer_name: string; buyer_email: string })[],
  // Payment screenshots by storage path. In demo mode they only live in memory.
  receipts: new Map<string, string>([
    [`${demoSocieties[1].id}/membership/demo-receipt.jpg`, DEMO_RECEIPT_MEMBERSHIP],
    [`${demoSocieties[1].id}/order/demo-ticket-receipt.jpg`, DEMO_RECEIPT_TICKET],
  ]),
};

/** Orders other students placed with CUCS, so the committee's orders table has something in it. */
function makeDemoOrders() {
  const statuses: OrderStatus[] = ['payment_claimed', 'payment_claimed', 'awaiting_payment', 'paid', 'paid', 'ready', 'collected'];
  const product = makeDemoProducts().find((p) => p.title === 'Sticker pack')!;
  const shop = statuses.map((status, i) => {
    const qty = (i % 3) + 1;
    const created = new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString();
    return {
      id: `80000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      society_id: product.society_id,
      product_id: product.id,
      user_id: `demo-buyer-${i}`,
      ref: `CUC-${String(4821 + i * 37).slice(-4)}`,
      product_title: product.title,
      items: [{ variant: '', qty, unit_price: product.price_hkd }],
      total_hkd: qty * product.price_hkd,
      member_price: false,
      status,
      payment_method: i === 2 ? ('cash' as const) : ('fps' as const),
      buyer_note: null,
      pickup_code: `demopickup${i}`.padEnd(32, '0'),
      expires_at: i === 2 ? null : new Date(Date.parse(created) + 48 * 3600_000).toISOString(),
      claimed_at: status === 'awaiting_payment' ? null : created,
      paid_at: ['paid', 'ready', 'collected'].includes(status) ? created : null,
      ready_at: status === 'ready' ? created : null,
      collected_at: status === 'collected' ? created : null,
      cancelled_at: null,
      event_id: null,
      registration_id: null,
      receipt_path: null,
      receipt_at: null,
      pickup_slot_id: `70000000-0000-4000-8000-${String(3 + (i % 3)).padStart(12, '0')}`,
      created_at: created,
      buyer_name: FAKE_NAMES[i],
      buyer_email: `student${1155200000 + i}@link.cuhk.edu.hk`,
    };
  });
  // Hoodie pre-orders from other Hiking Club members, so the goal bar has progress.
  const hoodie = makeDemoProducts().find((p) => p.title === 'Club hoodie 2026')!;
  const hoodieLines: [string, number][][] = [
    [['S', 2]],
    [['L', 3]],
    [
      ['L', 1],
      ['XXL', 1],
    ],
    [['S', 1]],
    [['L', 2]],
    [
      ['XXL', 1],
      ['S', 1],
    ],
    [['L', 2]],
    [
      ['S', 1],
      ['L', 1],
    ],
    [['L', 2]],
  ];
  const hoodies = hoodieLines.map((lines, i) => {
    const created = new Date(Date.now() - (i + 1) * 9 * 3600_000).toISOString();
    const items = lines.map(([variant, qty]) => ({
      product_id: hoodie.id,
      title: hoodie.title,
      variant,
      qty,
      unit_price: hoodie.price_hkd + (variant === 'XXL' ? 20 : 0),
    }));
    return {
      ...shop[3],
      id: `81000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      society_id: hoodie.society_id,
      product_id: hoodie.id,
      user_id: `demo-hiker-${i}`,
      ref: `HIK-${String(3107 + i * 53).slice(-4)}`,
      product_title: hoodie.title,
      items,
      total_hkd: items.reduce((n, l) => n + l.qty * l.unit_price, 0),
      status: 'paid' as OrderStatus,
      pickup_code: `demohoodie${i}`.padEnd(32, '0'),
      pickup_slot_id: null,
      created_at: created,
      buyer_name: FAKE_NAMES[(i + 3) % FAKE_NAMES.length],
    };
  });
  // Tickets for the year-end dinner: one sent a screenshot, one hasn't paid yet, one is paid.
  const dinner = makeDemoEvents().find((e) => e.id === DEMO_DINNER)!;
  const tickets = (['payment_claimed', 'awaiting_payment', 'paid'] as OrderStatus[]).map((status, i) => {
    const created = new Date(Date.now() - (i + 2) * 7 * 3600_000).toISOString();
    const member = i === 2;
    const total = member ? dinner.member_price_hkd! : dinner.price_hkd!;
    return {
      ...shop[0],
      id: `80000000-0000-4000-8000-${String(101 + i).padStart(12, '0')}`,
      product_id: null,
      event_id: dinner.id,
      registration_id: `demo-reg-${i}`,
      user_id: `demo-buyer-${10 + i}`,
      ref: ['CUC-5120', 'CUC-7342', 'CUC-2209'][i],
      product_title: dinner.title,
      items: [{ variant: '', qty: 1, unit_price: total }],
      total_hkd: total,
      member_price: member,
      status,
      payment_method: 'fps' as const,
      pickup_code: `demoticket${i}`.padEnd(32, '0'),
      expires_at: new Date(Date.parse(created) + dinner.payment_window_hours * 3600_000).toISOString(),
      claimed_at: status === 'awaiting_payment' ? null : created,
      paid_at: status === 'paid' ? created : null,
      ready_at: null,
      collected_at: null,
      receipt_path: status === 'payment_claimed' ? `${dinner.society_id}/order/demo-ticket-receipt.jpg` : null,
      receipt_at: status === 'payment_claimed' ? created : null,
      pickup_slot_id: null,
      created_at: created,
      buyer_name: FAKE_NAMES[8 + i],
      buyer_email: `student${1155210000 + i}@link.cuhk.edu.hk`,
    };
  });
  return [...tickets, ...shop, ...hoodies];
}

function todayHK() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function isCurrentMember(societyId: string) {
  return state.memberships.some((m) => {
    const plan = state.plans.find((p) => p.id === m.plan_id);
    return (
      m.society_id === societyId &&
      m.user_id === state.user?.id &&
      m.status === 'active' &&
      !!plan &&
      plan.valid_from <= todayHK() &&
      todayHK() <= plan.valid_until
    );
  });
}

const planUntil = (m: Membership) => state.plans.find((p) => p.id === m.plan_id)?.valid_until ?? '';

function activateMembership(m: Membership) {
  if (m.member_no == null) {
    m.member_no = Math.max(0, ...state.memberships.filter((x) => x.society_id === m.society_id).map((x) => x.member_no ?? 0)) + 1;
  }
  const was = m.status;
  m.status = 'active';
  if (m.user_id === state.user?.id && was !== 'active') {
    const s = state.societies.find((x) => x.id === m.society_id)!;
    const society = s.short_name ?? s.name;
    notify(
      'membership_active',
      t('Membership confirmed'),
      t("You're a member of {society}. Your member card is in Tickets.", { society }),
      null,
      s.id,
    );
  }
}

function holdsStock(o: Order) {
  return (
    !['cancelled', 'refunded'].includes(o.status) &&
    !(o.status === 'awaiting_payment' && o.expires_at && o.expires_at < new Date().toISOString())
  );
}

function productSold(productId: string) {
  const sold: Record<string, number> = {};
  for (const o of state.orders) {
    if (!holdsStock(o)) continue;
    for (const i of o.items) {
      if ((i.product_id ?? o.product_id) === productId) sold[i.variant] = (sold[i.variant] ?? 0) + i.qty;
    }
  }
  return sold;
}

function slotBooked(slotId: string, except?: string) {
  return state.orders.filter((o) => o.pickup_slot_id === slotId && holdsStock(o) && o.id !== except).length;
}

function withBooked(s: PickupSlot): PickupSlot {
  return { ...s, booked: slotBooked(s.id) };
}

/** Mirrors _slot_label(): "Thu 13 Nov 13:00, Room 1009". */
function slotLabel(s: PickupSlot) {
  return `${formatDay(s.starts_at)} ${formatTime(s.starts_at)}, ${s.location}`;
}

function checkSlot(slotId: string, societyId: string, except?: string) {
  const slot = state.pickupSlots.find((x) => x.id === slotId && x.society_id === societyId);
  if (!slot) throw new Error('Choose another pickup time');
  const st = slotState({ ...slot, booked: slotBooked(slot.id, except) });
  if (st.key === 'past') throw new Error('That pickup time has passed');
  if (st.key === 'full') throw new Error('That pickup time is full');
}

/** Mirrors notify_slot_change(): the demo user hears about times they booked. */
function notifySlotChange(slot: PickupSlot, removed: boolean) {
  for (const o of state.orders) {
    if (o.pickup_slot_id !== slot.id || o.user_id !== state.user?.id || !holdsStock(o)) continue;
    if (!['awaiting_payment', 'payment_claimed', 'paid', 'ready'].includes(o.status)) continue;
    if (removed)
      notify('order_update', t('Pickup time cancelled'), t('Choose a new time to collect {ref}.', { ref: o.ref }), null, o.society_id);
    else
      notify(
        'order_update',
        t('Pickup time changed'),
        t('Now {slot} for {ref}.', { slot: slotLabel(slot), ref: o.ref }),
        null,
        o.society_id,
      );
  }
}

function societyCard(id: string) {
  const s = state.societies.find((x) => x.id === id)!;
  return { ...summary(s), category: s.category };
}

function readyBody(o: Order) {
  const slot = state.pickupSlots.find((s) => s.id === o.pickup_slot_id);
  return slot
    ? t('Collect {title} at {slot}. Show the pickup QR in Tickets.', { title: o.product_title, slot: slotLabel(slot) })
    : t('Show the pickup QR in Tickets to collect {title}.', { title: o.product_title });
}

function notifyOrder(o: Order) {
  if (o.user_id !== state.user?.id) return;
  const titles: Partial<Record<OrderStatus, [string, string]>> = {
    paid: [t('Payment received'), t('{title} ({ref}) is paid.', { title: o.product_title, ref: o.ref })],
    ready: [t('Ready for pickup'), readyBody(o)],
    awaiting_payment: [
      t('Payment not found yet'),
      t('The society could not find a payment for {ref}. Check the reference and amount.', { ref: o.ref }),
    ],
    cancelled: [t('Order cancelled'), `${o.product_title} (${o.ref})`],
    refunded: [
      t('Refunded'),
      t('HK${amount} for {ref} is on its way back to your card or wallet. It can take 5 to 10 days to appear.', {
        amount: o.total_hkd,
        ref: o.ref,
      }),
    ],
  };
  const n = titles[o.status];
  if (n) notify('order_update', n[0], n[1], null, o.society_id);
}

function seedDemoInbox() {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const followed = state.events
    .filter((e) => state.follows.has(e.society_id) && e.status === 'published' && e.starts_at > new Date().toISOString())
    .slice(0, 2);
  state.notifications = followed.map((e, i) => {
    const s = state.societies.find((x) => x.id === e.society_id)!;
    return {
      id: uid(),
      kind: 'new_event' as const,
      title: t('New from {society}', { society: s.short_name ?? s.name }),
      body: e.title,
      event_id: e.id,
      society_id: s.id,
      read_at: i === 0 ? null : ago(60),
      created_at: ago(i === 0 ? 25 : 60 * 26),
    };
  });
  const reported = state.events.find((e) => e.id.endsWith('11')) ?? state.events[state.events.length - 1];
  state.reports = ['Looks like an advert, not a society event', 'Spam'].map((reason, i) => ({
    id: uid(),
    target_type: 'event' as const,
    target_id: reported.id,
    target_name: reported.title,
    reason,
    report_count: 2,
    created_at: ago(90 - i * 30),
    resolved: false,
  }));
}

function notify(kind: NotificationKind, title: string, body: string, event_id: string | null = null, society_id: string | null = null) {
  if (!state.user) return;
  state.notifications.unshift({ id: uid(), kind, title, body, event_id, society_id, read_at: null, created_at: new Date().toISOString() });
}

function onlineReady(societyId: string) {
  return state.payoutAccounts.some((a) => a.society_id === societyId && a.charges_enabled);
}

function isAdminOf(societyId: string) {
  return !!state.user && state.members.some((m) => m.society_id === societyId && m.role !== 'editor');
}

const listeners = new Set<(u: AuthUser | null) => void>();

/** Mirrors _has_booth(). */
function hasBooth(fairId: string, societyId: string) {
  return (
    state.fairs.some((f) => f.id === fairId && f.status === 'approved') &&
    state.booths.some((b) => b.fair_id === fairId && b.society_id === societyId && b.status === 'approved')
  );
}

/** Mirrors _fair_json(): what the fair lists show. */
function fairCard(f: Fair): FairWithCounts {
  const booths = state.booths.filter((b) => b.fair_id === f.id && b.status === 'approved');
  return {
    ...f,
    organiser: societyCard(f.organiser_society_id),
    booth_count: booths.length,
    product_count: state.products.filter((p) => p.fair_id === f.id && p.status === 'published' && hasBooth(f.id, p.society_id)).length,
    can_manage: isAdminOf(f.organiser_society_id),
  };
}

/** Mirrors the fairs read policy. */
function canSeeFair(f: Fair) {
  return f.status === 'approved' || isMember(f.organiser_society_id) || !!state.profile?.is_platform_admin;
}

function requireUser() {
  if (!state.user) throw new Error('Sign in first');
  return state.user;
}

function summary(s: Society) {
  return { id: s.id, name: s.name, short_name: s.short_name, logo_url: s.logo_url, verified: s.verified, college: s.college };
}

function withSociety(e: CampusEvent): EventWithSociety {
  const s = state.societies.find((x) => x.id === e.society_id)!;
  return { ...e, society: summary(s) };
}

function isMember(societyId: string) {
  return !!state.user && state.members.some((m) => m.society_id === societyId);
}

function visibleEvent(e: CampusEvent) {
  const s = state.societies.find((x) => x.id === e.society_id);
  return (e.status !== 'draft' && !e.removed_at && s?.status === 'approved') || isMember(e.society_id);
}

/** Mirrors the "read live posts" policy. */
function visiblePost(p: DemoPost) {
  const s = state.societies.find((x) => x.id === p.society_id);
  return (!p.removed_at && s?.status === 'approved') || isMember(p.society_id);
}

function withPostLinks(p: DemoPost): SocietyPost {
  const s = state.societies.find((x) => x.id === p.society_id)!;
  const e = p.event_id ? state.events.find((x) => x.id === p.event_id) : undefined;
  return {
    ...p,
    society: { ...summary(s), category: s.category },
    event:
      e && visibleEvent(e)
        ? {
            id: e.id,
            title: e.title,
            starts_at: e.starts_at,
            ends_at: e.ends_at,
            location: e.location,
            cover_url: e.cover_url,
            category: e.category,
            status: e.status,
          }
        : null,
  };
}

/** How list_open_reports() names a post: "Society: first 80 characters". */
function postName(id: string) {
  const p = state.posts.find((x) => x.id === id);
  const s = p && state.societies.find((x) => x.id === p.society_id);
  return p && s ? `${s.name}: ${p.body.slice(0, 80)}` : undefined;
}

function committeePost(id: string) {
  const p = state.posts.find((x) => x.id === id);
  if (!p || !isMember(p.society_id)) throw new Error('Not allowed');
  return p;
}

function fillFromWaitlist(e: CampusEvent) {
  while (e.capacity == null || e.confirmed_count < e.capacity) {
    const next = state.registrations
      .filter((r) => r.event_id === e.id && r.status === 'waitlisted')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (!next) {
      // Simulated people on the waitlist ahead of nobody: just shrink the count.
      if (e.waitlist_count > 0) {
        e.waitlist_count--;
        e.confirmed_count++;
        continue;
      }
      break;
    }
    next.status = 'confirmed';
    ensureTicketOrder(next);
    e.confirmed_count++;
    e.waitlist_count = Math.max(0, e.waitlist_count - 1);
    notify(
      'waitlist_promoted',
      t('You got a spot!'),
      t('A place opened up for {title}. Your QR ticket is ready.', { title: e.title }),
      e.id,
    );
  }
}

/** Mirrors _ticket_price(): null when this event is free for the demo user. */
function ticketPrice(e: CampusEvent) {
  const price = e.member_price_hkd != null && isCurrentMember(e.society_id) ? e.member_price_hkd : (e.price_hkd ?? 0);
  return price > 0 ? price : null;
}

function ticketOrders(regId: string) {
  return state.orders.filter((o) => o.registration_id === regId);
}

function toTicketOrder(o: Order): TicketOrder {
  const { id, ref, status, total_hkd, expires_at, payment_method, member_price, receipt_at, created_at } = o;
  return { id, ref, status, total_hkd, expires_at, payment_method, member_price, receipt_at, created_at };
}

function withOrder(r: Registration): MyRegistration {
  return { ...r, order: liveTicketOrder(ticketOrders(r.id).map(toTicketOrder)) };
}

/** Mirrors sync_ticket_order(): a confirmed place on a paid event gets an order to pay. */
function ensureTicketOrder(reg: Registration) {
  const e = state.events.find((x) => x.id === reg.event_id)!;
  const price = ticketPrice(e);
  if (reg.status !== 'confirmed' || price == null) return;
  const held = ticketOrders(reg.id).some(
    (o) => o.status === 'paid' || o.status === 'payment_claimed' || (o.status === 'awaiting_payment' && holdsStock(o)),
  );
  if (held) return;
  const s = state.societies.find((x) => x.id === e.society_id)!;
  const prefix = ((s.short_name ?? s.name).replace(/[^A-Za-z]/g, '') || 'CS').slice(0, 3).toUpperCase();
  const method = reg.payment_method ?? 'fps';
  const now = new Date();
  const window = new Date(now.getTime() + e.payment_window_hours * 3600_000).toISOString();
  state.orders.unshift({
    id: uid(),
    society_id: e.society_id,
    product_id: null,
    event_id: e.id,
    registration_id: reg.id,
    user_id: reg.user_id,
    ref: `${prefix}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    product_title: e.title,
    items: [{ variant: '', qty: 1, unit_price: price }],
    total_hkd: price,
    member_price: e.member_price_hkd != null && isCurrentMember(e.society_id),
    status: 'awaiting_payment',
    payment_method: method,
    buyer_note: null,
    pickup_code: uid().slice(5) + uid().slice(5) + uid().slice(5),
    expires_at: method === 'cash' ? null : window < e.starts_at ? window : e.starts_at,
    claimed_at: null,
    paid_at: null,
    ready_at: null,
    collected_at: null,
    cancelled_at: null,
    receipt_path: null,
    receipt_at: null,
    pickup_slot_id: null,
    created_at: now.toISOString(),
    buyer_name: state.profile?.display_name || state.user?.email || '',
    buyer_email: state.user?.email ?? '',
  });
}

/** Mirrors _drop_registration(): frees the place and moves the waitlist up. */
function dropRegistration(regId: string | null) {
  const reg = state.registrations.find((r) => r.id === regId);
  if (!reg || reg.status === 'cancelled') return;
  const e = state.events.find((x) => x.id === reg.event_id)!;
  const was = reg.status;
  reg.status = 'cancelled';
  cancelUnpaidTicket(reg.id);
  if (was === 'confirmed') {
    e.confirmed_count = Math.max(0, e.confirmed_count - 1);
    fillFromWaitlist(e);
  } else {
    e.waitlist_count = Math.max(0, e.waitlist_count - 1);
  }
}

function cancelUnpaidTicket(regId: string) {
  for (const o of ticketOrders(regId)) {
    if (o.status === 'awaiting_payment' || o.status === 'payment_claimed') {
      o.status = 'cancelled';
      o.cancelled_at = new Date().toISOString();
    }
  }
}

/** Mirrors _release_unpaid_tickets(). */
function releaseUnpaidTickets(eventId: string) {
  for (const o of state.orders.filter((x) => x.event_id === eventId && x.status === 'awaiting_payment' && !holdsStock(x))) {
    o.status = 'cancelled';
    o.cancelled_at = new Date().toISOString();
    notifyOrder(o);
    dropRegistration(o.registration_id);
  }
}

function unpaidTicket(regId: string) {
  return ticketOrders(regId).find((o) => o.status === 'awaiting_payment' || o.status === 'payment_claimed');
}

export const demoBackend: Backend = {
  isDemo: true,

  async getUser() {
    return state.user;
  },
  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  async sendCode(email) {
    await delay(400);
    if (!isCuhkEmail(email)) throw new Error('Please use your CUHK email address');
  },
  async verifyCode(email, code) {
    await delay(400);
    if (code.trim() !== DEMO_CODE) throw new Error(`Demo mode: the code is ${DEMO_CODE}`);
    const e = email.trim().toLowerCase();
    state.user = { id: 'demo-user', email: e };
    state.profile = {
      id: 'demo-user',
      email: e,
      display_name: '',
      college: null,
      major: null,
      year_of_study: null,
      avatar_url: null,
      is_platform_admin: true,
    };
    seedDemoInbox();
    listeners.forEach((l) => l(state.user));
  },
  async signInWithPassword(email) {
    await this.verifyCode(email, DEMO_CODE);
  },
  async signOut() {
    state.user = null;
    state.profile = null;
    listeners.forEach((l) => l(null));
  },
  async deleteAccount() {
    for (const r of state.registrations) await this.cancelRegistration(r.event_id);
    state.registrations = [];
    state.notifications = [];
    await this.signOut();
  },
  async getProfile() {
    return state.profile;
  },
  async updateProfile(patch) {
    requireUser();
    state.profile = { ...state.profile!, ...patch };
  },

  async listBanners() {
    await delay();
    const now = new Date().toISOString();
    return state.banners
      .filter((b) => b.status === 'approved' && b.starts_at <= now && b.ends_at >= now)
      .sort((a, b) => b.priority - a.priority)
      .map((b) => ({
        ...b,
        society: summary(state.societies.find((s) => s.id === b.society_id)!),
        event: state.events.find((e) => e.id === b.event_id) ?? null,
      }));
  },
  async listEvents(q) {
    await delay();
    const search = q.search?.trim().toLowerCase();
    return state.events
      .filter(visibleEvent)
      .filter((e) => q.includeDrafts || (e.status !== 'draft' && !e.removed_at))
      .filter((e) => !q.from || e.ends_at >= q.from)
      .filter((e) => !q.to || e.starts_at <= q.to)
      .filter((e) => !q.societyIds || q.societyIds.includes(e.society_id))
      .filter((e) => !q.ids || q.ids.includes(e.id))
      .filter((e) => !q.category || e.category === q.category)
      .filter((e) => !search || e.title.toLowerCase().includes(search) || e.location.toLowerCase().includes(search))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, q.limit ?? 200)
      .map(withSociety);
  },
  async getEvent(id) {
    await delay();
    const e = state.events.find((x) => x.id === id);
    return e && visibleEvent(e) ? withSociety(e) : null;
  },
  async listSocieties(q) {
    await delay();
    const search = q.search?.trim().toLowerCase();
    return state.societies
      .filter((s) => s.status === 'approved')
      .filter((s) => !q.category || s.category === q.category)
      .filter((s) => !search || s.name.toLowerCase().includes(search) || (s.short_name ?? '').toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async getSociety(id) {
    await delay();
    return state.societies.find((s) => s.id === id && (s.status === 'approved' || isMember(id))) ?? null;
  },
  async listCampusDates(from, to) {
    return state.campusDates.filter((d) => d.ends_on >= from && d.starts_on <= to);
  },

  async listPosts(societyId) {
    await delay();
    return state.posts
      .filter((p) => p.society_id === societyId && visiblePost(p))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
      .map(withPostLinks);
  },

  async getPost(id) {
    await delay();
    const p = state.posts.find((x) => x.id === id);
    return p && visiblePost(p) ? withPostLinks(p) : null;
  },

  async myHiddenSocietyIds() {
    return state.user ? [...state.hidden] : [];
  },
  async setSocietyHidden(societyId, hidden) {
    requireUser();
    if (hidden) {
      state.hidden.add(societyId);
      // Mirrors unfollow_hidden_society().
      await this.setFollow(societyId, false);
    } else state.hidden.delete(societyId);
  },
  async mySavedEventIds() {
    return state.user ? [...state.saved] : [];
  },
  async setEventSaved(eventId, saved) {
    requireUser();
    const e = state.events.find((x) => x.id === eventId);
    const was = state.saved.includes(eventId);
    if (saved && !was) {
      // Mirrors the "save a visible event" policy.
      if (!e || !visibleEvent(e) || e.status === 'draft' || e.removed_at) throw new Error('Event not found');
      state.saved.unshift(eventId);
      e.save_count++; // count_event_saves()
    } else if (!saved && was) {
      state.saved = state.saved.filter((id) => id !== eventId);
      if (e) e.save_count = Math.max(0, e.save_count - 1);
    }
  },
  async myLikedPostIds(postIds) {
    return state.user ? postIds.filter((id) => state.liked.has(id)) : [];
  },
  async setPostLiked(postId, liked) {
    requireUser();
    const p = state.posts.find((x) => x.id === postId);
    if (!p || !visiblePost(p) || p.removed_at) throw new Error('Post not found');
    if (liked && !state.liked.has(postId)) {
      state.liked.add(postId);
      p.like_count++;
    } else if (!liked && state.liked.delete(postId)) {
      p.like_count = Math.max(p.like_count - 1, 0);
    }
  },
  async myFollowIds() {
    return state.user ? [...state.follows] : [];
  },
  async setFollow(societyId, follow) {
    requireUser();
    const s = state.societies.find((x) => x.id === societyId)!;
    if (follow && !state.follows.has(societyId)) {
      state.follows.add(societyId);
      s.follower_count++;
    } else if (!follow && state.follows.has(societyId)) {
      state.follows.delete(societyId);
      s.follower_count--;
    }
  },
  async myTickets() {
    await delay();
    if (!state.user) return [];
    return state.registrations
      .filter((r) => r.status !== 'cancelled')
      .map((r) => ({ ...withOrder(r), event: withSociety(state.events.find((e) => e.id === r.event_id)!) }));
  },
  async myRegistration(eventId) {
    const reg = state.registrations.find((r) => r.event_id === eventId && r.user_id === state.user?.id);
    return reg ? withOrder(reg) : null;
  },
  async waitlistPosition(eventId) {
    const e = state.events.find((x) => x.id === eventId)!;
    const mine = state.registrations.find((r) => r.event_id === eventId && r.status === 'waitlisted');
    if (!mine) return 0;
    // Simulated waitlisters were already queued before you joined.
    const simulated = e.waitlist_count - state.registrations.filter((r) => r.event_id === eventId && r.status === 'waitlisted').length;
    return simulated + 1;
  },
  async register(eventId, answer, method) {
    await delay(300);
    const user = requireUser();
    const e = state.events.find((x) => x.id === eventId);
    const now = new Date().toISOString();
    if (!e || e.status !== 'published' || e.removed_at) throw new Error('This event is not open for registration');
    if (!e.registration_required) throw new Error('No sign-up needed for this event, just turn up!');
    if (e.registration_opens_at && now < e.registration_opens_at) throw new Error('Registration has not opened yet');
    if (now > (e.registration_closes_at ?? e.starts_at)) throw new Error('Registration has closed');

    let reg = state.registrations.find((r) => r.event_id === eventId && r.user_id === user.id);
    if (reg && reg.status !== 'cancelled') return reg;
    // Mirrors enforce_members_only().
    if (e.members_only && !isMember(e.society_id) && !isCurrentMember(e.society_id)) {
      throw new Error('This event is for members only. Join the society first.');
    }

    const paymentMethod = ticketPrice(e) == null ? null : (method ?? null);
    if (ticketPrice(e) != null && !paymentMethod) throw new Error('Choose how you will pay');
    releaseUnpaidTickets(e.id);

    let status: Registration['status'];
    if (e.capacity == null || e.confirmed_count < e.capacity) status = 'confirmed';
    else if (e.waitlist_enabled) status = 'waitlisted';
    else throw new Error('Sorry, this event is full');

    if (reg) {
      Object.assign(reg, { status, answer: answer?.trim() || null, payment_method: paymentMethod, checked_in_at: null, created_at: now });
    } else {
      reg = {
        id: uid(),
        event_id: eventId,
        user_id: user.id,
        status,
        ticket_code: uid().slice(5) + uid().slice(5),
        answer: answer?.trim() || null,
        payment_method: paymentMethod,
        checked_in_at: null,
        created_at: now,
      };
      state.registrations.push(reg);
    }
    if (status === 'confirmed') e.confirmed_count++;
    else e.waitlist_count++;
    ensureTicketOrder(reg);
    return reg;
  },
  async cancelRegistration(eventId) {
    await delay(200);
    const reg = state.registrations.find((r) => r.event_id === eventId && r.user_id === state.user?.id);
    dropRegistration(reg?.id ?? null);
  },
  async report(targetType, targetId, reason) {
    requireUser();
    await delay(300);
    const name =
      targetType === 'event'
        ? state.events.find((e) => e.id === targetId)?.title
        : targetType === 'society'
          ? state.societies.find((s) => s.id === targetId)?.name
          : targetType === 'post'
            ? postName(targetId)
            : state.banners.find((b) => b.id === targetId)?.title;
    state.reports.push({
      id: uid(),
      target_type: targetType,
      target_id: targetId,
      target_name: name ?? 'Unknown',
      reason,
      report_count: 1,
      created_at: new Date().toISOString(),
      resolved: false,
    });
  },

  async listNotifications() {
    await delay();
    return state.user ? state.notifications.map((n) => ({ ...n })) : [];
  },
  async unreadNotificationCount() {
    return state.user ? state.notifications.filter((n) => !n.read_at).length : 0;
  },
  async markAllNotificationsRead() {
    const now = new Date().toISOString();
    state.notifications.forEach((n) => (n.read_at ??= now));
  },
  async deleteNotification(id) {
    state.notifications = state.notifications.filter((n) => n.id !== id);
  },
  async registerPushToken() {
    // Demo mode has no server to send pushes from.
  },
  async unregisterPushToken() {},

  async mySocieties() {
    if (!state.user) return [];
    return state.members.map((m) => ({ ...state.societies.find((s) => s.id === m.society_id)!, role: m.role })) as MySociety[];
  },
  async createSociety(input) {
    requireUser();
    const id = uid();
    state.societies.push({
      id,
      name: input.name,
      short_name: input.short_name || null,
      description: input.description,
      category: input.category,
      college: input.college || null,
      logo_url: null,
      cover_url: null,
      instagram: input.instagram || null,
      website: null,
      contact_email: input.contact_email || null,
      status: 'pending',
      verified: false,
      follower_count: 0,
    });
    state.members.push({ society_id: id, role: 'owner' });
    return id;
  },
  async updateSociety(id, patch) {
    if (!isMember(id)) throw new Error('Not allowed');
    Object.assign(
      state.societies.find((s) => s.id === id)!,
      patch,
    );
  },
  async saveEvent(input) {
    await delay(300);
    if (!isMember(input.society_id)) throw new Error('Not allowed');
    if (input.id) {
      const e = state.events.find((x) => x.id === input.id)!;
      const before = { ...e };
      const capacityChanged = e.capacity !== input.capacity;
      Object.assign(e, input);
      if (capacityChanged) fillFromWaitlist(e);
      // Mirrors notify_event_change() in SQL, which skips the person making the edit;
      // in demo mode there is only one person, so these are shown for illustration.
      const registered = state.registrations.some((r) => r.event_id === e.id && r.status !== 'cancelled');
      if (before.status === 'published' && e.status === 'cancelled' && registered) {
        const s = state.societies.find((x) => x.id === e.society_id)!;
        const society = s.short_name ?? s.name;
        notify(
          'event_cancelled',
          t('Event cancelled'),
          t('{title} by {society} has been cancelled.', { title: e.title, society }),
          e.id,
          e.society_id,
        );
      } else if (before.status === 'published' && e.status === 'published' && registered) {
        const time = before.starts_at !== e.starts_at;
        const place = before.location !== e.location;
        if (time || place) {
          const body =
            time && place
              ? t('{title} has a new time and place. Check the details.', { title: e.title })
              : time
                ? t('{title} has a new time. Check the details.', { title: e.title })
                : t('{title} has a new place. Check the details.', { title: e.title });
          notify('event_updated', t('Event details changed'), body, e.id, e.society_id);
        }
      }
      return e.id;
    }
    const id = uid();
    state.events.push({ ...input, id, confirmed_count: 0, waitlist_count: 0, save_count: 0, featured_at: null, removed_at: null });
    return id;
  },
  async deleteEvent(id) {
    state.events = state.events.filter((e) => e.id !== id);
  },
  async listAttendees(eventId) {
    await delay();
    const e = state.events.find((x) => x.id === eventId)!;
    if (!isMember(e.society_id)) throw new Error('Only society committee members can see attendees');
    const real: Attendee[] = state.registrations
      .filter((r) => r.event_id === eventId && r.status !== 'cancelled')
      .map((r) => ({
        registration_id: r.id,
        display_name: state.profile?.display_name ?? 'You',
        email: state.user?.email ?? '',
        college: state.profile?.college ?? null,
        status: r.status,
        answer: r.answer,
        checked_in_at: r.checked_in_at,
        created_at: r.created_at,
      }));
    const checked = state.checkedInFake.get(eventId) ?? new Set();
    const fakeConfirmed = Math.max(0, e.confirmed_count - real.filter((a) => a.status === 'confirmed').length);
    const fakes: Attendee[] = Array.from({ length: Math.min(fakeConfirmed, 40) }, (_, i) => ({
      registration_id: `${eventId}-fake-${i}`,
      display_name: FAKE_NAMES[i % FAKE_NAMES.length],
      email: `student${1155000000 + i}@link.cuhk.edu.hk`,
      college: null,
      status: 'confirmed',
      answer: e.signup_question && i % 3 !== 2 ? FAKE_ANSWERS[i % FAKE_ANSWERS.length] : null,
      checked_in_at: checked.has(i) ? new Date().toISOString() : null,
      created_at: e.starts_at,
    }));
    return [...real, ...fakes];
  },
  async checkIn(eventId, code) {
    await delay(200);
    const e = state.events.find((x) => x.id === eventId)!;
    if (!isMember(e.society_id)) throw new Error('Only society committee members can check people in');
    // Same rules as public.check_in: a rotating QR token, or the 8-character backup code.
    const typed = code.replace(/\s/g, '').toLowerCase();
    const token = parseTicketToken(typed);
    let expired = false;
    let reg: (typeof state.registrations)[number] | undefined;
    if (token) {
      reg = state.registrations.find((r) => tokenIdMatches(token, r.id));
      const verdict = reg ? checkTicketToken(token, reg.ticket_code) : 'bad';
      if (verdict === 'bad') return { ok: false, message: 'Ticket not found' };
      expired = verdict === 'expired';
    } else if (typed.length === 8) {
      reg = state.registrations.find((r) => r.event_id === eventId && r.ticket_code.startsWith(typed));
    } else if (state.registrations.some((r) => r.ticket_code === typed)) {
      return { ok: false, message: 'Old QR code. Ask them to update the app, or type the backup code' };
    }
    if (!reg) return { ok: false, message: 'Ticket not found' };
    const name = state.profile?.display_name ?? 'Student';
    if (reg.event_id !== eventId) return { ok: false, name, message: 'This ticket is for a different event' };
    if (expired) return { ok: false, name, message: 'QR code expired. Ask them to open the ticket in the app, or type the backup code' };
    if (reg.status !== 'confirmed') return { ok: false, name, message: `Ticket is ${reg.status}, not confirmed` };
    const unpaid = unpaidTicket(reg.id);
    if (unpaid) return { ok: false, name, ref: unpaid.ref, message: 'Not paid yet' };
    if (reg.checked_in_at) return { ok: false, name, message: 'Already checked in' };
    reg.checked_in_at = new Date().toISOString();
    return { ok: true, name, message: 'Checked in' };
  },
  async setCheckedIn(registrationId, checked) {
    await delay();
    const fake = registrationId.match(/^(.*)-fake-(\d+)$/);
    if (fake) {
      const set = state.checkedInFake.get(fake[1]) ?? new Set<number>();
      if (checked) set.add(Number(fake[2]));
      else set.delete(Number(fake[2]));
      state.checkedInFake.set(fake[1], set);
      return;
    }
    const reg = state.registrations.find((r) => r.id === registrationId);
    if (!reg) throw new Error('Registration not found');
    if (checked && reg.status !== 'confirmed') throw new Error('Only confirmed attendees can be checked in');
    if (checked && !reg.checked_in_at && unpaidTicket(reg.id)) throw new Error('Not paid yet');
    reg.checked_in_at = checked ? (reg.checked_in_at ?? new Date().toISOString()) : null;
  },
  async listMembers(societyId) {
    await delay();
    const me = state.members.find((m) => m.society_id === societyId);
    if (!state.user || !me) throw new Error('Only committee members can see the committee');
    const self: SocietyMember = {
      user_id: state.user.id,
      display_name: state.profile?.display_name ?? 'You',
      email: state.user.email,
      role: me.role,
      created_at: '2026-08-20T02:00:00Z',
    };
    const order = { owner: 0, admin: 1, editor: 2 };
    return [self, ...(state.committee[societyId] ?? [])].sort((a, b) => order[a.role] - order[b.role]);
  },
  async addMember(societyId, email, role) {
    await delay(300);
    if (!isAdminOf(societyId)) throw new Error('Only society admins can add committee members');
    const e = email.trim().toLowerCase();
    if (!isCuhkEmail(e)) throw new Error('No account for that email yet. Ask them to sign in to the app once, then try again.');
    const list = (state.committee[societyId] ??= []);
    const existing = list.find((m) => m.email === e);
    if (existing) {
      if (existing.role !== 'owner') existing.role = role;
      return;
    }
    const name = e
      .split('@')[0]
      .split(/[._-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    list.push({ user_id: uid(), display_name: name, email: e, role, created_at: new Date().toISOString() });
  },
  async setMemberRole(societyId, userId, role) {
    if (!isAdminOf(societyId)) throw new Error('Only society admins can change roles');
    const m = state.committee[societyId]?.find((x) => x.user_id === userId);
    if (m && m.role !== 'owner') m.role = role;
  },
  async removeMember(societyId, userId) {
    if (userId === state.user?.id) {
      const me = state.members.find((m) => m.society_id === societyId);
      if (me?.role === 'owner') throw new Error('Transfer ownership before leaving');
      state.members = state.members.filter((m) => m.society_id !== societyId);
      return;
    }
    if (!isAdminOf(societyId)) throw new Error('Only society admins can remove members');
    state.committee[societyId] = (state.committee[societyId] ?? []).filter((m) => m.user_id !== userId || m.role === 'owner');
  },
  async transferOwnership(societyId, userId) {
    const me = state.members.find((m) => m.society_id === societyId);
    if (me?.role !== 'owner') throw new Error('Only the owner can transfer ownership');
    const heir = state.committee[societyId]?.find((m) => m.user_id === userId);
    if (!heir) throw new Error('The new owner must already be on the committee');
    heir.role = 'owner';
    me.role = 'admin';
  },
  async societyBanners(societyId) {
    return state.banners.filter((b) => b.society_id === societyId);
  },
  async requestBanner(input) {
    if (!isMember(input.society_id)) throw new Error('Not allowed');
    state.banners.push({ ...input, id: uid(), priority: 0, status: 'pending' });
  },
  async deleteBanner(id) {
    state.banners = state.banners.filter((b) => b.id !== id);
  },
  async savePost(input) {
    requireUser();
    await delay(250);
    const body = input.body.trim();
    if (!isMember(input.society_id)) throw new Error('Not allowed');
    if (!body || body.length > 2000) throw new Error('Write something to post (up to 2000 characters).');
    if (input.image_urls.length > 4) throw new Error('Add up to 4 photos.');
    if (input.event_id && state.events.find((e) => e.id === input.event_id)?.society_id !== input.society_id)
      throw new Error('Not allowed');
    // Mirrors _society_post_write(): one pinned post per society.
    if (input.pinned) state.posts.filter((p) => p.society_id === input.society_id).forEach((p) => (p.pinned = false));
    if (input.id) {
      const p = committeePost(input.id);
      if (p.body !== body || p.image_urls.join() !== input.image_urls.join()) p.edited_at = new Date().toISOString();
      Object.assign(p, { body, image_urls: input.image_urls, event_id: input.event_id, pinned: input.pinned });
      return p.id;
    }
    const post: DemoPost = {
      id: uid(),
      society_id: input.society_id,
      body,
      image_urls: input.image_urls,
      event_id: input.event_id,
      pinned: input.pinned,
      like_count: 0,
      created_at: new Date().toISOString(),
      edited_at: null,
      removed_at: null,
    };
    state.posts.unshift(post);
    return post.id;
  },
  async setPostPinned(id, pinned) {
    const p = committeePost(id);
    if (pinned) state.posts.filter((x) => x.society_id === p.society_id).forEach((x) => (x.pinned = false));
    p.pinned = pinned;
  },
  async deletePost(id) {
    committeePost(id);
    state.posts = state.posts.filter((p) => p.id !== id);
    state.liked.delete(id);
  },
  async uploadImage(localUri) {
    // Demo mode keeps the local file URI; it only lives on this device.
    return localUri;
  },

  async listPlans(societyId) {
    await delay();
    return state.plans
      .filter((p) => p.society_id === societyId && (p.is_open || isMember(societyId)))
      .sort((a, b) => b.valid_until.localeCompare(a.valid_until));
  },
  async myMemberships() {
    await delay();
    if (!state.user) return [];
    return state.memberships
      .filter((m) => m.user_id === state.user!.id && (m.status === 'pending' || m.status === 'active'))
      .map((m) => ({ ...m, plan: state.plans.find((p) => p.id === m.plan_id)!, society: societyCard(m.society_id) }));
  },
  async joinSociety(input) {
    await delay(300);
    const user = requireUser();
    const plan = state.plans.find((p) => p.id === input.plan_id);
    if (!plan) throw new Error('This membership is not available');
    if (!plan.is_open || todayHK() > plan.valid_until) throw new Error('This society is not taking new members right now');
    if (!input.full_name.trim()) throw new Error('Enter your full name');
    if (input.student_id.trim() && !/^\d{10}$/.test(input.student_id.trim())) throw new Error('A student ID has 10 digits');
    if (plan.price_hkd > 0 && !input.payment_method) throw new Error('Choose how you will pay');
    let m = state.memberships.find((x) => x.plan_id === plan.id && x.user_id === user.id);
    if (m && (m.status === 'pending' || m.status === 'active')) return m;
    const fields = {
      status: 'pending' as const,
      full_name: input.full_name.trim(),
      student_id: input.student_id.trim() || null,
      college: input.college || null,
      major: input.major.trim() || null,
      phone: input.phone.trim() || null,
      answers: input.answers,
      payment_method: plan.price_hkd > 0 ? input.payment_method : null,
      consent_at: new Date().toISOString(),
      claimed_paid_at: null,
      paid_at: null,
      receipt_path: null,
      receipt_at: null,
      created_at: new Date().toISOString(),
    };
    if (m) Object.assign(m, fields);
    else {
      m = {
        id: uid(),
        plan_id: plan.id,
        society_id: plan.society_id,
        user_id: user.id,
        member_no: null,
        card_code: uid().slice(5) + uid().slice(5) + uid().slice(5),
        email: user.email,
        imported: false,
        ...fields,
      };
      state.memberships.unshift(m);
    }
    if (plan.price_hkd === 0 && plan.auto_approve) activateMembership(m);
    return { ...m };
  },
  async claimMembershipPaid(id) {
    const m = state.memberships.find((x) => x.id === id && x.user_id === state.user?.id && x.status === 'pending' && !x.paid_at);
    if (!m) throw new Error('Membership not found');
    m.claimed_paid_at = new Date().toISOString();
  },
  async cancelMembership(id) {
    const m = state.memberships.find((x) => x.id === id && x.user_id === state.user?.id && ['pending', 'active'].includes(x.status));
    if (!m) throw new Error('Membership not found');
    m.status = 'cancelled';
  },
  async savePlan(input) {
    await delay(300);
    if (!isAdminOf(input.society_id)) throw new Error('Only society admins can change memberships');
    if (input.id) {
      Object.assign(
        state.plans.find((p) => p.id === input.id)!,
        input,
      );
      return input.id;
    }
    const plan: MembershipPlan = { ...input, id: uid(), created_at: new Date().toISOString() };
    state.plans.push(plan);
    // Mirrors notify_membership_renewal(): current members not yet on the new plan are asked to renew.
    if (plan.is_open && isCurrentMember(plan.society_id)) {
      const s = state.societies.find((x) => x.id === plan.society_id)!;
      notify(
        'membership_renewal',
        t('Time to renew'),
        t('{society} has opened {plan}. Renew to keep your member card.', { society: s.short_name ?? s.name, plan: plan.name }),
        null,
        s.id,
      );
    }
    return plan.id;
  },
  async deletePlan(id) {
    const plan = state.plans.find((p) => p.id === id);
    if (!plan || !isAdminOf(plan.society_id)) throw new Error('Only society admins can change memberships');
    state.plans = state.plans.filter((p) => p.id !== id);
    state.memberships = state.memberships.filter((m) => m.plan_id !== id);
  },
  async listMemberships(societyId) {
    await delay();
    if (!isMember(societyId)) throw new Error('Only committee members can see the member list');
    return state.memberships.filter((m) => m.society_id === societyId).map((m) => ({ ...m }));
  },
  async setMembershipStatus(ids, status) {
    await delay(200);
    let n = 0;
    for (const m of state.memberships.filter((x) => ids.includes(x.id))) {
      if (!isAdminOf(m.society_id)) throw new Error('Only society admins can change memberships');
      if (status === 'active') {
        const plan = state.plans.find((p) => p.id === m.plan_id)!;
        if (plan.price_hkd > 0) m.paid_at ??= new Date().toISOString();
        activateMembership(m);
      } else {
        m.status = status;
        if (status === 'pending') {
          // "Not received": back to unpaid, so the member sees the payment screen again.
          m.paid_at = null;
          m.claimed_paid_at = null;
        }
      }
      n++;
    }
    return n;
  },
  async importMemberships(planId, rows) {
    await delay(400);
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan || !isAdminOf(plan.society_id)) throw new Error('Only society admins can import members');
    if (rows.length > 2000) throw new Error('Import up to 2000 rows at a time');
    let n = 0;
    for (const r of rows) {
      const sid = (r.student_id ?? '').replace(/\D/g, '');
      const email = (r.email?.trim().toLowerCase() || (sid ? `${sid}@link.cuhk.edu.hk` : '')).trim();
      if (!email || !r.full_name?.trim()) continue;
      const userId = state.user && email === state.user.email ? state.user.id : null;
      if (state.memberships.some((m) => m.plan_id === planId && ((userId && m.user_id === userId) || m.email.toLowerCase() === email)))
        continue;
      const m: Membership = {
        id: uid(),
        plan_id: planId,
        society_id: plan.society_id,
        user_id: userId,
        status: 'pending',
        member_no: null,
        card_code: uid().slice(5) + uid().slice(5) + uid().slice(5),
        full_name: r.full_name.trim().slice(0, 80),
        email,
        student_id: /^\d{10}$/.test(sid) ? sid : null,
        college: r.college?.trim() || null,
        major: r.major?.trim().slice(0, 80) || null,
        phone: r.phone?.trim().slice(0, 30) || null,
        answers: [],
        payment_method: null,
        consent_at: null,
        claimed_paid_at: null,
        paid_at: null,
        imported: true,
        receipt_path: null,
        receipt_at: null,
        created_at: new Date().toISOString(),
      };
      state.memberships.unshift(m);
      activateMembership(m);
      n++;
    }
    return n;
  },
  async logMembershipExport(societyId) {
    if (!isMember(societyId)) throw new Error('Only committee members can export the member list');
  },
  async checkMemberCard(societyId, code) {
    await delay(200);
    if (!isMember(societyId)) throw new Error('Only society committee members can check member cards');
    const typed = code.trim().match(/^#?(\d{1,6})$/);
    const m = typed
      ? state.memberships
          .filter((x) => x.society_id === societyId && x.member_no === Number(typed[1]))
          .sort((a, b) => planUntil(b).localeCompare(planUntil(a)))[0]
      : state.memberships.find((x) => x.card_code === code.trim().toLowerCase());
    if (!m) return { ok: false, message: 'Member card not found' };
    const plan = state.plans.find((p) => p.id === m.plan_id)!;
    if (m.society_id !== societyId) return { ok: false, name: m.full_name, message: 'This card is for a different society' };
    if (m.status !== 'active') return { ok: false, name: m.full_name, message: 'This membership is not active' };
    if (todayHK() > plan.valid_until)
      return { ok: false, name: m.full_name, message: 'This membership has expired', valid_until: plan.valid_until };
    return {
      ok: true,
      name: m.full_name,
      message: 'Active member',
      member_no: m.member_no ?? undefined,
      valid_until: plan.valid_until,
      plan: plan.name,
    };
  },

  async getPaymentSettings(societyId) {
    return state.paymentSettings.find((p) => p.society_id === societyId) ?? null;
  },
  async listProducts(societyId) {
    await delay();
    const now = new Date().toISOString();
    return state.products
      .filter((p) =>
        societyId
          ? p.society_id === societyId && (p.status !== 'draft' || isMember(societyId))
          : p.status === 'published' && (!p.closes_at || p.closes_at > now),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ ...p, sold: productSold(p.id), alert: state.alerts.has(p.id), society: societyCard(p.society_id) }));
  },
  async placeBagOrder(societyId, bagLines, method, slotId, note) {
    await delay(300);
    const user = requireUser();
    const now = new Date().toISOString();
    if (!['fps', 'payme', 'cash', 'online'].includes(method)) throw new Error('Choose how you will pay');
    if (method === 'online' && !onlineReady(societyId)) throw new Error('This society does not take online payments yet');
    const lines = bagLines.filter((l) => l.qty > 0);
    if (!lines.length) throw new Error('Choose at least one item');
    const member = isCurrentMember(societyId);
    const taken = new Map<string, Record<string, number>>();
    const perProduct = new Map<string, number>();
    const out: Order['items'] = [];
    const titles: string[] = [];
    let total = 0;
    let anyMember = false;
    let window = Infinity;
    for (const l of lines) {
      const p = state.products.find((x) => x.id === l.product_id);
      if (!p || p.society_id !== societyId || p.status !== 'published') throw new Error('This item is not on sale');
      if (p.opens_at && now < p.opens_at) throw new Error('Orders have not opened yet');
      if (p.closes_at && now > p.closes_at) throw new Error('Orders have closed');
      const v = p.variants.find((x) => x.name === l.variant);
      if (!v) throw new Error('Choose a size');
      const sold = taken.get(p.id) ?? productSold(p.id);
      if (v.stock != null && (sold[v.name] ?? 0) + l.qty > v.stock) throw new Error('Not enough stock left');
      taken.set(p.id, { ...sold, [v.name]: (sold[v.name] ?? 0) + l.qty });
      const per = (perProduct.get(p.id) ?? 0) + l.qty;
      perProduct.set(p.id, per);
      if (per > p.max_per_order) throw new Error('That is more than the limit per order');
      if (p.max_per_buyer != null) {
        const mine = state.orders
          .filter((o) => o.user_id === user.id && holdsStock(o))
          .flatMap((o) => o.items.filter((i) => (i.product_id ?? o.product_id) === p.id))
          .reduce((n, i) => n + i.qty, 0);
        if (mine + per > p.max_per_buyer) throw new Error('You have reached the limit for this item');
      }
      const isMemberPrice = member && p.member_price_hkd != null;
      anyMember ||= isMemberPrice;
      const unit = unitPrice(p, v.name, member);
      total += unit * l.qty;
      out.push({ product_id: p.id, title: p.title, variant: v.name, qty: l.qty, unit_price: unit });
      if (!titles.includes(p.title)) titles.push(p.title);
      window = Math.min(window, p.payment_window_hours);
    }
    if (slotId) checkSlot(slotId, societyId);
    // Mirrors prepare_fair_order(): one fair per order, the booth must be confirmed, presale open.
    const lineProducts = out.map((i) => state.products.find((x) => x.id === i.product_id)!);
    const fairIds = [...new Set(lineProducts.map((p) => p.fair_id ?? null))];
    if (fairIds.length > 1) throw new Error('Check out fair presale items on their own');
    const fair = fairIds[0] ? state.fairs.find((f) => f.id === fairIds[0]) : null;
    if (fair) {
      if (!hasBooth(fair.id, societyId)) throw new Error('This item is not on sale');
      if ((fair.presale_closes_at ?? fair.ends_at) < now) throw new Error('Presale for this fair has closed');
    }
    out.forEach((i, n) => {
      if (lineProducts[n].kind === 'voucher') i.kind = 'voucher';
    });
    const vouchers = out.filter((i) => i.kind === 'voucher').reduce((n, i) => n + i.qty, 0);
    const s = state.societies.find((x) => x.id === societyId)!;
    const prefix = ((s.short_name ?? s.name).replace(/[^A-Za-z]/g, '') || 'CS').slice(0, 3).toUpperCase();
    const order: Order & { buyer_name: string; buyer_email: string } = {
      id: uid(),
      society_id: societyId,
      product_id: perProduct.size === 1 ? out[0].product_id! : null,
      user_id: user.id,
      ref: `${prefix}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      product_title: titles.join(', '),
      items: out,
      total_hkd: total,
      member_price: anyMember,
      status: total === 0 ? 'paid' : 'awaiting_payment',
      payment_method: method,
      buyer_note: note?.trim() || null,
      pickup_code: uid().slice(5) + uid().slice(5) + uid().slice(5),
      expires_at:
        total > 0 && method !== 'cash' ? new Date(Date.now() + (method === 'online' ? 0.5 : window) * 3600_000).toISOString() : null,
      claimed_at: null,
      paid_at: total === 0 ? now : null,
      ready_at: null,
      collected_at: null,
      cancelled_at: null,
      event_id: null,
      registration_id: null,
      receipt_path: null,
      receipt_at: null,
      pickup_slot_id: slotId,
      fair_id: fair?.id ?? null,
      vouchers_total: vouchers,
      vouchers_used: 0,
      created_at: now,
      buyer_name: state.profile?.display_name || user.email,
      buyer_email: user.email,
    };
    state.orders.unshift(order);
    const { buyer_name: _n, buyer_email: _e, ...plain } = order;
    return plain;
  },
  async listPickupSlots(societyId) {
    await delay();
    const cutoff = new Date(Date.now() - 86400_000).toISOString();
    return state.pickupSlots
      .filter((s) => s.society_id === societyId && (s.ends_at > cutoff || isMember(societyId)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map(withBooked);
  },
  async choosePickupSlot(orderId, slotId) {
    await delay(200);
    const o = state.orders.find((x) => x.id === orderId && x.user_id === state.user?.id);
    if (!o) throw new Error('Order not found');
    if (o.event_id || !['awaiting_payment', 'payment_claimed', 'paid', 'ready'].includes(o.status) || !holdsStock(o)) {
      throw new Error('This order can no longer change its pickup time');
    }
    checkSlot(slotId, o.society_id, o.id);
    o.pickup_slot_id = slotId;
  },
  async setProductAlert(productId, on) {
    requireUser();
    if (on) state.alerts.add(productId);
    else state.alerts.delete(productId);
  },
  async myOrders() {
    await delay();
    if (!state.user) return [];
    return state.orders
      .filter((o) => o.user_id === state.user!.id)
      .map(({ buyer_name: _n, buyer_email: _e, ...o }) => ({
        ...o,
        society: societyCard(o.society_id),
        pickup_slot: state.pickupSlots.find((s) => s.id === o.pickup_slot_id) ?? null,
      }));
  },
  async claimOrderPaid(id, note) {
    const o = state.orders.find((x) => x.id === id && x.user_id === state.user?.id);
    if (!o) throw new Error('Order not found');
    if (o.payment_method === 'online') throw new Error('Online payments are confirmed automatically');
    if (o.status !== 'awaiting_payment') throw new Error('This order is not waiting for payment');
    if (!holdsStock(o)) throw new Error('This order expired. Please order again.');
    o.status = 'payment_claimed';
    o.claimed_at = new Date().toISOString();
    if (note?.trim()) o.buyer_note = note.trim();
  },
  async cancelMyOrder(id) {
    const o = state.orders.find((x) => x.id === id && x.user_id === state.user?.id);
    if (!o || !['awaiting_payment', 'payment_claimed'].includes(o.status)) {
      throw new Error('This order can no longer be cancelled here. Contact the society.');
    }
    o.status = 'cancelled';
    o.cancelled_at = new Date().toISOString();
    dropRegistration(o.registration_id);
  },
  async uploadReceipt(kind, record, jpegUri) {
    await delay(400);
    const user = requireUser();
    const path = receiptPath(kind, record.society_id, record.id);
    const now = new Date().toISOString();
    if (kind === 'order') {
      const o = state.orders.find((x) => x.id === record.id && x.user_id === user.id);
      if (!o) throw new Error('Order not found');
      if (o.status !== 'awaiting_payment' && o.status !== 'payment_claimed') throw new Error('This order is not waiting for payment');
      if (!holdsStock(o)) throw new Error('This order expired. Please order again.');
      Object.assign(o, { receipt_path: path, receipt_at: now, status: 'payment_claimed', claimed_at: o.claimed_at ?? now });
    } else {
      const m = state.memberships.find((x) => x.id === record.id && x.user_id === user.id && x.status === 'pending');
      if (!m) throw new Error('Membership not found');
      Object.assign(m, { receipt_path: path, receipt_at: now, claimed_paid_at: m.claimed_paid_at ?? now });
    }
    state.receipts.set(path, jpegUri);
  },
  async receiptUrl(path) {
    const uri = state.receipts.get(path);
    if (!uri) throw new Error('This screenshot was deleted after the payment was settled.');
    return uri;
  },
  async onlinePaymentsReady(societyId) {
    return onlineReady(societyId);
  },
  async startOnlinePayment(orderId) {
    await delay(500);
    // No payment page in the demo: the "provider" confirms straight away.
    const o = state.orders.find((x) => x.id === orderId && x.user_id === state.user?.id);
    if (!o) throw new Error('Order not found');
    if (o.payment_method !== 'online') throw new Error('This order is paid another way');
    if (o.status !== 'awaiting_payment') throw new Error('This order is not waiting for payment');
    if (!holdsStock(o)) throw new Error('This order expired. Please order again.');
    o.status = 'paid';
    o.paid_at = new Date().toISOString();
    o.platform_fee_hkd = platformFeeHkd(o.total_hkd, state.platformFee);
    notifyOrder(o);
    return null;
  },
  async platformFee() {
    return state.platformFee;
  },
  async payoutAccount(societyId) {
    if (!isMember(societyId)) return null;
    return state.payoutAccounts.find((a) => a.society_id === societyId) ?? null;
  },
  async startPayoutSetup(societyId) {
    await delay(500);
    if (!isAdminOf(societyId)) throw new Error('Only society admins can set up online payments');
    if (!state.payoutAccounts.some((a) => a.society_id === societyId)) {
      state.payoutAccounts.push({
        society_id: societyId,
        provider: 'stripe',
        account_id: 'acct_' + uid().slice(5),
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements_due: 0,
        disabled_reason: null,
        updated_at: new Date().toISOString(),
      });
    }
    return null;
  },
  async refreshPayoutAccount(societyId) {
    return state.payoutAccounts.find((a) => a.society_id === societyId) ?? null;
  },
  async payoutDashboardUrl() {
    return null;
  },
  async refundOnlineOrder(orderId) {
    await delay(400);
    const o = state.orders.find((x) => x.id === orderId);
    if (!o || !isAdminOf(o.society_id)) throw new Error('Only society admins can confirm payments');
    if (o.payment_method !== 'online' || !['paid', 'ready', 'collected'].includes(o.status)) {
      throw new Error('That change is not possible for this order');
    }
    o.status = 'refunded';
    o.cancelled_at = new Date().toISOString();
    notifyOrder(o);
  },
  async setPaymentSettings(societyId, s) {
    if (!isAdminOf(societyId)) throw new Error('Only society admins can change payment details');
    const clean = (v: string | null) => v?.trim() || null;
    const row: PaymentSettings = {
      society_id: societyId,
      fps_id: clean(s.fps_id),
      payee_name: clean(s.payee_name),
      payme_link: clean(s.payme_link),
      instructions: clean(s.instructions),
      updated_at: new Date().toISOString(),
    };
    state.paymentSettings = [...state.paymentSettings.filter((p) => p.society_id !== societyId), row];
  },
  async saveProduct(input) {
    await delay(300);
    if (!isMember(input.society_id)) throw new Error('Not allowed');
    // Mirrors check_product_fair().
    const before = input.id ? state.products.find((x) => x.id === input.id) : null;
    if (input.fair_id && input.fair_id !== before?.fair_id && !hasBooth(input.fair_id, input.society_id)) {
      throw new Error('Your society needs a confirmed booth at this fair first');
    }
    if (input.id) {
      const p = state.products.find((x) => x.id === input.id)!;
      // Mirrors notify_product_alerts(): published, or more stock on any size.
      const more = input.variants.some((nv) => {
        const ov = p.variants.find((v) => v.name === nv.name);
        return !ov || (nv.stock == null && ov.stock != null) || (nv.stock ?? 0) > (ov.stock ?? Infinity);
      });
      if (input.status === 'published' && (p.status !== 'published' || more) && state.alerts.has(p.id)) {
        state.alerts.delete(p.id);
        notify(
          'product_available',
          t('Back on sale'),
          t('{title} is available again. Get it before it goes.', { title: input.title }),
          null,
          p.society_id,
        );
      }
      Object.assign(p, input);
      return input.id;
    }
    const id = uid();
    state.products.push({ ...input, id, created_at: new Date().toISOString() });
    return id;
  },
  async savePickupSlot(input) {
    await delay(200);
    if (!isMember(input.society_id)) throw new Error('Not allowed');
    if (input.ends_at <= input.starts_at) throw new Error('The end must be after the start');
    if (input.id) {
      const slot = state.pickupSlots.find((s) => s.id === input.id)!;
      const moved = slot.starts_at !== input.starts_at || slot.ends_at !== input.ends_at || slot.location !== input.location;
      Object.assign(slot, input);
      if (moved) notifySlotChange(slot, false);
      return input.id;
    }
    const id = uid();
    state.pickupSlots.push({ ...input, id });
    return id;
  },
  async deletePickupSlot(id) {
    const slot = state.pickupSlots.find((s) => s.id === id);
    if (!slot || !isMember(slot.society_id)) throw new Error('Not allowed');
    notifySlotChange(slot, true);
    state.pickupSlots = state.pickupSlots.filter((s) => s.id !== id);
    for (const o of state.orders) if (o.pickup_slot_id === id) o.pickup_slot_id = null;
  },
  async deleteProduct(id) {
    state.products = state.products.filter((p) => p.id !== id);
  },
  async listOrders(societyId) {
    await delay();
    if (!isMember(societyId)) throw new Error('Only committee members can see orders');
    return state.orders
      .filter((o) => o.society_id === societyId)
      .map((o) => ({ ...o, expired: o.status === 'awaiting_payment' && !holdsStock(o) })) as SocietyOrder[];
  },
  async setOrderStatus(ids, status) {
    await delay(200);
    let n = 0;
    const now = new Date().toISOString();
    for (const o of state.orders.filter((x) => ids.includes(x.id))) {
      const payment = ['awaiting_payment', 'paid', 'cancelled', 'refunded'].includes(status);
      if (!isMember(o.society_id) || (payment && !isAdminOf(o.society_id))) throw new Error('Only society admins can confirm payments');
      if (o.status === status) continue;
      if (o.payment_method === 'online') {
        if (['paid', 'awaiting_payment'].includes(status)) throw new Error('Online payments are confirmed automatically');
        if (status === 'refunded' || (status === 'cancelled' && o.status !== 'awaiting_payment')) {
          throw new Error('Refund online payments with the Refund button');
        }
      }
      const ok =
        (status === 'paid' && ['awaiting_payment', 'payment_claimed'].includes(o.status)) ||
        (status === 'awaiting_payment' && o.status === 'payment_claimed') ||
        (status === 'ready' && o.status === 'paid') ||
        (status === 'collected' && ['paid', 'ready'].includes(o.status)) ||
        (status === 'cancelled' && ['awaiting_payment', 'payment_claimed', 'paid', 'ready'].includes(o.status)) ||
        (status === 'refunded' && ['paid', 'ready', 'collected'].includes(o.status));
      if (!ok) throw new Error('That change is not possible for this order');
      if (o.event_id && (status === 'ready' || status === 'collected')) {
        throw new Error('This is an event ticket. Check it in from the event instead.');
      }
      o.status = status;
      if (status === 'paid') o.paid_at = now;
      if (status === 'ready') o.ready_at = now;
      if (status === 'collected') o.collected_at = now;
      if (status === 'cancelled' || status === 'refunded') o.cancelled_at = now;
      if (status === 'awaiting_payment') {
        o.claimed_at = null;
        if (o.payment_method !== 'cash') o.expires_at = new Date(Date.now() + 48 * 3600_000).toISOString();
      }
      notifyOrder(o);
      if (status === 'cancelled' || status === 'refunded') dropRegistration(o.registration_id);
      n++;
    }
    return n;
  },
  async collectOrder(societyId, code, cashReceived, vouchers) {
    await delay(200);
    if (!isMember(societyId)) throw new Error('Only society committee members can hand out orders');
    const o = state.orders.find(
      (x) => x.pickup_code === code.trim().toLowerCase() || (x.society_id === societyId && x.ref === code.trim().toUpperCase()),
    );
    if (!o) return { ok: false, message: 'Order not found' };
    if (o.society_id !== societyId) return { ok: false, name: o.buyer_name, message: 'This order is for a different society' };
    const mixed = new Set(o.items.map((i) => i.title ?? o.product_title)).size > 1;
    const lines = o.items.map((i) => `${mixed ? `${i.title} ` : ''}${i.variant ? i.variant + ' ' : ''}×${i.qty}`).join(', ');
    const slot = state.pickupSlots.find((s) => s.id === o.pickup_slot_id);
    const total = o.vouchers_total ?? 0;
    const used = o.vouchers_used ?? 0;
    const base = {
      name: o.buyer_name,
      ref: o.ref,
      items: mixed ? lines : `${o.product_title} · ${lines}`,
      slot: slot ? slotLabel(slot) : null,
      total_hkd: o.total_hkd,
      payment_method: o.payment_method,
      vouchers_total: total,
      vouchers_left: total - used,
    };
    if (o.event_id) return { ...base, ok: false, message: 'This is an event ticket. Check it in from the event instead.' };
    if (o.status === 'collected') {
      return { ...base, ok: false, message: total ? 'All vouchers used' : 'Already collected', collected_at: o.collected_at ?? undefined };
    }
    const now = new Date().toISOString();
    let cashTaken = false;
    if (o.status === 'awaiting_payment' && o.payment_method === 'cash' && cashReceived) {
      if (!total) {
        Object.assign(o, { status: 'collected', paid_at: now, collected_at: now });
        return { ...base, ok: true, message: 'Cash taken and collected' };
      }
      Object.assign(o, { status: 'paid', paid_at: now });
      cashTaken = true;
    }
    if (o.status !== 'paid' && o.status !== 'ready') {
      const message =
        o.status === 'awaiting_payment' && o.payment_method === 'cash'
          ? 'Take cash'
          : o.status === 'cancelled' || o.status === 'refunded'
            ? 'This order was cancelled'
            : 'Not paid yet';
      return { ...base, ok: false, message };
    }
    if (total) {
      const left = total - used;
      if (vouchers == null) return { ...base, ok: false, cash_taken: cashTaken, message: 'How many vouchers?' };
      if (vouchers < 1 || vouchers > left) return { ...base, ok: false, message: 'Not that many vouchers left' };
      o.vouchers_used = used + vouchers;
      if (vouchers === left) Object.assign(o, { status: 'collected', collected_at: now });
      return { ...base, ok: true, message: 'Vouchers used', used_now: vouchers, vouchers_left: left - vouchers };
    }
    o.status = 'collected';
    o.collected_at = now;
    return { ...base, ok: true, message: 'Collected' };
  },

  async listFairs() {
    await delay();
    const now = Date.now();
    return state.fairs
      .filter(canSeeFair)
      .filter((f) => new Date(f.ends_at).getTime() > now - (isMember(f.organiser_society_id) ? 30 * 86400_000 : 0))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map(fairCard);
  },
  async getFair(id) {
    await delay();
    const f = state.fairs.find((x) => x.id === id);
    if (!f || !canSeeFair(f)) return null;
    const organiser = isMember(f.organiser_society_id);
    const booths = state.booths
      .filter((b) => b.fair_id === id && ((b.status === 'approved' && f.status === 'approved') || organiser || isMember(b.society_id)))
      .map((b) => ({ ...b, society: societyCard(b.society_id) }))
      .sort(
        (a, b) =>
          Number(a.status !== 'pending') - Number(b.status !== 'pending') ||
          (a.label ?? '~').localeCompare(b.label ?? '~') ||
          a.society.name.localeCompare(b.society.name),
      );
    return { ...fairCard(f), booths };
  },
  async listFairProducts(fairId) {
    await delay();
    return state.products
      .filter((p) => p.fair_id === fairId && p.status === 'published' && hasBooth(fairId, p.society_id))
      .map((p) => ({
        ...p,
        sold: productSold(p.id),
        alert: state.alerts.has(p.id),
        booth: state.booths.find((b) => b.fair_id === fairId && b.society_id === p.society_id)?.label ?? null,
        society: societyCard(p.society_id),
      }))
      .sort((a, b) => (a.booth ?? '~').localeCompare(b.booth ?? '~') || a.created_at.localeCompare(b.created_at));
  },
  async saveFair(input) {
    await delay(300);
    const now = new Date().toISOString();
    const { id, organiser_society_id, ...fields } = input;
    if (fields.ends_at <= fields.starts_at) throw new Error('The fair must end after it starts');
    if (id) {
      const f = state.fairs.find((x) => x.id === id);
      if (!f || !isAdminOf(f.organiser_society_id)) throw new Error('Only the organiser can change this fair');
      Object.assign(f, fields, { status: f.status === 'rejected' ? 'pending' : f.status });
      return id;
    }
    if (!isAdminOf(organiser_society_id)) throw new Error('Only society admins can organise a fair');
    const newId = uid();
    state.fairs.push({
      ...fields,
      id: newId,
      organiser_society_id,
      status: state.profile?.is_platform_admin ? 'approved' : 'pending',
      created_at: now,
    });
    state.booths.push({
      id: uid(),
      fair_id: newId,
      society_id: organiser_society_id,
      label: null,
      status: 'approved',
      note: null,
      created_at: now,
    });
    return newId;
  },
  async applyForBooth(fairId, societyId, note) {
    await delay(300);
    if (!isAdminOf(societyId)) throw new Error('Only society admins can ask for a booth');
    const f = state.fairs.find((x) => x.id === fairId && x.status === 'approved');
    if (!f) throw new Error('Fair not found');
    if (!f.booths_open || f.ends_at < new Date().toISOString()) throw new Error('This fair is not taking booth requests');
    const status = isAdminOf(f.organiser_society_id) ? 'approved' : 'pending';
    const b = state.booths.find((x) => x.fair_id === fairId && x.society_id === societyId);
    if (b) {
      b.note = note?.trim() || null;
      if (b.status === 'rejected') b.status = 'pending';
      return;
    }
    state.booths.push({
      id: uid(),
      fair_id: fairId,
      society_id: societyId,
      label: null,
      status,
      note: note?.trim() || null,
      created_at: new Date().toISOString(),
    });
  },
  async reviewBooth(boothId, status, label) {
    await delay(200);
    const b = state.booths.find((x) => x.id === boothId);
    const f = b && state.fairs.find((x) => x.id === b.fair_id);
    if (!b || !f || !isAdminOf(f.organiser_society_id)) throw new Error('Only the organiser can review booths');
    const was = b.status;
    Object.assign(b, { status, label: label?.trim() || null });
    if (status !== was && status !== 'pending' && isMember(b.society_id)) {
      notify(
        'fair_update',
        status === 'approved' ? t('Booth confirmed') : t('Booth request declined'),
        status === 'approved'
          ? t('You have a booth at {fair}. Add presale items and food vouchers from your shop.', { fair: f.name })
          : t('{fair} could not give you a booth this time.', { fair: f.name }),
        null,
        b.society_id,
      );
    }
  },
  async societyBooths(societyId) {
    await delay();
    return state.booths
      .filter((b) => b.society_id === societyId)
      .map((b) => ({ ...b, fair: state.fairs.find((f) => f.id === b.fair_id)! }))
      .filter((b) => b.fair && canSeeFair(b.fair))
      .sort((a, b) => a.fair.starts_at.localeCompare(b.fair.starts_at));
  },
  async fairSales(fairId) {
    await delay();
    const f = state.fairs.find((x) => x.id === fairId);
    if (!f || !(isMember(f.organiser_society_id) || state.profile?.is_platform_admin)) {
      throw new Error('Only the organiser can see fair sales');
    }
    return state.booths
      .filter((b) => b.fair_id === fairId && b.status === 'approved')
      .map((b) => {
        const orders = state.orders.filter(
          (o) => o.fair_id === fairId && o.society_id === b.society_id && ['paid', 'ready', 'collected'].includes(o.status),
        );
        return {
          society_id: b.society_id,
          society_name: state.societies.find((s) => s.id === b.society_id)?.name ?? '',
          booth: b.label,
          orders: orders.length,
          sales_hkd: orders.reduce((n, o) => n + o.total_hkd, 0),
          vouchers_sold: orders.reduce((n, o) => n + (o.vouchers_total ?? 0), 0),
          vouchers_used: orders.reduce((n, o) => n + (o.vouchers_used ?? 0), 0),
          collected: orders.filter((o) => o.status === 'collected').length,
        };
      })
      .sort((a, b) => b.sales_hkd - a.sales_hkd || a.society_name.localeCompare(b.society_name));
  },
  async pendingFairs() {
    return state.fairs.filter((f) => f.status === 'pending').map(fairCard);
  },
  async reviewFair(id, status) {
    if (!state.profile?.is_platform_admin) throw new Error('Only platform admins can review fairs');
    const f = state.fairs.find((x) => x.id === id);
    if (!f) throw new Error('Fair not found');
    f.status = status;
    if (isMember(f.organiser_society_id)) {
      notify(
        'fair_update',
        status === 'approved' ? t('Fair approved') : t('Fair not approved'),
        status === 'approved'
          ? t('{fair} is listed. Societies can now ask for a booth.', { fair: f.name })
          : t('{fair} was not approved. Edit it and it will be checked again.', { fair: f.name }),
        null,
        f.organiser_society_id,
      );
    }
  },

  async pendingSocieties() {
    return state.societies.filter((s) => s.status === 'pending');
  },
  async pendingBanners() {
    return state.banners
      .filter((b) => b.status === 'pending')
      .map((b) => ({
        ...b,
        society: summary(state.societies.find((s) => s.id === b.society_id)!),
        event: state.events.find((e) => e.id === b.event_id) ?? null,
      }));
  },
  async reviewSociety(id, status, verified) {
    const s = state.societies.find((x) => x.id === id)!;
    const wasApproved = s.status === 'approved';
    Object.assign(s, { status, verified });
    if (status === 'approved' && !wasApproved && isMember(id)) {
      notify('society_approved', t('Your society is live'), t('{name} is now visible to every student.', { name: s.name }), null, id);
    }
  },
  async reviewBanner(id, status, priority) {
    Object.assign(
      state.banners.find((b) => b.id === id)!,
      { status, priority },
    );
  },
  async setEventFeatured(id, featured) {
    await delay();
    if (!state.profile?.is_platform_admin) throw new Error('Admins only');
    const e = state.events.find((x) => x.id === id);
    if (!e) throw new Error('Event not found');
    e.featured_at = featured ? (e.featured_at ?? new Date().toISOString()) : null;
  },
  async openReports() {
    await delay();
    const open = state.reports.filter((r) => !r.resolved);
    return open.map(({ resolved: _, ...r }) => ({
      ...r,
      report_count: open.filter((x) => x.target_type === r.target_type && x.target_id === r.target_id).length,
    }));
  },
  async resolveReport(id, action) {
    await delay();
    const report = state.reports.find((r) => r.id === id);
    if (!report) return;
    if (action === 'removed') {
      if (report.target_type === 'event') {
        const e = state.events.find((x) => x.id === report.target_id);
        if (e) e.removed_at = new Date().toISOString();
      } else if (report.target_type === 'society') {
        const s = state.societies.find((x) => x.id === report.target_id);
        if (s) s.status = 'rejected';
      } else if (report.target_type === 'post') {
        const p = state.posts.find((x) => x.id === report.target_id);
        if (p) Object.assign(p, { removed_at: new Date().toISOString(), pinned: false });
      } else {
        const b = state.banners.find((x) => x.id === report.target_id);
        if (b) b.status = 'rejected';
      }
    }
    state.reports
      .filter((r) => r.target_type === report.target_type && r.target_id === report.target_id)
      .forEach((r) => (r.resolved = true));
  },
};
