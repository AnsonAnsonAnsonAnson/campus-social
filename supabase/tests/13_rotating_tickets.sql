-- v0.7: rotating QR tickets.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000131', 'rq-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000132', 'rq-guest@link.cuhk.edu.hk');

-- HMAC matches RFC 4231 test case 2 (and so the app's hmacSha256Hex).
select tests.eq(public._hmac_sha256_hex('Jefe', 'what do ya want for nothing?'),
  '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'hmac-sha256 test vector');
select tests.eq(public._hmac_sha256_hex(repeat('k', 100), 'long key'),
  '5903eedefe0bba3f15b658715e41d71f1848739bddf19e497e968df5723dcd56', 'keys longer than a block work');

set role authenticated;
select tests.throws($$select public._hmac_sha256_hex('a', 'b')$$, 'permission denied', 'hmac helper is not callable from the app');
select tests.login('00000000-0000-0000-0000-000000000131');
select public.create_society('Rotating Club', null, '', 'Academic', null, null, null) as sid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Rotating QR night', now() + interval '1 day', now() + interval '1 day 2 hours', 'published')
returning id as eid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Other night', now() + interval '2 days', now() + interval '2 days 2 hours', 'published')
returning id as eid2 \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000132');
select ticket_code as code from public.register_for_event(:'eid') \gset
select tests.login('00000000-0000-0000-0000-000000000131');

select tests.eq(public.check_in(:'eid', :'code') ->> 'message', 'Old QR code. Ask them to update the app, or type the backup code',
  'the fixed full code no longer checks in');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'code', -3)) ->> 'message',
  'QR code expired. Ask them to open the ticket in the app, or type the backup code', 'a token from 90s ago (screenshot) is refused');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'code', 2)) ->> 'message',
  'QR code expired. Ask them to open the ticket in the app, or type the backup code', 'a token from the future is refused');
select tests.eq(public.check_in(:'eid', left(tests.ticket_token(:'code'), -6) || '000000') ->> 'message',
  'Ticket not found', 'a forged signature is refused');
select tests.eq(public.check_in(:'eid2', tests.ticket_token(:'code')) ->> 'message', 'This ticket is for a different event',
  'token for another event');
select tests.eq((select checked_in_at from public.registrations where ticket_code = :'code') is null, true, 'nothing checked in yet');
select tests.eq((public.check_in(:'eid', upper(tests.ticket_token(:'code', -2))) ->> 'ok')::boolean, true,
  'a token from a minute ago (slow clock) checks in, any case');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'code')) ->> 'message' like 'Already checked in%', true,
  'second scan says already checked in');

-- The backup code still works, with the space shown on screen.
select tests.login('00000000-0000-0000-0000-000000000132');
select left(ticket_code, 4) || ' ' || substr(ticket_code, 5, 4) as backup from public.register_for_event(:'eid2') \gset
select tests.login('00000000-0000-0000-0000-000000000131');
select tests.eq((public.check_in(:'eid2', upper(:'backup')) ->> 'ok')::boolean, true, 'typed backup code with a space checks in');
reset role;
