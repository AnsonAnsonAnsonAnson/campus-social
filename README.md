# Campus Social

A student app for CUHK: follow societies, discover events, sign up Eventbrite-style with QR tickets and waitlists, and see university and college dates in one calendar. Built with Expo (React Native) and Supabase, iOS first, Android supported.

## What's in the app

| Tab | What students get |
| --- | --- |
| **Discover** | Promoted-event banner carousel, events from societies you follow, this week, upcoming by category, search across events and societies, notification inbox (bell) |
| **Calendar** | Month view with dots for events, your tickets and campus dates (term, exams, holidays, your college's dates); filter All / Following / Going |
| **Societies** | Directory with categories, verified badges, follower counts and one-tap follow |
| **Tickets** | Upcoming and past registrations, QR ticket for the next event, waitlist status |
| **Profile** | Photo, college, major, societies you run, notification settings, language, review queue (admins), privacy/terms/support, sign out, delete account |

New students get a short welcome screen after their first sign-in (name, college, interests, suggested societies to follow).

Society committees get: a dashboard per society; editing the society's details, logo and cover; a committee screen (add people by CUHK email as editor or admin, change roles, transfer ownership); create/edit/cancel/duplicate events (cover image, capacity, waitlist, sign-up window, an optional question for attendees, price note, drafts); an attendee list with search, tap-to-check-in, answers and CSV export; a QR scanner for check-in at the door; and banner requests to promote an event on Discover.

How sign-ups work: registration goes through Postgres functions that lock the event row, so capacity can't be oversold. When a confirmed person cancels or the committee raises capacity, the first person on the waitlist is promoted automatically.

Notifications: the database writes an inbox row when someone gets off a waitlist, an event they joined is cancelled or moves, a society they follow publishes an event, their society is approved, or they're added to a committee. The app shows these in the inbox, schedules a local reminder an hour before each event you're going to, and (once push is set up, below) the `send-push` Edge Function delivers each inbox row as a push notification.

Languages: the app opens in Traditional Chinese (Hong Kong wording) with English as the second language, switchable in Profile (or on the welcome screen). Dates and times follow the language (下午6:30 / 6:30pm), notifications and pushes are written in each person's chosen language, and the App Store name, permission prompts and listing (`store/app-store-listing.md`) come in both. Events and societies are shown as their committees wrote them.

Trust and safety: only `@link.cuhk.edu.hk` / `@cuhk.edu.hk` emails can create accounts; new societies and banners wait for admin approval (stops impersonation and spam); events, societies and banners can be reported, and admins see grouped reports in the review queue where they can dismiss them or take the item down; in-app account deletion (society ownership passes to another committee member).

## Run it now (demo mode, no backend needed)

```bash
npm install
npx expo start
```

Scan the QR code with the Camera app on your iPhone (install **Expo Go** from the App Store first). Without Supabase keys the app runs on built-in sample data: sign in with any CUHK email and code `123456`. In demo mode you are a committee member of CU Coding Society and an admin, so every screen is reachable.

## Connect Supabase (real data)

1. Create a project at [supabase.com](https://supabase.com). Pick the **Singapore** region (closest to Hong Kong).
2. Apply the schema. On a new project, open **SQL Editor**, paste all of `supabase/setup.sql` and press **Run** (it is every migration in one transaction; regenerate it with `bash scripts/make-setup-sql.sh` after adding a migration). Later migrations: paste just the new file, or use the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`).
3. Optional sample content for a test project: run `supabase/seed.sql` in the SQL editor (regenerate with `npm run seed`). Don't run it on the project students will use.
4. **Auth → Emails → Magic link template**: make sure it includes `{{ .Token }}` so students receive a 6-digit code instead of only a link.
5. **Auth → SMTP**: set up your own SMTP (e.g. Resend, Postmark). Supabase's built-in mailer is rate-limited and not meant for production.
6. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API). Restart `npx expo start`. EAS builds take the same two values from `env` in `eas.json`. Both are safe to ship inside the app (row level security protects the data); never put the secret or `service_role` key in the app or the repo.
7. Make yourself an admin after signing in once:
   ```sql
   update public.profiles set is_platform_admin = true where email = 'you@link.cuhk.edu.hk';
   ```
8. Replace the sample `campus_dates` with the official CUHK calendar (admins can insert rows in the SQL editor; an `.ics` importer is a good next step).

### Push notifications

The in-app inbox and local event reminders work without this. To also send pushes:

1. `app.json` has `extra.eas.projectId` (the app only registers for push when it has one; `npx eas-cli@latest init` sets it for a new Expo project). Upload your APNs key / FCM credentials with `npx eas-cli@latest credentials`.
2. Deploy the sender: `supabase functions deploy send-push --no-verify-jwt`, then set a random secret: `supabase secrets set PUSH_WEBHOOK_SECRET=<long random string>` (optionally `EXPO_ACCESS_TOKEN` if you turn on enhanced push security in Expo).
3. In the dashboard, **Database → Webhooks → Create a new hook**: table `notifications`, event `Insert`, type **Supabase Edge Functions**, function `send-push`, and add an HTTP header `x-webhook-secret` with the same secret.

Devices that uninstall the app are removed from `push_tokens` automatically.

### Payments and receipts

Campus Social never holds money. Buyers, members and ticket holders pay the society directly (FPS QR with the amount and reference filled in, PayMe link, or cash), then tap "I've paid" or add an optional payment screenshot; the treasurer confirms in the app. Treasurers can also paste their bank's transaction list into **Orders → Match bank statement**, which finds the references and ticks the matching payments for them, so most people never need a screenshot.

Screenshots are kept small and short-lived:

- The app shrinks each one to a JPEG about 1000 px on its longest side (typically 60–150 KB) before upload, which also strips location and camera data.
- The private `receipts` bucket only accepts JPEGs up to 300 KB. Each order or membership has one file at a fixed path, so a second upload replaces the first instead of adding to it.
- Only the payer and the society's owners and admins can open one, through a link that lasts five minutes.
- The `purge-receipts` Edge Function deletes them 30 days after a payment is confirmed, 7 days after a cancellation, after 90 days at most, and removes uploads that were never attached after a day. It also frees event places held by tickets nobody paid for in time.

To turn on the daily clean-up:

1. `supabase functions deploy purge-receipts --no-verify-jwt`, then `supabase secrets set CRON_SECRET=<long random string>`.
2. In the dashboard, **Integrations → Cron → Create job**: schedule `0 4 * * *` (04:00 UTC, noon in Hong Kong), type **Supabase Edge Function**, function `purge-receipts`, method POST, with an HTTP header `x-cron-secret` equal to the secret.

Without it nothing breaks: expired places are also released whenever someone signs up for that event, and screenshots stay until the job runs.

### Online payments (Stripe Connect)

Shop orders can also be paid online: card, Apple Pay, Google Pay, Alipay and WeChat Pay, on Stripe's hosted checkout page. Each society connects its own payout account (Stripe checks the treasurer's ID and bank account on its own pages); Stripe pays the society every Friday, less the platform fee, which is 5% + HK$3 per order by default. FPS, PayMe and cash keep working as above and stay free. Only Stripe's webhook can mark an online order paid or refunded; refunds go through **Orders → Refund**. Research and fee maths: [Campus Social Shop Payments](https://claude.ai/artifact/6EZR79sWgziZsDN2QmNuPD).

The demo backend pretends CU Coding Society is already verified and pays instantly, so the whole flow can be tried without Stripe.

To turn it on for real:

1. Open a Stripe account for Hong Kong (a sole proprietorship with a Business Registration certificate is enough). In the dashboard, set up **Connect** as a platform/marketplace, and under **Settings → Payment methods** turn on Alipay and WeChat Pay.
2. Run the migration `supabase/migrations/20261030050000_v08_online_payments.sql`.
3. Deploy the functions: `supabase functions deploy payments` and `supabase functions deploy stripe-webhook --no-verify-jwt`.
4. In Stripe, **Developers → Webhooks**, add two endpoints with the URL `https://<project>.supabase.co/functions/v1/stripe-webhook`:
   - listening to events on **your account**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`;
   - listening to events on **connected accounts**: `account.updated`.
5. `supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...`. Optional: `PAYMENTS_RETURN_URL` (default: `docs/return.html` on GitHub Pages, which must be enabled) and `STRIPE_METHODS` (default `card,alipay,wechat_pay`).
6. Test with test-mode keys (card `4242 4242 4242 4242`), then switch to live keys and live webhook secrets.

To change the fee, run `update platform_fee set percent = 5, fixed_hkd = 3;` in the SQL editor, or `update society_payout_accounts set fee_percent = 3, fee_fixed_hkd = 0 where society_id = '<society id>';` for one society (`set_platform_fee` does the same for platform admins signed in to the app).

## Launching on the App Store

You need an Apple Developer account (US$99/year) and an Expo account. No Mac is required; EAS builds in the cloud.

1. **Identity.** Check `ios.bundleIdentifier` and `android.package` in `app.json` (currently `com.ansonchow.campussocial`); they can't change after the first upload. The icons in `assets/` are drawn by `python3 scripts/make-icons.py`.
2. **Name.** The app is called Campus Social. Apple may reject an app that presents itself as a university's official app or uses its logo without permission (guideline 5.2), so keep "CUHK" to descriptive text (for example "for CUHK students") unless the university gives written permission.
3. **EAS setup.**
   ```bash
   npx eas-cli@latest login            # the Expo account that owns the project in app.json
   npx eas-cli@latest build -p ios --profile production
   npx eas-cli@latest submit -p ios --latest
   ```
   Use the `preview` profile to install test builds on your own phone, or TestFlight via `submit`.
4. **Public pages.** The privacy policy, terms and support page live in `docs/` (Chinese and English). Turn on GitHub Pages (repo **Settings › Pages › Deploy from a branch › main / docs**) and they appear at `https://ansonansonansonanson.github.io/campus-social/` (`privacy.html`, `terms.html`). Replace `REPLACE_WITH_SUPPORT_EMAIL` in `docs/*.html` with a real address first. The app links to them from sign-in and Profile (`src/lib/constants.ts`).
5. **App Store Connect listing.** Privacy policy URL and support URL from step 4, screenshots (6.9" iPhone), description and keywords (both languages are in `store/app-store-listing.md`; set the primary language to Chinese (Traditional)), age rating and review notes (also in that file).
6. **App Privacy answers.** See `store/app-store-listing.md`. Nothing is used for tracking and there are no third-party analytics.
7. **Review account.** Reviewers can't receive a CUHK email code. Follow `supabase/review-account.sql`: allow the address, create the user with a password in Supabase **Auth › Users › Add user**, then run part 2 to give it a test society. Put the credentials in the review notes. They sign in via "Sign in with a password instead".
8. **Things App Review checks that are already handled:**
   - account deletion in the app
   - a report button on events and societies, hiding a society, a moderation queue, and terms with a zero-tolerance rule that are one tap from sign-in (guideline 1.2)
   - browsing without an account (5.1.1)
   - purpose strings for camera, photos and calendar in both languages, with the photo picker needing no permission
   - the encryption export answer (`usesNonExemptEncryption: false`)
   - a privacy manifest for UserDefaults, file timestamps, boot time and disk space
   - payments go straight to societies for real-world events, merch and memberships, so in-app purchase doesn't apply (3.1.3(e))
   - light, dark and tinted app icons

## Project layout

```
src/app/            Expo Router screens (file = route)
  (tabs)/           Discover, Calendar, Societies, Tickets, Profile
  event/[id].tsx    Event page with register / waitlist / sign-up question / QR ticket
  society/[id].tsx  Society profile
  notifications.tsx Inbox
  welcome.tsx       First-run setup
  manage/           Committee tools: dashboard, society details, committee, event form, attendees, scanner, promote
  admin/            Review queue: reports, societies, banners
src/components/     Shared UI (ui.tsx kit, cards, toasts, skeleton loaders)
src/lib/
  backend.ts        The Backend interface the UI uses
  remote.ts         Supabase implementation
  demo.ts           In-memory demo implementation
  demoData.ts       Sample societies, events, banners, campus dates
  notifications.ts  Local reminders and push registration
  i18n.ts           t('English text') lookups, language setting
src/i18n/zh-Hant.ts Traditional Chinese for every English string
locales/            Localized app name and permission prompts (iOS/Android)
store/              App Store listing text in both languages
  __tests__/        Unit tests (jest)
supabase/
  migrations/       Schema, RLS policies, RPCs (register, cancel, check-in, committee, moderation, ...)
  functions/        send-push and purge-receipts Edge Functions
  tests/            Database tests (run against plain Postgres)
  seed.sql          Generated sample data
  setup.sql         All migrations in one file, for a new project's SQL Editor
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db` (needs a local Postgres; set `PGHOST`, `PGUSER`, `PGPASSWORD`), `npm run format`, `npm run seed`. GitHub Actions runs all of them on every pull request.

## Suggested next steps

- Import the official CUHK and college calendars from `.ics` feeds
- Traditional Chinese localisation
- A web dashboard for committees (bulk edits, analytics) sharing the same Supabase backend
- Paid tickets (Stripe) once free events are working well

All dependencies are MIT/Apache/BSD licensed; no AGPL code is included.
