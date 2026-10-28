import type {
  AppNotification,
  ImportRow,
  JoinInput,
  MemberCardResult,
  Membership,
  MembershipPlan,
  MembershipStatus,
  MyMembership,
  MyOrder,
  MyRegistration,
  ReceiptKind,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentSettings,
  PickupResult,
  PlanInput,
  ProductInput,
  ProductWithStock,
  SocietyOrder,
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
  OpenReport,
  Profile,
  Registration,
  ReportTarget,
  ReviewStatus,
  Society,
  SocietyInput,
  SocietyMember,
  SocietyRole,
  Ticket,
} from './types';

export type AuthUser = { id: string; email: string };

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'college' | 'major' | 'year_of_study' | 'avatar_url' | 'locale' | 'interests'>>;

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
  /** Societies this person has hidden from Discover and the calendar. */
  myHiddenSocietyIds(): Promise<string[]>;
  setSocietyHidden(societyId: string, hidden: boolean): Promise<void>;
  setFollow(societyId: string, follow: boolean): Promise<void>;
  /** Events this person saved for later (private to them). */
  mySavedEventIds(): Promise<string[]>;
  setEventSaved(eventId: string, saved: boolean): Promise<void>;
  myTickets(): Promise<Ticket[]>;
  myRegistration(eventId: string): Promise<MyRegistration | null>;
  waitlistPosition(eventId: string): Promise<number>;
  /** `answer` replies to the event's sign-up question, if it has one; `method` is needed for paid events. */
  register(eventId: string, answer?: string, method?: PaymentMethod): Promise<Registration>;
  cancelRegistration(eventId: string): Promise<void>;
  report(targetType: ReportTarget, targetId: string, reason: string): Promise<void>;

  // Notifications
  listNotifications(): Promise<AppNotification[]>;
  unreadNotificationCount(): Promise<number>;
  markAllNotificationsRead(): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;

  // Society committee
  mySocieties(): Promise<MySociety[]>;
  createSociety(input: SocietyInput): Promise<string>;
  updateSociety(id: string, patch: SocietyPatch): Promise<void>;
  saveEvent(input: EventInput): Promise<string>;
  deleteEvent(id: string): Promise<void>;
  listAttendees(eventId: string): Promise<Attendee[]>;
  checkIn(eventId: string, ticketCode: string): Promise<CheckInResult>;
  /** Manual check-in (or undo) from the attendee list. */
  setCheckedIn(registrationId: string, checked: boolean): Promise<void>;
  listMembers(societyId: string): Promise<SocietyMember[]>;
  addMember(societyId: string, email: string, role: Exclude<SocietyRole, 'owner'>): Promise<void>;
  setMemberRole(societyId: string, userId: string, role: Exclude<SocietyRole, 'owner'>): Promise<void>;
  removeMember(societyId: string, userId: string): Promise<void>;
  transferOwnership(societyId: string, userId: string): Promise<void>;
  societyBanners(societyId: string): Promise<Banner[]>;
  requestBanner(input: BannerInput): Promise<void>;
  deleteBanner(id: string): Promise<void>;
  uploadImage(localUri: string): Promise<string>;

  // Members: students
  /** Open plans for a society (committee members also see closed ones). */
  listPlans(societyId: string): Promise<MembershipPlan[]>;
  myMemberships(): Promise<MyMembership[]>;
  joinSociety(input: JoinInput): Promise<Membership>;
  claimMembershipPaid(id: string): Promise<void>;
  cancelMembership(id: string): Promise<void>;

  // Members: committee
  savePlan(input: PlanInput): Promise<string>;
  deletePlan(id: string): Promise<void>;
  /** Every membership of a society, newest first. */
  listMemberships(societyId: string): Promise<Membership[]>;
  /** 'active' approves (and records payment on paid plans). Returns how many changed. */
  setMembershipStatus(ids: string[], status: Exclude<MembershipStatus, 'cancelled'>): Promise<number>;
  importMemberships(planId: string, rows: ImportRow[]): Promise<number>;
  logMembershipExport(societyId: string, rows: number): Promise<void>;
  checkMemberCard(societyId: string, code: string): Promise<MemberCardResult>;

  // Shop: students
  getPaymentSettings(societyId: string): Promise<PaymentSettings | null>;
  /** A society's products, or every open product across shops when societyId is null. */
  listProducts(societyId: string | null): Promise<ProductWithStock[]>;
  placeOrder(productId: string, items: { variant: string; qty: number }[], method: PaymentMethod, note?: string): Promise<Order>;
  myOrders(): Promise<MyOrder[]>;
  claimOrderPaid(id: string, note?: string): Promise<void>;
  cancelMyOrder(id: string): Promise<void>;
  /**
   * Optional payment screenshot for an order or a membership (an already compressed
   * JPEG). Replaces any earlier one and tells the treasurer, like "I've paid".
   */
  uploadReceipt(kind: ReceiptKind, record: { id: string; society_id: string }, jpegUri: string): Promise<void>;
  /** A short-lived link to a screenshot, for the payer or the society's admins. */
  receiptUrl(path: string): Promise<string>;

  // Shop: committee
  setPaymentSettings(societyId: string, s: Pick<PaymentSettings, 'fps_id' | 'payee_name' | 'payme_link' | 'instructions'>): Promise<void>;
  saveProduct(input: ProductInput): Promise<string>;
  deleteProduct(id: string): Promise<void>;
  listOrders(societyId: string): Promise<SocietyOrder[]>;
  setOrderStatus(ids: string[], status: Exclude<OrderStatus, 'payment_claimed'>): Promise<number>;
  collectOrder(societyId: string, code: string): Promise<PickupResult>;

  // Platform admins (Student Affairs / app team)
  pendingSocieties(): Promise<Society[]>;
  pendingBanners(): Promise<BannerWithLinks[]>;
  reviewSociety(id: string, status: ReviewStatus, verified: boolean): Promise<void>;
  reviewBanner(id: string, status: ReviewStatus, priority: number): Promise<void>;
  openReports(): Promise<OpenReport[]>;
  /** 'removed' takes the reported event down (or rejects the society / banner). */
  resolveReport(id: string, action: 'dismissed' | 'removed'): Promise<void>;
}

export function isCuhkEmail(email: string) {
  return /@([a-z0-9-]+\.)*cuhk\.edu\.hk$/i.test(email.trim());
}
