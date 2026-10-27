// In-memory backend so the app runs with no Supabase project (Expo Go preview,
// App Store screenshots, UI work). Mirrors the rules in the SQL migration.
import type { AuthUser, Backend } from './backend';
import { isCuhkEmail } from './backend';
import { liveTicketOrder, receiptPath } from './commerce';
import {
  DEMO_DINNER,
  demoPaymentSettings,
  demoSocieties,
  makeDemoBanners,
  makeDemoCampusDates,
  makeDemoEvents,
  makeDemoMemberships,
  makeDemoPlans,
  makeDemoProducts,
} from './demoData';
import { DEMO_RECEIPT_MEMBERSHIP, DEMO_RECEIPT_TICKET } from './demoReceipts';
import { t } from './i18n';
import type {
  AppNotification,
  Attendee,
  Banner,
  CampusEvent,
  EventWithSociety,
  Membership,
  MembershipPlan,
  MyRegistration,
  MySociety,
  Order,
  OrderStatus,
  PaymentSettings,
  Product,
  SocietyOrder,
  NotificationKind,
  OpenReport,
  Profile,
  Registration,
  Society,
  SocietyMember,
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
  plans: makeDemoPlans() as MembershipPlan[],
  memberships: makeDemoMemberships() as Membership[],
  paymentSettings: demoPaymentSettings.map((p) => ({ ...p })) as PaymentSettings[],
  products: makeDemoProducts() as Product[],
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
      created_at: created,
      buyer_name: FAKE_NAMES[i],
      buyer_email: `student${1155200000 + i}@link.cuhk.edu.hk`,
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
      created_at: created,
      buyer_name: FAKE_NAMES[8 + i],
      buyer_email: `student${1155210000 + i}@link.cuhk.edu.hk`,
    };
  });
  return [...tickets, ...shop];
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
    if (o.product_id !== productId || !holdsStock(o)) continue;
    for (const i of o.items) sold[i.variant] = (sold[i.variant] ?? 0) + i.qty;
  }
  return sold;
}

function societyCard(id: string) {
  const s = state.societies.find((x) => x.id === id)!;
  return { ...summary(s), category: s.category };
}

