import type {
  Attendee,
  Banner,
  BannerInput,
  BannerWithLinks,
  CampusDate,
  CheckInResult,
  EventInput,
  EventQuery,
  EventWithSociety,
  MySociety,
  Profile,
  Registration,
  ReviewStatus,
  Society,
  SocietyInput,
  Ticket,
} from './types';

export type AuthUser = { id: string; email: string };

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'college' | 'major' | 'year_of_study' | 'avatar_url'>>;

export type SocietyPatch = Partial<
  Pick<
    Society,
    'name' | 'short_name' | 'description' | 'category' | 'college' | 'logo_url' | 'cover_url' | 'instagram' | 'website' | 'contact_email'
  >
>;

/** Everything the UI needs from the server. Implemented by Supabase and by an in-memory demo. */
export interface Backend {
  readonly isDemo: boolean;

  // Auth
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** For accounts created by an admin, e.g. the App Store review account. */
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  getProfile(): Promise<Profile | null>;
  updateProfile(patch: ProfilePatch): Promise<void>;

  // Public content
  listBanners(): Promise<BannerWithLinks[]>;
  listEvents(q: EventQuery): Promise<EventWithSociety[]>;
  getEvent(id: string): Promise<EventWithSociety | null>;
  listSocieties(q: { search?: string; category?: string }): Promise<Society[]>;
  getSociety(id: string): Promise<Society | null>;
  listCampusDates(fromDay: string, toDay: string): Promise<CampusDate[]>;

  // Signed-in student
  myFollowIds(): Promise<string[]>;
  setFollow(societyId: string, follow: boolean): Promise<void>;
  myTickets(): Promise<Ticket[]>;
  myRegistration(eventId: string): Promise<Registration | null>;
  waitlistPosition(eventId: string): Promise<number>;
  register(eventId: string): Promise<Registration>;
  cancelRegistration(eventId: string): Promise<void>;
  report(targetType: 'event' | 'society' | 'banner', targetId: string, reason: string): Promise<void>;

  // Society committee
  mySocieties(): Promise<MySociety[]>;
  createSociety(input: SocietyInput): Promise<string>;
  updateSociety(id: string, patch: SocietyPatch): Promise<void>;
  saveEvent(input: EventInput): Promise<string>;
  deleteEvent(id: string): Promise<void>;
  listAttendees(eventId: string): Promise<Attendee[]>;
  checkIn(eventId: string, ticketCode: string): Promise<CheckInResult>;
  societyBanners(societyId: string): Promise<Banner[]>;
  requestBanner(input: BannerInput): Promise<void>;
  deleteBanner(id: string): Promise<void>;
  uploadImage(localUri: string): Promise<string>;

  // Platform admins (Student Affairs / app team)
  pendingSocieties(): Promise<Society[]>;
  pendingBanners(): Promise<BannerWithLinks[]>;
  reviewSociety(id: string, status: ReviewStatus, verified: boolean): Promise<void>;
  reviewBanner(id: string, status: ReviewStatus, priority: number): Promise<void>;
}

export function isCuhkEmail(email: string) {
  return /@([a-z0-9-]+\.)*cuhk\.edu\.hk$/i.test(email.trim());
}
