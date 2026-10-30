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

export type SocietySummary = Pick<Society, 'id' | 'name' | 'short_name' | 'logo_url' | 'verified' | 'college'>;

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
  /** Only current members (and the committee) can sign up; everyone can see it. */
  members_only: boolean;
  /** Ticket price; null or 0 is free. Paid the society directly, like shop orders. */
  price_hkd: number | null;
  /** Price for current members, if different (0 = free for members). */
  member_price_hkd: number | null;
  /** Unpaid FPS / PayMe tickets give up their place after this many hours. */
  payment_window_hours: number;
  confirmed_count: number;
  waitlist_count: number;
  /** How many students saved it (who saved stays private). */
  save_count: number;
  /** Set by platform admins for major events; they lead "Most anticipated". */
  featured_at: string | null;
  /** Set when moderators take the event down; only its committee still sees it. */
  removed_at: string | null;
};

export type EventWithSociety = CampusEvent & { society: SocietySummary };

export type EventInput = Omit<CampusEvent, 'id' | 'confirmed_count' | 'waitlist_count' | 'save_count' | 'featured_at' | 'removed_at'> & {
  id?: string;
};

export type Registration = {
  id: string;
  event_id: string;
  user_id: string;
  status: RegistrationStatus;
  ticket_code: string;
  answer: string | null;
  /** Chosen at sign-up for paid events. */
  payment_method: PaymentMethod | null;
  checked_in_at: string | null;
  created_at: string;
};

/** The order behind a paid ticket. */
export type TicketOrder = Pick<
  Order,
  'id' | 'ref' | 'status' | 'total_hkd' | 'expires_at' | 'payment_method' | 'member_price' | 'receipt_at' | 'created_at'
>;

/** Your own sign-up, with the order to pay when the event is paid (null when free for you). */
export type MyRegistration = Registration & { order: TicketOrder | null };

export type Ticket = MyRegistration & { event: EventWithSociety };

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

/** `ref` is the unpaid ticket's order reference when the message is "Not paid yet". */
export type CheckInResult = { ok: boolean; name?: string; message: string; ref?: string };

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
  /** Only these events (e.g. the ones you saved). */
  ids?: string[];
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
  | 'payment_settings_changed'
  | 'product_available'
  | 'fair_update';

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

export type ReportTarget = 'event' | 'society' | 'banner' | 'post';

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
// Society posts (v0.7): the committee's feed on a society page.
// ---------------------------------------------------------------------------
export type PostEvent = Pick<CampusEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'cover_url' | 'category' | 'status'>;

export type SocietyPost = {
  id: string;
  society_id: string;
  body: string;
  /** Up to four photos. */
  image_urls: string[];
  /** The event this post promotes, if any. */
  event_id: string | null;
  pinned: boolean;
  like_count: number;
  created_at: string;
  edited_at: string | null;
  /** Set when moderators take the post down; only its committee still sees it. */
  removed_at: string | null;
  society: SocietySummary & Pick<Society, 'category'>;
  /** Null when the event was deleted or is not visible to you. */
  event: PostEvent | null;
};

export type PostInput = Pick<SocietyPost, 'society_id' | 'body' | 'image_urls' | 'event_id' | 'pinned'> & { id?: string };

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
/** 'online' is card, Apple Pay, Google Pay, Alipay or WeChat Pay through the payment provider (shop only). */
export type PaymentMethod = 'fps' | 'payme' | 'cash' | 'online';

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
  /** Payment screenshot in the private receipts bucket; cleared once it's deleted after review. */
  receipt_path: string | null;
  receipt_at: string | null;
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

/**
 * A size or colour. `stock` null means pre-order with no limit; one variant named '' means one size.
 * `extra_hkd` is added to the price for this size (e.g. XXL +HK$20).
 */
export type ProductVariant = { name: string; stock: number | null; extra_hkd?: number | null };
export type ProductStatus = 'draft' | 'published' | 'closed';

export type Product = {
  id: string;
  society_id: string;
  title: string;
  description: string;
  /** Cover photo; `images` are the extra photos after it. */
  image_url: string | null;
  images: string[];
  price_hkd: number;
  member_price_hkd: number | null;
  variants: ProductVariant[];
  /** Comma-separated rows, header first: "Size, Chest, Length". */
  size_chart: string | null;
  /** Pre-orders: units the society needs to go ahead. */
  goal_qty: number | null;
  /** Pre-orders: expected ready date, YYYY-MM-DD. */
  ready_on: string | null;
  /** Across all of one buyer's live orders. */
  max_per_buyer: number | null;
  opens_at: string | null;
  closes_at: string | null;
  pickup_note: string | null;
  max_per_order: number;
  payment_window_hours: number;
  status: ProductStatus;
  /** Sold at a fair, collected or used at the society's booth there. */
  fair_id?: string | null;
  kind?: ProductKind;
  /** A voucher's value at the booth, when more than its price. */
  voucher_value_hkd?: number | null;
  created_at: string;
};

/** Merch is handed over; a voucher is used at the booth (one unit at a time if the buyer likes). */
export type ProductKind = 'merch' | 'voucher';

