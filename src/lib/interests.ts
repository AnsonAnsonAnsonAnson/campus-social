// Topics for the onboarding taste picker. Like a music app's genres, they are
// specific things people do ("Hiking", not "Sports"); each maps to the society
// category it says something about, and those categories are what we save.

export type Topic = { label: string; category: string };

/** Most popular first within each category; the first two of each show up front. */
export const TOPICS: Topic[] = [
  { label: 'Hiking and camping', category: 'Sports' },
  { label: 'Basketball', category: 'Sports' },
  { label: 'Dance', category: 'Sports' },
  { label: 'Football', category: 'Sports' },
  { label: 'Badminton', category: 'Sports' },
  { label: 'Swimming', category: 'Sports' },
  { label: 'Band', category: 'Music' },
  { label: 'Choir', category: 'Music' },
  { label: 'A cappella', category: 'Music' },
  { label: 'Orchestra', category: 'Music' },
  { label: 'Photography', category: 'Arts' },
  { label: 'Film', category: 'Arts' },
  { label: 'Drama', category: 'Arts' },
  { label: 'Drawing', category: 'Arts' },
  { label: 'Design', category: 'Arts' },
  { label: 'Coding', category: 'Tech' },
  { label: 'AI', category: 'Tech' },
  { label: 'Startups', category: 'Tech' },
  { label: 'Robotics', category: 'Tech' },
  { label: 'Debate', category: 'Academic' },
  { label: 'Finance', category: 'Academic' },
  { label: 'Case competitions', category: 'Academic' },
  { label: 'Research', category: 'Academic' },
  { label: 'Language exchange', category: 'Culture' },
  { label: 'Food', category: 'Culture' },
  { label: 'Travel', category: 'Culture' },
  { label: 'Exchange students', category: 'Culture' },
  { label: 'Volunteering', category: 'Service' },
  { label: 'Environment', category: 'Service' },
  { label: 'Mentoring', category: 'Service' },
  { label: 'Hall life', category: 'College' },
  { label: 'O’ Camp', category: 'College' },
  { label: 'Fellowship', category: 'Faith' },
  { label: 'Board games', category: 'Other' },
  { label: 'Anime', category: 'Other' },
];

/** What shows before you pick anything: a couple of topics from each category, mixed. */
export function startingTopics(): string[] {
  const firsts: string[] = [];
  const seconds: string[] = [];
  const seen = new Map<string, number>();
  for (const topic of TOPICS) {
    const n = seen.get(topic.category) ?? 0;
    seen.set(topic.category, n + 1);
    if (n === 0) firsts.push(topic.label);
    else if (n === 1) seconds.push(topic.label);
  }
  return [...firsts, ...seconds];
}

/** Picking a topic reveals the rest of its category right after it, like "more like this". */
export function revealRelated(shown: string[], picked: string): string[] {
  const category = TOPICS.find((x) => x.label === picked)?.category;
  const extra = TOPICS.filter((x) => x.category === category && !shown.includes(x.label)).map((x) => x.label);
  const at = shown.indexOf(picked);
  return [...shown.slice(0, at + 1), ...extra, ...shown.slice(at + 1)];
}

/** Society categories behind the picked topics, in a stable order: what goes on the profile. */
export function categoriesFor(picked: Iterable<string>): string[] {
  const set = new Set(picked);
  return [...new Set(TOPICS.filter((x) => set.has(x.label)).map((x) => x.category))];
}
