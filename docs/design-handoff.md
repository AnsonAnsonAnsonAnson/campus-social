# Campus Social: design hand-off (v2)

Prepared 26 Oct 2026 from the Claude Design canvas **Campus Social Redesign** (private link, ask Anson for access). Use it alongside the canvas, where every value below is drawn. Everything here maps onto `src/lib/theme.ts`, `src/components/ui.tsx` and the existing component files.

> **Brand update (2026-10-29):** the app has one signature brand colour, set by `BRAND` in `src/lib/theme.ts` (default for launch: the original v2 cobalt `#2450F0` with tangerine; other palettes are kept in `BRANDS` for later). Cobalt and tangerine values below are the v2 originals; read them as `palette.brand` / `palette.accent`. Fills (primary button, selected chips, current-tab pill, progress) use `brand`/`onBrand`; icons, borders and links use `tint`/`tintText`, which for a light brand like lime are dark. Redraw the icon and splash with `BRAND=<name> python3 scripts/make-icons.py` and update the three colours in `app.json`.

**Direction in one line:** sharp, big-tech look (Apple / Google style). True white and black surfaces, neutral greys, one electric cobalt for the single primary action per screen, a tangerine accent for dates, and vivid flat category colours for event covers. CUHK purple and gold are retired.

**Rules that apply everywhere**

- Filled cobalt (`tint`) appears on at most **one** control per screen: the main action. Selected chips, segmented controls, toasts and "Checked in" use `ink` (near-black, or white in dark mode).
- Status is always colour **plus** an icon or words, never colour alone.
- Disabled buttons are neutral grey (`disabledFill` / `disabledText`) and always have a hint underneath that says what's missing.
- Focus ring is cobalt (2pt border + 3pt halo), never gold or orange.
- Chinese text: cap display weights at 600 and use the `zh` line heights below. Set `lang="zh-Hant-HK"` (or the platform equivalent) on Chinese UI text so Android never falls back to Simplified glyphs.
- Event content (titles, venues, society names) stays in the language the society wrote it in.
- Every tap target is at least 44 × 44pt. Screen gutter is 16pt.

---

## 1. Design tokens

Drop-in replacement for `src/lib/theme.ts`. Existing key names are kept so current screens keep compiling. New keys are marked `// new`. `purple`, `purpleLight` and `gold` are kept as deprecated aliases until every screen has moved over; delete them afterwards.