export type ProductWithStock = Product & {
  /** Units held by live orders, by variant name. */
  sold: Record<string, number>;
  /** You asked to be told when it's back on sale. */
  alert?: boolean;
  /** Booth number, on a fair's product list. */
  booth?: string | null;
  society: SocietySummary & { category: string };
};

export type ProductInput = Omit<Product, 'id' | 'created_at'> & { id?: string };

export type OrderStatus = 'awaiting_payment' | 'payment_claimed' | 'paid' | 'ready' | 'collected' | 'cancelled' | 'refunded';

/** One line of an order. Orders before v0.7 have no product_id or title on their lines (see Order.product_title). */
export type OrderItem = { product_id?: string; title?: string; variant: string; qty: number; unit_price: number; kind?: 'voucher' };

export type Order = {
  id: string;
  society_id: string;
  product_id: string | null;
  /** Set for event tickets (product_id is then null). */
  event_id: string | null;
  registration_id: string | null;
  user_id: string | null;
  ref: string;
  /** Set when the order holds one product; mixed bags list each product on their lines. */
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
  receipt_path: string | null;
  receipt_at: string | null;
  pickup_slot_id: string | null;
  /** What the platform kept from an online payment; the society received the total less this. */
  platform_fee_hkd?: number | null;
  /** Fair presale: collected or used at the society's booth. */
  fair_id?: string | null;
  vouchers_total?: number;
  vouchers_used?: number;
  created_at: string;
};

/** The buyer's own order, with the society and the pickup time they booked. */
export type MyOrder = Order & { society: SocietySummary & { category: string }; pickup_slot?: PickupSlot | null };

/** An order as the committee sees it. */
export type SocietyOrder = Order & { buyer_name: string; buyer_email: string; expired: boolean };

/** "Take cash" means an unpaid cash order: collect again with cash received to hand it over. */
export type PickupResult = CheckInResult & {
  ref?: string;
  items?: string;
  collected_at?: string;
  /** The pickup time the buyer booked, "Thu 13 Nov 13:00, Room 1009". */
  slot?: string | null;
  total_hkd?: number;
  payment_method?: PaymentMethod;
  vouchers_total?: number;
  vouchers_left?: number;
  /** "How many vouchers?" after taking cash at the desk. */
  cash_taken?: boolean;
  used_now?: number;
};

/** A time and place the committee hands out orders. */
export type PickupSlot = {
  id: string;
  society_id: string;
  starts_at: string;
  ends_at: string;
  location: string;
  /** Orders that can book it; null = no cap. */
  capacity: number | null;
  /** Live orders booked on it. */
  booked?: number;
};

export type PickupSlotInput = Omit<PickupSlot, 'id' | 'booked'> & { id?: string };

/** One line in a shopping bag (kept on the phone until checkout). */
export type BagLine = { product_id: string; variant: string; qty: number };

/** A society's payout account at the payment provider, for online payments. */
export type PayoutAccount = {
  society_id: string;
  provider: 'stripe';
  account_id: string;
  /** Buyers can pay online once the provider has verified the account. */
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  /** How many details the provider still needs. */
  requirements_due: number;
  disabled_reason: string | null;
  updated_at: string;
};

/** What the platform keeps from each online order: a percentage plus a fixed amount. */
export type PlatformFee = { percent: number; fixed_hkd: number };

/** Which record a payment screenshot belongs to. */
export type ReceiptKind = 'order' | 'membership';

// ---------------------------------------------------------------------------
// Fairs (v0.9)
// ---------------------------------------------------------------------------

export type ReviewState = 'pending' | 'approved' | 'rejected';

/** A day or two when many societies run booths in one place (O'Camp, Christmas fair). */
export type Fair = {
  id: string;
  organiser_society_id: string;
  name: string;
  description: string;
  venue: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  /** Null: presale runs until the fair ends. */
  presale_closes_at: string | null;
  booths_open: boolean;
  status: ReviewState;
  created_at: string;
};

export type FairWithCounts = Fair & {
  organiser: SocietySummary & { category: string };
  booth_count: number;
  product_count: number;
  /** You are an admin of the organiser. */
  can_manage: boolean;
};

export type FairBooth = {
  id: string;
  fair_id: string;
  society_id: string;
  /** "B12", given by the organiser. */
  label: string | null;
  status: ReviewState;
  note: string | null;
  created_at: string;
  society: SocietySummary & { category: string };
};

export type FairDetail = FairWithCounts & { booths: FairBooth[] };

export type FairInput = Pick<
  Fair,
  'name' | 'description' | 'venue' | 'cover_url' | 'starts_at' | 'ends_at' | 'presale_closes_at' | 'booths_open'
> & { id?: string; organiser_society_id: string };

/** A society's booth with its fair, for the society's own screens. */
export type SocietyBooth = Omit<FairBooth, 'society'> & { fair: Fair };

/** Presale at one booth, for the organiser (totals only). */
export type BoothSales = {
  society_id: string;
  society_name: string;
  booth: string | null;
  orders: number;
  sales_hkd: number;
  vouchers_sold: number;
  vouchers_used: number;
  collected: number;
};
