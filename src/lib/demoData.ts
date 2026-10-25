// Sample content used by demo mode and by scripts/make-seed.ts (supabase/seed.sql).
// Event times are relative to "today" in Hong Kong so the app always looks alive.
// Campus dates are illustrative: replace them with the official CUHK calendar.
import type { Banner, CampusDate, CampusEvent, Society } from './types';

const HK_OFFSET_HOURS = 8;

/** ISO timestamp for `days` from today (HK time) at hh:mm HK time. */
export function hkAt(days: number, hour: number, minute = 0, now = new Date()): string {
  const hkNow = new Date(now.getTime() + HK_OFFSET_HOURS * 3600_000);
  const d = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate() + days, hour - HK_OFFSET_HOURS, minute);
  return new Date(d).toISOString();
}

/** YYYY-MM-DD for `days` from today (HK time). */
export function hkDay(days: number, now = new Date()): string {
  return hkAt(days, 12, 0, now).slice(0, 10);
}

const sid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const bid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function society(n: number, s: Partial<Society> & Pick<Society, 'name' | 'category' | 'description'>): Society {
  return {
    id: sid(n),
    short_name: null,
    college: null,
    logo_url: null,
    cover_url: null,
    instagram: null,
    website: null,
    contact_email: null,
    status: 'approved',
    verified: true,
    follower_count: 0,
    ...s,
  };
}

export const demoSocieties: Society[] = [
  society(1, {
    name: 'CUHK Hiking Club',
    short_name: 'Hiking',
    category: 'Sports',
    description: 'Weekend hikes across Hong Kong for every fitness level. Gear lending, first-aid trained leaders, and plenty of snacks.',
    instagram: '@cuhkhiking',
    follower_count: 842,
  }),
  society(2, {
    name: 'CU Coding Society',
    short_name: 'CUCS',
    category: 'Tech',
    description: 'Hackathons, workshops and study groups for anyone who wants to build things with code. Beginners very welcome.',
    instagram: '@cucoding',
    follower_count: 1290,
  }),
  society(3, {
    name: 'Chung Chi College Student Union',
    short_name: 'CCSU',
    category: 'College',
    college: 'Chung Chi',
    description: 'Representing Chung Chi students. Orientation, high table dinners, college festivals and welfare.',
    follower_count: 2104,
  }),
  society(4, {
    name: 'CUHK Photographic Society',
    short_name: 'PhotoSoc',
    category: 'Arts',
    description: 'Photo walks, darkroom sessions and an annual exhibition. Phones and film cameras equally welcome.',
    follower_count: 655,
  }),
  society(5, {
    name: 'CUHK Debate Society',
    short_name: 'Debate',
    category: 'Academic',
    description: 'British Parliamentary and Asian format debating in English, Cantonese and Putonghua. Weekly training.',
    follower_count: 402,
  }),
  society(6, {
    name: 'Wu Yee Sun College Orchestra',
    short_name: 'WYS Orchestra',
    category: 'Music',
    college: 'Wu Yee Sun',
    description: 'A friendly student orchestra open to all colleges. Two concerts a year and chamber groups in between.',
    follower_count: 318,
  }),
  society(7, {
    name: 'CUHK Social Service Team',
    short_name: 'SST',
    category: 'Service',
    description: 'Tutoring, elderly visits and community projects in Shatin and beyond.',
    follower_count: 771,
  }),
  society(8, {
    name: 'International Students Association',
    short_name: 'ISA',
    category: 'Culture',
    description: 'A home away from home for exchange and international students. Food nights, city trips and language exchange.',
    follower_count: 1533,
  }),
];

type EventSeed = Omit<
  CampusEvent,
  | 'id'
  | 'status'
  | 'cover_url'
  | 'registration_opens_at'
  | 'registration_closes_at'
  | 'waitlist_enabled'
  | 'confirmed_count'
  | 'waitlist_count'
  | 'signup_question'
  | 'removed_at'
> &
  Partial<CampusEvent>;

function event(n: number, e: EventSeed): CampusEvent {
  return {
    id: eid(n),
    status: 'published',
    cover_url: null,
    registration_opens_at: null,
    registration_closes_at: null,
    waitlist_enabled: true,
    confirmed_count: 0,
    waitlist_count: 0,
    signup_question: null,
    removed_at: null,
    ...e,
  };
}

