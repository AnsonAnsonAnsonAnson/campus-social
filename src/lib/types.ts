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
  'waitlist_promoted' | 'event_cancelled' | 'event_updated' | 'new_event' | 'society_approved' | 'committee_added';

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
