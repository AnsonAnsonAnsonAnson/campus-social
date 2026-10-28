-- v0.7: bag checkout, size charges, per-buyer limits, pickup times, restock alerts, cash at the desk.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007a1', 'g-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000007a2', 'g-buyer@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000007a3', 'g-editor@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000007a4', 'g-other@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000007a1');
select public.create_society('Bag Society', 'BAG', '', 'Arts', null, null, null) as sid \gset
select public.create_society('Other Shop', 'OTH', '', 'Arts', null, null, null) as sid2 \gset
reset role;
update public.societies set status = 'approved' where id in (:'sid', :'sid2');
insert into public.society_members (society_id, user_id, role) values (:'sid', '00000000-0000-0000-0000-0000000007a3', 'editor');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000007a1');

-- size charges are checked
select tests.throws(format(
  'insert into public.products (society_id, title, price_hkd, variants) values (%L, %L, 100, %L)',
  :'sid', 'Bad', '[{"name": "M", "stock": -1}]'), 'products_variants_valid', 'negative stock refused');
select tests.throws(format(
  'insert into public.products (society_id, title, price_hkd, variants) values (%L, %L, 100, %L)',
  :'sid', 'Bad', '[{"name": "M", "stock": 1, "extra_hkd": -5}]'), 'products_variants_valid', 'negative size charge refused');

insert into public.products (society_id, title, price_hkd, variants, max_per_order, max_per_buyer, goal_qty, status, images, size_chart)
values (:'sid', 'Hoodie', 200,
  '[{"name": "M", "stock": 5}, {"name": "XXL", "stock": 5, "extra_hkd": 20}]', 5, 3, 40, 'published',
  '{https://example.com/a.jpg}', 'Size, Chest\nM, 52\nXXL, 60')
returning id as hoodie \gset
insert into public.products (society_id, title, price_hkd, variants, status)
values (:'sid', 'Tote', 60, '[{"name": "", "stock": 1}]', 'published') returning id as tote \gset
insert into public.products (society_id, title, price_hkd, status) values (:'sid2', 'Elsewhere', 10, 'published') returning id as other \gset

insert into public.pickup_slots (society_id, starts_at, ends_at, location, capacity)
values (:'sid', now() + interval '2 days', now() + interval '2 days 2 hours', 'Room 1009', 1) returning id as slot \gset
insert into public.pickup_slots (society_id, starts_at, ends_at, location)
values (:'sid', now() + interval '3 days', now() + interval '3 days 2 hours', 'Pavilion') returning id as slot2 \gset
insert into public.pickup_slots (society_id, starts_at, ends_at, location)
values (:'sid', now() - interval '3 days', now() - interval '2 days', 'Gone') returning id as oldslot \gset

-- committee only writes its own pickup times
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.throws(format(
  'insert into public.pickup_slots (society_id, starts_at, ends_at, location) values (%L, now(), now() + interval ''1 hour'', %L)',
  :'sid', 'Hack'), 'row-level security', 'buyers cannot add pickup times');
select tests.eq(jsonb_array_length(public.list_pickup_slots(:'sid')), 2, 'buyers see upcoming pickup times only');

-- one bag, two products, one order
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'other', 'variant', '', 'qty', 1)), 'fps'),
  'not on sale', 'a bag holds one society''s products only');
select tests.throws(format('select public.place_cart_order(%L, %L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'tote', 'variant', '', 'qty', 1)), 'fps', :'oldslot'),
  'has passed', 'past pickup times refused');
select id as oid, ref, total_hkd, product_title, pickup_slot_id as oslot
  from public.place_cart_order(:'sid', jsonb_build_array(
    jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 1),
    jsonb_build_object('product_id', :'hoodie', 'variant', 'XXL', 'qty', 1),
    jsonb_build_object('product_id', :'tote', 'variant', '', 'qty', 1)), 'fps', :'slot', 'thanks') \gset
select tests.eq(:'total_hkd'::numeric, 480::numeric, 'XXL charge added: 200 + 220 + 60');
select tests.ok(:'ref' ~ '^BAG-[0-9]{4}$', 'one reference for the whole bag');
select tests.eq((select product_id from public.orders where id = :'oid'), null::uuid, 'no single product on a mixed order');
select tests.eq(:'product_title', 'Hoodie, Tote', 'title lists the products');
select tests.eq(:'oslot', :'slot', 'pickup time booked');
select tests.eq(public.product_sold(:'hoodie'), '{"M": 1, "XXL": 1}'::jsonb, 'stock counted per line');
select tests.eq(public.product_sold(:'tote') ->> '', '1', 'second product held too');
select tests.eq((select items -> 1 ->> 'title' from public.orders where id = :'oid'), 'Hoodie', 'lines keep their product');

