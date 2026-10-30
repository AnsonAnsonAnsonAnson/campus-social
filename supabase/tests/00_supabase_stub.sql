-- Minimal stand-in for the parts of Supabase the migrations depend on, so the
-- schema can be tested on plain Postgres (see scripts/test-db.sh). Not used in
-- a real Supabase project.
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create schema auth;
create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;

grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- Assertion helpers used by the test files.
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end $$;

create function tests.eq(p_got anyelement, p_want anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % (got %, want %)', p_label, p_got, p_want;
  end if;
  raise notice 'ok - %', p_label;
end $$;

-- Text version, so quoted literals and psql variables need no casts.
create function tests.eq(p_got text, p_want text, p_label text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % (got %, want %)', p_label, p_got, p_want;
  end if;
  raise notice 'ok - %', p_label;
end $$;

-- Runs p_sql and passes only if it raises an error whose message contains p_match.
create function tests.throws(p_sql text, p_match text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_match) in lower(sqlerrm)) > 0 then
      raise notice 'ok - %', p_label;
      return;
    end if;
    raise exception 'FAIL: % (wrong error: %)', p_label, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', p_label;
end $$;

create function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- The QR token the app would show right now for a ticket (see src/lib/ticketToken.ts).
-- p_steps moves the phone clock by that many 30-second steps.
create function tests.ticket_token(p_code text, p_steps int default 0) returns text
language plpgsql security definer as $$
declare
  v_id text;
  v_step bigint := floor(extract(epoch from now()) / 30) + p_steps;
begin
  select replace(id::text, '-', '') into v_id from public.registrations where ticket_code = p_code;
  return v_id || '.' || v_step || '.' || left(public._hmac_sha256_hex(p_code, v_id || '.' || v_step), 24);
end $$;
grant execute on function tests.ticket_token(text, int) to authenticated;
