-- v0.8: online payments through the provider, with a platform fee.
\set ON_ERROR_STOP 1
\set QUIET 1

-- The edge functions call in as service_role.
grant usage on schema public, tests to service_role;
grant execute on all functions in schema tests to service_role;
-- Supabase gives service_role every table; the test stub does not.
grant select, insert, update, delete on all tables in schema public to service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000008b1', 'p-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000008b2', 'p-buyer@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000008b3', 'p-editor@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000008b4', 'p-admin@link.cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000008b4';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b1');
select public.create_society('Pay Society', 'PAY', '', 'Arts', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.society_members (society_id, user_id, role) values (:'sid', '00000000-0000-0000-0000-0000000008b3', 'editor');
insert into public.products (society_id, title, price_hkd, variants, status)
values (:'sid', 'Hoodie', 200, '[{"name": "M", "stock": 10}]', 'published') returning id as hoodie \gset

-- not before the society is verified
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b2');
select tests.eq(public.shop_online_ready(:'sid'), false, 'no payout account, no online payments');
select tests.throws(format('select public.place_cart_order(%L, %L, %L)', :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 1)), 'online'),
  'does not take online payments yet', 'online order refused before setup');
select tests.throws(format('select public.sync_payout_account(%L, %L, true, true, true, 0, null)', :'sid', 'acct_hack'),
  'permission denied', 'buyers cannot mark an account verified');
select tests.throws(format('select public.online_payment_succeeded(%L, %L, %L, 200)', 'cs_x', 'pi_x', 'card'),
  'permission denied', 'buyers cannot mark payments succeeded');

-- onboarding
set role service_role;
select tests.throws(format('select public.payout_onboarding_info(%L, %L)', :'sid', '00000000-0000-0000-0000-0000000008b3'),
  'Only society admins', 'editors cannot connect a payout account');
select tests.eq(public.payout_onboarding_info(:'sid', '00000000-0000-0000-0000-0000000008b1') ->> 'account_id', null,
  'no account yet');
select public.sync_payout_account(:'sid', 'acct_1', false, false, true, 2, null, '00000000-0000-0000-0000-0000000008b1');
select tests.eq(public.shop_online_ready(:'sid'), false, 'submitted but not verified: still off');
select public.sync_payout_account(null, 'acct_1', true, true, true, 0, null);
select tests.eq(public.shop_online_ready(:'sid'), true, 'account.updated by account id turns it on');
select tests.eq(public.sync_payout_account(null, 'acct_unknown', true, true, true, 0, null) is null, true,
  'unknown accounts are ignored');

-- the committee sees the account and the rate
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b3');
select tests.eq((select account_id from public.society_payout_accounts where society_id = :'sid'), 'acct_1',
  'committee sees the payout account');
select tests.eq(public.platform_fee_for(:'sid'), '{"percent": 5.00, "fixed_hkd": 3.00}'::jsonb, 'default rate 5% + HK$3');

