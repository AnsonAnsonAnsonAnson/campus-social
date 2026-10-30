-- v0.6: saving events.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000091', 'i-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000092', 'i-saver@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000091');
select public.create_society('Saving Society', 'SAV', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Open day', now() + interval '3 days', now() + interval '3 days 2 hours', 'published')
returning id as eid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Secret draft', now() + interval '4 days', now() + interval '4 days 2 hours', 'draft')
returning id as did \gset

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000092');
insert into public.saved_events (event_id) values (:'eid');
select tests.eq((select count(*) from public.saved_events), 1::bigint, 'can save a published event');
select tests.throws(format('insert into public.saved_events (event_id) values (%L)', :'did'),
  'row-level security', 'cannot save a draft you cannot see');
select tests.throws(format('insert into public.saved_events (user_id, event_id) values (%L, %L)',
  '00000000-0000-0000-0000-000000000091', :'eid'), 'row-level security', 'cannot save for someone else');

select tests.login('00000000-0000-0000-0000-000000000091');
select tests.eq((select count(*) from public.saved_events), 0::bigint, 'saved events are private, even from the society');

select tests.login('00000000-0000-0000-0000-000000000092');
delete from public.saved_events where event_id = :'eid';
select tests.eq((select count(*) from public.saved_events), 0::bigint, 'can unsave');
reset role;