```ts
import { useColorScheme } from 'react-native';

/** Brand scales. Pick role tokens below in components; use these only for one-offs. */
export const palette = {
  cobalt: { 50: '#EEF2FF', 100: '#E6ECFF', 200: '#B9C8FF', 300: '#8FA6FF', 400: '#6283FF', 500: '#3D63FF', 600: '#2450F0', 700: '#1A3CC4', 800: '#152F96', 900: '#0E1A4D', 950: '#0A1033' },
  tangerine: { 50: '#FFF4EC', 100: '#FFE4D1', 200: '#FFC8A3', 300: '#FFA66B', 400: '#FF8A3D', 500: '#FF6F0F', 600: '#E05A00', 700: '#B34700', 800: '#853500', 900: '#3A1A04' },
  neutral: { 0: '#FFFFFF', 50: '#F5F5F7', 100: '#EDEDF0', 200: '#E0E0E5', 300: '#C7C7CC', 400: '#A1A1A6', 450: '#8E8E93', 500: '#76767C', 600: '#6E6E73', 700: '#48484A', 750: '#38383A', 800: '#2C2C2E', 850: '#1C1C1E', 900: '#0A0A0B', 1000: '#000000' },
} as const;

const light = {
  // deprecated aliases (remove after migration)
  purple: '#2450F0',
  purpleLight: '#3D63FF',
  gold: '#FF6F0F',

  tint: '#2450F0',            // the one primary action per screen
  tintPressed: '#1A3CC4',     // new
  onTint: '#FFFFFF',
  tintSoft: '#E6ECFF',        // new · Follow button, "Going" pill, bell-on
  tintText: '#2450F0',        // new · links, plain buttons, verified tick

  accent: '#FF6F0F',          // new · campus-date markers, "New" dot
  accentSoft: '#FFE4D1',      // new · campus-date bars and cards
  accentText: '#B34700',      // new · event dates in lists, campus labels (AA on white)

  background: '#F5F5F7',      // grouped screens (Profile, Manage, forms)
  backgroundPlain: '#FFFFFF', // new · feed screens (Discover, Search, Tickets, Calendar, Societies, Event)
  card: '#FFFFFF',
  elevated: '#FFFFFF',        // new · sheets, menus, bottom action bar
  text: '#0A0A0B',
  textSecondary: '#6E6E73',
  textTertiary: '#76767C',    // new · placeholders, timestamps
  border: '#E0E0E5',
  fill: '#F2F2F5',            // search field, secondary buttons, icon tiles
  fillStrong: '#EDEDF0',      // new · neutral pills, segmented-control track
  ink: '#0A0A0B',             // new · selected chip, Checked in, toast, "next event" card
  onInk: '#FFFFFF',           // new

  disabledFill: '#EDEDF0',    // new
  disabledText: '#A1A1A6',    // new
  focusRing: 'rgba(36,80,240,0.24)', // new · 3pt halo outside a 2pt tint border

  success: '#078040',
  successSoft: '#E3F7EA',     // new
  successText: '#066B35',     // new
  warning: '#C25400',
  warningSoft: '#FFF1E0',     // new
  warningText: '#9A4300',     // new
  danger: '#E0201B',          // also: unread badge, saved heart
  dangerSoft: '#FFE8E7',      // new
  dangerText: '#B8150F',      // new
  info: '#0A7EA4',            // new
  infoSoft: '#E2F4FA',        // new
  infoText: '#075F7D',        // new

  toast: '#0A0A0B',
  onToast: '#FFFFFF',
  scrim: 'rgba(10,10,11,0.45)', // new
  tabBar: 'rgba(255,255,255,0.94)', // new
};

const dark: typeof light = {
  purple: '#3D63FF',
  purpleLight: '#8FA6FF',
  gold: '#FF8A3D',

  tint: '#3D63FF',
  tintPressed: '#6283FF',
  onTint: '#FFFFFF',
  tintSoft: '#0E1A4D',
  tintText: '#8FA6FF',

  accent: '#FF8A3D',
  accentSoft: '#3A1A04',
  accentText: '#FFA66B',

  background: '#000000',
  backgroundPlain: '#000000',
  card: '#1C1C1E',
  elevated: '#2C2C2E',
  text: '#F5F5F7',
  textSecondary: '#A1A1A6',
  textTertiary: '#8E8E93',
  border: '#38383A',
  fill: '#2C2C2E',
  fillStrong: '#2C2C2E',
  ink: '#F5F5F7',
  onInk: '#0A0A0B',

  disabledFill: '#2C2C2E',
  disabledText: '#636366',
  focusRing: 'rgba(61,99,255,0.45)',

  success: '#30D158',
  successSoft: '#0E2E19',
  successText: '#5BE07E',
  warning: '#FF9F0A',
  warningSoft: '#3A2400',
  warningText: '#FFB547',
  danger: '#FF453A',
  dangerSoft: '#3D0F0C',
  dangerText: '#FF6B61',
  info: '#64D2FF',
  infoSoft: '#062B38',
  infoText: '#7FDBFF',

  toast: '#F5F5F7',
  onToast: '#0A0A0B',
  scrim: 'rgba(0,0,0,0.6)',
  tabBar: 'rgba(28,28,30,0.94)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Existing keys keep their values; lg drops 18 → 16. */
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const; // xs, xl, pill are new
export const avatarRadius = (size: number) => size * 0.28; // society squircle

/** Existing keys keep their values so layouts don't shift. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 } as const; // xxs, xxl, xxxl are new

/** Light uses shadows; dark uses lighter surfaces (`elevated`) plus a 6% white hairline. */
export const elevation = {
  e0: {},
  e1: { shadowColor: '#16081E', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }, // cards
  e2: { shadowColor: '#16081E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, // action bar, floating buttons on covers
  e3: { shadowColor: '#16081E', shadowOpacity: 0.18, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 12 }, // sheets, dialogs
} as const;

/**
 * Type scale. `zh` overrides apply when the UI language is Traditional Chinese:
 * lighter display weights and ~1.45× line height. Keys `title` and `overline` are kept as aliases.
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, zh: { lineHeight: 46, fontWeight: '600' } },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3, zh: { lineHeight: 38, fontWeight: '600' } }, // new
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', zh: { lineHeight: 31, fontWeight: '600' } }, // new
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', zh: { lineHeight: 31, fontWeight: '600' } }, // alias of title2
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', zh: { lineHeight: 25 } },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400', zh: { lineHeight: 24 } },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', zh: { lineHeight: 22 } },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', zh: { lineHeight: 19 } },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', zh: { lineHeight: 19 } }, // new · replaces overline (sentence case, textSecondary)
  overline: { fontSize: 13, lineHeight: 18, fontWeight: '600', zh: { lineHeight: 19 } }, // alias of label · uppercase removed
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600', zh: { lineHeight: 17 } },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' }, // new · small buttons use 15
  stat: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }, // new
  code: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: 2, fontFamily: 'Menlo' }, // new · ticket code; use 'monospace' on Android
} as const;

/** Event categories → cover colour (white text/icon, ≥4.5:1) and icon. Replaces the gradient pairs. */
export const categoryArt = {
  Social:       { cover: '#E11D74', coverDark: '#E11D74', icon: 'people-outline' },
  Talk:         { cover: '#0072A3', coverDark: '#0072A3', icon: 'mic-outline' },
  Workshop:     { cover: '#C94700', coverDark: '#C94700', icon: 'construct-outline' },
  Sports:       { cover: '#00875A', coverDark: '#00875A', icon: 'basketball-outline' },
  Performance:  { cover: '#7C3AED', coverDark: '#7C3AED', icon: 'musical-notes-outline' },
  Career:       { cover: '#18181B', coverDark: '#3A3A3F', icon: 'briefcase-outline' },
  Volunteering: { cover: '#D92D20', coverDark: '#D92D20', icon: 'heart-outline' },
  Orientation:  { cover: '#2450F0', coverDark: '#3D63FF', icon: 'compass-outline' },
  Other:        { cover: '#52525B', coverDark: '#5A5A63', icon: 'sparkles-outline' },
} as const;

/** Soft tints for society avatars (initials in `ink`). Keyed by colour family. */
export const avatarArt = {
  Pink:     { light: ['#FDE7F0', '#C0135E'], dark: ['#3A0D20', '#FF7AB3'] },
  Ocean:    { light: ['#E0F2FA', '#00648F'], dark: ['#032636', '#5CC8F5'] },
  Orange:   { light: ['#FFEDE0', '#B03E00'], dark: ['#3A1A04', '#FF9B5C'] },
  Green:    { light: ['#DDF5EA', '#00774F'], dark: ['#032B1D', '#4FDBA0'] },
  Violet:   { light: ['#EFE7FE', '#6D28D9'], dark: ['#24104A', '#B794FF'] },
  Graphite: { light: ['#E8E8EB', '#18181B'], dark: ['#2C2C2E', '#D4D4D8'] },
  Red:      { light: ['#FDE8E6', '#B42318'], dark: ['#3D0F0C', '#FF6B61'] },
  Cobalt:   { light: ['#E6ECFF', '#2450F0'], dark: ['#0E1A4D', '#8FA6FF'] },
  Slate:    { light: ['#EDEDF0', '#48484A'], dark: ['#2C2C2E', '#C7C7CC'] },
} as const;

/** Society category → avatar family. Faith and Other share Slate; the initials tell them apart. */
export const societyFamily = {
  Academic: 'Ocean', Tech: 'Graphite', Arts: 'Violet', Music: 'Pink', Culture: 'Orange',
  Sports: 'Green', Service: 'Red', Faith: 'Slate', College: 'Cobalt', Other: 'Slate',
} as const;

/** Deterministic icon placement so two covers of the same category still differ. Replaces artFor(). */
export function coverVariant(seed: string): 'corner' | 'topRight' | 'tilted' {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (['corner', 'topRight', 'tilted'] as const)[Math.abs(h) % 3];
}
```