-- checkout
select tests.login('00000000-0000-0000-0000-0000000008b2');
select tests.eq((select count(*) from public.society_payout_accounts)::int, 0, 'buyers cannot see payout accounts');
select id as oid, expires_at as oexp, total_hkd from public.place_cart_order(:'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 1)), 'online') \gset
select tests.ok(:'oexp'::timestamptz between now() + interval '29 minutes' and now() + interval '31 minutes',
  'online orders hold stock for 30 minutes');
select tests.throws(format('select public.claim_order_paid(%L)', :'oid'), 'confirmed automatically',
  'buyers cannot claim an online order paid');

select tests.login('00000000-0000-0000-0000-0000000008b1');
select tests.throws(format('select public.set_order_status(array[%L]::uuid[], %L)', :'oid', 'paid'),
  'confirmed automatically', 'treasurers cannot tick an online order paid');

set role service_role;
select tests.throws(format('select public.online_checkout_info(%L, %L)', :'oid', '00000000-0000-0000-0000-0000000008b1'),
  'Order not found', 'only the buyer can pay');
select public.online_checkout_info(:'oid', '00000000-0000-0000-0000-0000000008b2') as info \gset
select tests.eq((:'info'::jsonb ->> 'fee_hkd')::numeric, 13::numeric, 'fee on HK$200 is HK$13');
select tests.eq(:'info'::jsonb ->> 'account_id', 'acct_1', 'paid to the society account');
select public.record_checkout_session(:'oid', 'cs_1', 'https://checkout.stripe.com/1', now() + interval '30 minutes', 200, 13);
select tests.eq(public.online_checkout_info(:'oid', '00000000-0000-0000-0000-0000000008b2') -> 'open_sessions',
  '["cs_1"]'::jsonb, 'a second try lists the open page to close');
select public.record_checkout_session(:'oid', 'cs_2', 'https://checkout.stripe.com/2', now() + interval '40 minutes', 200, 13);
select tests.eq((select status from public.payments where session_id = 'cs_1'), 'expired', 'older page closed');
select tests.ok((select expires_at from public.orders where id = :'oid') > now() + interval '44 minutes',
  'order holds stock while the page is open');

-- webhook: paid
select tests.eq(public.online_payment_succeeded('cs_unknown', 'pi_0', 'card', 200), 'unknown', 'other sessions ignored');
select tests.eq(public.online_payment_succeeded('cs_2', 'pi_2', 'alipay', 200), 'paid', 'payment marks the order paid');
select tests.eq(public.online_payment_succeeded('cs_2', 'pi_2', 'alipay', 200), 'already', 'same payment twice is a no-op');
select tests.eq((select status || ' ' || platform_fee_hkd from public.orders where id = :'oid'), 'paid 13.00',
  'order paid with the fee recorded');
select tests.eq((select title from public.notifications where user_id = '00000000-0000-0000-0000-0000000008b2'
  order by created_at desc limit 1), '已收到付款', 'buyer told (in Chinese by default)');
-- the closed page was paid anyway (two tabs): refund that one, order stays paid
select tests.eq(public.online_payment_succeeded('cs_1', 'pi_1', 'card', 200), 'refund', 'second payment is refunded');
select tests.eq(public.online_payment_succeeded('cs_1', 'pi_1', 'card', 200), 'refund', 'retry still asks for the refund');
select tests.eq(public.online_payment_succeeded('cs_2', 'pi_2', 'alipay', 200), 'already', 'the payment that counts stays');
select public.record_online_refund('pi_1', 200);
select tests.eq(public.online_payment_succeeded('cs_1', 'pi_1', 'card', 200), 'already', 'once refunded, retries stop');
select tests.eq((select status from public.orders where id = :'oid'), 'paid', 'refunding the extra payment keeps the order');

-- committee moves it along and refunds
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b3');
select tests.eq(public.set_order_status(array[:'oid']::uuid[], 'ready'), 1, 'paid online orders can be marked ready');
select tests.login('00000000-0000-0000-0000-0000000008b1');
select tests.throws(format('select public.set_order_status(array[%L]::uuid[], %L)', :'oid', 'refunded'),
  'Refund button', 'refunds go through the provider');
select tests.throws(format('select public.set_order_status(array[%L]::uuid[], %L)', :'oid', 'cancelled'),
  'Refund button', 'paid online orders cannot just be cancelled');
select tests.eq((select count(*) from public.payments where order_id = :'oid')::int, 2, 'admins see the payments');

set role service_role;
select tests.throws(format('select public.online_refund_info(%L, %L)', :'oid', '00000000-0000-0000-0000-0000000008b3'),
  'Only society admins', 'editors cannot refund');
select tests.eq(public.online_refund_info(:'oid', '00000000-0000-0000-0000-0000000008b1') ->> 'payment_intent', 'pi_2',
  'refund the payment that counts');
select public.record_online_refund('pi_2', 200);
select tests.eq((select status from public.orders where id = :'oid'), 'refunded', 'order refunded');
select tests.eq((select title from public.notifications where user_id = '00000000-0000-0000-0000-0000000008b2'
  order by created_at desc limit 1), '已退款', 'buyer told about the refund');

-- a payment that lands after the buyer cancelled is refunded
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b2');
select id as oid2 from public.place_cart_order(:'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'hoodie', 'variant', 'M', 'qty', 1)), 'online') \gset
set role service_role;
select public.record_checkout_session(:'oid2', 'cs_3', 'https://checkout.stripe.com/3', now() + interval '30 minutes', 200, 13);
set role authenticated;
select public.cancel_my_order(:'oid2');
set role service_role;
select tests.eq(public.online_payment_succeeded('cs_3', 'pi_3', 'card', 200), 'refund', 'late payment refunded');
select tests.eq((select status from public.orders where id = :'oid2'), 'cancelled', 'cancelled order stays cancelled');
select public.online_payment_closed('cs_9', 'expired');

-- buyers see their own payments only
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008b2');
select tests.eq((select count(*) from public.payments)::int, 3, 'buyer sees their payments');
select tests.login('00000000-0000-0000-0000-0000000008b3');
select tests.eq((select count(*) from public.payments)::int, 0, 'editors do not see payments');

-- the rate
select tests.throws('select public.set_platform_fee(1, 0)', 'Only platform admins', 'only platform admins set the fee');
select tests.login('00000000-0000-0000-0000-0000000008b4');
select public.set_platform_fee(3, 0, :'sid');
select tests.eq(public.platform_fee_for(:'sid'), '{"percent": 3.00, "fixed_hkd": 0.00}'::jsonb, 'society rate');
reset role;
select tests.eq(public._platform_fee_hkd(:'sid', 200), 6.00::numeric, 'society rate used');
select tests.eq(public._platform_fee_hkd(:'sid', 0), 0::numeric, 'no fee on free orders');
set role authenticated;
select public.set_platform_fee(5, 3);
reset role;
select tests.eq((select percent from public.platform_fee), 5.00::numeric, 'app rate kept');
