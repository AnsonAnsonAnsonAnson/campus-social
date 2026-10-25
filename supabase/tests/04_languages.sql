-- v0.3: notifications are written in each recipient's app language.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000d2', 'd-zh@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000d3', 'd-en@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000000d4', 'd-admin@cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000000d4';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select locale from public.profiles where id = auth.uid()), 'zh-Hant', 'Traditional Chinese by default');
select tests.login('00000000-0000-0000-0000-0000000000d3');
update public.profiles set locale = 'en' where id = auth.uid();
select tests.eq((select locale from public.profiles where id = auth.uid()), 'en', 'people can switch to English');
select tests.throws($$ update public.profiles set locale = 'fr' where id = auth.uid() $$, 'check constraint', 'only supported languages');
update public.profiles set locale = 'en' where id = '00000000-0000-0000-0000-0000000000d2';
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select locale from public.profiles where id = auth.uid()), 'zh-Hant', 'cannot change someone else''s language');

-- society approval: owner (Chinese)
select tests.login('00000000-0000-0000-0000-0000000000d1');
select public.create_society('Lang Club', null, '', 'Culture', null, null, null) as sid \gset
select tests.login('00000000-0000-0000-0000-0000000000d4');
select public.review_society(:'sid', 'approved', false);
select tests.login('00000000-0000-0000-0000-0000000000d1');
select tests.eq((select title || ' / ' || body from public.notifications where kind = 'society_approved'),
  '你的學會已上線 / Lang Club 現已向所有學生公開。', 'approval in Chinese');

-- committee invite to an English speaker
select public.add_society_member(:'sid', 'd-en@link.cuhk.edu.hk', 'editor');
select tests.login('00000000-0000-0000-0000-0000000000d3');
select tests.eq((select body from public.notifications where kind = 'committee_added'),
  'You can now manage events for Lang Club.', 'committee invite in English');

-- the same new event reaches each follower in their own language
select tests.login('00000000-0000-0000-0000-0000000000d2');
insert into public.follows (society_id) values (:'sid');
select tests.login('00000000-0000-0000-0000-0000000000d3');
insert into public.follows (society_id) values (:'sid');
select tests.login('00000000-0000-0000-0000-0000000000d1');
insert into public.events (society_id, title, starts_at, ends_at, status, capacity)
values (:'sid', 'Tea night', now() + interval '2 days', now() + interval '2 days 2 hours', 'published', 1)
returning id as eid \gset
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select title from public.notifications where kind = 'new_event'), 'Lang Club 有新活動', 'new event in Chinese');
select tests.login('00000000-0000-0000-0000-0000000000d3');
select tests.eq((select title from public.notifications where kind = 'new_event'), 'New from Lang Club', 'new event in English');

-- waitlist promotion and cancellation
select tests.login('00000000-0000-0000-0000-0000000000d3');
select public.register_for_event(:'eid');
select tests.login('00000000-0000-0000-0000-0000000000d2');
select public.register_for_event(:'eid');
select tests.login('00000000-0000-0000-0000-0000000000d3');
select public.cancel_registration(:'eid');
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select title || ' / ' || body from public.notifications where kind = 'waitlist_promoted'),
  '你已獲得名額！ / 「Tea night」有名額空出，你的二維碼門票已準備好。', 'promotion in Chinese');
select tests.login('00000000-0000-0000-0000-0000000000d1');
update public.events set starts_at = starts_at + interval '1 hour', location = 'LT2' where id = :'eid';
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select body from public.notifications where kind = 'event_updated'),
  '「Tea night」的時間及地點有變，請查看詳情。', 'change of time and place in Chinese');
select tests.login('00000000-0000-0000-0000-0000000000d1');
update public.events set status = 'cancelled' where id = :'eid';
select tests.login('00000000-0000-0000-0000-0000000000d2');
select tests.eq((select body from public.notifications where kind = 'event_cancelled'),
  'Lang Club 的「Tea night」已取消。', 'cancellation in Chinese');

-- campus dates can carry a Chinese title
reset role;
insert into public.campus_dates (title, title_zh, starts_on, ends_on) values ('Language test day', '語言測試日', current_date, current_date);
select tests.eq((select title_zh from public.campus_dates where title = 'Language test day'), '語言測試日', 'campus date Chinese title');
