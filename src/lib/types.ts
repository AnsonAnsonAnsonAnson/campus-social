// Row shapes mirror supabase/migrations/*.sql (snake_case on purpose, so rows
// from Supabase can be used directly).

import type { Lang } from './i18n';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type SocietyRole = 'owner' | 'admin' | 'editor';
export type EventStatus = 'draft' | 'published' | 'cancelled';
export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled';

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  college: string | null;
  major: string | null;
  year_of_study: number | null;
  avatar_url: string | null;
  is_platform_admin: boolean;
  /** App language; notifications are written in it. */
  locale?: Lang;
};

export type Society = {
  id: string;
  name: string;
  short_name: string | null;
  description: string;
  category: string;
  college: string | null;
  logo_url: string | null;
  cover_url: string | null;
  instagram: string | null;
  website: string | null;
  contact_email: string | null;
  status: ReviewStatus;
  verified: boolean;
  follower_count: number;
};

export type SocietySummary = Pick<Society, 'id' | 'name' | 'short_name' | 'logo_url' | 'verified'>;

export type CampusEvent = {
  id: string;
  society_id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  starts_at: string;
  ends_at: string;
  cover_url: string | null;
  status: EventStatus;
  registration_required: boolean;
  capacity: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  price_text: string | null;
  /** Optional question attendees answer when they sign up. */
  signup_question: string | null;
  confirmed_count: number;
  waitlist_count: number;
  /** Set when moderators take the event down; only its committee still sees it. */
  removed_at: string | null;
};

export type EventWithSociety = CampusEvent & { society: SocietySummary };

export type EventInput = Omit<CampusEvent, 'id' | 'confirmed_count' | 'waitlist_count' | 'removed_at'> & { id?: string };

export type Registration = {
  id: string;
  event_id: string;
  user_id: string;
  status: RegistrationStatus;
  ticket_code: string;
  answer: string | null;
  checked_in_at: string | null;
  created_at: string;
};

export type Ticket = Registration & { event: EventWithSociety };

export type Banner = {
  id: string;
  society_id: string;
  event_id: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  priority: number;
  status: ReviewStatus;
};

export type BannerWithLinks = Banner & { society: SocietySummary; event: CampusEvent | null };

export type CampusDateKind = 'university' | 'college' | 'holiday' | 'term' | 'exam' | 'deadline';

export type CampusDate = {
  id: string;
  title: string;
  /** Traditional Chinese title, shown when the app is in Chinese. */
  title_zh?: string | null;
  kind: CampusDateKind;
  college: string | null;
  starts_on: string; // YYYY-MM-DD
  ends_on: string;
  url: string | null;
};

export type Attendee = {
  registration_id: string;
  display_name: string;
  email: string;
  college: string | null;
  status: RegistrationStatus;
  answer: string | null;
  checked_in_at: string | null;
  created_at: string;
};

export type CheckInResult = { ok: boolean; name?: string; message: string };

export type MySociety = Society & { role: SocietyRole };

export type SocietyInput = {
  name: string;
  short_name: string;
  description: string;
  category: string;
  college: string;
  instagram: string;
  contact_email: string;
};

export type BannerInput = {
  society_id: string;
  event_id: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
};

export type EventQuery = {
  from?: string;
  to?: string;
  societyIds?: string[];
  category?: string;
  search?: string;
  /** Include drafts (only returned for societies you help run). */
  includeDrafts?: boolean;
  limit?: number;
};

export type NotificationKind =
  | 'waitlist_promoted'
  | 'event_cancelled'
  | 'event_updated'
  | 'new_event'
  | 'society_approved'
  | 'committee_added'
  | 'membership_active'
  | 'membership_renewal'
  | 'order_update'
  | 'payment_settings_changed';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  event_id: string | null;
  society_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type SocietyMember = {
  user_id: string;
  display_name: string;
  email: string;
  role: SocietyRole;
  created_at: string;
};

export type ReportTarget = 'event' | 'society' | 'banner';

