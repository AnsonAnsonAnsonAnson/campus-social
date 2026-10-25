import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { AuthUser, Backend } from './backend';
import type {
  AppNotification,
  Attendee,
  Banner,
  BannerWithLinks,
  CampusDate,
  CheckInResult,
  EventWithSociety,
  MySociety,
  OpenReport,
  Profile,
  Registration,
  Society,
  SocietyMember,
  Ticket,
} from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const hasSupabaseConfig = !!url && !!key;

export const supabase = hasSupabaseConfig
  ? createClient(url, key, {
      auth: {
        storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  // Only refresh tokens while the app is in the foreground.
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

const SOCIETY_SUMMARY = 'id, name, short_name, logo_url, verified';
const EVENT_WITH_SOCIETY = `*, society:societies!inner(${SOCIETY_SUMMARY})`;

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function currentUser(): Promise<AuthUser | null> {
  const { data } = await db().auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? '' } : null;
}

async function requireUserId() {
  const u = await currentUser();
  if (!u) throw new Error('Sign in first');
  return u.id;
}

/** Strip characters that have meaning inside a PostgREST `or=` filter. */
function cleanSearch(s: string) {
  return s.replace(/[,()%*\\]/g, ' ').trim();
}

export const remoteBackend: Backend = {
  isDemo: false,

  getUser: currentUser,
  onAuthChange(cb) {
    const { data } = db().auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    return () => data.subscription.unsubscribe();
  },
  async sendCode(email) {
    const { error } = await db().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
  },
  async verifyCode(email, code) {
    const { error } = await db().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) throw new Error(error.message);
  },
  async signInWithPassword(email, password) {
    const { error } = await db().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(error.message);
  },
  async signOut() {
    await db().auth.signOut();
  },
  async deleteAccount() {
    check(await db().rpc('delete_my_account'));
    await db().auth.signOut({ scope: 'local' });
  },
  async getProfile() {
    const id = (await currentUser())?.id;
    if (!id) return null;
    return check(await db().from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null;
  },
  async updateProfile(patch) {
    const id = await requireUserId();
    check(await db().from('profiles').update(patch).eq('id', id));
  },

  async listBanners() {
    const now = new Date().toISOString();
    const rows = check(
      await db()
        .from('banners')
        .select(`*, society:societies(${SOCIETY_SUMMARY}), event:events(*)`)
        .eq('status', 'approved')
        .lte('starts_at', now)
        .gte('ends_at', now)
        .order('priority', { ascending: false })
        .limit(10),
    );
    return rows as BannerWithLinks[];
  },
  async listEvents(q) {
    let query = db().from('events').select(EVENT_WITH_SOCIETY);
    if (!q.includeDrafts) query = query.in('status', ['published', 'cancelled']).is('removed_at', null);
    if (q.from) query = query.gte('ends_at', q.from);
    if (q.to) query = query.lte('starts_at', q.to);
    if (q.societyIds) query = query.in('society_id', q.societyIds);
    if (q.category) query = query.eq('category', q.category);
    const s = q.search && cleanSearch(q.search);
    if (s) query = query.or(`title.ilike.*${s}*,location.ilike.*${s}*`);
    return check(await query.order('starts_at').limit(q.limit ?? 200)) as EventWithSociety[];
  },
  async getEvent(id) {
    return check(await db().from('events').select(EVENT_WITH_SOCIETY).eq('id', id).maybeSingle()) as EventWithSociety | null;
  },
  async listSocieties(q) {
    let query = db().from('societies').select('*').eq('status', 'approved');
    if (q.category) query = query.eq('category', q.category);
    const s = q.search && cleanSearch(q.search);
    if (s) query = query.or(`name.ilike.*${s}*,short_name.ilike.*${s}*`);
    return check(await query.order('name')) as Society[];
  },
  async getSociety(id) {
    return check(await db().from('societies').select('*').eq('id', id).maybeSingle()) as Society | null;
  },
  async listCampusDates(from, to) {
    return check(await db().from('campus_dates').select('*').lte('starts_on', to).gte('ends_on', from).order('starts_on')) as CampusDate[];
  },

  async myFollowIds() {
    if (!(await currentUser())) return [];
    const rows = check(await db().from('follows').select('society_id'));
    return (rows ?? []).map((r: { society_id: string }) => r.society_id);
  },
  async setFollow(societyId, follow) {
    await requireUserId();
    if (follow) {
      const { error } = await db().from('follows').insert({ society_id: societyId });
      if (error && error.code !== '23505') throw new Error(error.message);
    } else {
      check(await db().from('follows').delete().eq('society_id', societyId));
    }
  },
  async myTickets() {
    if (!(await currentUser())) return [];
    const rows = check(await db().from('registrations').select(`*, event:events(${EVENT_WITH_SOCIETY})`).neq('status', 'cancelled'));
    return (rows as Ticket[]).filter((t) => t.event);
  },
  async myRegistration(eventId) {
    const u = await currentUser();
    if (!u) return null;
    return check(
      await db().from('registrations').select('*').eq('event_id', eventId).eq('user_id', u.id).maybeSingle(),
    ) as Registration | null;
  },
  async waitlistPosition(eventId) {
    return check(await db().rpc('waitlist_position', { p_event_id: eventId })) as number;
  },
  async register(eventId, answer) {
    return check(await db().rpc('register_for_event', { p_event_id: eventId, p_answer: answer ?? null })) as Registration;
  },
  async cancelRegistration(eventId) {
    check(await db().rpc('cancel_registration', { p_event_id: eventId }));
  },
  async report(targetType, targetId, reason) {
    await requireUserId();
    check(await db().from('reports').insert({ target_type: targetType, target_id: targetId, reason }));
  },

  async listNotifications() {
    if (!(await currentUser())) return [];
    return check(await db().from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) as AppNotification[];
  },
  async unreadNotificationCount() {
    if (!(await currentUser())) return 0;
    const { count, error } = await db().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async markAllNotificationsRead() {
    check(await db().rpc('mark_all_notifications_read'));
  },
  async deleteNotification(id) {
    check(await db().from('notifications').delete().eq('id', id));
  },
  async registerPushToken(token, platform) {
    check(await db().rpc('register_push_token', { p_token: token, p_platform: platform }));
  },
  async unregisterPushToken(token) {
    check(await db().from('push_tokens').delete().eq('token', token));
  },

  async mySocieties() {
    const u = await currentUser();
    if (!u) return [];
    const rows = check(await db().from('society_members').select('role, society:societies(*)').eq('user_id', u.id));
    return (rows as unknown as { role: MySociety['role']; society: Society }[])
      .filter((r) => r.society)
      .map((r) => ({ ...r.society, role: r.role }));
  },
  async createSociety(input) {
    return check(
      await db().rpc('create_society', {
        p_name: input.name,
        p_short_name: input.short_name,
        p_description: input.description,
        p_category: input.category,
        p_college: input.college,
        p_instagram: input.instagram,
        p_contact_email: input.contact_email,
      }),
    ) as string;
  },
  async updateSociety(id, patch) {
    check(await db().from('societies').update(patch).eq('id', id));
  },
  async saveEvent(input) {
    const { id, society_id, ...fields } = input;
    if (id) {
      check(await db().from('events').update(fields).eq('id', id));
      return id;
    }
    const row = check(
      await db()
        .from('events')
        .insert({ society_id, ...fields })
        .select('id')
        .single(),
    );
    return (row as { id: string }).id;
  },
  async deleteEvent(id) {
    check(await db().from('events').delete().eq('id', id));
  },
  async listAttendees(eventId) {
    return check(await db().rpc('list_attendees', { p_event_id: eventId })) as Attendee[];
  },
  async checkIn(eventId, ticketCode) {
    return check(await db().rpc('check_in', { p_event_id: eventId, p_ticket_code: ticketCode })) as CheckInResult;
  },
  async setCheckedIn(registrationId, checked) {
    check(await db().rpc('set_checked_in', { p_registration_id: registrationId, p_checked: checked }));
  },
  async listMembers(societyId) {
    return check(await db().rpc('list_society_members', { p_society_id: societyId })) as SocietyMember[];
  },
  async addMember(societyId, email, role) {
    check(await db().rpc('add_society_member', { p_society_id: societyId, p_email: email, p_role: role }));
  },
  async setMemberRole(societyId, userId, role) {
    check(await db().from('society_members').update({ role }).eq('society_id', societyId).eq('user_id', userId));
  },
  async removeMember(societyId, userId) {
    check(await db().from('society_members').delete().eq('society_id', societyId).eq('user_id', userId));
  },
  async transferOwnership(societyId, userId) {
    check(await db().rpc('transfer_society_ownership', { p_society_id: societyId, p_new_owner: userId }));
  },
  async societyBanners(societyId) {
    return check(await db().from('banners').select('*').eq('society_id', societyId).order('created_at', { ascending: false })) as Banner[];
  },
  async requestBanner(input) {
    check(await db().from('banners').insert(input));
  },
  async deleteBanner(id) {
    check(await db().from('banners').delete().eq('id', id));
  },
  async uploadImage(localUri) {
    const userId = await requireUserId();
    const res = await fetch(localUri);
    const body = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db().storage.from('media').upload(path, body, { contentType });
    if (error) throw new Error(error.message);
    return db().storage.from('media').getPublicUrl(path).data.publicUrl;
  },

  async pendingSocieties() {
    return check(await db().from('societies').select('*').eq('status', 'pending').order('created_at')) as Society[];
  },
  async pendingBanners() {
    return check(
      await db()
        .from('banners')
        .select(`*, society:societies(${SOCIETY_SUMMARY}), event:events(*)`)
        .eq('status', 'pending')
        .order('created_at'),
    ) as BannerWithLinks[];
  },
  async reviewSociety(id, status, verified) {
    check(await db().rpc('review_society', { p_id: id, p_status: status, p_verified: verified }));
  },
  async reviewBanner(id, status, priority) {
    check(await db().rpc('review_banner', { p_id: id, p_status: status, p_priority: priority }));
  },
  async openReports() {
    return check(await db().rpc('list_open_reports')) as OpenReport[];
  },
  async resolveReport(id, action) {
    check(await db().rpc('resolve_report', { p_report_id: id, p_action: action }));
  },
};
