import { getLang, intlLocale, t } from './i18n';

// All times are shown in Hong Kong time regardless of the device timezone,
// so exchange students with a foreign phone setting still see campus times.
const TZ = 'Asia/Hong_Kong';

// Formatters are cached per language, since building Intl objects is slow.
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(name: string, opts: Intl.DateTimeFormatOptions) {
  const key = `${getLang()}:${name}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(), { timeZone: TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}

const dayFmt = () => fmt('day', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = () => fmt('time', { hour: 'numeric', minute: '2-digit', hour12: true });
const longDayFmt = () => fmt('longDay', { weekday: 'long', day: 'numeric', month: 'long' });
const monthDayFmt = () => fmt('monthDay', { day: 'numeric', month: 'short' });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD of an ISO timestamp in Hong Kong. */
export function hkDate(iso: string | Date) {
  return ymdFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function todayHK() {
  return hkDate(new Date());
}

export function formatDay(iso: string) {
  const d = hkDate(iso);
  const today = todayHK();
  const tomorrow = hkDate(new Date(Date.now() + 86400_000));
  if (d === today) return t('Today');
  if (d === tomorrow) return t('Tomorrow');
  return dayFmt().format(new Date(iso));
}

export function formatTime(iso: string) {
  const s = timeFmt().format(new Date(iso));
  // "6:30 pm" → "6:30pm"; Chinese ("下午6:30") is left as it is.
  return getLang() === 'en' ? s.toLowerCase().replace(/\s/g, '') : s;
}

export function formatWhen(starts: string, ends?: string) {
  const start = `${formatDay(starts)} · ${formatTime(starts)}`;
  if (!ends) return start;
  return hkDate(starts) === hkDate(ends) ? `${start}–${formatTime(ends)}` : `${start} – ${formatDay(ends)} ${formatTime(ends)}`;
}

export function formatLongDay(isoOrDay: string) {
  const d = isoOrDay.length === 10 ? new Date(`${isoOrDay}T12:00:00+08:00`) : new Date(isoOrDay);
  return longDayFmt().format(d);
}

export function formatDayRange(fromDay: string, toDay: string) {
  const a = monthDayFmt().format(new Date(`${fromDay}T12:00:00+08:00`));
  if (fromDay === toDay) return a;
  return `${a} – ${monthDayFmt().format(new Date(`${toDay}T12:00:00+08:00`))}`;
}

/** Start/end of a HK calendar day as ISO timestamps. */
export function hkDayBounds(day: string) {
  return {
    from: new Date(`${day}T00:00:00+08:00`).toISOString(),
    to: new Date(`${day}T23:59:59+08:00`).toISOString(),
  };
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return hkDate(d);
}

export function compactNumber(n: number) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
}

export type Availability =
  | { kind: 'open'; label: string }
  | { kind: 'few'; label: string }
  | { kind: 'waitlist'; label: string }
  | { kind: 'full'; label: string }
  | { kind: 'not-open'; label: string }
  | { kind: 'closed'; label: string }
  | { kind: 'drop-in'; label: string }
  | { kind: 'cancelled'; label: string };

export function availability(e: {
  status: string;
  registration_required: boolean;
  capacity: number | null;
  confirmed_count: number;
  waitlist_enabled: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string;
}): Availability {
  const now = new Date().toISOString();
  if (e.status === 'cancelled') return { kind: 'cancelled', label: t('Cancelled') };
  if (!e.registration_required) return { kind: 'drop-in', label: t('No sign-up needed') };
  if (e.registration_opens_at && now < e.registration_opens_at)
    return {
      kind: 'not-open',
      label: t('Sign-up opens {when}', { when: `${formatDay(e.registration_opens_at)} ${formatTime(e.registration_opens_at)}` }),
    };
  if (now > (e.registration_closes_at ?? e.starts_at)) return { kind: 'closed', label: t('Sign-up closed') };
  if (e.capacity == null) return { kind: 'open', label: t('Open') };
  const left = e.capacity - e.confirmed_count;
  if (left <= 0) return e.waitlist_enabled ? { kind: 'waitlist', label: t('Full · join waitlist') } : { kind: 'full', label: t('Full') };
  const label = left === 1 ? t('1 spot left') : t('{n} spots left', { n: left });
  if (left <= Math.max(5, e.capacity * 0.1)) return { kind: 'few', label };
  return { kind: 'open', label };
}

/** "Just now", "5m", "3h", "Yesterday", then a date. For notification timestamps. */
export function formatAgo(iso: string, now = Date.now()) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return t('Just now');
  if (mins < 60) return t('{n}m', { n: mins });
  if (mins < 24 * 60) return t('{n}h', { n: Math.floor(mins / 60) });
  if (hkDate(iso) === hkDate(new Date(now - 86400_000))) return t('Yesterday');
  return monthDayFmt().format(new Date(iso));
}