export type OpenReport = {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  target_name: string;
  reason: string;
  report_count: number;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Members (v0.4). Separate from SocietyMember, which is the committee.
// ---------------------------------------------------------------------------

export type MembershipPlan = {
  id: string;
  society_id: string;
  name: string;
  price_hkd: number;
  valid_from: string; // YYYY-MM-DD
  valid_until: string;
  /** Extra questions asked when joining. */
  questions: string[];
  /** Free plans only: new members are active straight away. */
  auto_approve: boolean;
  is_open: boolean;
  created_at: string;
};

export type PlanInput = Omit<MembershipPlan, 'id' | 'created_at'> & { id?: string };

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'cancelled';
export type PaymentMethod = 'fps' | 'payme' | 'cash';

export type Membership = {
  id: string;
  plan_id: string;
  society_id: string;
  user_id: string | null;
  status: MembershipStatus;
  member_no: number | null;
  card_code: string;
  full_name: string;
  email: string;
  student_id: string | null;
  college: string | null;
  major: string | null;
  phone: string | null;
  answers: string[];
  payment_method: PaymentMethod | null;
  consent_at: string | null;
  claimed_paid_at: string | null;
  paid_at: string | null;
  imported: boolean;
  created_at: string;
};

/** A membership with its plan and society, for the member's own card. */
export type MyMembership = Membership & {
  plan: MembershipPlan;
  society: SocietySummary & { category: string };
};

export type JoinInput = {
  plan_id: string;
  full_name: string;
  student_id: string;
  college: string;
  major: string;
  phone: string;
  answers: string[];
  payment_method: PaymentMethod | null;
};

export type ImportRow = {
  full_name: string;
  email?: string;
  student_id?: string;
  college?: string;
  major?: string;
  phone?: string;
};

export type MemberCardResult = CheckInResult & { member_no?: number; valid_until?: string; plan?: string };

// ---------------------------------------------------------------------------
// Shop (v0.4)
// ---------------------------------------------------------------------------

export type PaymentSettings = {
  society_id: string;
  /** FPS proxy: HK mobile number, email or FPS ID. */
  fps_id: string | null;
  payee_name: string | null;
  payme_link: string | null;
  instructions: string | null;
  updated_at: string;
};

/** A size or colour. `stock` null means pre-order with no limit; one variant named '' means one size. */
export type ProductVariant = { name: string; stock: number | null };
export type ProductStatus = 'draft' | 'published' | 'closed';

export type Product = {
  id: string;
  society_id: string;
  title: string;
  description: string;
  image_url: string | null;
  price_hkd: number;
  member_price_hkd: number | null;
  variants: ProductVariant[];
  opens_at: string | null;
  closes_at: string | null;
  pickup_note: string | null;
  max_per_order: number;
  payment_window_hours: number;
  status: ProductStatus;
  created_at: string;
};

export type ProductWithStock = Product & {
  /** Units held by live orders, by variant name. */
  sold: Record<string, number>;
  society: SocietySummary & { category: string };
};

export type ProductInput = Omit<Product, 'id' | 'created_at'> & { id?: string };

export type OrderStatus = 'awaiting_payment' | 'payment_claimed' | 'paid' | 'ready' | 'collected' | 'cancelled' | 'refunded';

export type OrderItem = { variant: string; qty: number; unit_price: number };

export type Order = {
  id: string;
  society_id: string;
  product_id: string | null;
  user_id: string | null;
  ref: string;
  product_title: string;
  items: OrderItem[];
  total_hkd: number;
  member_price: boolean;
  status: OrderStatus;
  payment_method: PaymentMethod;
  buyer_note: string | null;
  pickup_code: string;
  expires_at: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

/** The buyer's own order, with the society. */
export type MyOrder = Order & { society: SocietySummary & { category: string } };

/** An order as the committee sees it. */
export type SocietyOrder = Order & { buyer_name: string; buyer_email: string; expired: boolean };

export type PickupResult = CheckInResult & { ref?: string; items?: string; collected_at?: string };
