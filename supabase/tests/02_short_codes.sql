-- Check-in by the 8-character code printed under the QR.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'sc-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000b2', 'sc-guest@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select public.create_society('Short Code Club', null, '', 'Academic', null, null, null) as sid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Short code event', now() + interval '1 day', now() + interval '1 day 2 hours', 'published')
returning id as eid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b2');
select left(ticket_code, 8) as short from public.register_for_event(:'eid') \gset
select tests.login('00000000-0000-0000-0000-0000000000b1');
select tests.eq((public.check_in(:'eid', upper(:'short')) ->> 'ok')::boolean, true, 'short code (any case) checks in');
select tests.eq(public.check_in(:'eid', 'zzzzzzzz') ->> 'message', 'Ticket not found', 'unknown short code rejected');
reset role;