Helper to apply the Chinese overrides:

```ts
export function textStyle(key: keyof typeof type, lang: 'zh' | 'en') {
  const { zh, ...base } = type[key] as any;
  return lang === 'zh' && zh ? { ...base, ...zh } : base;
}
```

---

## 2. Components

Names match the existing exports. "Uses" lists token names from section 1.

### Button (`ui.tsx`)

| Variant | Background | Label | Notes |
|---|---|---|---|
| `primary` | `tint` | `onTint` | One per screen. |
| `secondary` | `fill` | `text` | |
| `plain` | transparent | `tintText` | Links and "Open in Maps". |
| `destructive` | `dangerSoft` | `dangerText` | Default destructive (e.g. Delete draft, Reject). |
| `destructiveStrong` (new) | `danger` | `onInk` | Only for the final confirm in a dialog or sheet ("Hide event"). |
| `ink` (new) | `ink` | `onInk` | Show ticket, Approve, Keep my spot. |
| `dangerText` (new) | transparent | `dangerText` | "Cancel my spot" in the event bar. |

- Size: height 50, `radius.md`, padding-x 16 (20 for primary in the action bar), label `type.button`, icon 18, gap 8.
- `small`: height 36 (hit area 44 via `hitSlop`), `radius.pill`, padding-x 14–16, label 15/600, icon 14–15.
- **Disabled**: `disabledFill` / `disabledText` (no opacity trick). Show a hint line (13pt, `textSecondary`, info icon) under it.
- **Loading**: keep the button colour, swap the icon for a spinner, change the label to the "-ing" form ("Registering…" / 報名中…). Opacity 0.9.
- Pressed: `tintPressed` for primary; 0.75 opacity for others.

### FollowButton (`SocietyRow.tsx`)

