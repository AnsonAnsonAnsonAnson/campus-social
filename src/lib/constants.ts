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

/** Public pages in docs/, served by GitHub Pages (Settings › Pages › main /docs). */
const SITE = 'https://ansonansonansonanson.github.io/campus-social';
export const SUPPORT_URL = `${SITE}/`;
export const PRIVACY_URL = `${SITE}/privacy.html`;
export const TERMS_URL = `${SITE}/terms.html`;
