-- v0.2: notifications, committee management, sign-up answers, manual
-- check-in, report moderation, ownership hand-over on account deletion.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000c2', 'c-fan@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000c3', 'c-late@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000c4', 'c-admin@cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000c5', 'c-helper@link.cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000000c4';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000c1');
select public.create_society('Notify Club', 'NC', '', 'Academic', null, null, null) as sid \gset

select tests.login('00000000-0000-0000-0000-0000000000c4');
select public.review_society(:'sid', 'approved', false);
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.eq((select kind from public.notifications), 'society_approved', 'committee told when society is approved');

-- followers hear about new events
select tests.login('00000000-0000-0000-0000-0000000000c2');
insert into public.follows (society_id) values (:'sid');
select tests.login('00000000-0000-0000-0000-0000000000c1');
insert into public.events (society_id, title, starts_at, ends_at, status, capacity, signup_question)
values (:'sid', 'Notify event', now() + interval '3 days', now() + interval '3 days 2 hours', 'published', 1, 'Dietary needs?')
returning id as eid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Draft event', now() + interval '4 days', now() + interval '4 days 2 hours', 'draft')
returning id as draft_id \gset

select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.notifications where kind = 'new_event'), 1::bigint, 'followers notified of published event only');
select tests.login('00000000-0000-0000-0000-0000000000c1');
update public.events set status = 'published' where id = :'draft_id';
select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.notifications where kind = 'new_event'), 2::bigint, 'publishing a draft notifies followers');

-- sign-up answers
select tests.eq((select answer from public.register_for_event(:'eid', '  No nuts please ')), 'No nuts please', 'answer stored trimmed');
select tests.login('00000000-0000-0000-0000-0000000000c3');
select tests.eq((select status::text from public.register_for_event(:'eid')), 'waitlisted', 'answer is optional');

-- waitlist promotion notification
select tests.login('00000000-0000-0000-0000-0000000000c2');
select public.cancel_registration(:'eid');
select tests.login('00000000-0000-0000-0000-0000000000c3');
select tests.eq((select kind from public.notifications), 'waitlist_promoted', 'promoted person is notified');
select tests.eq((select count(*) from public.notifications where read_at is null), 1::bigint, 'unread until marked');
select public.mark_all_notifications_read();
select tests.eq((select count(*) from public.notifications where read_at is null), 0::bigint, 'mark all read');
select tests.throws($$ update public.notifications set title = 'hacked' $$, 'permission denied', 'notification text is read only');
select tests.throws($$ insert into public.notifications (user_id, kind, title) values (auth.uid(), 'new_event', 'x') $$, 'permission denied', 'users cannot create notifications');
select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.notifications where kind = 'waitlist_promoted'), 0::bigint, 'notifications are private');

-- event changes reach registrants (c3 confirmed; c2 cancelled so not told)
select tests.login('00000000-0000-0000-0000-0000000000c1');
update public.events set location = 'LT1' where id = :'eid';
update public.events set title = 'Renamed' where id = :'eid';
select tests.login('00000000-0000-0000-0000-0000000000c3');
select tests.eq((select body from public.notifications where kind = 'event_updated'), '「Notify event」的地點有變，請查看詳情。', 'location change notifies once');
select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.notifications where kind = 'event_updated'), 0::bigint, 'cancelled registrants not told');

-- committee: attendees, answers, manual check-in
select tests.login('00000000-0000-0000-0000-0000000000c1');
select registration_id as rid from public.list_attendees(:'eid') \gset
select public.set_checked_in(:'rid', true);
select tests.ok((select checked_in_at is not null from public.list_attendees(:'eid')), 'manual check-in');
select public.set_checked_in(:'rid', false);
select tests.ok((select checked_in_at is null from public.list_attendees(:'eid')), 'undo check-in');
select tests.login('00000000-0000-0000-0000-0000000000c3');
select tests.throws(format('select public.set_checked_in(%L, true)', :'rid'), 'committee', 'attendees cannot check in manually');

