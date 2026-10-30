# First TestFlight build

Everything in the repo is ready; these are the steps that need your own
accounts. Do them in order. Tick a box when done. Total time is about an hour,
most of it waiting for the build.

## 1. Supabase: bring the database up to date (10 min)

Open the Supabase dashboard for project `ggvfeluqajhvvhmiguxr` → **SQL Editor**.

Paste this check and press Run. It shows which migrations the project already
has (`true`) and which it still needs (`false`):

```sql
select m, ok from (values
  ('20261027000000_v04_members',             to_regclass('public.memberships') is not null),
  ('20261027010000_v04_shop',                to_regclass('public.products') is not null),
  ('20261028000000_v05_blocks_members_only', to_regclass('public.society_blocks') is not null),
  ('20261028010000_v05_tickets_receipts',    exists (select 1 from pg_proc where proname = '_ticket_price')),
  ('20261029000000_v06_saved_events',        to_regclass('public.saved_events') is not null),
  ('20261030000000_v07_interests',           exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'interests')),
  ('20261030010000_v07_top_events',          exists (select 1 from pg_proc where proname = 'set_event_featured')),
  ('20261030020000_v07_society_posts',       to_regclass('public.society_posts') is not null),
  ('20261030030000_v07_rotating_tickets',    exists (select 1 from pg_proc where proname = '_hmac_sha256_hex')),
  ('20261030040000_v07_shop_rethink',        to_regclass('public.pickup_slots') is not null),
  ('20261030050000_v08_online_payments',     to_regclass('public.platform_fee') is not null),
  ('20261030060000_v09_fairs',               to_regclass('public.fairs') is not null)
) as t(m, ok);
```

- [ ] For every `false` row, top to bottom, open
      `supabase/migrations/<name>.sql` on GitHub (release branch), paste the
      whole file into a new query and Run. Run them in the order listed; each
      one is a single transaction, so a failure changes nothing.
      `20261027020000_v04_review_fixes` has no table to check: run it right
      after `v04_shop` if you run that one (it is safe to run twice).
- [ ] Run the check again: all rows `true`.
- [ ] **Auth → SMTP** uses your own sender (Resend or similar). The built-in
      mailer only sends a couple of codes an hour, so testers would get stuck
      at sign-in.

Stripe, push and the receipt clean-up job are **not** needed for TestFlight:
online payments stay hidden until a society connects Stripe, and FPS / PayMe /
cash work without it. Set them up later from the README.

## 2. GitHub: public pages (5 min)

App Store Connect needs a working privacy policy URL before external testers
can install.

- [ ] Tell Claude which support email to show (or edit `docs/index.html`,
      `docs/privacy.html`, `docs/terms.html` and replace
      `REPLACE_WITH_SUPPORT_EMAIL`).
- [ ] Merge the release PR into `main`.
- [ ] Repo **Settings → Pages → Deploy from a branch → `main` / `docs`**.
- [ ] Open https://ansonansonansonanson.github.io/campus-social/privacy.html
      and check it loads.

## 3. Apple (15 min, plus Apple's approval if the account is new)

- [ ] Apple Developer Program is active (US$99/year) at
      https://developer.apple.com/account. A new enrolment can take a day or two.
- [ ] You know your Apple ID password and have a device for the 2-factor code.

You do **not** need to create the app in App Store Connect by hand: `eas
submit` creates it on the first run (bundle ID `com.ansonchow.campussocial`).

## 4. Build and upload (on your Mac, 30–40 min mostly waiting)

In Terminal, inside the project folder, on the release branch (or `main`
after merging):

```bash
git pull
npm ci
npx eas-cli@latest login                       # your Expo account
npx eas-cli@latest build -p ios --profile production
```

The first build asks a few questions. Answer:

- "Do you want to log in to your Apple account?" → **Yes**, sign in.
- "Generate a new Apple Distribution Certificate?" → **Yes**.
- "Generate a new Apple Provisioning Profile?" → **Yes**.
- "Set up Push Notifications?" / "Generate a new Apple Push Notifications
  service key?" → **Yes**.

The build runs in Expo's cloud (about 15–25 min). Then:

```bash
npx eas-cli@latest submit -p ios --latest
```

- "App Store Connect app" → let it **create a new app** named Campus Social,
  language **Chinese (Traditional)**, SKU `campus-social`.
- [ ] Copy the app's **Apple ID** number it prints (or from App Store Connect
      → App Information) and send it to Claude; it goes into `eas.json` as
      `ascAppId` so later submits run without questions.

Apple processes the upload for 10–30 min; you get an email when the build is
ready in TestFlight.

## 5. TestFlight

In App Store Connect → Campus Social → **TestFlight**:

- [ ] **Internal testing** (you and up to 100 people on your App Store
      Connect team, no review): create a group, add yourself, install the
      TestFlight app on your iPhone and accept the invite.
- [ ] Test on your iPhone: sign in with your CUHK email code, tab bar, app
      icon, camera prompt when scanning a ticket, photo picker, a ticket QR,
      notifications prompt.
- [ ] **External testing** (friends, pilot societies, up to 10,000 people):
      fill **Test Information** (feedback email, privacy policy URL from step
      2, and the "What to Test" text below), add the review sign-in from
      `supabase/review-account.sql`, create an external group and add the
      build. The first external build goes through a short Beta App Review
      (usually under a day). Then share the public link.

**What to Test** (paste into TestFlight):

> 感謝試用 Campus Social！請用中大電郵登入，試吓：揀興趣及追蹤學會、報名活動及出示門票、收藏活動、學會帖文、學會商店（購物袋、預約取貨時段）。如發現問題，請喺 TestFlight 截圖回報。
>
> Thanks for testing Campus Social! Sign in with your CUHK email and try: picking interests and following societies, signing up for an event and showing your ticket, saving events, society posts, and the society shop (bag checkout, booking a pickup time). Found a bug? Take a screenshot in TestFlight to send feedback.

## Later builds

Bump nothing by hand: the build number is kept by EAS
(`appVersionSource: remote`, `autoIncrement`). Change `expo.version` in
`app.json` only when you release a new App Store version (1.0.1, 1.1.0).

```bash
npx eas-cli@latest build -p ios --profile production --auto-submit
```
