-- CUHK Campus: initial schema
-- Societies, follows, events with capacity + waitlist, QR check-in,
-- promotional banners, campus calendar dates, reports, account deletion.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.society_role as enum ('owner', 'admin', 'editor');
create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.registration_status as enum ('confirmed', 'waitlisted', 'cancelled');
create type public.review_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, CUHK emails only)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null default '',
  college text,
  major text,
  year_of_study int check (year_of_study between 1 and 8),
  avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Extra addresses allowed to sign up (e.g. the App Store review account).
create table public.allowed_emails (
  email text primary key,
  note text
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    lower(new.email) ~ '@([a-z0-9-]+\.)*cuhk\.edu\.hk$'
    or exists (select 1 from public.allowed_emails a where a.email = lower(new.email))
  ) then
    raise exception 'Please sign in with your CUHK email address';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email), split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Societies
-- ---------------------------------------------------------------------------
create table public.societies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  short_name text,
  description text not null default '',
  category text not null default 'Other',
  college text,
  logo_url text,
  cover_url text,
  instagram text,
  website text,
  contact_email text,
  status public.review_status not null default 'pending',
  verified boolean not null default false,
  follower_count int not null default 0,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.society_members (
  society_id uuid not null references public.societies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.society_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (society_id, user_id)
);