- Not following: small button, `tintSoft` background, `tintText` label, `+` icon. Label 追蹤 / Follow.
- Following: transparent, 1pt `border`, `textSecondary` label, check icon. Label 已追蹤 / Following.
- On the society page it becomes full-size: Follow uses `primary` (the page's one action), Following uses `secondary` with a check. Next to it, a 44pt bell (new-event alerts: `tintSoft`/`tintText` filled bell when on) and a 44pt share button (`fill`).

### Chip / ChipRow

- Height 36, `radius.pill`, padding-x 14, label 15/600, optional icon 14.
- Unselected: `card` background, 1pt `border`, `text`.
- **Selected: `ink` background and border, `onInk` text** (not tint).
- Multi-select chips (interests) add a 14pt check before the label when selected.
- Dropdown filter chip (Search): `fill` background, no border, label + chevron-down 15; selected = `ink` with the chosen value as label ("本週 ⌄").
- ChipRow: horizontal scroll, gap 8, padding-x 16, no scroll indicator.

### SegmentedControl (new)

- Track `fill` (or `fillStrong` on grey screens), radius 10, padding 2. Segments height 32, radius 8, 14/600.
- Selected segment: `card` background, `text`, shadow `0 1 3 rgba(0,0,0,.12)`. Others transparent, `textSecondary`.
- Used for: Calendar filter (全部活動 / 已追蹤 / 已報名), Month/Agenda, Upcoming/Drafts/Past, committee role.

### Tabs with underline (new)

- Height 44, gap 22–24, label 15–16/600. Active: `text` with 2.5pt `text` underline; inactive `textSecondary`. Hairline `border` under the row.
- Optional count badge: 20pt pill, `fillStrong`/`textSecondary`, or `danger`/white for urgent (Reports).
- Used for: Tickets (即將舉行 / 已收藏 / 過往), Society page, Review queue.

### Pill (status)

- Height 24 (22 in compact rows), `radius.pill`, padding 7/9, 12/600, 12–13pt icon, gap 4. Tinted fill, **no outline**.

| Status | Tone | Icon | zh / en |
|---|---|---|---|
| Spots left | success | dot | 尚餘 13 個名額 / 13 spots left |
| Full, join waitlist | warning | clock | 已滿 · 可候補 / Full · join waitlist |
| On waitlist | warning | clock | 候補第 3 位 / Waitlist #3 |
| Going | brand (`tintSoft`/`tintText`) | check | 已報名 / Going |
| Checked in | ink (`ink`/`onInk`) | check-circle | 已簽到 / Checked in |
| Cancelled | danger | x | 已取消 / Cancelled |
| Opens later | info | calendar | 11月1日開始報名 / Opens 1 Nov |
| Ended | neutral (`fillStrong`/`neutral.700`) | flag | 已結束 / Ended |
| Draft | neutral | pencil | 草稿 / Draft |
| Published | info | globe | 已發佈 / Published |
| Updated | info | refresh | 時間已更新 · 2 小時前 / Time updated · 2h ago |

Severity pills (Review queue): 5+ reports danger, 2–4 warning, 1 neutral.

### SectionHeader

- Title `type.title2` (zh weight 600), `text`. Action on the right: 15/600 `textSecondary` + 14pt chevron (not tint). Min height 44 for the action.

### Card

- `card` background, `radius.lg` (16), padding 14–16, `elevation.e1` in light, none in dark.
- On white screens (`backgroundPlain`) use `background` (#F5F5F7) as the card fill instead of a shadow (Tickets stubs, share sheet rows).

### EmptyState

- 64–80pt circle in `tintSoft` with a 30–36pt icon in `tintText` (not grey).
- Title 18–20/600, body 15/22 `textSecondary` max 280 wide, then **one** clear next step as a `primary` button (it's the only action on the screen).
- Variants seen: Tickets (Find events), Inbox (探索學會), Calendar empty day (inline card: "呢日暫時冇活動" + link), Agenda empty day (dashed card + "4 events you might like"), Societies category with no results.

### Skeleton

- Blocks `#E5E5EA` / `#F2F2F5` light, `#2C2C2E` / `#232325` dark. Row skeleton mirrors EventRow: 76pt thumb + 4 bars (45%, 90%, 70%, 30% pill). Never a spinner on a blank screen.

### Toast

- `toast` background, `onToast` text, radius 14, padding 12/14, `elevation.e3`. 20pt icon (`successText` tone in light). Max one action as a small pill (`rgba(127,127,127,.25)` background).
- **Placement: top, under the header.** Never over the tab bar, the action bar or a hero. 3s.
- Offline notice is not a toast: inline banner, `infoSoft`/`infoText`, cloud-check icon, "離線中，顯示下午2:14儲存的門票。二維碼在入場時仍可使用。"

### SocietyAvatar

- Squircle `avatarRadius(size)`. No image: `avatarArt[societyFamily[category]]` soft background with initials in its ink colour, 700 weight, `size × 0.36`.
- Initials: first letters of the first two words after stripping "CUHK"/"CU". Chinese-only names: first character after 中大 (中大合唱團 → 合).
- Sizes: 28, 40, 44, 48, 52, 56, 84 (society page, with a 4pt `backgroundPlain` border overlapping the cover).

### Artwork (event / banner cover)

- Image if present. Otherwise flat `categoryArt[cat].cover` (no gradient), plus:
  - Category label top-left: 12/600 white with a 14pt icon, on `rgba(255,255,255,0.2)` pill for heroes.
  - A large white category icon at 20–28% opacity, placed by `coverVariant(event.id)`: corner (130pt, offset right -20 bottom -30), topRight (180pt, offset -50/-46), tilted (110pt, rotate -12°).
- Cancelled events: cover `#76767C`.
- Ionicons names in `categoryArt.icon` are suggestions; the canvas uses equivalent stroke icons.

### Field

- Label above: `type.label`, `textSecondary`, **sentence case**, no uppercase.
- Input: height 48–52, `radius.md`, 1pt `border`, `card` background, 16–17pt text, padding-x 14.
- Focused: 2pt `tint` border + 3pt `focusRing` shadow (on iOS use a wrapping View with `borderWidth: 3, borderColor: focusRing`).
- Error: 2pt `danger` border, message below in `dangerText` 13/18 with an alert icon, written as the fix ("Use your CUHK email (@link.cuhk.edu.hk or @cuhk.edu.hk).").
- Valid: optional 20pt green check-circle inside the right edge.
- Hint: 13/18 `textSecondary` below.

### OtpInput (new)

- 6 boxes, grid gap 8, height 58, `radius.md`, mono 26/600. Filled: 1pt `neutral.300`. Active: 2pt `tint` + `focusRing` + 2×26 caret. Use one hidden `TextInput` with `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` and `keyboardType="number-pad"`.

### ListRow / ListGroup

- Row min height 50, padding-x 16, gap 12. Icon 20 in **`textSecondary`** (not tint). Title 16. Value 15 `textSecondary`. Chevron 14 `textTertiary`.
- Optional subtitle 13 `textSecondary` (row grows to ~56).
- Trailing badge: 22pt `danger` pill with white count (Inbox).
- Switch: iOS standard size, on = `success`, off = `border`.
- Group: `card`, `radius.md`, hairline separators. Group title above: `type.label`, `textSecondary`, sentence case, padding-left 16.

### EventCard (`EventCard.tsx`)

**EventCardLarge** (carousels, Search results)
- Carousel: width 280, gap 12, next card peeks 24. Search: full width.
- Cover height 140 (carousel) / 196 (Search), radius 16–18. Search variant puts round 42pt white **Share** and **Save** buttons bottom-right of the cover (`elevation.e2`).
- Body: date line 13–15/600 **`accentText`**; title 17–20/600, **2 lines max, never truncated mid-word** (`numberOfLines={2}`); venue · society 13–15 `textSecondary`, 1 line; then price + status Pill.

**EventRow** (feeds, "為你推介")
- Thumb 76–104 square, radius 12–14, cover colour + icon.
- Date 13/600 `accentText`, title 16–17/600 2 lines, venue 14 `textSecondary` 1 line, bottom row: status text (13/600 in its tone) left, **share + save icon buttons** (36pt) right.
- Saved heart: filled `danger`; unsaved: outline `neutral.700`.

**NextEventCard** (new, Discover top)
- `ink` card radius 18, padding 12. 56pt cover square, "你的下一個活動 · 明日 下午7:00" 12/600 in `palette.tangerine.300`, title 16/600 white 1 line, venue 13 `neutral.400`, white pill button "門票" with QR icon.

### TicketCard (`TicketCard.tsx`)

- **Hero ticket**: `background` (#F5F5F7) card radius 20. Top band in the category cover colour (here `#18181B`) with date (13/600 tangerine 300) and title (20/600 white). Dashed perforation line with 20pt notches cut in `backgroundPlain`. Bottom: 112–124pt white QR tile (QR in `#0A0A0B` on white even in dark mode), hint "入場時出示此二維碼", code `type.code`, status Pill, "全螢幕顯示" plain link.
- **Stub row** (later tickets): `background` card radius 16, left info (title 2 lines, date, Pill + link), dashed divider with notches, 96pt right stub in cover colour showing month + day (12/600 + 28/700).
- Offline line above the list: cloud-check icon in `success`, "已儲存在此手機，冇網絡都用得".

### SocietyRow

- Avatar 48, name 16/600 **up to 2 lines** + verified tick (`tintText`, 14pt), meta 13 `textSecondary` ("科技 · 1.2k 位追蹤者", college added when set), next-event line 13/600 `accentText` ("下個活動 10月26日 · …") or 13 `textTertiary` "暫時未有活動". FollowButton on the right.
- Recommendation card (new): 150 wide, `background` fill, radius 18, padding 14, avatar 52, name 2 lines, meta 12, full-width small FollowButton.

### BannerCarousel

- Bold category cover (or image), radius 22, height ~150–196, label pill top-left, society 12–13/600, title 20–21/700 2 lines, one-line subtitle. Page dots below in `border` / `text`.

### NotificationBell

- 44pt circle, `fill` background, 22pt bell in `text`. Unread: 9pt `danger` dot top-right with a 2pt ring in the button colour. Accessibility label includes the count.

### EventBar (new, event page bottom bar)

One component with `state`. Container: `elevated` at 97% opacity, 1pt top `border`, padding 12/16 + 34 safe area, min height 50 content row.

| State | Left (title / sub, sub colour) | Right |
|---|---|---|
| `register` | 免費 / "41/80 人出席 · 尚餘 39 個名額" `successText` | primary 報名 (min 150) |
| `waitlist` | 免費 / "已滿 · 12 人候補" `warningText` | primary 加入候補 |
| `onWaitlist` | 36pt clock in `warningSoft` + "你在候補名單排第 3 位" / "有名額會即時通知你" | secondary 退出候補 |
| `registered` | 36pt check in `tintSoft` + "你已報名" / "門票已存到此手機" | `dangerText` button 取消名額 |
| `checkedIn` | check-circle in `successSoft` + "已簽到" / "下午6:42 簽到" | none |
| `opensLater` | calendar in `infoSoft` + "11月1日 上午10:00 開始報名" / "免費 · 80 個名額" | secondary 提醒我 with bell |
| `ended` | flag in `fill` + "活動已結束" / date | secondary 其他活動 |
| `cancelled` | full-width `dangerSoft` notice: "活動已取消" + explanation | none |
| `committee` | "41/80 人出席" / "你是此學會的管理員" | secondary 管理 (sliders icon) + primary 報名 (min 110) |

English strings for every state are on the canvas ("Bottom action bar · every state").

### InfoRow (new, event page)

- 40pt icon tile (`fill`, radius 12, 20pt icon), main 16/600, sub 14 `textSecondary` (or a tone colour at 600 for capacity), optional trailing plain action 15/600 `tintText` (加入日曆 / 地圖). Capacity row adds a 6pt progress bar (`fillStrong` track, `success` or `warning` fill).

### CountdownCard (new, Calendar)

- 226×112, radius 18, padding 12/14. Big countdown 26/700 ("明日", "5 日後", "8 日後") with a 12/600 label on the right, title 15/600 + one meta line 12.
- Three fixed kinds: next ticket (`ink`), most anticipated (event cover colour, white), campus date (`accentSoft` with `palette.tangerine.800` text).

### CalendarDay (new)

- Cell 56 tall. Inner tile 36 tall, radius 11, inset 3. Number 16/500.
- Heat (events that day, after the filter): 0 transparent, 1 `fill`, 2 `#DCE4FF`, 3+ `#B9C8FF` (dark: `#1C1C1E`, `#14214F`, `#1E3380`).
- Selected: `ink` tile, `onInk` number 700. Today: number `tint` 700 plus a 9pt "今日" caption.
- Going: 15pt `tint` circle with a white check, top-right, 2pt white ring.
- Campus band: 14pt `accentSoft` strip at the bottom of the cell, rounded at the start and end of a run, label 9.5/700 in the first cell (國慶日, 閱讀週).
- Legend under the grid explains all three markers in words.

### ShareSheet + ShareCard (new)

- ShareCard (the image that gets saved/shared, 272 wide): cover band 148 with category pill + title 19/700, body with date (`accentText`), venue, society avatar + name, then a divider row with a 42pt QR, "掃描報名 · 免費 / 尚餘 13 個名額" and the "Campus Social" wordmark in `tint`.
- Sheet: `elevated`, top radius 24, grabber, title "分享俾朋友" + one-line sub, a 5-up grid of 56pt circle targets (`fill`): 儲存圖片, 複製連結, WhatsApp, 限時動態, 更多 (generic icons, no third-party logos), a 收藏活動 switch row, and a primary 分享連結 button.

### Scanner result card (new)

- Bottom card, radius 26, padding 22/20, `elevation.e3`. Bright fills with dark text for arm's-length reading in a dark room:
  - Checked in `#30D158` / `#04210F`, Already checked in `#FF9F0A` / `#2B1700`, Different event `#FF453A` / `#2B0503`.
- 58pt icon circle, title 30/800, name 21/600, meta 16/600, foot 14. Viewfinder corners (5pt, radius 18) take the result colour.
- Session counter pill at the top, torch button, "Type the 8-character code" button (`rgba(255,255,255,.16)`).

### StatTile (new)

- `card` radius 14–16, padding 10–12, value `type.stat` (22–24), label 12–13 `textSecondary`, optional delta 12/600 (`successText` when positive). "Checked in" uses `successSoft` / `successText`.

---

## 3. Per-screen changes (compared with the v0.2 / v0.3 screenshots)

**Tab bar (all tabs)**
- Native tab bar, active tint `tint`, inactive `neutral.450`, labels 10/600. Tabs: 探索 · 日曆 · 學會 · 門票 · 個人.

**Discover 探索** (`app/(tabs)/index`)
- White background. Large title in `text` (34/600 zh) with a NotificationBell; no purple header bar or divider.
- Rounded search pill (46pt, `fill`) under the title.
- Category ChipRow (selected = ink).
- New NextEventCard when the student has an upcoming ticket.
- "為你推介" list of EventRows with share/save; "查看全部" goes to Search.
- Signed-out: same layout; ask for sign-in only on register/follow (see Sign in).

**Search results** (new screen or Discover search mode)
- Back + search pill, dropdown filter chips (篩選 · 日期 · 費用 · 類別 · 書院), "本週 28 個活動" + sort, full-width EventCardLarge with Share/Save on the cover. Optional floating "校園地圖" pill.

**Event page** (`app/event/[id]`)
- Cover shortened to ~236 including the status-bar area; header buttons (back, share, save, more) as 40pt white circles on the cover; category pill and a white date badge (月 / 日 / 週) on the cover.
- First screen: Updated/Cancelled/Ended pill → title 25/600 → host row with FollowButton → InfoRows (date + 加入日曆, venue + 地圖, price, capacity with bar) → About.
- Registered / checked in: the hero TicketCard replaces the capacity row; "Cancel my spot" becomes the quiet red text in EventBar.
- Overflow menu: Share, Report.
- Sticky EventBar with the 9 states.
- "One quick question" is a bottom sheet (society name, question in the society's language, optional answer, "Only the committee sees your answer", 確認報名 / 暫時唔報名).
- Success moment is a bottom sheet (check + light confetti, summary row, 出示門票 ink button, 叫朋友一齊去 and 加入日曆 secondary, 完成). No toast over the hero.
- Cancel confirmation is a centred alert: 保留名額 (ink, default) / 取消名額 (`dangerSoft`).
- Cancelled events: grey cover, danger notice in the bar.

**Share flow** (new)
- Share button anywhere opens ShareSheet. 儲存圖片 renders ShareCard to an image; 分享連結 uses the system share sheet with a prefilled message: title, 時間, 地點, 主辦, spots left and the link. The link must open the app (universal link) or the web page.

**Calendar 日曆** (`app/(tabs)/calendar`)
- Large title + 今日 button + sync button.
- "本月焦點 · 倒數" row of three CountdownCards above the grid.
- SegmentedControl filter, then the month: heat-shaded CalendarDay cells, going check badges, campus bands with labels, legend.
- Tapping a day lists that day's events below (colour bar, time column, title, pill + venue), campus notes, or an empty-day card.
- Month / Agenda toggle; Agenda shows a 7-day strip, a campus countdown banner and events grouped by day with empty-day suggestions.
- Sync sheet: switches for tickets, followed societies, campus dates and saved events → Add to Apple Calendar / Google Calendar / copy private feed link.

**Societies 學會** (`app/(tabs)/societies`)
- Large title + 登記學會 pill, search, chips (已追蹤 N, 全部, categories), "為你推薦" cards (only on 全部), list of SocietyRows with next event line.
- Society page: category cover (no-artwork placeholder), 84pt avatar overlapping it, name + verified, meta, stats row, Follow + bell + share, about (3 lines), Instagram/Email chips, Upcoming / Past tabs, Report in the overflow menu.

**Tickets 門票**
- Underline tabs 即將舉行 / 已收藏 N / 過往 (saved events now live here).
- Offline line, hero TicketCard for the next ticket, "稍後" stub rows.
- Empty state leads to Discover.

**Profile 個人**
- Grey grouped screen. Centred avatar (88, tint background, initial), name + edit, email, college pill.
- Stats row: 已收藏 · 門票 · 追蹤中 (each tappable).
- Rows: 收件匣 with badge, 我管理的學會 (→ Manage), settings group (活動提醒, 報名後自動加入日曆, 語言 · Language), 登記學會, 關於.
- Still to add: admin-only "Review queue" row with a pending count; Sign out and Delete account at the bottom (Delete in `dangerText`, separated).

**Welcome / onboarding**
- Two steps with a progress bar and 略過. Step 1: name + college chips (single choice, ink selected). Step 2: interest chips (multi, check icon) + 4 recommended societies; finish button shows "完成 · 已追蹤 N 個學會".

**Sign in**
- Opens over the screen that needed it, with "登入後會返回 {event}" so returning is obvious.
- Email field with cobalt focus and green valid check; disabled send button is neutral with a hint. Code step uses OtpInput, resend countdown, spam hint. "改用密碼登入" and terms stay at the bottom.

**Inbox 收件匣**
- Back + large title + 全部標為已讀. Groups 今日 / 較早. Rows: 40pt type icon (or society avatar), title (700 when unread, with a cobalt dot), time, body; inline action pill where useful (查看門票 / 出示門票). Changed times show the old value struck through.
- Empty state with 探索學會.

**Manage dashboard** (`app/manage/[id]`)
- Society header with role pill, three StatTiles, one primary "New event", list group (Edit society details, Committee, View public page), events list with Upcoming / Drafts / Past and status + progress per event. Drafts say what's missing.

**Event form**
- Cancel / title + "Draft saved" / Preview header. Cover preview shows the generated cover until an image is uploaded.
- Sections as cards: Basics (title with counter, category chips), When and where (date/time fields, location), Details, Sign-up (switches, capacity, open/close, price note), Question for attendees.
- Inline validation on the field. Bottom bar: Save draft (secondary) + Publish (disabled with "1 thing missing…" until valid). Delete draft / Cancel event at the end.

**Attendees**
- Title + date, three StatTiles (Going, Checked in in green, Waitlist), dominant primary "Scan tickets", four small grey action tiles (Edit, Promote, Duplicate, Export CSV), search, filter chips with counts, rows with a 48pt tap-to-check-in circle (`success` when done), college pill, email, answer and check-in time. Waitlist rows show rank.

**Scanner**
- Always dark. See "Scanner result card". Keep the camera running behind the result; auto-ready for the next scan after ~2s.

**Committee members**
- Add a member card (email, Editor/Admin segmented control with one-line explanation, primary "Add to committee"), member list with Owner (ink) / Admin (tintSoft) / Editor (fillStrong) pills and a row menu.

**Review queue** (`app/admin`)
- Underline tabs Societies / Banners / Reports with counts (Reports red).
- Report cards: severity pill, kind + latest time, title, owner, reason chips with counts, quoted detail, View · Hide… · Dismiss. Dismiss collapses the card into "Dismissed · Undo".
- Hide opens a confirm sheet: reason chips (shown to the society), optional note, "Also warn the society" switch, red "Hide event", Cancel, history note.
- Pending society / banner cards: preview, automatic checks (green tick or amber warning), Approve (ink) · Ask for changes · Reject….

---

## 4. Libraries

Already in `package.json` and enough for most of this: `expo-image`, `expo-haptics`, `expo-camera` (scanner), `expo-calendar` (add to calendar), `expo-clipboard` (copy link), `expo-linking`, `expo-symbols`, `react-native-svg`, `react-native-qrcode-svg`, `react-native-safe-area-context`.

**New, needed for the share flow**
- `react-native-view-shot`: render ShareCard to a PNG for 儲存圖片 / Instagram story.
- `expo-media-library`: save that PNG to Photos.
- `expo-sharing`: share the PNG file (the plain link can keep using RN `Share`).

**Probably remove**
- `expo-linear-gradient`: no longer used once Artwork and SocietyAvatar switch to flat colours.
- `react-native-calendars`: the heat cells, going badges and multi-day campus bands are easier as a custom 7-column grid than as a `dayComponent` override. Keep it only if you'd rather customise it.

**Not a client library, but needed**
- Universal links / App Links for shared event URLs (`associatedDomains` in `app.json` plus `apple-app-site-association` / `assetlinks.json` on the web domain). The domain is still a placeholder on the canvas.
- The calendar sync feed is an iCal (`.ics`) endpoint per user with a resettable secret token, best served from a Supabase Edge Function. Apple/Google subscribe via `webcal://` / Google's "add by URL".
- Optional: `expo-blur` for a translucent tab bar and sheet backgrounds. The designs work with the 94–97% opaque colours given in the tokens, so this is cosmetic.

---

## 5. Open items

- **Sample data:** campus dates (閱讀週 19–24 Oct, midterms from 2 Nov), counts, names and society details on the canvas are made up. Campus dates should come from the CUHK and college calendars.
- **Share link domain:** shown as `[domain]` on the canvas.
- **Dark mode coverage:** fully drawn for the component sheets, the event page, the society page and the scanner. Other screens follow the same token swap but weren't drawn in dark.
- **English coverage:** component sheets, event page, bar states, calendar agenda and committee/admin screens are drawn in English; other screens are Chinese-first with the English strings implied by `locales/`.
- **Profile:** add the admin Review queue row, Sign out and Delete account (not drawn in v2).
- **Friends going:** deliberately not designed. Only consider it later as opt-in per person; attendee lists stay committee-only.
