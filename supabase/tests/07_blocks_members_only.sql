-- v0.5: hiding a society, members-only events.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000071', 'g-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000072', 'g-member@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000073', 'g-guest@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000071');
select public.create_society('Members Only Club', 'MOC', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until, auto_approve)
values (:'sid', 'Free', 0, current_date - 1, current_date + 300, true) returning id as plan \gset
insert into public.events (society_id, title, starts_at, ends_at, status, members_only)
values (:'sid', 'Members night', now() + interval '3 days', now() + interval '3 days 2 hours', 'published', true)
returning id as eid \gset

-- hiding a society unfollows it and is private
set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000073');
insert into public.follows (society_id) values (:'sid');
insert into public.society_blocks (society_id) values (:'sid');
select tests.eq((select count(*) from public.follows where society_id = :'sid'), 0::bigint, 'hiding unfollows');
select tests.login('00000000-0000-0000-0000-000000000072');
select tests.eq((select count(*) from public.society_blocks), 0::bigint, 'hidden lists are private');
select tests.login('00000000-0000-0000-0000-000000000073');
delete from public.society_blocks where society_id = :'sid';
select tests.eq((select count(*) from public.society_blocks), 0::bigint, 'can unhide');

-- members-only events
select tests.eq((select count(*) from public.events where id = :'eid'), 1::bigint, 'non-members can see members-only events');
select tests.throws(format('select public.register_for_event(%L)', :'eid'), 'members only', 'non-members cannot sign up');
select tests.login('00000000-0000-0000-0000-000000000072');
select public.join_society(:'plan', 'Member Person', null, null, null, null, '[]', null);
select tests.eq((public.register_for_event(:'eid')).status::text, 'confirmed', 'current members can sign up');
select tests.login('00000000-0000-0000-0000-000000000071');
select tests.eq((public.register_for_event(:'eid')).status::text, 'confirmed', 'committee can sign up');

-- committees can set the flag themselves
select tests.login('00000000-0000-0000-0000-000000000071');
insert into public.events (society_id, title, starts_at, ends_at, status, members_only)
values (:'sid', 'Committee-made members night', now() + interval '4 days', now() + interval '4 days 2 hours', 'draft', true);
update public.events set members_only = false where society_id = :'sid' and title = 'Committee-made members night';
select tests.eq((select members_only from public.events where title = 'Committee-made members night'), false, 'committee can change members only');