-- limits
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 2)), 'cash'),
  'reached the limit', 'per-buyer limit counts earlier orders');
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'tote', 'variant', '', 'qty', 1)), 'cash'),
  'Not enough stock', 'sold-out product refused');

-- a full pickup time
select tests.login('00000000-0000-0000-0000-0000000007a4');
select tests.throws(format('select public.place_cart_order(%L, %L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 1)), 'cash', :'slot'),
  'is full', 'capped pickup time refuses more orders');
select tests.eq((select (s ->> 'booked')::int from jsonb_array_elements(public.list_pickup_slots(:'sid')) s where s ->> 'id' = :'slot'), 1,
  'booked count shown');

-- the legacy one-product call still works, and books no time
select id as cashid, pickup_code as cashcode from public.place_order(:'hoodie', '[{"variant": "M", "qty": 1}]', 'cash') \gset
select tests.eq((select product_id::text from public.orders where id = :'cashid'), :'hoodie', 'single-product order keeps product_id');
select tests.throws(format('select public.choose_pickup_slot(%L, %L)', :'cashid', :'slot'), 'is full', 'cannot move into a full time');
select tests.eq((select pickup_slot_id::text from public.choose_pickup_slot(:'cashid', :'slot2')), :'slot2', 'buyer books a time later');
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.throws(format('select public.choose_pickup_slot(%L, %L)', :'cashid', :'slot2'), 'Order not found', 'only your own order');

-- restock alerts
select tests.login('00000000-0000-0000-0000-0000000007a2');
insert into public.product_alerts (product_id) values (:'tote');
select tests.eq((select (p ->> 'alert')::boolean from jsonb_array_elements(public.list_products(:'sid')) p where p ->> 'id' = :'tote'), true,
  'alert shown on the product');
select tests.login('00000000-0000-0000-0000-0000000007a1');
update public.products set title = 'Tote bag' where id = :'tote';
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.eq((select count(*) from public.notifications where kind = 'product_available'), 0::bigint, 'no alert without new stock');
select tests.login('00000000-0000-0000-0000-0000000007a1');
update public.products set variants = '[{"name": "", "stock": 10}]' where id = :'tote';
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.eq((select count(*) from public.notifications where kind = 'product_available'), 1::bigint, 'told when stock is added');
select tests.eq((select count(*) from public.product_alerts), 0::bigint, 'alert used up');

-- moving a pickup time tells the people booked on it
select tests.login('00000000-0000-0000-0000-0000000007a3');
update public.pickup_slots set location = 'Room 1010' where id = :'slot';
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.eq((select count(*) from public.notifications where kind = 'order_update' and body like '%Room 1010%'), 1::bigint,
  'buyer told the time moved');

-- pickup desk: cash taken at the desk by any committee member
select tests.login('00000000-0000-0000-0000-0000000007a3');
select tests.eq(public.collect_order(:'sid', :'cashcode') ->> 'message', 'Take cash', 'unpaid cash order asks for cash');
select tests.eq((public.collect_order(:'sid', :'cashcode') ->> 'total_hkd')::numeric, 200::numeric, 'desk sees the amount');
select tests.eq(public.collect_order(:'sid', :'cashcode', true) ->> 'message', 'Cash taken and collected', 'cash and handover in one step');
select tests.eq(public.collect_order(:'sid', :'cashcode') ->> 'message', 'Already collected', 'not handed out twice');
select tests.eq(public.collect_order(:'sid', :'ref') ->> 'message', 'Not paid yet', 'FPS order still needs the treasurer');
select tests.eq(public.collect_order(:'sid', :'ref') ->> 'items', 'Hoodie M ×1, Hoodie XXL ×1, Tote ×1', 'desk lists every line');
select tests.eq(public.collect_order(:'sid', :'ref', true) ->> 'message', 'Not paid yet', 'cash flag ignored for FPS orders');

-- deleting a time tells the buyer to choose again
select tests.login('00000000-0000-0000-0000-0000000007a1');
delete from public.pickup_slots where id = :'slot';
select tests.login('00000000-0000-0000-0000-0000000007a2');
select tests.eq((select count(*) from public.notifications where kind = 'order_update' and title in ('Pickup time cancelled', '取貨時段已取消')), 1::bigint, 'buyer told the time was cancelled');
select tests.eq((select pickup_slot_id from public.orders where id = :'oid'), null::uuid, 'order no longer booked');

reset role;
