-- v0.4: society shop (payment settings, products, orders, stock, pickup).
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000f2', 'f-buyer@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000f3', 'f-editor@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000f4', 'f-admin@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000f5', 'f-other@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000f1');
select public.create_society('Shop Society', 'SSM', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.society_members (society_id, user_id, role) values
  (:'sid', '00000000-0000-0000-0000-0000000000f3', 'editor'),
  (:'sid', '00000000-0000-0000-0000-0000000000f4', 'admin');

-- payment settings: admins only, other admins told
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000f3');
select tests.throws(format('select public.set_payment_settings(%L, %L, %L, null, null)', :'sid', '91234567', 'X'),
  'Only society admins', 'editors cannot change payment details');
select tests.login('00000000-0000-0000-0000-0000000000f1');
select public.set_payment_settings(:'sid', '91234567', 'Shop Society', 'https://payme.hsbc/shopsoc', null);
select tests.login('00000000-0000-0000-0000-0000000000f4');
select tests.eq((select count(*) from public.notifications where kind = 'payment_settings_changed'), 1::bigint, 'other admins told about the change');
select tests.login('00000000-0000-0000-0000-0000000000f2');
select tests.eq((select payee_name from public.society_payment_settings where society_id = :'sid'), 'Shop Society', 'buyers see the payee');

-- products
select tests.login('00000000-0000-0000-0000-0000000000f3');
insert into public.products (society_id, title, price_hkd, member_price_hkd, variants, max_per_order, status)
values (:'sid', 'Hoodie', 180, 150, '[{"name": "M", "stock": 2}, {"name": "L", "stock": null}]', 3, 'published')
returning id as pid \gset
insert into public.products (society_id, title, price_hkd, status) values (:'sid', 'Secret tote', 60, 'draft');
select tests.login('00000000-0000-0000-0000-0000000000f2');
select tests.eq(jsonb_array_length(public.list_products(:'sid')), 1, 'buyers see published products only');
select tests.eq(jsonb_array_length(public.list_products(null)), 1, 'open products listed across shops');

-- ordering
select tests.throws(format('select public.place_order(%L, %L, %L)', :'pid', '[{"variant": "M", "qty": 3}]', 'fps'),
  'Not enough stock left', 'stock enforced');
select tests.throws(format('select public.place_order(%L, %L, %L)', :'pid', '[{"variant": "L", "qty": 4}]', 'fps'),
  'more than the limit', 'per-order limit enforced');
select tests.throws(format('select public.place_order(%L, %L, %L)', :'pid', '[{"variant": "XS", "qty": 1}]', 'fps'),
  'Choose a size', 'unknown size rejected');
select tests.throws(format('select public.place_order(%L, %L, %L)', :'pid', '[{"variant": "M", "qty": 2}, {"variant": "M", "qty": 1}]', 'fps'),
  'Not enough stock left', 'a size repeated across lines counts once in total');
select id as oid, ref, total_hkd, status as ostatus
  from public.place_order(:'pid', '[{"variant": "M", "qty": 2}, {"variant": "L", "qty": 1}]', 'fps', 'from Chan') \gset
select tests.eq(:'total_hkd'::numeric, 540::numeric, 'non-members pay the full price');
select tests.eq(:'ostatus', 'awaiting_payment', 'order waits for payment');
select tests.ok(:'ref' ~ '^SSM-[0-9]{4}$', 'reference from society initials');
select tests.eq(public.product_sold(:'pid') ->> 'M', '2', 'stock held by the order');

select tests.login('00000000-0000-0000-0000-0000000000f5');
select tests.throws(format('select public.place_order(%L, %L, %L)', :'pid', '[{"variant": "M", "qty": 1}]', 'fps'),
  'Not enough stock left', 'held stock is not sold twice');
select tests.eq((select count(*) from public.orders), 0::bigint, 'buyers only see their own orders');

-- an expired unpaid order frees its stock
reset role;
update public.orders set expires_at = now() - interval '1 minute' where id = :'oid';
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000f5');
select tests.eq(public.product_sold(:'pid') ->> 'M', null, 'expired order stops holding stock');
select id as oid2 from public.place_order(:'pid', '[{"variant": "M", "qty": 1}]', 'cash') \gset
select tests.eq((select expires_at from public.orders where id = :'oid2'), null::timestamptz, 'cash orders do not expire');
select tests.login('00000000-0000-0000-0000-0000000000f2');
select tests.throws(format('select public.claim_order_paid(%L)', :'oid'), 'expired', 'expired order cannot be claimed');

-- a fresh order, claimed, checked, not received, paid, ready, collected
reset role;
update public.orders set status = 'cancelled' where id = :'oid';
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000f2');
select id as oid, pickup_code as code, lower(ref) as oref from public.place_order(:'pid', '[{"variant": "L", "qty": 1}]', 'payme') \gset
select tests.eq((public.claim_order_paid(:'oid', 'paid 3pm')).status, 'payment_claimed', 'buyer says paid');

select tests.login('00000000-0000-0000-0000-0000000000f3');
select tests.throws(format('select public.set_order_status(array[%L::uuid], %L)', :'oid', 'paid'),
  'Only society admins', 'editors cannot confirm payments');
select tests.eq(jsonb_array_length(public.list_orders(:'sid')), 3, 'committee sees every order');
select tests.eq((public.list_orders(:'sid') -> 0 ->> 'buyer_email'), 'f-buyer@link.cuhk.edu.hk', 'with the buyer');
select tests.eq(public.collect_order(:'sid', :'code') ->> 'message', 'Not paid yet', 'unpaid orders are not handed out');

select tests.login('00000000-0000-0000-0000-0000000000f4');
select tests.eq(public.set_order_status(array[:'oid'::uuid], 'awaiting_payment'), 1, 'not received');
select tests.ok((select (o ->> 'expires_at')::timestamptz > now() from jsonb_array_elements(public.list_orders(:'sid')) o
  where o ->> 'id' = :'oid'), 'not received gives a new window');
select tests.eq(public.set_order_status(array[:'oid'::uuid], 'paid'), 1, 'treasurer ticks paid');
select tests.throws(format('select public.set_order_status(array[%L::uuid], %L)', :'oid', 'awaiting_payment'),
  'not possible', 'invalid transition rejected');

select tests.login('00000000-0000-0000-0000-0000000000f3');
select tests.eq(public.set_order_status(array[:'oid'::uuid], 'ready'), 1, 'editors mark ready');
select tests.eq((public.collect_order(:'sid', :'code') ->> 'ok')::boolean, true, 'pickup scan collects');
select tests.eq(public.collect_order(:'sid', :'code') ->> 'message', 'Already collected', 'second scan warns');
select tests.eq(public.collect_order(:'sid', :'oref') ->> 'message', 'Already collected', 'typed order ref finds the order');

select tests.login('00000000-0000-0000-0000-0000000000f2');
select tests.eq((select count(*) from public.notifications where kind = 'order_update'), 3::bigint, 'buyer told: not received, paid, ready');
select tests.throws(format('select public.cancel_my_order(%L)', :'oid'), 'can no longer be cancelled', 'collected orders stay');

-- member price
select tests.login('00000000-0000-0000-0000-0000000000f1');
insert into public.membership_plans (society_id, name, valid_until, auto_approve) values (:'sid', 'Members', current_date + 100, true)
returning id as plan \gset
select tests.login('00000000-0000-0000-0000-0000000000f2');
select public.join_society(:'plan', 'Buyer', null, null, null, null);
select tests.eq((public.place_order(:'pid', '[{"variant": "L", "qty": 1}]', 'fps')).total_hkd, 150::numeric, 'members pay the member price');
reset role;