export function makeDemoEvents(now = new Date()): CampusEvent[] {
  const at = (d: number, h: number, m = 0) => hkAt(d, h, m, now);
  return [
    event(1, {
      society_id: sid(1),
      title: 'Sunrise hike: Lion Rock',
      description: 'Meet at University MTR Exit B at 4:45am. Bring 1.5L water, a headlamp and a snack. We will be back on campus by 10am.',
      category: 'Sports',
      location: 'University MTR, Exit B',
      starts_at: at(2, 4, 45),
      ends_at: at(2, 10),
      registration_required: true,
      capacity: 30,
      price_text: 'Free',
      confirmed_count: 30,
      waitlist_count: 4,
    }),
    event(2, {
      society_id: sid(2),
      title: 'CU Hack Night: Build an app in 4 hours',
      description: 'Team up and ship something fun. Mentors on hand, pizza at 8pm, prizes for the best demo. No experience needed.',
      category: 'Workshop',
      location: 'Ho Sin-Hang Engineering Building, Room 513',
      starts_at: at(3, 18, 30),
      ends_at: at(3, 22, 30),
      registration_required: true,
      capacity: 80,
      price_text: 'Free',
      signup_question: 'What would you like to build? (Helps us form teams)',
      confirmed_count: 61,
    }),
    event(3, {
      society_id: sid(3),
      title: 'Chung Chi Lantern & Music Night',
      description: 'Lanterns, riddles, snacks and live music on the Chung Chi lawn. Open to all students.',
      category: 'Social',
      location: 'Chung Chi College Lawn',
      starts_at: at(0, 19),
      ends_at: at(0, 22),
      registration_required: false,
      capacity: null,
      price_text: 'Free',
    }),
    event(4, {
      society_id: sid(4),
      title: 'Golden hour photo walk',
      description: 'Shoot the campus at golden hour with tips on composition and editing. Phone photographers welcome.',
      category: 'Workshop',
      location: 'University Mall, Sir Run Run Shaw Hall',
      starts_at: at(1, 17),
      ends_at: at(1, 19),
      registration_required: true,
      capacity: 25,
      price_text: 'Free',
      confirmed_count: 12,
    }),
    event(5, {
      society_id: sid(5),
      title: 'Novice debate workshop',
      description: 'Learn the BP format, practise a short speech and get feedback from experienced debaters.',
      category: 'Talk',
      location: 'Yasumoto International Academic Park, LT6',
      starts_at: at(4, 19),
      ends_at: at(4, 21),
      registration_required: true,
      capacity: 40,
      price_text: 'Free',
      confirmed_count: 18,
    }),
    event(6, {
      society_id: sid(6),
      title: 'Autumn Concert: Dvořák 8',
      description: 'Our autumn concert featuring Dvořák Symphony No. 8 and student soloists.',
      category: 'Performance',
      location: 'Lee Hysan Concert Hall',
      starts_at: at(9, 19, 30),
      ends_at: at(9, 21, 30),
      registration_required: true,
      capacity: 300,
      price_text: 'Free (ticket required)',
      confirmed_count: 212,
    }),
    event(7, {
      society_id: sid(7),
      title: 'Saturday tutoring in Shatin',
      description: 'Help primary school students with homework. Training provided on the day.',
      category: 'Volunteering',
      location: 'Meet at Central Campus bus stop',
      starts_at: at(5, 9, 30),
      ends_at: at(5, 12, 30),
      registration_required: true,
      capacity: 15,
      waitlist_enabled: false,
      price_text: 'Free',
      confirmed_count: 15,
    }),
    event(8, {
      society_id: sid(8),
      title: 'Global food night',
      description: 'Bring a dish from home (or just bring yourself). Music, games and food from over 20 countries.',
      category: 'Social',
      location: 'Pommerenke Student Centre',
      starts_at: at(6, 18, 30),
      ends_at: at(6, 21, 30),
      registration_required: true,
      capacity: 120,
      price_text: 'HK$20 at the door',
      confirmed_count: 87,
    }),
    event(9, {
      society_id: sid(2),
      title: 'Intro to React Native',
      description: 'Build your first mobile app. Bring a laptop with Node installed.',
      category: 'Workshop',
      location: 'Science Centre, L1',
      starts_at: at(11, 19),
      ends_at: at(11, 21),
      registration_required: true,
      capacity: 60,
      price_text: 'Free',
      confirmed_count: 22,
      registration_opens_at: at(1, 12),
    }),
    event(10, {
      society_id: sid(1),
      title: 'MacLehose Section 2 day hike',
      description: 'A full day on one of the most beautiful sections of the MacLehose Trail. Moderate to hard.',
      category: 'Sports',
      location: 'Pak Tam Chung',
      starts_at: at(13, 8),
      ends_at: at(13, 17),
      registration_required: true,
      capacity: 25,
      price_text: 'Free',
      confirmed_count: 9,
    }),
    event(11, {
      society_id: sid(8),
      title: 'Hong Kong city trip: Sham Shui Po',
      description: 'Street food, fabric markets and hidden cafés with local student guides.',
      category: 'Social',
      location: 'University MTR concourse',
      starts_at: at(16, 13),
      ends_at: at(16, 18),
      registration_required: true,
      capacity: 30,
      price_text: 'Bring your own Octopus',
      confirmed_count: 3,
    }),
    event(12, {
      society_id: sid(3),
      title: 'Career talk: Life after CUHK',
      description: 'Alumni from banking, tech and NGOs share how they found their first job.',
      category: 'Career',
      location: 'Chung Chi College Chapel',
      starts_at: at(8, 18, 30),
      ends_at: at(8, 20),
      registration_required: true,
      capacity: 150,
      price_text: 'Free',
      confirmed_count: 44,
    }),
    event(13, {
      society_id: sid(4),
      title: 'Darkroom basics',
      description: 'Develop your own black and white film. Limited spots.',
      category: 'Workshop',
      location: 'Pommerenke Student Centre, Darkroom',
      starts_at: at(-3, 14),
      ends_at: at(-3, 17),
      registration_required: true,
      capacity: 8,
      price_text: 'HK$50 materials',
      confirmed_count: 8,
    }),
  ];
}

