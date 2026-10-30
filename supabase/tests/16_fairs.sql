-- v0.9: fairs, booths, presale at a booth, food vouchers used at the booth.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009c1', 'f-union@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000009c2', 'f-booth@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000009c3', 'f-buyer@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000009c4', 'f-admin@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000009c5', 'f-late@link.cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000009c4';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000009c1');
select public.create_society('Student Union', 'SU', '', 'Arts', null, null, null) as union_id \gset
select tests.login('00000000-0000-0000-0000-0000000009c2');
select public.create_society('Tea Society', 'TEA', '', 'Arts', null, null, null) as tea \gset
select tests.login('00000000-0000-0000-0000-0000000009c5');
select public.create_society('Late Society', 'LATE', '', 'Arts', null, null, null) as late \gset
reset role;
update public.societies set status = 'approved' where id in (:'union_id', :'tea', :'late');

-- the organiser creates a fair; nobody else sees it until a platform admin approves
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000009c2');
select tests.throws(format('select public.save_fair(null, %L, %L, %L, %L, null, now() + interval ''7 days'', now() + interval ''8 days'', null, true)',
  :'union_id', 'Fake Fair', '', 'Mall'), 'Only society admins', 'only the society''s admins can organise its fair');

select tests.login('00000000-0000-0000-0000-0000000009c1');
select public.save_fair(null, :'union_id', 'Christmas Fair', 'Booths on the mall', 'University Mall', null,
  now() + interval '7 days', now() + interval '8 days', now() + interval '6 days', true) as fair \gset
select tests.eq((select status from public.fairs where id = :'fair'), 'pending', 'new fairs wait for review');
select tests.eq((select count(*)::int from public.fair_booths where fair_id = :'fair' and status = 'approved'), 1,
  'the organiser has a booth at its own fair');
select tests.eq((public.get_fair(:'fair') ->> 'can_manage')::boolean, true, 'organiser can manage');

select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.eq(jsonb_array_length(public.list_fairs()), 0, 'pending fairs are hidden');
select tests.throws(format('select public.review_fair(%L, %L)', :'fair', 'approved'), 'Only platform admins', 'students cannot approve');

select tests.login('00000000-0000-0000-0000-0000000009c4');
select public.review_fair(:'fair', 'approved');
select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.eq(jsonb_array_length(public.list_fairs()), 1, 'approved fairs are listed');
reset role;
select tests.eq((select title from public.notifications where kind = 'fair_update'
  and user_id = '00000000-0000-0000-0000-0000000009c1'), '市集已獲批', 'organiser told the fair is approved');
set role authenticated;

-- booths
select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.throws(format('select public.apply_for_booth(%L, %L)', :'fair', :'tea'), 'Only society admins',
  'only society admins ask for a booth');
select tests.login('00000000-0000-0000-0000-0000000009c2');
select (public.apply_for_booth(:'fair', :'tea', 'Bubble tea and tote bags')).id as booth \gset
select tests.eq((select status from public.fair_booths where id = :'booth'), 'pending', 'booth requests wait for the organiser');

-- no fair products before the booth is confirmed
select tests.throws(format('insert into public.products (society_id, title, price_hkd, status, fair_id) values (%L, %L, 25, %L, %L)',
  :'tea', 'Early tea', 'published', :'fair'), 'confirmed booth', 'no presale without a confirmed booth');

select tests.throws(format('select public.review_booth(%L, %L, %L)', :'booth', 'approved', 'B12'), 'Only the organiser',
  'booths cannot approve themselves');
select tests.login('00000000-0000-0000-0000-0000000009c1');
select public.review_booth(:'booth', 'approved', 'B12');
reset role;
select tests.eq((select title from public.notifications where kind = 'fair_update'
  and user_id = '00000000-0000-0000-0000-0000000009c2'), '攤位已確認', 'booth society told');
set role authenticated;

select tests.login('00000000-0000-0000-0000-0000000009c2');
insert into public.products (society_id, title, price_hkd, status, fair_id, kind, voucher_value_hkd, variants)
values (:'tea', 'Bubble tea voucher', 25, 'published', :'fair', 'voucher', 30, '[{"name": "", "stock": 100}]')
returning id as tea_voucher \gset
insert into public.products (society_id, title, price_hkd, status, fair_id, variants)
values (:'tea', 'Fair tote', 60, 'published', :'fair', '[{"name": "", "stock": 20}]') returning id as fair_tote \gset
insert into public.products (society_id, title, price_hkd, status) values (:'tea', 'Everyday mug', 80, 'published')
returning id as mug \gset

select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.eq(jsonb_array_length(public.list_fair_products(:'fair')), 2, 'fair page lists the booth''s presale items');
select tests.eq(public.list_fair_products(:'fair') -> 0 ->> 'booth', 'B12', 'with the booth number');
select tests.eq((public.get_fair(:'fair') ->> 'product_count')::int, 2, 'fair counts its items');

-- checkout: fair items on their own
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'tea',
  jsonb_build_array(jsonb_build_object('product_id', :'tea_voucher', 'variant', '', 'qty', 1),
    jsonb_build_object('product_id', :'mug', 'variant', '', 'qty', 1)), 'cash'),
  'on their own', 'fair and everyday items do not mix');

