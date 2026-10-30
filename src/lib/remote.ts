import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { AuthUser, Backend } from './backend';
import { liveTicketOrder, receiptPath } from './commerce';
import type {
  AppNotification,
  BoothSales,
  FairDetail,
  FairWithCounts,
  SocietyBooth,
  Attendee,
  Banner,
  BannerWithLinks,
  CampusDate,
  CheckInResult,
  EventWithSociety,
  MemberCardResult,
  Membership,
  MembershipPlan,
  MyMembership,
  MyOrder,
  MyRegistration,
  MySociety,
  Order,
  PaymentSettings,
  PayoutAccount,
  PlatformFee,
  PickupResult,
  PickupSlot,
  ProductWithStock,
  SocietyOrder,
  OpenReport,
  Profile,
  Registration,
  Society,
  SocietyMember,
  Ticket,
  TicketOrder,
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

const SOCIETY_SUMMARY = 'id, name, short_name, logo_url, verified, college';
const SOCIETY_CARD = `${SOCIETY_SUMMARY}, category`;
const EVENT_WITH_SOCIETY = `*, society:societies!inner(${SOCIETY_SUMMARY})`;
const TICKET_ORDER = 'orders(id, ref, status, total_hkd, expires_at, payment_method, member_price, receipt_at, created_at)';

/** Registrations come back with every order they ever had; keep the one that counts. */
function withTicketOrder<T extends Registration>(r: T & { orders?: TicketOrder[] }): T & { order: TicketOrder | null } {
  const { orders, ...rest } = r;
  return { ...(rest as unknown as T), order: liveTicketOrder(orders) };
}

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

/** Calls the online payments edge function (supabase/functions/payments). */
async function payments<T>(action: string, body: Record<string, string>): Promise<T> {
  await requireUserId();
  const { data, error } = await db().functions.invoke('payments', { body: { action, ...body } });
  if (error) {
    // The function answers {error: message}; show that rather than "non-2xx status".
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
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
    if (q.ids) query = query.in('id', q.ids);
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

  async myHiddenSocietyIds() {
    if (!(await currentUser())) return [];
    const rows = check(await db().from('society_blocks').select('society_id'));
    return (rows ?? []).map((r: { society_id: string }) => r.society_id);
  },
  async setSocietyHidden(societyId, hidden) {
    await requireUserId();
    if (hidden) {
      const { error } = await db().from('society_blocks').insert({ society_id: societyId });
      if (error && error.code !== '23505') throw new Error(error.message);
    } else {
      check(await db().from('society_blocks').delete().eq('society_id', societyId));
    }
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
  async mySavedEventIds() {
    if (!(await currentUser())) return [];
    const rows = check(await db().from('saved_events').select('event_id').order('created_at', { ascending: false }));
    return (rows ?? []).map((r: { event_id: string }) => r.event_id);
  },
  async setEventSaved(eventId, saved) {
    await requireUserId();
    if (saved) {
      const { error } = await db().from('saved_events').insert({ event_id: eventId });
      if (error && error.code !== '23505') throw new Error(error.message);
    } else {
      check(await db().from('saved_events').delete().eq('event_id', eventId));
    }
  },
  async myTickets() {
    if (!(await currentUser())) return [];
    const rows = check(
      await db().from('registrations').select(`*, event:events(${EVENT_WITH_SOCIETY}), ${TICKET_ORDER}`).neq('status', 'cancelled'),
    );
    return (rows as (Ticket & { orders: TicketOrder[] })[]).filter((t) => t.event).map(withTicketOrder);
  },
  async myRegistration(eventId) {
    const u = await currentUser();
    if (!u) return null;
    const row = check(
      await db().from('registrations').select(`*, ${TICKET_ORDER}`).eq('event_id', eventId).eq('user_id', u.id).maybeSingle(),
    ) as (MyRegistration & { orders: TicketOrder[] }) | null;
    return row && withTicketOrder(row);
  },
  async waitlistPosition(eventId) {
    return check(await db().rpc('waitlist_position', { p_event_id: eventId })) as number;
  },
  async register(eventId, answer, method) {
    return check(
      await db().rpc('register_for_event', { p_event_id: eventId, p_answer: answer ?? null, p_payment_method: method ?? null }),
    ) as Registration;
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

  async listPlans(societyId) {
    return check(
      await db().from('membership_plans').select('*').eq('society_id', societyId).order('valid_until', { ascending: false }),
    ) as MembershipPlan[];
  },
  async myMemberships() {
    const u = await currentUser();
    if (!u) return [];
    return check(
      await db()
        .from('memberships')
        .select(`*, plan:membership_plans(*), society:societies(${SOCIETY_CARD})`)
        .eq('user_id', u.id)
        .in('status', ['pending', 'active'])
        .order('created_at', { ascending: false }),
    ) as MyMembership[];
  },
  async joinSociety(input) {
    return check(
      await db().rpc('join_society', {
        p_plan_id: input.plan_id,
        p_full_name: input.full_name,
        p_student_id: input.student_id,
        p_college: input.college,
        p_major: input.major,
        p_phone: input.phone,
        p_answers: input.answers,
        p_payment_method: input.payment_method,
      }),
    ) as Membership;
  },
  async claimMembershipPaid(id) {
    check(await db().rpc('claim_membership_paid', { p_id: id }));
  },
  async cancelMembership(id) {
    check(await db().rpc('cancel_membership', { p_id: id }));
  },
  async savePlan(input) {
    const { id, society_id, ...fields } = input;
    if (id) {
      check(await db().from('membership_plans').update(fields).eq('id', id));
      return id;
    }
    const row = check(
      await db()
        .from('membership_plans')
        .insert({ society_id, ...fields })
        .select('id')
        .single(),
    );
    return (row as { id: string }).id;
  },
  async deletePlan(id) {
    check(await db().from('membership_plans').delete().eq('id', id));
  },
  async listMemberships(societyId) {
    return check(
      await db().from('memberships').select('*').eq('society_id', societyId).order('created_at', { ascending: false }).limit(5000),
    ) as Membership[];
  },
  async setMembershipStatus(ids, status) {
    return check(await db().rpc('set_membership_status', { p_ids: ids, p_status: status })) as number;
  },
  async importMemberships(planId, rows) {
    return check(await db().rpc('import_memberships', { p_plan_id: planId, p_rows: rows })) as number;
  },
  async logMembershipExport(societyId, rows) {
    check(await db().rpc('log_membership_export', { p_society_id: societyId, p_rows: rows }));
  },
  async checkMemberCard(societyId, code) {
    return check(await db().rpc('check_member_card', { p_society_id: societyId, p_code: code })) as MemberCardResult;
  },

  async getPaymentSettings(societyId) {
    return check(
      await db().from('society_payment_settings').select('*').eq('society_id', societyId).maybeSingle(),
    ) as PaymentSettings | null;
  },
  async listProducts(societyId) {
    return check(await db().rpc('list_products', { p_society_id: societyId })) as ProductWithStock[];
  },
  async placeBagOrder(societyId, lines, method, slotId, note) {
    return check(
      await db().rpc('place_cart_order', {
        p_society_id: societyId,
        p_lines: lines,
        p_payment_method: method,
        p_slot_id: slotId,
        p_note: note ?? null,
      }),
    ) as Order;
  },
  async listPickupSlots(societyId) {
    return check(await db().rpc('list_pickup_slots', { p_society_id: societyId })) as PickupSlot[];
  },
  async choosePickupSlot(orderId, slotId) {
    check(await db().rpc('choose_pickup_slot', { p_order_id: orderId, p_slot_id: slotId }));
  },
  async setProductAlert(productId, on) {
    if (on) check(await db().from('product_alerts').upsert({ product_id: productId }, { ignoreDuplicates: true }));
    else
      check(
        await db()
          .from('product_alerts')
          .delete()
          .eq('product_id', productId)
          .eq('user_id', await requireUserId()),
      );
  },
  async myOrders() {
    const u = await currentUser();
    if (!u) return [];
    return check(
      await db()
        .from('orders')
        .select(`*, society:societies(${SOCIETY_CARD}), pickup_slot:pickup_slots(*)`)
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ) as MyOrder[];
  },
  async claimOrderPaid(id, note) {
    check(await db().rpc('claim_order_paid', { p_order_id: id, p_note: note ?? null }));
  },
  async cancelMyOrder(id) {
    check(await db().rpc('cancel_my_order', { p_order_id: id }));
  },
  async uploadReceipt(kind, record, jpegUri) {
    await requireUserId();
    const body = await (await fetch(jpegUri)).arrayBuffer();
    // Fixed path per record, so a second upload replaces the first instead of adding a file.
    const { error } = await db()
      .storage.from('receipts')
      .upload(receiptPath(kind, record.society_id, record.id), body, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    check(await db().rpc('attach_receipt', { p_kind: kind, p_id: record.id }));
  },
  async receiptUrl(path) {
    const { data, error } = await db().storage.from('receipts').createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async onlinePaymentsReady(societyId) {
    return check(await db().rpc('shop_online_ready', { p_society_id: societyId })) as boolean;
  },
  async startOnlinePayment(orderId) {
    return (await payments<{ url: string }>('checkout', { order_id: orderId })).url;
  },
  async platformFee(societyId) {
    const f = check(await db().rpc('platform_fee_for', { p_society_id: societyId })) as PlatformFee;
    return { percent: Number(f.percent), fixed_hkd: Number(f.fixed_hkd) };
  },
  async payoutAccount(societyId) {
    return check(await db().from('society_payout_accounts').select('*').eq('society_id', societyId).maybeSingle()) as PayoutAccount | null;
  },
  async startPayoutSetup(societyId) {
    return (await payments<{ url: string }>('connect', { society_id: societyId })).url;
  },
  async refreshPayoutAccount(societyId) {
    return (await payments<{ account: PayoutAccount | null }>('refresh', { society_id: societyId })).account;
  },
  async payoutDashboardUrl(societyId) {
    return (await payments<{ url: string }>('dashboard', { society_id: societyId })).url;
  },
  async refundOnlineOrder(orderId) {
    await payments('refund', { order_id: orderId });
  },
  async setPaymentSettings(societyId, s) {
    check(
      await db().rpc('set_payment_settings', {
        p_society_id: societyId,
        p_fps_id: s.fps_id,
        p_payee_name: s.payee_name,
        p_payme_link: s.payme_link,
        p_instructions: s.instructions,
      }),
    );
  },
  async saveProduct(input) {
    const { id, society_id, ...fields } = input;
    if (id) {
      check(await db().from('products').update(fields).eq('id', id));
      return id;
    }
    const row = check(
      await db()
        .from('products')
        .insert({ society_id, ...fields })
        .select('id')
        .single(),
    );
    return (row as { id: string }).id;
  },
  async deleteProduct(id) {
    check(await db().from('products').delete().eq('id', id));
  },
  async listOrders(societyId) {
    return check(await db().rpc('list_orders', { p_society_id: societyId })) as SocietyOrder[];
  },
  async setOrderStatus(ids, status) {
    return check(await db().rpc('set_order_status', { p_ids: ids, p_status: status })) as number;
  },
  async collectOrder(societyId, code, cashReceived, vouchers) {
    return check(
      await db().rpc('collect_order', {
        p_society_id: societyId,
        p_code: code,
        p_cash_received: !!cashReceived,
        p_vouchers: vouchers ?? null,
      }),
    ) as PickupResult;
  },
  async savePickupSlot(input) {
    const { id, society_id, ...fields } = input;
    if (id) {
      check(await db().from('pickup_slots').update(fields).eq('id', id));
      return id;
    }
    const row = check(
      await db()
        .from('pickup_slots')
        .insert({ society_id, ...fields })
        .select('id')
        .single(),
    );
    return (row as { id: string }).id;
  },
  async deletePickupSlot(id) {
    check(await db().from('pickup_slots').delete().eq('id', id));
  },

  async pendingSocieties() {
    return check(await db().from('societies').select('*').eq('status', 'pending').order('created_at')) as Society[];
  },
  async listFairs() {
    return check(await db().rpc('list_fairs')) as FairWithCounts[];
  },
  async getFair(id) {
    return (check(await db().rpc('get_fair', { p_id: id })) as FairDetail | null) ?? null;
  },
  async listFairProducts(fairId) {
    return check(await db().rpc('list_fair_products', { p_fair_id: fairId })) as ProductWithStock[];
  },
  async saveFair(input) {
    return check(
      await db().rpc('save_fair', {
        p_id: input.id ?? null,
        p_society_id: input.organiser_society_id,
        p_name: input.name,
        p_description: input.description,
        p_venue: input.venue,
        p_cover_url: input.cover_url,
        p_starts_at: input.starts_at,
        p_ends_at: input.ends_at,
        p_presale_closes_at: input.presale_closes_at,
        p_booths_open: input.booths_open,
      }),
    ) as string;
  },
  async applyForBooth(fairId, societyId, note) {
    check(await db().rpc('apply_for_booth', { p_fair_id: fairId, p_society_id: societyId, p_note: note ?? null }));
  },
  async reviewBooth(boothId, status, label) {
    check(await db().rpc('review_booth', { p_booth_id: boothId, p_status: status, p_label: label }));
  },
  async societyBooths(societyId) {
    const rows = check(
      await db().from('fair_booths').select('*, fair:fairs(*)').eq('society_id', societyId).order('created_at', { ascending: false }),
    ) as SocietyBooth[];
    // A booth at a fair still waiting for review has no fair you can read yet.
    return rows.filter((b) => b.fair);
  },
  async fairSales(fairId) {
    return check(await db().rpc('fair_sales', { p_fair_id: fairId })) as BoothSales[];
  },
  async pendingFairs() {
    const fairs = check(await db().rpc('list_fairs')) as FairWithCounts[];
    return fairs.filter((f) => f.status === 'pending');
  },
  async reviewFair(id, status) {
    check(await db().rpc('review_fair', { p_id: id, p_status: status }));
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
  async setEventFeatured(id, featured) {
    check(await db().rpc('set_event_featured', { p_event_id: id, p_featured: featured }));
  },
  async openReports() {
    return check(await db().rpc('list_open_reports')) as OpenReport[];
  },
  async resolveReport(id, action) {
    check(await db().rpc('resolve_report', { p_report_id: id, p_action: action }));
  },
};
