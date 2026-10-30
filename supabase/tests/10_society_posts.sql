-- v0.7: society posts, likes, reporting and taking posts down.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'p-owner@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a2', 'p-fan@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a3', 'p-admin@cuhk.edu.hk'),
  ('00000000-0000-0000-0000-0000000001a4', 'p-other@link.cuhk.edu.hk');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-0000000001a3';

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000001a1');
select public.create_society('Posting Society', 'POST', '', 'Arts', null, null, null) as sid \gset
select tests.login('00000000-0000-0000-0000-0000000001a4');
select public.create_society('Other Society', 'OTH', '', 'Arts', null, null, null) as other_sid \gset
reset role;
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'sid', 'Open day', now() + interval '3 days', now() + interval '3 days 2 hours', 'published')
returning id as eid \gset
insert into public.events (society_id, title, starts_at, ends_at, status)
values (:'other_sid', 'Not ours', now() + interval '3 days', now() + interval '3 days 2 hours', 'published')
returning id as other_eid \gset

set role authenticated;
select tests.login('00000000-0000-0000-0000-0000000001a1');
insert into public.society_posts (society_id, body, event_id) values (:'sid', '  Come to our open day!  ', :'eid')
returning id as post1 \gset
select tests.eq((select body from public.society_posts where id = :'post1'), 'Come to our open day!', 'committee can post; text is trimmed');
select tests.eq((select author_id::text from public.society_posts where id = :'post1'),
  '00000000-0000-0000-0000-0000000001a1', 'author is recorded');
select tests.throws(format('insert into public.society_posts (society_id, body, event_id) values (%L, %L, %L)', :'sid', 'Hi', :'other_eid'),
  'row-level security', 'cannot promote another society''s event');
select tests.throws(format('insert into public.society_posts (society_id, body) values (%L, %L)', :'sid', '   '),
  'check constraint', 'empty posts are rejected');
select tests.throws(format('insert into public.society_posts (society_id, body, image_urls) values (%L, %L, %L)',
  :'sid', 'Too many', '{a,b,c,d,e}'), 'check constraint', 'at most four photos');
select tests.throws(format('insert into public.society_posts (society_id, body, like_count) values (%L, %L, 99)', :'sid', 'Fake'),
  'permission denied', 'cannot set the like count');

select tests.login('00000000-0000-0000-0000-0000000001a2');
select tests.eq((select count(*) from public.society_posts), 0::bigint, 'posts of a pending society are hidden');
select tests.throws(format('insert into public.society_posts (society_id, body) values (%L, %L)', :'sid', 'Hello'),
  'row-level security', 'students cannot post');

reset role;
update public.societies set status = 'approved' where id = :'sid';
set role authenticated;
select tests.eq((select count(*) from public.society_posts), 1::bigint, 'anyone signed in sees an approved society''s posts');
set role anon;
select tests.login(null);
select tests.eq((select count(*) from public.society_posts), 1::bigint, 'signed-out visitors see posts too');
set role authenticated;

-- pinning and editing
select tests.login('00000000-0000-0000-0000-0000000001a1');
insert into public.society_posts (society_id, body, pinned) values (:'sid', 'Welcome to our page', true) returning id as post2 \gset
update public.society_posts set pinned = true where id = :'post1';
select tests.eq((select string_agg(id::text, ',') from public.society_posts where pinned), :'post1', 'pinning a post unpins the other');
select tests.ok((select edited_at is null from public.society_posts where id = :'post1'), 'pinning is not an edit');
update public.society_posts set body = 'Open day moved to Friday' where id = :'post1';
select tests.ok((select edited_at is not null from public.society_posts where id = :'post1'), 'editing the text marks the post edited');

select tests.login('00000000-0000-0000-0000-0000000001a2');
update public.society_posts set body = 'hacked' where id = :'post1';
select tests.eq((select body from public.society_posts where id = :'post1'), 'Open day moved to Friday', 'students cannot edit posts');

-- likes
insert into public.post_likes (post_id) values (:'post1');
select tests.eq((select like_count from public.society_posts where id = :'post1'), 1, 'liking counts');
select tests.throws(format('insert into public.post_likes (post_id) values (%L)', :'post1'), 'duplicate key', 'one like per person');
select tests.throws(format('insert into public.post_likes (user_id, post_id) values (%L, %L)',
  '00000000-0000-0000-0000-0000000001a1', :'post1'), 'row-level security', 'cannot like for someone else');
select tests.login('00000000-0000-0000-0000-0000000001a1');
select tests.eq((select count(*) from public.post_likes), 0::bigint, 'likes are private, even from the society');
select tests.login('00000000-0000-0000-0000-0000000001a2');
delete from public.post_likes where post_id = :'post1';
select tests.eq((select like_count from public.society_posts where id = :'post1'), 0, 'unliking counts down');

-- reporting and taking down
insert into public.reports (target_type, target_id, reason) values ('post', :'post1', 'Spam or scam');
select tests.login('00000000-0000-0000-0000-0000000001a3');
select tests.eq((select target_name from public.list_open_reports() where target_id = :'post1'),
  'Posting Society: Open day moved to Friday', 'moderators see which post was reported');
select public.resolve_report((select id from public.list_open_reports() where target_id = :'post1'), 'removed');
select tests.ok((select removed_at is not null and not pinned from public.society_posts where id = :'post1'), 'taking a post down hides and unpins it');

select tests.login('00000000-0000-0000-0000-0000000001a2');
select tests.eq((select count(*) from public.society_posts), 1::bigint, 'a removed post is hidden from students');
select tests.throws(format('insert into public.post_likes (post_id) values (%L)', :'post1'), 'row-level security', 'cannot like a removed post');
select tests.login('00000000-0000-0000-0000-0000000001a1');
select tests.eq((select count(*) from public.society_posts), 2::bigint, 'the committee still sees its removed post');
update public.society_posts set body = 'try again' where id = :'post1';
select tests.ok((select removed_at is not null from public.society_posts where id = :'post1'), 'editing does not bring a removed post back');

-- deleting
delete from public.society_posts where id = :'post2';
select tests.eq((select count(*) from public.society_posts), 1::bigint, 'committee can delete a post');
reset role;