select * from public.place_cart_order(:'tea',
  jsonb_build_array(jsonb_build_object('product_id', :'tea_voucher', 'variant', '', 'qty', 3),
    jsonb_build_object('product_id', :'fair_tote', 'variant', '', 'qty', 1)), 'cash') \gset o_
select tests.eq(:'o_fair_id'::uuid, :'fair'::uuid, 'the order belongs to the fair');
select tests.eq(:'o_vouchers_total'::int, 3, 'three vouchers');
select tests.eq((select items -> 0 ->> 'kind' from public.orders where id = :'o_id'), 'voucher', 'voucher lines are marked');
select tests.eq((select items -> 1 ->> 'kind' from public.orders where id = :'o_id'), null, 'merch lines are not');

-- at the booth: cash, then vouchers a few at a time
select tests.login('00000000-0000-0000-0000-0000000009c2');
select tests.eq(public.collect_order(:'tea', :'o_pickup_code') ->> 'message', 'Take cash', 'unpaid cash order asks for cash');
select tests.eq(public.collect_order(:'tea', :'o_pickup_code', true) ->> 'message', 'How many vouchers?',
  'after the cash, asks how many vouchers');
reset role;
select tests.eq((select status from public.orders where id = :'o_id'), 'paid', 'cash recorded');
set role authenticated;
select tests.eq(public.collect_order(:'tea', :'o_pickup_code', false, 5) ->> 'message', 'Not that many vouchers left',
  'cannot use more than were bought');
select tests.eq(public.collect_order(:'tea', :'o_pickup_code', false, 1) ->> 'vouchers_left', '2', 'one used, two left');
reset role;
select tests.eq((select status from public.orders where id = :'o_id'), 'paid', 'still open with vouchers left');
set role authenticated;
select tests.eq(public.collect_order(:'tea', :'o_pickup_code', false, 2) ->> 'message', 'Vouchers used', 'the rest used');
reset role;
select tests.eq((select status from public.orders where id = :'o_id'), 'collected', 'all used: collected');
set role authenticated;
select tests.eq(public.collect_order(:'tea', :'o_pickup_code', false, 1) ->> 'message', 'All vouchers used', 'no double use');

-- plain orders at a fair booth collect in one scan
select tests.login('00000000-0000-0000-0000-0000000009c3');
select * from public.place_cart_order(:'tea', jsonb_build_array(jsonb_build_object('product_id', :'mug', 'variant', '', 'qty', 1)),
  'cash') \gset m_
select tests.eq((select fair_id from public.orders where id = :'m_id') is null, true, 'everyday orders have no fair');
select tests.login('00000000-0000-0000-0000-0000000009c2');
select tests.eq(public.collect_order(:'tea', :'m_pickup_code', true) ->> 'message', 'Cash taken and collected', 'one scan');

-- organiser sees sales per booth; booths do not
select tests.throws(format('select public.fair_sales(%L)', :'fair'), 'Only the organiser', 'booths cannot see other booths');
select tests.login('00000000-0000-0000-0000-0000000009c1');
select tests.eq((select (x ->> 'sales_hkd')::numeric from jsonb_array_elements(public.fair_sales(:'fair')) x
  where x ->> 'booth' = 'B12'), 135::numeric, 'presale per booth');
select tests.eq((select (x ->> 'vouchers_used')::int from jsonb_array_elements(public.fair_sales(:'fair')) x
  where x ->> 'booth' = 'B12'), 3, 'vouchers used per booth');

-- presale closes for the whole fair at once
reset role;
update public.fairs set presale_closes_at = now() - interval '1 minute' where id = :'fair';
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'tea',
  jsonb_build_array(jsonb_build_object('product_id', :'tea_voucher', 'variant', '', 'qty', 1)), 'cash'),
  'Presale for this fair has closed', 'closed presale refuses orders');

-- a rejected booth stops selling
reset role;
update public.fairs set presale_closes_at = null where id = :'fair';
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000009c1');
select public.review_booth(:'booth', 'rejected', 'B12');
select tests.login('00000000-0000-0000-0000-0000000009c3');
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'tea',
  jsonb_build_array(jsonb_build_object('product_id', :'tea_voucher', 'variant', '', 'qty', 1)), 'cash'),
  'not on sale', 'rejected booth cannot sell');
select tests.eq(jsonb_array_length(public.list_fair_products(:'fair')), 0, 'and drops off the fair page');

-- asking again after a rejection asks again
select tests.login('00000000-0000-0000-0000-0000000009c2');
select tests.eq((public.apply_for_booth(:'fair', :'tea', 'Please')).status, 'pending', 'asks again');

-- booth requests close with the fair
select tests.login('00000000-0000-0000-0000-0000000009c1');
select public.save_fair(:'fair', null, 'Christmas Fair', '', 'University Mall', null,
  now() + interval '7 days', now() + interval '8 days', null, false);
select tests.login('00000000-0000-0000-0000-0000000009c5');
select tests.throws(format('select public.apply_for_booth(%L, %L)', :'fair', :'late'), 'not taking booth requests',
  'closed to new booths');

reset role;
