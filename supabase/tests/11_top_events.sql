-- v0.7: save counts and major events for "Biggest this week / month".
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'j-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a2', 'j-saver@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a3', 'j-saver2@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a5', 'j-admin@link.cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000001a5';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000001a1');
select public.create_society('Top Society', 'TOP', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Big night', now() + interval '3 days', now() + interval '3 days 2 hours', 'published')
returning id as eid \gset

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000001a2');
insert into public.saved_events (event_id) values (:'eid');
select tests.login('00000000-0000-0000-0000-0000000001a3');
insert into public.saved_events (event_id) values (:'eid');
select tests.eq((select save_count from public.events where id = :'eid'), 2, 'saves are counted');
delete from public.saved_events where event_id = :'eid';
select tests.eq((select save_count from public.events where id = :'eid'), 1, 'unsaving lowers the count');

select tests.login('00000000-0000-0000-0000-0000000001a1');
select tests.throws(format('update public.events set save_count = 999 where id = %L', :'eid'),
  'permission denied', 'committees cannot inflate the save count');
select tests.throws(format('update public.events set featured_at = now() where id = %L', :'eid'),
  'permission denied', 'committees cannot feature their own event');
select tests.throws(format('select public.set_event_featured(%L, true)', :'eid'),
  'Admins only', 'only admins can mark a major event');

select tests.login('00000000-0000-0000-0000-0000000001a5');
select public.set_event_featured(:'eid', true);
select tests.eq((select featured_at is not null from public.events where id = :'eid'), true, 'admin marks a major event');
select public.set_event_featured(:'eid', false);
select tests.eq((select featured_at is null from public.events where id = :'eid'), true, 'admin can unmark it');
reset role;
