// In-memory backend so the app runs with no Supabase project (Expo Go preview,
// App Store screenshots, UI work). Mirrors the rules in the SQL migration.
import type { AuthUser, Backend } from './backend';
import { isCuhkEmail } from './backend';
import { makeDemoBanners, makeDemoCampusDates, makeDemoEvents, demoSocieties } from './demoData';
import type { Attendee, Banner, CampusEvent, EventWithSociety, MySociety, Profile, Registration, Society, SocietyRole } from './types';

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
  registrations: [] as Registration[],
  // In demo mode you help run CU Coding Society, so committee tools are visible.
  members: [{ society_id: demoSocieties[1].id, role: 'owner' as SocietyRole }],
  checkedInFake: new Map<string, Set<number>>(),
};

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
  return (e.status !== 'draft' && s?.status === 'approved') || isMember(e.society_id);
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
    e.confirmed_count++;
    e.waitlist_count = Math.max(0, e.waitlist_count - 1);
  }
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
      display_name: e.split('@')[0],
      college: null,
      major: null,
      year_of_study: null,
      avatar_url: null,
      is_platform_admin: true,
    };
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
      .filter((e) => q.includeDrafts || e.status !== 'draft')
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
      .map((r) => ({ ...r, event: withSociety(state.events.find((e) => e.id === r.event_id)!) }));
  },
  async myRegistration(eventId) {
    return state.registrations.find((r) => r.event_id === eventId && r.user_id === state.user?.id) ?? null;
  },
  async waitlistPosition(eventId) {
    const e = state.events.find((x) => x.id === eventId)!;
    const mine = state.registrations.find((r) => r.event_id === eventId && r.status === 'waitlisted');
    if (!mine) return 0;
    // Simulated waitlisters were already queued before you joined.
    const simulated = e.waitlist_count - state.registrations.filter((r) => r.event_id === eventId && r.status === 'waitlisted').length;
    return simulated + 1;
  },
  async register(eventId) {
    await delay(300);
    const user = requireUser();
    const e = state.events.find((x) => x.id === eventId);
    const now = new Date().toISOString();
    if (!e || e.status !== 'published') throw new Error('This event is not open for registration');
    if (!e.registration_required) throw new Error('No sign-up needed for this event, just turn up!');
    if (e.registration_opens_at && now < e.registration_opens_at) throw new Error('Registration has not opened yet');
    if (now > (e.registration_closes_at ?? e.starts_at)) throw new Error('Registration has closed');

    let reg = state.registrations.find((r) => r.event_id === eventId && r.user_id === user.id);
    if (reg && reg.status !== 'cancelled') return reg;

    let status: Registration['status'];
    if (e.capacity == null || e.confirmed_count < e.capacity) status = 'confirmed';
    else if (e.waitlist_enabled) status = 'waitlisted';
    else throw new Error('Sorry, this event is full');

    if (reg) {
      Object.assign(reg, { status, checked_in_at: null, created_at: now });
    } else {
      reg = {
        id: uid(),
        event_id: eventId,
        user_id: user.id,
        status,
        ticket_code: uid().slice(5) + uid().slice(5),
        checked_in_at: null,
        created_at: now,
      };
      state.registrations.push(reg);
    }
    if (status === 'confirmed') e.confirmed_count++;
    else e.waitlist_count++;
    return reg;
  },
  async cancelRegistration(eventId) {
    await delay(200);
    const reg = state.registrations.find((r) => r.event_id === eventId && r.user_id === state.user?.id);
    if (!reg || reg.status === 'cancelled') return;
    const e = state.events.find((x) => x.id === eventId)!;
    const was = reg.status;
    reg.status = 'cancelled';
    if (was === 'confirmed') {
      e.confirmed_count = Math.max(0, e.confirmed_count - 1);
      fillFromWaitlist(e);
    } else {
      e.waitlist_count = Math.max(0, e.waitlist_count - 1);
    }
  },
  async report() {
    requireUser();
    await delay(300);
  },

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
      const capacityChanged = e.capacity !== input.capacity;
      Object.assign(e, input);
      if (capacityChanged) fillFromWaitlist(e);
      return e.id;
    }
    const id = uid();
    state.events.push({ ...input, id, confirmed_count: 0, waitlist_count: 0 });
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
    if (reg.checked_in_at) return { ok: false, name, message: 'Already checked in' };
    reg.checked_in_at = new Date().toISOString();
    return { ok: true, name, message: 'Checked in' };
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
    Object.assign(
      state.societies.find((s) => s.id === id)!,
      { status, verified },
    );
  },
  async reviewBanner(id, status, priority) {
    Object.assign(
      state.banners.find((b) => b.id === id)!,
      { status, priority },
    );
  },
};
