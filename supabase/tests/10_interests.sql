-- v0.7: interests on the profile.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'j-student@link.cuhk.edu.hk'),
  ('00000000-0000-0000-0000-000000000102', 'j-other@link.cuhk.edu.hk');

set role authenticated;
select tests.login('00000000-0000-0000-0000-000000000101');
select tests.eq((select interests from public.profiles where id = auth.uid()), '{}'::text[], 'new profiles start with no interests');

update public.profiles set interests = array['Music', 'Sports'] where id = auth.uid();
select tests.eq((select interests from public.profiles where id = auth.uid()), array['Music', 'Sports'], 'can save own interests');

select tests.throws($$ update public.profiles set interests = array['Gambling'] where id = auth.uid() $$, 'check constraint',
  'only society categories are allowed');

select tests.login('00000000-0000-0000-0000-000000000102');
update public.profiles set interests = array['Tech'] where id = '00000000-0000-0000-0000-000000000101';
reset role;
select tests.eq((select interests from public.profiles where id = '00000000-0000-0000-0000-000000000101'),
  array['Music', 'Sports'], 'cannot change someone else''s interests');
