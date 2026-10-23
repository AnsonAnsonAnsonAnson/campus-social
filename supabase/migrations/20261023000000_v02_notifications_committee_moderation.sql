-- v0.2: notifications, committee management, sign-up questions, manual
-- check-in, moderation of reports, push token storage.

-- ---------------------------------------------------------------------------
-- Notifications inbox (also the source for push delivery, see
-- supabase/functions/send-push)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('waitlist_promoted', 'event_cancelled', 'event_updated', 'new_event', 'society_approved', 'committee_added')),
  title text not null,
  body text not null default '',
  event_id uuid references public.events on delete cascade,
  society_id uuid references public.societies on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own notifications" on public.notifications
  for delete using (user_id = auth.uid());
-- Rows are written only by triggers and security definer functions.
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at), delete on public.notifications to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- Expo push tokens, one row per device.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;
create policy "manage own push tokens" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Written through register_push_token; the app only deletes its token on sign-out.
revoke insert, update, delete on public.push_tokens from anon, authenticated;
grant delete on public.push_tokens to authenticated;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  -- A device that changes hands moves its token to the new account.
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end;
$$;

-- Waitlist promotions: tell the person they got a spot.
create or replace function public.notify_registration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if old.status = 'waitlisted' and new.status = 'confirmed' then
    select title into v_title from public.events where id = new.event_id;
    insert into public.notifications (user_id, kind, title, body, event_id)
    values (new.user_id, 'waitlist_promoted', 'You got a spot!', 'A place opened up for ' || v_title || '. Your QR ticket is ready.', new.event_id);
  end if;
  return null;
end;
$$;

create trigger registration_status_changed
  after update of status on public.registrations
  for each row execute function public.notify_registration_change();

-- Event cancelled / moved, and new events for followers. The person making
-- the change is never notified about it.
create or replace function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society text;
begin
  select coalesce(short_name, name) into v_society from public.societies where id = new.society_id;

  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'cancelled' then
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select r.user_id, 'event_cancelled', 'Event cancelled', new.title || ' by ' || v_society || ' has been cancelled.', new.id, new.society_id
    from public.registrations r
    where r.event_id = new.id and r.status <> 'cancelled' and r.user_id is distinct from auth.uid();

  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status = 'published'
    and (old.starts_at is distinct from new.starts_at or old.location is distinct from new.location) then
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select r.user_id, 'event_updated', 'Event details changed',
      new.title || ' has a new ' ||
        case when old.starts_at is distinct from new.starts_at and old.location is distinct from new.location then 'time and place'
             when old.starts_at is distinct from new.starts_at then 'time' else 'place' end || '. Check the details.',
      new.id, new.society_id
    from public.registrations r
    where r.event_id = new.id and r.status <> 'cancelled' and r.user_id is distinct from auth.uid();

  elsif new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') and new.starts_at > now() then
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select f.user_id, 'new_event', 'New from ' || v_society, new.title, new.id, new.society_id
    from public.follows f
    where f.society_id = new.society_id and f.user_id is distinct from auth.uid();
  end if;
  return null;
end;
$$;

create trigger event_changed_notify
  after insert or update of status, starts_at, location on public.events
  for each row execute function public.notify_event_change();

-- ---------------------------------------------------------------------------
-- Sign-up question (Eventbrite-style "anything we should know?")
-- ---------------------------------------------------------------------------
alter table public.events add column signup_question text check (char_length(signup_question) <= 200);
alter table public.registrations add column answer text check (char_length(answer) <= 500);
grant insert (signup_question), update (signup_question) on public.events to authenticated;

drop function public.register_for_event(uuid);

create or replace function public.register_for_event(p_event_id uuid, p_answer text default null)
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
  v_answer text := nullif(trim(p_answer), '');
begin
  if v_uid is null then
    raise exception 'Sign in to register for events';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null or v_event.status <> 'published' or v_event.removed_at is not null then
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
      set status = v_status, answer = v_answer, checked_in_at = null, created_at = now(), updated_at = now()
      where id = v_reg.id
      returning * into v_reg;
  else
    insert into public.registrations (event_id, user_id, status, answer)
      values (p_event_id, v_uid, v_status, v_answer)
      returning * into v_reg;
  end if;

  update public.events
    set confirmed_count = confirmed_count + (v_status = 'confirmed')::int,
        waitlist_count = waitlist_count + (v_status = 'waitlisted')::int
    where id = p_event_id;

  return v_reg;
end;
$$;

drop function public.list_attendees(uuid);

