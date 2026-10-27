-- v0.4: member roster (plans, join, approve, import, card check, renewal) and empty display names.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000e2', '1155123456@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000e3', 'e-editor@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000e4', 'e-stranger@link.cuhk.edu.hk');

select tests.eq((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'), '',
  'new accounts are not named after their student ID');

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000e1');
select public.create_society('Member Club', 'MC', '', 'Academic', null, null, null) as sid \gset
reset role;
update public.societies set status = 'approved' where id = :'sid';
insert into public.society_members (society_id, user_id, role) values (:'sid', '00000000-0000-0000-0000-0000000000e3', 'editor');

-- plans: admins only
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000e3');
select tests.throws($$ insert into public.membership_plans (society_id, name, valid_until)
  values ((select id from public.societies where name = 'Member Club'), 'Nope', current_date + 30) $$,
  'row-level security', 'editors cannot create plans');
select tests.login('00000000-0000-0000-0000-0000000000e1');
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until, questions)
values (:'sid', '2026-27 member', 50, current_date - 30, current_date + 300, '["Instrument"]')
returning id as plan \gset
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until, auto_approve)
values (:'sid', 'Friend', 0, current_date, current_date + 300, true)
returning id as free_plan \gset

-- joining a paid plan
select tests.login('00000000-0000-0000-0000-0000000000e2');
select tests.eq((select count(*) from public.membership_plans where society_id = :'sid'), 2::bigint, 'students see open plans');
select tests.throws($$ select public.join_society((select id from public.membership_plans where name = '2026-27 member'),
  'Chan Tai Man', '1155123456', 'Shaw', 'CS', null, '[]', null) $$, 'Choose how you will pay', 'paid plans need a payment method');
select tests.throws($$ select public.join_society((select id from public.membership_plans where name = '2026-27 member'),
  'Chan Tai Man', '12345', 'Shaw', 'CS', null, '[]', 'fps') $$, 'A student ID has 10 digits', 'student ID checked');
select id as mid from public.join_society(:'plan', 'Chan Tai Man', '1155123456', 'Shaw', 'Computer Science', '91234567', '["Violin"]', 'fps') \gset
select tests.eq((select status from public.memberships where id = :'mid'), 'pending', 'paid membership waits for the committee');
select tests.eq((select member_no from public.memberships where id = :'mid'), null::int, 'no member number yet');
select tests.ok((select consent_at is not null from public.memberships where id = :'mid'), 'consent recorded');
select public.claim_membership_paid(:'mid');
select tests.ok((select claimed_paid_at is not null from public.memberships where id = :'mid'), 'student can say they paid');
select tests.throws($$ select public.set_membership_status(array[(select id from public.memberships limit 1)], 'active') $$,
  'Only society admins', 'students cannot approve themselves');

-- strangers can't see the roster; editors can
select tests.login('00000000-0000-0000-0000-0000000000e4');
select tests.eq((select count(*) from public.memberships), 0::bigint, 'roster is private');
select tests.login('00000000-0000-0000-0000-0000000000e3');
select tests.eq((select count(*) from public.memberships where society_id = :'sid'), 1::bigint, 'committee sees the roster');
select tests.throws(format('select public.set_membership_status(array[%L::uuid], %L)', :'mid', 'active'),
  'Only society admins', 'editors cannot approve');

-- approving assigns a number, records payment, notifies
select tests.login('00000000-0000-0000-0000-0000000000e1');
select tests.eq(public.set_membership_status(array[:'mid'::uuid], 'active'), 1, 'admin approves');
select tests.eq((select member_no from public.memberships where id = :'mid'), 1, 'first member number');
select tests.ok((select paid_at is not null from public.memberships where id = :'mid'), 'approval records the payment');
select tests.login('00000000-0000-0000-0000-0000000000e2');
select tests.eq((select kind from public.notifications order by created_at desc limit 1), 'membership_active', 'member told');
select tests.ok(public.is_current_member(:'sid'), 'counts as a current member');

-- free plan with auto approve
select id as fid, status as fstatus from public.join_society(:'free_plan', 'Chan Tai Man', null, null, null, null) \gset
select tests.eq(:'fstatus', 'active', 'free auto-approved plan is active at once');

-- card check at the door
select card_code as card from public.memberships where id = :'mid' \gset
select tests.login('00000000-0000-0000-0000-0000000000e4');
select tests.throws(format('select public.check_member_card(%L, %L)', :'sid', :'card'), 'Only society committee', 'only committee scans cards');
select tests.login('00000000-0000-0000-0000-0000000000e3');
select tests.eq((public.check_member_card(:'sid', :'card') ->> 'ok')::boolean, true, 'active card accepted');
select tests.eq(public.check_member_card(:'sid', 'nope') ->> 'message', 'Member card not found', 'unknown card');
select tests.eq((public.check_member_card(:'sid', '#1') ->> 'ok')::boolean, true, 'typed member number accepted');
select tests.eq(public.check_member_card(:'sid', '999') ->> 'message', 'Member card not found', 'unknown member number');

-- import: one row matches an account, one waits for sign-in, duplicates and blanks skipped
select tests.login('00000000-0000-0000-0000-0000000000e1');
select tests.eq(public.import_memberships(:'plan', '[
  {"full_name": "Stranger", "email": "E-Stranger@link.cuhk.edu.hk", "college": "United"},
  {"full_name": "Future Person", "student_id": "1155999999"},
  {"full_name": "Chan Tai Man", "email": "1155123456@link.cuhk.edu.hk"},
  {"full_name": "", "email": "blank@link.cuhk.edu.hk"}
]'::jsonb), 2, 'imports new rows only');
select tests.eq((select user_id::text from public.memberships where full_name = 'Stranger'), '00000000-0000-0000-0000-0000000000e4',
  'imported row linked to existing account');
select tests.eq((select email from public.memberships where full_name = 'Future Person'), '1155999999@link.cuhk.edu.hk',
  'email made from the student ID');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e5', '1155999999@link.cuhk.edu.hk');
select tests.eq((select user_id::text from public.memberships where full_name = 'Future Person'), '00000000-0000-0000-0000-0000000000e5',
  'imported row claimed on first sign-in');

-- export log
set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000e3');
select public.log_membership_export(:'sid', 3);
select tests.eq((select row_count from public.membership_exports where society_id = :'sid'), 3, 'exports are logged');

-- renewal: a new plan notifies current members who are not on it
select tests.login('00000000-0000-0000-0000-0000000000e1');
insert into public.membership_plans (society_id, name, price_hkd, valid_from, valid_until)
values (:'sid', '2027-28 member', 50, current_date + 301, current_date + 665);
select tests.login('00000000-0000-0000-0000-0000000000e2');
select tests.eq((select count(*) from public.notifications where kind = 'membership_renewal'), 1::bigint, 'members asked to renew');

-- leaving
select public.cancel_membership(:'mid');
select tests.eq((select status from public.memberships where id = :'mid'), 'cancelled', 'member can leave');
reset role;