function notifyOrder(o: Order) {
  if (o.user_id !== state.user?.id) return;
  const titles: Partial<Record<OrderStatus, [string, string]>> = {
    paid: [t('Payment received'), t('{title} ({ref}) is paid.', { title: o.product_title, ref: o.ref })],
    ready: [t('Ready for pickup'), t('Show the pickup QR in Tickets to collect {title}.', { title: o.product_title })],
    awaiting_payment: [
      t('Payment not found yet'),
      t('The society could not find a payment for {ref}. Check the reference and amount.', { ref: o.ref }),
    ],
    cancelled: [t('Order cancelled'), `${o.product_title} (${o.ref})`],
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

function isAdminOf(societyId: string) {
  return !!state.user && state.members.some((m) => m.society_id === societyId && m.role !== 'editor');
}

const listeners = new Set<(u: AuthUser | null) => void>();

function requireUser() {
  if (!state.user) throw new Error('Sign in first');
  return state.user;
}

function summary(s: Society) {
  return { id: s.id, name: s.name, short_name: s.short_name, logo_url: s.logo_url, verified: s.verified };
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
    state.events.push({ ...input, id, confirmed_count: 0, waitlist_count: 0, removed_at: null });
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
    const typed = code.trim().toLowerCase();
    const reg =
      state.registrations.find((r) => r.ticket_code === typed) ??
      (typed.length === 8 ? state.registrations.find((r) => r.event_id === eventId && r.ticket_code.startsWith(typed)) : undefined);
    if (!reg) return { ok: false, message: 'Ticket not found' };
    const name = state.profile?.display_name ?? 'Student';
    if (reg.event_id !== eventId) return { ok: false, name, message: 'This ticket is for a different event' };
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
      .map((p) => ({ ...p, sold: productSold(p.id), society: societyCard(p.society_id) }));
  },
  async placeOrder(productId, items, method, note) {
    await delay(300);
    const user = requireUser();
    const p = state.products.find((x) => x.id === productId);
    const now = new Date().toISOString();
    if (!p || p.status !== 'published') throw new Error('This item is not on sale');
    if (p.opens_at && now < p.opens_at) throw new Error('Orders have not opened yet');
    if (p.closes_at && now > p.closes_at) throw new Error('Orders have closed');
    const lines = items.filter((i) => i.qty > 0);
    if (!lines.length) throw new Error('Choose at least one item');
    const member = p.member_price_hkd != null && isCurrentMember(p.society_id);
    const unit = member ? p.member_price_hkd! : p.price_hkd;
    const sold = productSold(p.id);
    for (const i of lines) {
      const v = p.variants.find((x) => x.name === i.variant);
      if (!v) throw new Error('Choose a size');
      if (v.stock != null && (sold[v.name] ?? 0) + i.qty > v.stock) throw new Error('Not enough stock left');
    }
    const qty = lines.reduce((n, i) => n + i.qty, 0);
    if (qty > p.max_per_order) throw new Error('That is more than the limit per order');
    const s = state.societies.find((x) => x.id === p.society_id)!;
    const prefix = ((s.short_name ?? s.name).replace(/[^A-Za-z]/g, '') || 'CS').slice(0, 3).toUpperCase();
    const total = qty * unit;
    const order: Order & { buyer_name: string; buyer_email: string } = {
      id: uid(),
      society_id: p.society_id,
      product_id: p.id,
      user_id: user.id,
      ref: `${prefix}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      product_title: p.title,
      items: lines.map((i) => ({ variant: i.variant, qty: i.qty, unit_price: unit })),
      total_hkd: total,
      member_price: member,
      status: total === 0 ? 'paid' : 'awaiting_payment',
      payment_method: method,
      buyer_note: note?.trim() || null,
      pickup_code: uid().slice(5) + uid().slice(5) + uid().slice(5),
      expires_at: total > 0 && method !== 'cash' ? new Date(Date.now() + p.payment_window_hours * 3600_000).toISOString() : null,
      claimed_at: null,
      paid_at: total === 0 ? now : null,
      ready_at: null,
      collected_at: null,
      cancelled_at: null,
      event_id: null,
      registration_id: null,
      receipt_path: null,
      receipt_at: null,
      created_at: now,
      buyer_name: state.profile?.display_name || user.email,
      buyer_email: user.email,
    };
    state.orders.unshift(order);
    const { buyer_name: _n, buyer_email: _e, ...plain } = order;
    return plain;
  },
  async myOrders() {
    await delay();
    if (!state.user) return [];
    return state.orders
      .filter((o) => o.user_id === state.user!.id)
      .map(({ buyer_name: _n, buyer_email: _e, ...o }) => ({ ...o, society: societyCard(o.society_id) }));
  },
  async claimOrderPaid(id, note) {
    const o = state.orders.find((x) => x.id === id && x.user_id === state.user?.id);
    if (!o) throw new Error('Order not found');
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
    if (input.id) {
      Object.assign(
        state.products.find((p) => p.id === input.id)!,
        input,
      );
      return input.id;
    }
    const id = uid();
    state.products.push({ ...input, id, created_at: new Date().toISOString() });
    return id;
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
  async collectOrder(societyId, code) {
    await delay(200);
    if (!isMember(societyId)) throw new Error('Only society committee members can hand out orders');
    const o = state.orders.find(
      (x) => x.pickup_code === code.trim().toLowerCase() || (x.society_id === societyId && x.ref === code.trim().toUpperCase()),
    );
    if (!o) return { ok: false, message: 'Order not found' };
    const items = `${o.product_title} · ${o.items.map((i) => `${i.variant ? i.variant + ' ' : ''}×${i.qty}`).join(', ')}`;
    const base = { name: o.buyer_name, ref: o.ref, items };
    if (o.society_id !== societyId) return { ok: false, name: o.buyer_name, message: 'This order is for a different society' };
    if (o.status === 'collected') return { ...base, ok: false, message: 'Already collected', collected_at: o.collected_at ?? undefined };
    if (o.status !== 'paid' && o.status !== 'ready') return { ...base, ok: false, message: 'Not paid yet' };
    if (o.event_id) throw new Error('This is an event ticket. Check it in from the event instead.');
    o.status = 'collected';
    o.collected_at = new Date().toISOString();
    return { ...base, ok: true, message: 'Collected' };
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
