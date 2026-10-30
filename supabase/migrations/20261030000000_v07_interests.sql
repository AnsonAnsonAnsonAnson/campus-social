-- v0.7: interests picked during onboarding (the society categories a student is
-- into). They decide which societies we suggest to follow, during onboarding
-- and on the Societies tab. Only categories that societies can have are allowed.

alter table public.profiles add column interests text[] not null default '{}'
  check (
    interests <@ array['Academic', 'Arts', 'Culture', 'Faith', 'Music', 'Service', 'Sports', 'Tech', 'College', 'Other']
    and cardinality(interests) <= 10
  );
grant update (interests) on public.profiles to authenticated;
