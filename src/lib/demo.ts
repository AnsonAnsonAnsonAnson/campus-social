// In-memory backend so the app runs with no Supabase project (Expo Go preview,
// App Store screenshots, UI work). Mirrors the rules in the SQL migration.
import type { AuthUser, Backend } from './backend';
import { isCuhkEmail } from './backend';
import { makeDemoBanners, makeDemoCampusDates, makeDemoEvents, demoSocieties } from './demoData';
import { t } from './i18n';
import type {
  AppNotification,
  Attendee,
  Banner,
  CampusEvent,
  EventWithSociety,
  MySociety,
  NotificationKind,
  OpenReport,
  Profile,
  Registration,
  Society,
  SocietyMember,
  SocietyRole,
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
};

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
  async register(eventId, answer) {
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

    let status: Registration['status'];
    if (e.capacity == null || e.confirmed_count < e.capacity) status = 'confirmed';
    else if (e.waitlist_enabled) status = 'waitlisted';
    else throw new Error('Sorry, this event is full');

    if (reg) {
      Object.assign(reg, { status, answer: answer?.trim() || null, checked_in_at: null, created_at: now });
    } else {
      reg = {
        id: uid(),
        event_id: eventId,
        user_id: user.id,
        status,
        ticket_code: uid().slice(5) + uid().slice(5),
        answer: answer?.trim() || null,
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