create or replace function public.list_attendees(p_event_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  email text,
  college text,
  status public.registration_status,
  answer text,
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
    select r.id, p.display_name, p.email, p.college, r.status, r.answer, r.checked_in_at, r.created_at
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    where r.event_id = p_event_id and r.status <> 'cancelled'
    order by r.status, r.created_at;
end;
$$;

-- Tap an attendee to check them in (or undo) when they can't show a QR.
create or replace function public.set_checked_in(p_registration_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_society uuid;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  select society_id into v_society from public.events where id = v_reg.event_id;
  if v_society is null or not public.is_society_member(v_society) then
    raise exception 'Only society committee members can check people in';
  end if;
  if p_checked and v_reg.status <> 'confirmed' then
    raise exception 'Only confirmed attendees can be checked in';
  end if;
  update public.registrations
    set checked_in_at = case when p_checked then coalesce(checked_in_at, now()) else null end, updated_at = now()
    where id = p_registration_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Committee members
-- ---------------------------------------------------------------------------
create or replace function public.list_society_members(p_society_id uuid)
returns table (user_id uuid, display_name text, email text, role public.society_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_society_member(p_society_id) then
    raise exception 'Only committee members can see the committee';
  end if;
  return query
    select m.user_id, p.display_name, p.email, m.role, m.created_at
    from public.society_members m
    join public.profiles p on p.id = m.user_id
    where m.society_id = p_society_id
    order by m.role, m.created_at;
end;
$$;

create or replace function public.add_society_member(p_society_id uuid, p_email text, p_role public.society_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
begin
  if not public.is_society_admin(p_society_id) then
    raise exception 'Only society admins can add committee members';
  end if;
  if p_role = 'owner' then
    raise exception 'Use transfer ownership instead';
  end if;
  select id into v_user from public.profiles where email = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account for that email yet. Ask them to sign in to the app once, then try again.';
  end if;
  insert into public.society_members (society_id, user_id, role)
  values (p_society_id, v_user, p_role)
  on conflict (society_id, user_id) do update set role = excluded.role
  where public.society_members.role <> 'owner';

  select coalesce(short_name, name) into v_name from public.societies where id = p_society_id;
  insert into public.notifications (user_id, kind, title, body, society_id)
  values (v_user, 'committee_added', 'You joined a committee', 'You can now manage events for ' || v_name || '.', p_society_id);
end;
$$;

create or replace function public.transfer_society_ownership(p_society_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.society_members
    where society_id = p_society_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the owner can transfer ownership';
  end if;
  if not exists (select 1 from public.society_members where society_id = p_society_id and user_id = p_new_owner) then
    raise exception 'The new owner must already be on the committee';
  end if;
  update public.society_members set role = 'admin' where society_id = p_society_id and user_id = auth.uid();
  update public.society_members set role = 'owner' where society_id = p_society_id and user_id = p_new_owner;
end;
$$;

-- Society approval also notifies the committee.
create or replace function public.review_society(p_id uuid, p_status public.review_status, p_verified boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.review_status;
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  select status, name into v_old, v_name from public.societies where id = p_id;
  update public.societies set status = p_status, verified = p_verified where id = p_id;
  if p_status = 'approved' and v_old <> 'approved' then
    insert into public.notifications (user_id, kind, title, body, society_id)
    select m.user_id, 'society_approved', 'Your society is live', v_name || ' is now visible to every student.', p_id
    from public.society_members m where m.society_id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation: reports can be resolved, and admins can take an event down.
-- ---------------------------------------------------------------------------
alter table public.events add column removed_at timestamptz;
alter table public.reports add column resolved_at timestamptz;
alter table public.reports add column resolution text check (resolution in ('dismissed', 'removed'));

drop policy "read public events" on public.events;
create policy "read public events" on public.events
  for select using (
    (status in ('published', 'cancelled')
      and removed_at is null
      and exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved'))
    or public.is_society_member(society_id)
    or public.is_platform_admin()
  );

create or replace function public.list_open_reports()
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_name text,
  reason text,
  report_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select r.id, r.target_type, r.target_id,
      coalesce(e.title, s.name, b.title, 'Unknown') as target_name,
      r.reason,
      count(*) over (partition by r.target_type, r.target_id) as report_count,
      r.created_at
    from public.reports r
    left join public.events e on r.target_type = 'event' and e.id = r.target_id
    left join public.societies s on r.target_type = 'society' and s.id = r.target_id
    left join public.banners b on r.target_type = 'banner' and b.id = r.target_id
    where r.resolved_at is null
    order by r.created_at;
end;
$$;

-- Resolving one report resolves every open report on the same target.
create or replace function public.resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  if p_action not in ('dismissed', 'removed') then
    raise exception 'Unknown action';
  end if;
  select * into v_report from public.reports where id = p_report_id;
  if p_action = 'removed' then
    if v_report.target_type = 'event' then
      update public.events set removed_at = now() where id = v_report.target_id;
    elsif v_report.target_type = 'society' then
      update public.societies set status = 'rejected' where id = v_report.target_id;
    elsif v_report.target_type = 'banner' then
      update public.banners set status = 'rejected' where id = v_report.target_id;
    end if;
  end if;
  update public.reports set resolved_at = now(), resolution = p_action
    where target_type = v_report.target_type and target_id = v_report.target_id and resolved_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion: hand societies to another committee member first.
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
  v_society uuid;
  v_heir uuid;
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
  -- Promote the longest-serving admin (or editor) of each society this user owns.
  for v_society in
    select society_id from public.society_members where user_id = v_uid and role = 'owner'
  loop
    select user_id into v_heir from public.society_members
      where society_id = v_society and user_id <> v_uid
      order by (role = 'admin') desc, created_at
      limit 1;
    if v_heir is not null then
      update public.society_members set role = 'owner' where society_id = v_society and user_id = v_heir;
    end if;
  end loop;
  delete from auth.users where id = v_uid;
end;
$$;
