export const COLLEGES = [
  'Chung Chi',
  'New Asia',
  'United',
  'Shaw',
  'Morningside',
  'S.H. Ho',
  'Lee Woo Sing',
  'Wu Yee Sun',
  'C.W. Chu',
] as const;

export const SOCIETY_CATEGORIES = [
  'Academic',
  'Arts',
  'Culture',
  'Faith',
  'Music',
  'Service',
  'Sports',
  'Tech',
  'College',
  'Other',
] as const;

export const EVENT_CATEGORIES = [
  'Social',
  'Talk',
  'Workshop',
  'Sports',
  'Performance',
  'Career',
  'Volunteering',
  'Orientation',
  'Other',
] as const;

/** Prefix for QR ticket payloads, so the scanner can ignore unrelated QR codes. */
export const TICKET_QR_PREFIX = 'campussocial:ticket:';
/** Tickets issued before the app was renamed. */
export const LEGACY_TICKET_QR_PREFIX = 'cuhkcampus:ticket:';

export const SUPPORT_EMAIL = 'support@example.com';
export const PRIVACY_URL = 'https://example.com/privacy';
export const TERMS_URL = 'https://example.com/terms';
