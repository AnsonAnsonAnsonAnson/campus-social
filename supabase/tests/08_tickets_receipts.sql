-- v0.5: paid event tickets and payment screenshots.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000081', 'h-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000082', 'h-buyer@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000083', 'h-member@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000084', 'h-waiting@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000085', 'h-editor@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000081');
select public.create_society('Ticket Society', 'TKS', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.society_members (society_id, user_id, role) values (:'sid', '00000000-0000-0000-0000-000000000085', 'editor');
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until, auto_approve)
values (:'sid', 'Free', 0, current_date - 1, current_date + 300, true) returning id as plan \gset

-- committee sets prices
set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000081');
insert into public.events (society_id, title, starts_at, ends_at, status, registration_required, capacity,
  waitlist_enabled, price_hkd, member_price_hkd, payment_window_hours)
values (:'sid', 'Formal dinner', now() + interval '10 days', now() + interval '10 days 3 hours', 'published', true, 2,
  true, 300, 0, 24)
returning id as eid \gset

-- a non-member signs up: needs a payment method, then gets an order
select tests.login('00000000-0000-0000-0000-000000000082');
select tests.throws(format('select public.register_for_event(%L)', :'eid'), 'Choose how you will pay', 'paid events need a payment method');
select id as rid, ticket_code as tcode from public.register_for_event(:'eid', null, 'fps') \gset
select id as oid, ref, total_hkd, status as ostatus, expires_at is not null as expires
  from public.orders where registration_id = :'rid' \gset
select tests.eq(:'total_hkd'::numeric, 300::numeric, 'ticket order at the full price');
select tests.eq(:'ostatus', 'awaiting_payment', 'ticket waits for payment');
select tests.ok(:'ref' ~ '^TKS-[0-9]{4}$', 'ticket has a bank reference');
select tests.eq(:'expires', 't', 'FPS tickets have a payment window');

-- a member's ticket is free (member price 0): no order
select tests.login('00000000-0000-0000-0000-000000000083');
select public.join_society(:'plan', 'Member Person', null, null, null, null, '[]', null);
select id as mrid, coalesce(payment_method, 'none') as mmethod from public.register_for_event(:'eid', null, 'fps') \gset
select tests.eq(:'mmethod', 'none', 'free-for-member tickets drop the payment method');
select tests.eq((select count(*) from public.orders where registration_id = :'mrid'), 0::bigint, 'no order when free for you');

-- the event is now full: the next person waits, with no order yet
select tests.login('00000000-0000-0000-0000-000000000084');
select id as wrid, status as wstatus from public.register_for_event(:'eid', null, 'payme') \gset
select tests.eq(:'wstatus', 'waitlisted', 'full paid event has a waitlist');
select tests.eq((select count(*) from public.orders where registration_id = :'wrid'), 0::bigint, 'waitlisted people pay nothing yet');

-- check-in refuses unpaid tickets, both ways
select tests.login('00000000-0000-0000-0000-000000000085');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'tcode')) ->> 'message',
  'Not paid yet', 'scanner refuses an unpaid ticket');
select tests.throws(format('select public.set_checked_in(%L, true)', :'rid'), 'Not paid yet', 'manual check-in refuses an unpaid ticket');
select tests.throws(format('select public.set_order_status(array[%L]::uuid[], %L)', :'oid', 'paid'),
  'Only society admins', 'editors cannot mark tickets paid');

-- payment screenshot: only the buyer can upload, into the record's own path
select :'sid' || '/order/' || :'oid' || '.jpg' as rpath \gset
select tests.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'receipts', :'rpath'),
  'row-level security', 'others cannot upload a receipt for your order');
select tests.login('00000000-0000-0000-0000-000000000082');
select tests.throws(format('select public.attach_receipt(%L, %L)', 'order', :'oid'), 'Upload the screenshot first', 'attach needs the file');
select tests.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'receipts', :'sid' || '/order/elsewhere.jpg'),
  'row-level security', 'receipts only go to the record''s path');
insert into storage.objects (bucket_id, name) values ('receipts', :'rpath');
select tests.eq(public.attach_receipt('order', :'oid'), :'rpath', 'receipt attached');
select tests.eq((select status from public.orders where id = :'oid'), 'payment_claimed', 'a receipt counts as "I''ve paid"');
select tests.eq((select count(*) from storage.objects where name = :'rpath'), 1::bigint, 'buyer can see their receipt');
select tests.login('00000000-0000-0000-0000-000000000084');
select tests.eq((select count(*) from storage.objects where name = :'rpath'), 0::bigint, 'other students cannot see it');
select tests.login('00000000-0000-0000-0000-000000000085');
select tests.eq((select count(*) from storage.objects where name = :'rpath'), 0::bigint, 'editors cannot see it');
select tests.login('00000000-0000-0000-0000-000000000081');
select tests.eq((select count(*) from storage.objects where name = :'rpath'), 1::bigint, 'owner can see it to confirm');
select tests.eq((select receipt_path from jsonb_to_recordset(public.list_orders(:'sid')) as x(id uuid, receipt_path text) where id = :'oid'),
  :'rpath', 'treasurer''s list shows the receipt');

-- treasurer confirms; the ticket now works; it can't be "collected" like merch
select public.set_order_status(array[:'oid']::uuid[], 'paid');
select tests.throws(format('select public.set_order_status(array[%L]::uuid[], %L)', :'oid', 'ready'),
  'event ticket', 'tickets are not handed out like merch');