create or replace function public.is_society_member(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.society_members m
    where m.society_id = sid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_society_admin(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.society_members m
    where m.society_id = sid and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- Whoever registers a society becomes its owner.
create or replace function public.handle_new_society()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.society_members (society_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_society_created
  after insert on public.societies
  for each row execute function public.handle_new_society();

-- Students register a society through this RPC; it starts as "pending" until
-- a platform admin approves it, so nobody can impersonate an official society.
create or replace function public.create_society(
  p_name text,
  p_short_name text,
  p_description text,
  p_category text,
  p_college text,
  p_instagram text,
  p_contact_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to register a society';
  end if;
  insert into public.societies (name, short_name, description, category, college, instagram, contact_email, created_by)
  values (p_name, nullif(p_short_name, ''), coalesce(p_description, ''), coalesce(p_category, 'Other'),
          nullif(p_college, ''), nullif(p_instagram, ''), nullif(p_contact_email, ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create table public.follows (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  society_id uuid not null references public.societies on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, society_id)
);

create index follows_society_idx on public.follows (society_id);

create or replace function public.sync_follower_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.societies set follower_count = follower_count + 1 where id = new.society_id;
  else
    update public.societies set follower_count = greatest(follower_count - 1, 0) where id = old.society_id;
  end if;
  return null;
end;
$$;

create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute function public.sync_follower_count();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  category text not null default 'Social',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cover_url text,
  status public.event_status not null default 'draft',
  registration_required boolean not null default true,
  capacity int check (capacity is null or capacity > 0),
  waitlist_enabled boolean not null default true,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  price_text text,
  confirmed_count int not null default 0,
  waitlist_count int not null default 0,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index events_starts_idx on public.events (starts_at);
create index events_society_idx on public.events (society_id, starts_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Registrations (tickets). Written only through the RPCs below so capacity
-- and waitlist stay consistent under concurrent sign-ups.
-- ---------------------------------------------------------------------------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status public.registration_status not null,
  ticket_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index registrations_waitlist_idx on public.registrations (event_id, status, created_at);
create index registrations_user_idx on public.registrations (user_id);

-- Promote waitlisted people while there is room. Caller must hold the event row lock.
create or replace function public._fill_from_waitlist(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_next uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  while v_event.capacity is null or v_event.confirmed_count < v_event.capacity loop
    select r.id into v_next
    from public.registrations r
    where r.event_id = p_event_id and r.status = 'waitlisted'
    order by r.created_at
    limit 1;
    exit when v_next is null;

    update public.registrations set status = 'confirmed', updated_at = now() where id = v_next;
    update public.events
      set confirmed_count = confirmed_count + 1, waitlist_count = greatest(waitlist_count - 1, 0)
      where id = p_event_id
      returning * into v_event;
    v_next := null;
  end loop;
end;
$$;

create or replace function public.on_event_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._fill_from_waitlist(new.id);
  return null;
end;
$$;

create trigger event_capacity_changed
  after update of capacity on public.events
  for each row
  when (old.capacity is distinct from new.capacity)
  execute function public.on_event_capacity_change();

create or replace function public.register_for_event(p_event_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_reg public.registrations;
  v_status public.registration_status;
begin
  if v_uid is null then
    raise exception 'Sign in to register for events';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'This event is not open for registration';
  end if;
  if not v_event.registration_required then
    raise exception 'No sign-up needed for this event, just turn up!';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'Registration has not opened yet';
  end if;
  if now() > coalesce(v_event.registration_closes_at, v_event.starts_at) then
    raise exception 'Registration has closed';
  end if;

  select * into v_reg from public.registrations where event_id = p_event_id and user_id = v_uid;
  if v_reg.id is not null and v_reg.status <> 'cancelled' then
    return v_reg;
  end if;

  if v_event.capacity is null or v_event.confirmed_count < v_event.capacity then
    v_status := 'confirmed';
  elsif v_event.waitlist_enabled then
    v_status := 'waitlisted';
  else
    raise exception 'Sorry, this event is full';
  end if;

  if v_reg.id is not null then
    -- Re-registering after cancelling: goes to the back of the queue.
    update public.registrations
      set status = v_status, checked_in_at = null, created_at = now(), updated_at = now()
      where id = v_reg.id
      returning * into v_reg;
  else
    insert into public.registrations (event_id, user_id, status)
      values (p_event_id, v_uid, v_status)
      returning * into v_reg;
  end if;

  update public.events
    set confirmed_count = confirmed_count + (v_status = 'confirmed')::int,
        waitlist_count = waitlist_count + (v_status = 'waitlisted')::int
    where id = p_event_id;

  return v_reg;
end;
$$;

create or replace function public.cancel_registration(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_reg public.registrations;
begin
  perform 1 from public.events where id = p_event_id for update;

  select * into v_reg from public.registrations
    where event_id = p_event_id and user_id = v_uid;
  if v_reg.id is null or v_reg.status = 'cancelled' then
    return;
  end if;

  update public.registrations set status = 'cancelled', updated_at = now() where id = v_reg.id;

  if v_reg.status = 'confirmed' then
    update public.events set confirmed_count = greatest(confirmed_count - 1, 0) where id = p_event_id;
    perform public._fill_from_waitlist(p_event_id);
  else
    update public.events set waitlist_count = greatest(waitlist_count - 1, 0) where id = p_event_id;
  end if;
end;
$$;

create or replace function public.waitlist_position(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.registrations r, public.registrations mine
  where mine.event_id = p_event_id
    and mine.user_id = auth.uid()
    and mine.status = 'waitlisted'
    and r.event_id = p_event_id
    and r.status = 'waitlisted'
    and r.created_at <= mine.created_at;
$$;

create or replace function public.check_in(p_event_id uuid, p_ticket_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society uuid;
  v_reg public.registrations;
  v_name text;
begin
  select society_id into v_society from public.events where id = p_event_id;
  if v_society is null or not public.is_society_member(v_society) then
    raise exception 'Only society committee members can check people in';
  end if;

  select * into v_reg from public.registrations where ticket_code = p_ticket_code;
  if v_reg.id is null then
    return jsonb_build_object('ok', false, 'message', 'Ticket not found');
  end if;

  select coalesce(nullif(p.display_name, ''), p.email) into v_name
    from public.profiles p where p.id = v_reg.user_id;

  if v_reg.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'This ticket is for a different event');
  end if;
  if v_reg.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'Ticket is ' || v_reg.status::text || ', not confirmed');
  end if;
  if v_reg.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'Already checked in at ' || to_char(v_reg.checked_in_at at time zone 'Asia/Hong_Kong', 'HH24:MI'));
  end if;

  update public.registrations set checked_in_at = now(), updated_at = now() where id = v_reg.id;
  return jsonb_build_object('ok', true, 'name', v_name, 'message', 'Checked in');
end;
$$;

create or replace function public.list_attendees(p_event_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  email text,
  college text,
  status public.registration_status,
  checked_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_society_member((select e.society_id from public.events e where e.id = p_event_id)) then
    raise exception 'Only society committee members can see attendees';
  end if;
  return query
    select r.id, p.display_name, p.email, p.college, r.status, r.checked_in_at, r.created_at
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    where r.event_id = p_event_id and r.status <> 'cancelled'
    order by r.status, r.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promotional banners (reviewed before going live)
-- ---------------------------------------------------------------------------
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  event_id uuid references public.events on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  subtitle text,
  image_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  priority int not null default 0,
  status public.review_status not null default 'pending',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create or replace function public.review_society(p_id uuid, p_status public.review_status, p_verified boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  update public.societies set status = p_status, verified = p_verified where id = p_id;
end;
$$;

create or replace function public.review_banner(p_id uuid, p_status public.review_status, p_priority int default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  update public.banners set status = p_status, priority = p_priority where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- University / college calendar
-- ---------------------------------------------------------------------------
create table public.campus_dates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'university'
    check (kind in ('university', 'college', 'holiday', 'term', 'exam', 'deadline')),
  college text,
  starts_on date not null,
  ends_on date not null,
  url text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index campus_dates_starts_idx on public.campus_dates (starts_on);

-- ---------------------------------------------------------------------------
-- Reports (App Store guideline 1.2: user-generated content must be reportable)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references auth.users on delete set null,
  target_type text not null check (target_type in ('event', 'society', 'banner')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- In-app account deletion (App Store guideline 5.1.1(v))
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  -- Free up seats first so waitlists move and counts stay right.
  for v_event in
    select event_id from public.registrations where user_id = v_uid and status <> 'cancelled'
  loop
    perform public.cancel_registration(v_event);
  end loop;
  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.societies enable row level security;
alter table public.society_members enable row level security;
alter table public.follows enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.banners enable row level security;
alter table public.campus_dates enable row level security;
alter table public.reports enable row level security;

-- Column-level privileges: users can never write counters, review status or admin flags.
revoke insert, update, delete on all tables in schema public from anon, authenticated;

grant update (display_name, college, major, year_of_study, avatar_url) on public.profiles to authenticated;
grant update (name, short_name, description, category, college, logo_url, cover_url, instagram, website, contact_email)
  on public.societies to authenticated;
grant insert, delete on public.society_members to authenticated;
grant update (role) on public.society_members to authenticated;
grant insert (society_id), delete on public.follows to authenticated;
grant insert (society_id, title, description, category, location, starts_at, ends_at, cover_url, status,
  registration_required, capacity, waitlist_enabled, registration_opens_at, registration_closes_at, price_text)
  on public.events to authenticated;
grant update (title, description, category, location, starts_at, ends_at, cover_url, status,
  registration_required, capacity, waitlist_enabled, registration_opens_at, registration_closes_at, price_text)
  on public.events to authenticated;
grant delete on public.events to authenticated;
grant insert (society_id, event_id, title, subtitle, image_url, starts_at, ends_at), delete
  on public.banners to authenticated;
grant insert, update, delete on public.campus_dates to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;

revoke execute on function public._fill_from_waitlist(uuid) from public, anon, authenticated;

-- profiles
create policy "read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_platform_admin());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- societies
create policy "read approved or own societies" on public.societies
  for select using (status = 'approved' or public.is_society_member(id) or public.is_platform_admin());
create policy "society admins edit" on public.societies
  for update using (public.is_society_admin(id)) with check (public.is_society_admin(id));

-- society_members
create policy "members see their committee" on public.society_members
  for select using (user_id = auth.uid() or public.is_society_member(society_id) or public.is_platform_admin());
create policy "admins add members" on public.society_members
  for insert with check (public.is_society_admin(society_id) and role <> 'owner');
create policy "admins change roles" on public.society_members
  for update using (public.is_society_admin(society_id) and role <> 'owner')
  with check (role <> 'owner');
create policy "admins remove members or leave" on public.society_members
  for delete using ((public.is_society_admin(society_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

-- follows
create policy "see own follows" on public.follows
  for select using (user_id = auth.uid());
create policy "follow" on public.follows
  for insert to authenticated with check (user_id = auth.uid());
create policy "unfollow" on public.follows
  for delete using (user_id = auth.uid());

-- events
create policy "read public events" on public.events
  for select using (
    (status in ('published', 'cancelled')
      and exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved'))
    or public.is_society_member(society_id)
  );
create policy "committee creates events" on public.events
  for insert to authenticated with check (public.is_society_member(society_id));
create policy "committee edits events" on public.events
  for update using (public.is_society_member(society_id)) with check (public.is_society_member(society_id));
create policy "admins delete events" on public.events
  for delete using (public.is_society_admin(society_id));

-- registrations: read only; writes go through RPCs
create policy "see own tickets" on public.registrations
  for select using (user_id = auth.uid());

-- banners
create policy "read live banners" on public.banners
  for select using (
    (status = 'approved' and now() between starts_at and ends_at)
    or public.is_society_member(society_id)
    or public.is_platform_admin()
  );
create policy "committee requests banners" on public.banners
  for insert to authenticated with check (
    public.is_society_member(society_id)
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.society_id = banners.society_id))
  );
create policy "committee removes banners" on public.banners
  for delete using (public.is_society_member(society_id));

-- campus dates
create policy "anyone reads campus dates" on public.campus_dates for select using (true);
create policy "admins write campus dates" on public.campus_dates
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- reports
create policy "file reports" on public.reports
  for insert to authenticated with check (reporter = auth.uid());
create policy "admins read reports" on public.reports
  for select using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Storage: public "media" bucket, users upload into a folder named after their id
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "upload own media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "manage own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
