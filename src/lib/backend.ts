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
  PayoutAccount,
  PlatformFee,
  PickupResult,
  PickupSlot,
  PickupSlotInput,
  BagLine,
  BoothSales,
  FairDetail,
  FairInput,
  FairWithCounts,
  ReviewState,
  SocietyBooth,
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
  PostInput,
  SocietyPost,
  ReviewStatus,
  Society,
  SocietyInput,
  SocietyMember,
  SocietyRole,
  Ticket,
} from './types';

export type AuthUser = { id: string; email: string };

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'college' | 'major' | 'year_of_study' | 'avatar_url' | 'locale'>>;

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
  /** A society's posts, pinned first, then newest. The committee also sees posts moderators took down. */
  listPosts(societyId: string): Promise<SocietyPost[]>;
  getPost(id: string): Promise<SocietyPost | null>;

  // Signed-in student
  myFollowIds(): Promise<string[]>;
  /** Societies this person has hidden from Discover and the calendar. */
  myHiddenSocietyIds(): Promise<string[]>;
  setSocietyHidden(societyId: string, hidden: boolean): Promise<void>;
  setFollow(societyId: string, follow: boolean): Promise<void>;
  /** Events this person saved for later (private to them). */
  mySavedEventIds(): Promise<string[]>;
  setEventSaved(eventId: string, saved: boolean): Promise<void>;
  /** Which of these posts this person liked (private to them). */
  myLikedPostIds(postIds: string[]): Promise<string[]>;
  setPostLiked(postId: string, liked: boolean): Promise<void>;
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
  /** Creates or edits a post. Pinning one unpins the society's other posts. */
  savePost(input: PostInput): Promise<string>;
  setPostPinned(id: string, pinned: boolean): Promise<void>;
  deletePost(id: string): Promise<void>;
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
  /** Checks out a bag from one society as one order (one reference, one pickup QR). */
  placeBagOrder(societyId: string, lines: BagLine[], method: PaymentMethod, slotId: string | null, note?: string): Promise<Order>;
  /** Upcoming pickup times with how many orders booked each (committee also sees past ones). */
  listPickupSlots(societyId: string): Promise<PickupSlot[]>;
  choosePickupSlot(orderId: string, slotId: string): Promise<void>;
  /** "Tell me when it's back": one notification when stock is added or it goes on sale. */
  setProductAlert(productId: string, on: boolean): Promise<void>;
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

  // Online payments (card, Apple Pay, Google Pay, Alipay, WeChat Pay)
  /** Can buyers pay this society online? */
  onlinePaymentsReady(societyId: string): Promise<boolean>;
  /**
   * The provider's payment page for an unpaid online order. The order becomes paid
   * when the provider confirms, not when the buyer comes back. Null when there is
   * no page to open (the demo pays straight away).
   */
  startOnlinePayment(orderId: string): Promise<string | null>;
  /** The rate this society pays on online orders. */
  platformFee(societyId: string): Promise<PlatformFee>;
  payoutAccount(societyId: string): Promise<PayoutAccount | null>;
  /** The provider's onboarding pages for a society admin (null when nothing to open). */
  startPayoutSetup(societyId: string): Promise<string | null>;
  /** Re-reads the account from the provider, e.g. after onboarding. */
  refreshPayoutAccount(societyId: string): Promise<PayoutAccount | null>;
  /** The provider's payouts dashboard for the society. */
  payoutDashboardUrl(societyId: string): Promise<string | null>;
  /** Refunds a paid online order in full, back to the buyer's card or wallet. */
  refundOnlineOrder(orderId: string): Promise<void>;

  // Shop: committee
  setPaymentSettings(societyId: string, s: Pick<PaymentSettings, 'fps_id' | 'payee_name' | 'payme_link' | 'instructions'>): Promise<void>;
  saveProduct(input: ProductInput): Promise<string>;
  deleteProduct(id: string): Promise<void>;
  listOrders(societyId: string): Promise<SocietyOrder[]>;
  setOrderStatus(ids: string[], status: Exclude<OrderStatus, 'payment_claimed'>): Promise<number>;
  /**
   * `cashReceived` hands over an unpaid cash order and records the cash in one step.
   * `vouchers` is how many of the order's vouchers to use now; without it, an order
   * with vouchers left answers "How many vouchers?".
   */
  collectOrder(societyId: string, code: string, cashReceived?: boolean, vouchers?: number): Promise<PickupResult>;
  savePickupSlot(input: PickupSlotInput): Promise<string>;
  deletePickupSlot(id: string): Promise<void>;

  // Fairs: many societies' booths in one place for a day or two
  /** Fairs coming up or on now (organisers also see their own pending and recent ones). */
  listFairs(): Promise<FairWithCounts[]>;
  getFair(id: string): Promise<FairDetail | null>;
  /** Presale items at confirmed booths, with each booth's number. */
  listFairProducts(fairId: string): Promise<ProductWithStock[]>;
  /** Organiser society admins. A new fair is listed once a platform admin approves it. */
  saveFair(input: FairInput): Promise<string>;
  applyForBooth(fairId: string, societyId: string, note?: string): Promise<void>;
  reviewBooth(boothId: string, status: ReviewState, label: string | null): Promise<void>;
  /** Fairs where this society has, or asked for, a booth. */
  societyBooths(societyId: string): Promise<SocietyBooth[]>;
  /** Presale per booth, for the organiser. */
  fairSales(fairId: string): Promise<BoothSales[]>;

  // Platform admins (Student Affairs / app team)
  pendingFairs(): Promise<FairWithCounts[]>;
  reviewFair(id: string, status: Exclude<ReviewState, 'pending'>): Promise<void>;
  pendingSocieties(): Promise<Society[]>;
  pendingBanners(): Promise<BannerWithLinks[]>;
  reviewSociety(id: string, status: ReviewStatus, verified: boolean): Promise<void>;
  reviewBanner(id: string, status: ReviewStatus, priority: number): Promise<void>;
  /** Mark a major event so it leads "Most anticipated" (this week / month) on Discover. */
  setEventFeatured(id: string, featured: boolean): Promise<void>;
  openReports(): Promise<OpenReport[]>;
  /** 'removed' takes the reported event or post down (or rejects the society / banner). */
  resolveReport(id: string, action: 'dismissed' | 'removed'): Promise<void>;
}

export function isCuhkEmail(email: string) {
  return /@([a-z0-9-]+\.)*cuhk\.edu\.hk$/i.test(email.trim());
}
