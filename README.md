# CUHK Campus

A student app for CUHK: follow societies, discover events, sign up Eventbrite-style with QR tickets and waitlists, and see university and college dates in one calendar. Built with Expo (React Native) and Supabase, iOS first, Android supported.

## What's in the app

| Tab | What students get |
| --- | --- |
| **Discover** | Promoted-event banner carousel, events from societies you follow, this week, upcoming by category, search across events and societies |
| **Calendar** | Month view with dots for events, your tickets and campus dates (term, exams, holidays, your college's dates); filter All / Following / Going |
| **Societies** | Directory with categories, verified badges, follower counts and one-tap follow |
| **Tickets** | Upcoming and past registrations, QR ticket for the next event, waitlist status |
| **Profile** | College, major, societies you run, review queue (admins), privacy/terms/support, sign out, delete account |

Society committees get: a dashboard per society, create/edit/cancel events (cover image, capacity, waitlist, price note, drafts), attendee list with CSV export, a QR scanner for check-in at the door, and banner requests to promote an event on Discover.

How sign-ups work: registration goes through Postgres functions that lock the event row, so capacity can't be oversold. When a confirmed person cancels or the committee raises capacity, the first person on the waitlist is promoted automatically.

Trust and safety: only `@link.cuhk.edu.hk` / `@cuhk.edu.hk` emails can create accounts; new societies and banners wait for admin approval (stops impersonation and spam); events and societies can be reported; in-app account deletion.

## Run it now (demo mode, no backend needed)

```bash
npm install
npx expo start
```

Scan the QR code with the Camera app on your iPhone (install **Expo Go** from the App Store first). Without Supabase keys the app runs on built-in sample data: sign in with any CUHK email and code `123456`. In demo mode you are a committee member of CU Coding Society and an admin, so every screen is reachable.

## Connect Supabase (real data)

1. Create a project at [supabase.com](https://supabase.com). Pick the **Singapore** region (closest to Hong Kong).
2. Apply the schema. Either paste `supabase/migrations/20261022000000_init.sql` into the SQL editor and run it, or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
3. Optional sample content: run `supabase/seed.sql` in the SQL editor (regenerate with `npm run seed`).
4. **Auth → Emails → Magic link template**: make sure it includes `{{ .Token }}` so students receive a 6-digit code instead of only a link.
5. **Auth → SMTP**: set up your own SMTP (e.g. Resend, Postmark). Supabase's built-in mailer is rate-limited and not meant for production.
6. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API). Restart `npx expo start`.
7. Make yourself an admin after signing in once:
   ```sql
   update public.profiles set is_platform_admin = true where email = 'you@link.cuhk.edu.hk';
   ```
8. Replace the sample `campus_dates` with the official CUHK calendar (admins can insert rows in the SQL editor; an `.ics` importer is a good next step).

## Launching on the App Store

You need an Apple Developer account (US$99/year) and an Expo account. No Mac is required; EAS builds in the cloud.

1. **Identity.** Change `ios.bundleIdentifier` and `android.package` in `app.json` (currently `com.ansonchow.cuhkcampus`). Replace the placeholder icon in `assets/`.
2. **Name.** Apple may reject an app that uses a university's name or logo without permission (guideline 5.2). Either get written permission from CUHK (Office of Student Affairs is a good start) or choose a neutral name.
3. **EAS setup.**
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init            # links the project, fills extra.eas.projectId
   npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value ... --environment production
   npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value ... --environment production
   npx eas-cli@latest build -p ios --profile production
   npx eas-cli@latest submit -p ios --latest
   ```
   Use the `preview` profile to install test builds on your own phone, or TestFlight via `submit`.
4. **App Store Connect listing.** You need a privacy policy URL and support URL (update `PRIVACY_URL`, `TERMS_URL`, `SUPPORT_EMAIL` in `src/lib/constants.ts`), screenshots (6.9" iPhone), description and keywords, and age rating.
5. **App Privacy answers.** Data collected and linked to the user: email address, name, user ID, photos (society uploads only), other user content (event sign-ups). Not used for tracking. No third-party analytics are included.
6. **Review account.** Reviewers can't receive a CUHK email code. Create a user in Supabase **Auth → Users → Add user** with a password, add the address to `public.allowed_emails` first, make it a committee member of a test society, and give the credentials in App Review notes. They sign in via "Sign in with a password instead".
7. **Things App Review checks that are already handled:** account deletion in-app, report button on user-generated content plus a moderation queue, purpose strings for camera/photos/calendar, encryption export answer (`usesNonExemptEncryption: false`), privacy manifest for UserDefaults.

## Project layout

```
src/app/            Expo Router screens (file = route)
  (tabs)/           Discover, Calendar, Societies, Tickets, Profile
  event/[id].tsx    Event page with register / waitlist / QR ticket
  society/[id].tsx  Society profile
  manage/           Committee tools: dashboard, event form, attendees, scanner, promote
  admin/            Review queue for societies and banners
src/lib/
  backend.ts        The Backend interface the UI uses
  remote.ts         Supabase implementation
  demo.ts           In-memory demo implementation
  demoData.ts       Sample societies, events, banners, campus dates
supabase/
  migrations/       Schema, RLS policies, RPCs (register, cancel, check-in, ...)
  seed.sql          Generated sample data
```

Useful scripts: `npm run typecheck`, `npm run format`, `npm run seed`.

## Suggested next steps

- Push notifications (expo-notifications) for waitlist promotions, event reminders and new events from followed societies
- Import the official CUHK and college calendars from `.ics` feeds
- Traditional Chinese localisation
- A web dashboard for committees (bulk edits, analytics) sharing the same Supabase backend
- Paid tickets (Stripe) once free events are working well

All dependencies are MIT/Apache/BSD licensed; no AGPL code is included.