select tests.eq(public.check_in(:'eid', tests.ticket_token(:'tcode')) ->> 'message',
  'Checked in', 'paid ticket checks in');
select tests.login('00000000-0000-0000-0000-000000000082');
select tests.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'receipts', :'rpath'),
  'row-level security', 'no more uploads once paid');

-- refunding gives the place up and moves the waitlist up, who then gets an order
select tests.login('00000000-0000-0000-0000-000000000081');
select public.set_order_status(array[:'oid']::uuid[], 'refunded');
reset role;
select tests.eq((select status::text from public.registrations where id = :'rid'), 'cancelled', 'refund cancels the ticket');
select tests.eq((select status::text from public.registrations where id = :'wrid'), 'confirmed', 'waitlist moves up');
select id as woid, payment_method as wmethod, status as wostatus from public.orders where registration_id = :'wrid' \gset
select tests.eq(:'wmethod', 'payme', 'promoted ticket keeps the chosen method');
select tests.eq(:'wostatus', 'awaiting_payment', 'promoted person gets an order to pay');

-- unpaid tickets past their window free the place for the next sign-up
update public.orders set expires_at = now() - interval '1 minute' where id = :'woid';
set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000082');
select status as again from public.register_for_event(:'eid', null, 'cash') \gset
select tests.eq(:'again', 'confirmed', 'an expired unpaid place is released to the next sign-up');
select tests.login('00000000-0000-0000-0000-000000000084');
select tests.eq((select status from public.orders where id = :'woid'), 'cancelled', 'expired order cancelled');
select tests.eq((select status::text from public.registrations where id = :'wrid'), 'cancelled', 'expired ticket cancelled');
select tests.ok((select count(*) from public.notifications where kind = 'order_update') > 0, 'buyer told the order lapsed');

-- cash tickets don't expire; cancelling the sign-up cancels the unpaid order
select tests.login('00000000-0000-0000-0000-000000000082');
select id as coid, coalesce(expires_at::text, 'none') as cexp from public.orders where registration_id = :'rid' and status = 'awaiting_payment' \gset
select tests.eq(:'cexp', 'none', 'cash tickets have no payment window');
select public.cancel_registration(:'eid');
select tests.eq((select status from public.orders where id = :'coid'), 'cancelled', 'cancelling the sign-up cancels its order');

-- and cancelling the order cancels the sign-up
select id as rid2 from public.register_for_event(:'eid', null, 'fps') \gset
select id as oid2 from public.orders where registration_id = :'rid2' and status = 'awaiting_payment' \gset
select public.cancel_my_order(:'oid2');
select tests.eq((select status::text from public.registrations where id = :'rid2'), 'cancelled', 'cancelling the order cancels the sign-up');

-- membership receipts
reset role;
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until)
values (:'sid', 'Paid', 50, current_date - 1, current_date + 300) returning id as paidplan \gset
set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000084');
select id as mid from public.join_society(:'paidplan', 'Waiting Person', null, null, null, null, '[]', 'fps') \gset
select :'sid' || '/membership/' || :'mid' || '.jpg' as mpath \gset
insert into storage.objects (bucket_id, name) values ('receipts', :'mpath');
select public.attach_receipt('membership', :'mid');
select tests.ok((select claimed_paid_at is not null and receipt_path = :'mpath' from public.memberships where id = :'mid'),
  'membership receipt claims payment');

-- retention: nothing yet; settled and old ones are listed, then forgotten
set role service_role;
select cardinality(public.receipts_to_purge()) as n0 \gset
reset role;
select tests.eq(:'n0', '0', 'fresh receipts are kept');
update public.orders set paid_at = now() - interval '31 days', status = 'paid' where id = :'oid';
update public.orders set receipt_path = :'rpath', cancelled_at = null where id = :'oid';
update public.memberships set receipt_at = now() - interval '91 days' where id = :'mid';
insert into storage.objects (bucket_id, name, created_at) values ('receipts', 'stray/order/x.jpg', now() - interval '2 days');
set role service_role;
select cardinality(public.receipts_to_purge()) as n3 \gset
select public.forget_receipts(public.receipts_to_purge());
reset role;
select tests.eq(:'n3', '3', 'settled, too old and stray receipts listed');
select tests.eq((select count(*) from public.orders where receipt_path is not null), 0::bigint, 'paths cleared after purge');
select tests.ok((select receipt_at is not null and receipt_path is null from public.memberships where id = :'mid'), 'receipt time kept');

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000082');
select tests.throws('select public.receipts_to_purge()', 'permission denied', 'students cannot run the purge');
reset role;

-- a member moved up when someone else cancels still gets the member price
set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000081');
insert into public.events (society_id, title, starts_at, ends_at, status, registration_required, capacity,
  waitlist_enabled, price_hkd, member_price_hkd)
values (:'sid', 'Small trip', now() + interval '5 days', now() + interval '5 days 3 hours', 'published', true, 1, true, 200, 100)
returning id as trip \gset
select tests.login('00000000-0000-0000-0000-000000000082');
select public.register_for_event(:'trip', null, 'fps');
select tests.login('00000000-0000-0000-0000-000000000083');
select public.register_for_event(:'trip', null, 'fps');
select tests.login('00000000-0000-0000-0000-000000000082');
select public.cancel_registration(:'trip');
select tests.login('00000000-0000-0000-0000-000000000083');
select tests.eq((select total_hkd from public.orders where event_id = :'trip' and status = 'awaiting_payment')::text, '100.00',
  'member moved up from the waitlist pays the member price');
reset role;