-- committee members
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.throws(format($$ select public.add_society_member(%L, 'nobody@link.cuhk.edu.hk', 'editor') $$, :'sid'), 'No account', 'unknown email explains next step');
select tests.throws(format($$ select public.add_society_member(%L, 'c-helper@link.cuhk.edu.hk', 'owner') $$, :'sid'), 'transfer', 'cannot add a second owner');
select public.add_society_member(:'sid', ' C-Helper@link.cuhk.edu.hk ', 'editor');
select tests.eq((select count(*) from public.list_society_members(:'sid')), 2::bigint, 'member added by email');
select tests.login('00000000-0000-0000-0000-0000000000c5');
select tests.eq((select kind from public.notifications), 'committee_added', 'new member notified');
select tests.throws(format($$ select public.add_society_member(%L, 'c-late@link.cuhk.edu.hk', 'editor') $$, :'sid'), 'admins', 'editors cannot add members');
select tests.throws(format($$ select public.transfer_society_ownership(%L, %L) $$, :'sid', '00000000-0000-0000-0000-0000000000c5'), 'owner', 'only the owner can transfer');
select tests.login('00000000-0000-0000-0000-0000000000c1');
select public.transfer_society_ownership(:'sid', '00000000-0000-0000-0000-0000000000c5');
select tests.eq((select string_agg(role::text, ',' order by role) from public.list_society_members(:'sid')), 'owner,admin', 'ownership transferred, old owner becomes admin');

-- account deletion hands the society on
select tests.login('00000000-0000-0000-0000-0000000000c5');
select public.delete_my_account();
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.eq((select role::text from public.society_members where society_id = :'sid' and user_id = auth.uid()), 'owner', 'heir promoted to owner');

-- moderation
select tests.login('00000000-0000-0000-0000-0000000000c2');
insert into public.reports (target_type, target_id, reason) values ('event', :'eid', 'Spam');
select tests.login('00000000-0000-0000-0000-0000000000c3');
insert into public.reports (target_type, target_id, reason) values ('event', :'eid', 'Misleading');
select tests.throws('select * from public.list_open_reports()', 'Admins', 'students cannot read reports');
select tests.login('00000000-0000-0000-0000-0000000000c4');
select id as rep, report_count, target_name from public.list_open_reports() where target_id = :'eid' limit 1 \gset
select tests.eq(:'report_count'::int, 2, 'reports grouped by target');
select tests.eq(:'target_name', 'Renamed', 'report shows target name');
select public.resolve_report(:'rep', 'removed');
select tests.eq((select count(*) from public.list_open_reports() where target_id = :'eid'), 0::bigint, 'resolving closes every report on the target');
select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.events where id = :'eid'), 0::bigint, 'removed event hidden from students');
select tests.throws(format('select public.register_for_event(%L)', :'eid'), 'not open', 'removed event cannot be joined');
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.eq((select count(*) from public.events where id = :'eid'), 1::bigint, 'committee still sees its removed event');
select tests.throws(format('update public.events set removed_at = null where id = %L', :'eid'), 'permission denied', 'committee cannot restore a removed event');

-- cancellation notice
select tests.login('00000000-0000-0000-0000-0000000000c2');
select public.register_for_event(:'draft_id');
select tests.login('00000000-0000-0000-0000-0000000000c1');
update public.events set status = 'cancelled' where id = :'draft_id';
select tests.login('00000000-0000-0000-0000-0000000000c2');
select tests.eq((select count(*) from public.notifications where kind = 'event_cancelled'), 1::bigint, 'registrants told about cancellation');

-- push tokens
select public.register_push_token('ExponentPushToken[abc]', 'ios');
select tests.login('00000000-0000-0000-0000-0000000000c3');
select public.register_push_token('ExponentPushToken[abc]', 'android');
reset role;
select tests.eq((select user_id::text || platform from public.push_tokens), '00000000-0000-0000-0000-0000000000c3android', 'token moves to the account now using the device');