export function makeDemoBanners(now = new Date()): Banner[] {
  const base = { status: 'approved' as const, starts_at: hkAt(-1, 0, 0, now), subtitle: null, image_url: null };
  return [
    {
      ...base,
      id: bid(1),
      society_id: sid(6),
      event_id: eid(6),
      title: 'Autumn Concert',
      subtitle: 'Dvořák 8 at Lee Hysan Hall · Free tickets',
      ends_at: hkAt(9, 19, 30, now),
      priority: 10,
    },
    {
      ...base,
      id: bid(2),
      society_id: sid(2),
      event_id: eid(2),
      title: 'CU Hack Night',
      subtitle: 'Build an app in 4 hours · Pizza included',
      ends_at: hkAt(3, 18, 30, now),
      priority: 5,
    },
    {
      ...base,
      id: bid(3),
      society_id: sid(8),
      event_id: eid(8),
      title: 'Global Food Night',
      subtitle: 'Food from 20+ countries at Pommerenke',
      ends_at: hkAt(6, 18, 30, now),
      priority: 1,
    },
  ];
}

export function makeDemoCampusDates(now = new Date()): CampusDate[] {
  const d = (n: number) => hkDay(n, now);
  const date = (
    n: number,
    title: string,
    title_zh: string,
    kind: CampusDate['kind'],
    from: number,
    to = from,
    college: string | null = null,
  ): CampusDate => ({
    id: cid(n),
    title,
    title_zh,
    kind,
    college,
    starts_on: d(from),
    ends_on: d(to),
    url: null,
  });
  return [
    date(1, 'Add/drop period ends', '加退選截止', 'deadline', 1),
    date(2, 'Reading week', '閱讀週', 'term', 14, 18),
    date(3, 'Chung Chi Founders Day', '崇基立校日', 'college', 7, 7, 'Chung Chi'),
    date(4, 'Public holiday', '公眾假期', 'holiday', 10),
    date(5, 'Course evaluation opens', '課程評估開始', 'university', 20),
    date(6, 'New Asia High Table Dinner', '新亞高桌晚宴', 'college', 12, 12, 'New Asia'),
    date(7, 'Last day of classes', '最後上課日', 'term', 35),
    date(8, 'Examination period', '考試期', 'exam', 38, 50),
  ];
}
