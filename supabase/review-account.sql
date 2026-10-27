-- App Store review account. Apple's reviewers can't receive a CUHK email code,
-- so they sign in with a password ("Sign in with a password instead").
--
-- 1. Change the address below, then run PART 1 in the SQL editor.
-- 2. Supabase dashboard › Authentication › Users › Add user › Create new user:
--    same address, a strong password, tick "Auto Confirm User".
-- 3. Run PART 2. It gives the account a hidden test society to manage.
-- 4. Put the address and password in App Store Connect › App Review › Sign-in.
-- After approval delete the user in Authentication › Users, then delete the
-- society: delete from public.societies where name = 'App Review Test Society';

-- PART 1: allow the address to sign up.
insert into public.allowed_emails (email) values ('appreview@example.com') on conflict do nothing;

-- PART 2: a test society the reviewer runs, with one event to try the tools on.
-- It is visible to everyone, so delete the user (and with it the society) once
-- the app is approved, or before students start using the app.
do $$
declare
  reviewer uuid := (select id from auth.users where email = 'appreview@example.com');
  sid uuid;
begin
  if reviewer is null then
    raise exception 'Create the user in Authentication › Users first';
  end if;
  update public.profiles set display_name = 'App Review' where id = reviewer;
  insert into public.societies (name, short_name, description, category, status, created_by)
  values ('App Review Test Society', 'TEST', 'A private society for App Store review.', 'Other', 'approved', reviewer)
  returning id into sid;
  insert into public.society_members (society_id, user_id, role) values (sid, reviewer, 'owner')
  on conflict (society_id, user_id) do update set role = 'owner';
  insert into public.events (society_id, title, description, location, starts_at, ends_at, status, capacity, created_by)
  values (sid, 'Review test event', 'Sign up, then open Tickets to see the QR ticket.', 'University Library',
          now() + interval '7 days', now() + interval '7 days 2 hours', 'published', 30, reviewer);
end $$;
