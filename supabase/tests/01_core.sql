-- Core rules: sign-up domain, society review, follows, registration with
-- waitlist, check-in, account deletion.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000a2', 'amy@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000a3', 'ben@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000a4', 'admin@cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000000a4';

select tests.throws($$ insert into auth.users (email) values ('someone@gmail.com') $$, 'CUHK', 'non-CUHK emails cannot sign up');
insert into public.allowed_emails (email) values ('review@example.com');
insert into auth.users (email) values ('review@example.com');
select tests.ok(exists (select 1 from public.profiles where email = 'review@example.com'), 'allow-listed email can sign up');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a1');
select public.create_society('Core Test Club', 'CTC', 'We test', 'Academic', null, null, null) as sid \gset
select tests.eq((select role::text from public.society_members where society_id = :'sid'), 'owner', 'creator becomes owner');
insert into public.events (society_id, title, starts_at, ends_at, status, capacity)
values (:'sid', 'Core event', now() + interval '2 days', now() + interval '2 days 3 hours', 'published', 1)
returning id as eid \gset
select tests.throws($$ update public.events set confirmed_count = 99 $$, 'permission denied', 'committee cannot write counters');
select tests.throws($$ update public.societies set status = 'approved' $$, 'permission denied', 'committee cannot approve itself');

select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.eq((select count(*) from public.events where id = :'eid'), 0::bigint, 'events of a pending society are hidden');
select tests.throws($$ update public.profiles set is_platform_admin = true $$, 'permission denied', 'users cannot make themselves admin');

select tests.login('00000000-0000-0000-0000-0000000000a4');
select public.review_society(:'sid', 'approved', true);

select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.eq((select count(*) from public.events where id = :'eid'), 1::bigint, 'events visible once society approved');
insert into public.follows (society_id) values (:'sid');
select tests.eq((select status::text from public.register_for_event(:'eid')), 'confirmed', 'first person gets the seat');
select tests.eq((select status::text from public.register_for_event(:'eid')), 'confirmed', 'registering twice is idempotent');

select tests.login('00000000-0000-0000-0000-0000000000a3');
select tests.eq((select status::text from public.register_for_event(:'eid')), 'waitlisted', 'second person is waitlisted');
select tests.eq(public.waitlist_position(:'eid'), 1, 'waitlist position is 1');
reset role;
select tests.eq((select confirmed_count || '/' || waitlist_count from public.events where id = :'eid'), '1/1', 'counts after two sign-ups');
select tests.eq((select follower_count from public.societies where id = :'sid'), 1, 'follower count maintained');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select public.cancel_registration(:'eid');
select tests.login('00000000-0000-0000-0000-0000000000a3');
select status as b_status, ticket_code as code from public.registrations where event_id = :'eid' \gset
select tests.eq(:'b_status', 'confirmed', 'waitlist promoted when a seat frees up');

select tests.throws(format('select public.check_in(%L, %L)', :'eid', :'code'), 'committee', 'attendees cannot check themselves in');
select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.eq((public.check_in(:'eid', tests.ticket_token(:'code')) ->> 'ok')::boolean, true, 'check-in with the QR token');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'code')) ->> 'message' like 'Already checked in%', true, 'duplicate check-in detected');

-- capacity raise moves the waitlist
select tests.login('00000000-0000-0000-0000-0000000000a2');
select tests.eq((select status::text from public.register_for_event(:'eid')), 'waitlisted', 'rejoining a full event waitlists');
select tests.login('00000000-0000-0000-0000-0000000000a1');
update public.events set capacity = 5 where id = :'eid';
reset role;
select tests.eq((select confirmed_count || '/' || waitlist_count from public.events where id = :'eid'), '2/0', 'capacity raise promotes waitlist');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000a2');
select public.delete_my_account();
reset role;
select tests.eq((select confirmed_count from public.events where id = :'eid'), 1, 'account deletion frees the seat');
select tests.eq((select follower_count from public.societies where id = :'sid'), 0, 'account deletion updates follower count');
select tests.ok(not exists (select 1 from auth.users where email = 'amy@link.cuhk.edu.hk'), 'account deleted');
