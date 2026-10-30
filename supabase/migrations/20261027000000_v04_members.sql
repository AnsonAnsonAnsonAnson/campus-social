-- v0.4 part 1: society membership (the yearly member roster), and no more
-- student IDs as display names.
--
-- society_members is the COMMITTEE (is_society_member() grants management
-- rights), so ordinary members get their own tables: membership_plans (one per
-- year or tier) and memberships (one row per person per plan).

-- ---------------------------------------------------------------------------
-- Display names: new accounts start with an empty name instead of the email
-- prefix, which for students is their student ID. The welcome screen asks for
-- a real name. Existing accounts still named after their email are cleared.
-- ---------------------------------------------------------------------------
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
  values (new.id, lower(new.email), '');
  return new;
end;
$$;

update public.profiles set display_name = '' where display_name = split_part(email, '@', 1);

-- ---------------------------------------------------------------------------
-- Notification kinds for memberships and (part 2) shop orders
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'waitlist_promoted', 'event_cancelled', 'event_updated', 'new_event', 'society_approved', 'committee_added',
  'membership_active', 'membership_renewal', 'order_update', 'payment_settings_changed'
));

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  price_hkd numeric(8, 2) not null default 0 check (price_hkd >= 0 and price_hkd <= 10000),
  valid_from date not null default current_date,
  valid_until date not null,
  -- Extra questions the society asks when someone joins, e.g. ["Phone", "Instrument"].
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 5),
  -- Free plans only: new members are active straight away, no committee check.
  auto_approve boolean not null default false,
  -- Closed plans keep their members but take no new sign-ups.
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  check (valid_until >= valid_from)
);

create index membership_plans_society_idx on public.membership_plans (society_id, valid_until desc);

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.membership_plans on delete cascade,
  society_id uuid not null references public.societies on delete cascade,
  -- Empty for rows imported from a spreadsheet until that person signs in.
  user_id uuid references auth.users on delete cascade,
  -- pending: waiting for the committee (payment check or approval).
  -- Expiry is not a status: a membership is current while its plan's valid_until has not passed.
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'cancelled')),
  member_no int,
  card_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- The member's details as given to this society (with consent), for its roster and OSA's list.
  full_name text not null check (char_length(full_name) between 1 and 80),
  email text not null,
  student_id text check (student_id ~ '^[0-9]{10}$'),
  college text,
  major text check (char_length(major) <= 80),
  phone text check (char_length(phone) <= 30),
  answers jsonb not null default '[]' check (jsonb_typeof(answers) = 'array'),
  payment_method text check (payment_method in ('fps', 'payme', 'cash')),
  consent_at timestamptz,
  claimed_paid_at timestamptz,
  paid_at timestamptz,
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, user_id)
);

create index memberships_society_idx on public.memberships (society_id, status);
create index memberships_user_idx on public.memberships (user_id);
create index memberships_email_idx on public.memberships (lower(email)) where user_id is null;

-- Committees log every roster export (PDPO DPP4: know who took a copy of what).
create table public.membership_exports (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  user_id uuid references auth.users on delete set null default auth.uid(),
  row_count int not null,
  created_at timestamptz not null default now()
);

alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_exports enable row level security;

create policy "read plans of visible societies" on public.membership_plans
  for select using (
    exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved')
    or public.is_society_member(society_id)
  );
create policy "society admins write plans" on public.membership_plans
  for all to authenticated
  using (public.is_society_admin(society_id))
  with check (public.is_society_admin(society_id));

create policy "own memberships and the committee's roster" on public.memberships
  for select using (user_id = auth.uid() or public.is_society_member(society_id));

create policy "committee reads export log" on public.membership_exports
  for select using (public.is_society_member(society_id));

revoke insert, update, delete on public.membership_plans, public.memberships, public.membership_exports from anon, authenticated;
grant insert (society_id, name, price_hkd, valid_from, valid_until, questions, auto_approve, is_open),
  update (name, price_hkd, valid_from, valid_until, questions, auto_approve, is_open), delete
  on public.membership_plans to authenticated;
-- Memberships are written only by the functions below.

-- A membership counts while it is active and its plan has not ended (Hong Kong date).
create or replace function public.is_current_member(p_society_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.membership_plans p on p.id = m.plan_id
    where m.society_id = p_society_id and m.user_id = p_user and m.status = 'active'
      and (now() at time zone 'Asia/Hong_Kong')::date between p.valid_from and p.valid_until
  );
$$;

-- Next member number for a society, under a lock on the society row.
create or replace function public._activate_membership(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_no int;
  v_society text;
begin
  select * into v_m from public.memberships where id = p_id;
  perform 1 from public.societies where id = v_m.society_id for update;
  if v_m.member_no is null then
    select coalesce(max(member_no), 0) + 1 into v_no from public.memberships where society_id = v_m.society_id;
  else
    v_no := v_m.member_no;
  end if;
  update public.memberships set status = 'active', member_no = v_no, updated_at = now() where id = p_id;

  if v_m.user_id is not null and v_m.status <> 'active' then
    select coalesce(short_name, name) into v_society from public.societies where id = v_m.society_id;
    insert into public.notifications (user_id, kind, title, body, society_id)
    select v_m.user_id, 'membership_active',
      public.localized(p.locale, 'Membership confirmed', '會籍已確認'),
      public.localized(p.locale, 'You''re a member of ' || v_society || '. Your member card is in Tickets.',
        '你已成為' || v_society || '會員，會員證已放入「門票」。'),
      v_m.society_id
    from public.profiles p where p.id = v_m.user_id;
  end if;
end;
$$;

revoke execute on function public._activate_membership(uuid) from public, anon, authenticated;

-- Student joins a plan. Their details are copied onto the membership with consent.
create or replace function public.join_society(
  p_plan_id uuid,
  p_full_name text,
  p_student_id text,
  p_college text,
  p_major text,
  p_phone text,
  p_answers jsonb default '[]',
  p_payment_method text default null
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.membership_plans;
  v_m public.memberships;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Sign in to join a society';
  end if;
  select * into v_plan from public.membership_plans where id = p_plan_id;
  if v_plan.id is null
    or not exists (select 1 from public.societies s where s.id = v_plan.society_id and s.status = 'approved') then
    raise exception 'This membership is not available';
  end if;
  if not v_plan.is_open or (now() at time zone 'Asia/Hong_Kong')::date > v_plan.valid_until then
    raise exception 'This society is not taking new members right now';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Enter your full name';
  end if;
  if nullif(trim(p_student_id), '') is not null and trim(p_student_id) !~ '^[0-9]{10}$' then
    raise exception 'A student ID has 10 digits';
  end if;
  if v_plan.price_hkd > 0 and coalesce(p_payment_method, '') not in ('fps', 'payme', 'cash') then
    raise exception 'Choose how you will pay';
  end if;

  select * into v_m from public.memberships where plan_id = p_plan_id and user_id = v_uid;
  if v_m.id is not null and v_m.status in ('pending', 'active') then
    return v_m;
  end if;

  select email into v_email from public.profiles where id = v_uid;

  if v_m.id is not null then
    update public.memberships set
      status = 'pending', full_name = trim(p_full_name), student_id = nullif(trim(p_student_id), ''),
      college = nullif(p_college, ''), major = nullif(trim(p_major), ''), phone = nullif(trim(p_phone), ''),
      answers = coalesce(p_answers, '[]'), payment_method = case when v_plan.price_hkd > 0 then p_payment_method end,
      consent_at = now(), claimed_paid_at = null, paid_at = null, created_at = now(), updated_at = now()
    where id = v_m.id
    returning * into v_m;
  else
    insert into public.memberships (plan_id, society_id, user_id, full_name, email, student_id, college, major, phone,
      answers, payment_method, consent_at)
    values (p_plan_id, v_plan.society_id, v_uid, trim(p_full_name), v_email, nullif(trim(p_student_id), ''),
      nullif(p_college, ''), nullif(trim(p_major), ''), nullif(trim(p_phone), ''), coalesce(p_answers, '[]'),
      case when v_plan.price_hkd > 0 then p_payment_method end, now())
    returning * into v_m;
  end if;

  if v_plan.price_hkd = 0 and v_plan.auto_approve then
    perform public._activate_membership(v_m.id);
    select * into v_m from public.memberships where id = v_m.id;
  end if;
  return v_m;
end;
$$;

-- "I've paid": tells the treasurer to look for the transfer.
create or replace function public.claim_membership_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships set claimed_paid_at = now(), updated_at = now()
    where id = p_id and user_id = auth.uid() and status = 'pending' and paid_at is null;
  if not found then
    raise exception 'Membership not found';
  end if;
end;
$$;

-- Leaving: a pending application is withdrawn; an active membership is ended.
create or replace function public.cancel_membership(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships set status = 'cancelled', updated_at = now()
    where id = p_id and user_id = auth.uid() and status in ('pending', 'active');
  if not found then
    raise exception 'Membership not found';
  end if;
end;
$$;

-- Committee: approve (also records payment for paid plans), reject, or move back to pending.
create or replace function public.set_membership_status(p_ids uuid[], p_status text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_price numeric;
  v_count int := 0;
begin
  if p_status not in ('active', 'rejected', 'pending') then
    raise exception 'Unknown status';
  end if;
  for v_m in select * from public.memberships where id = any(p_ids) loop
    if not public.is_society_admin(v_m.society_id) then
      raise exception 'Only society admins can change memberships';
    end if;
    if p_status = 'active' then
      select price_hkd into v_price from public.membership_plans where id = v_m.plan_id;
      if v_price > 0 and v_m.paid_at is null then
        update public.memberships set paid_at = now() where id = v_m.id;
      end if;
      perform public._activate_membership(v_m.id);
    else
      update public.memberships set status = p_status, updated_at = now(),
        paid_at = case when p_status = 'pending' then null else paid_at end,
        claimed_paid_at = case when p_status = 'pending' then null else claimed_paid_at end
        where id = v_m.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Committee: add last year's spreadsheet. Rows are active members; rows whose
-- email has an account are linked to it now, the rest when that person signs in.
-- p_rows: [{"full_name", "email", "student_id", "college", "major", "phone"}]
create or replace function public.import_memberships(p_plan_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.membership_plans;
  v_row jsonb;
  v_email text;
  v_user uuid;
  v_id uuid;
  v_count int := 0;
  v_sid text;
begin
  select * into v_plan from public.membership_plans where id = p_plan_id;
  if v_plan.id is null or not public.is_society_admin(v_plan.society_id) then
    raise exception 'Only society admins can import members';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import up to 2000 rows at a time';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(coalesce(v_row ->> 'email', '')));
    v_sid := nullif(regexp_replace(coalesce(v_row ->> 'student_id', ''), '[^0-9]', '', 'g'), '');
    if v_email = '' and v_sid is not null then
      v_email := v_sid || '@link.cuhk.edu.hk';
    end if;
    continue when v_email = '' or nullif(trim(coalesce(v_row ->> 'full_name', '')), '') is null;
    if v_sid is not null and v_sid !~ '^[0-9]{10}$' then
      v_sid := null;
    end if;
    select id into v_user from public.profiles where email = v_email;
    -- Skip people already on this plan.
    continue when exists (
      select 1 from public.memberships m
      where m.plan_id = p_plan_id and (m.user_id = v_user or lower(m.email) = v_email)
    );
    insert into public.memberships (plan_id, society_id, user_id, status, full_name, email, student_id, college, major, phone, imported)
    values (p_plan_id, v_plan.society_id, v_user, 'pending', left(trim(v_row ->> 'full_name'), 80), v_email, v_sid,
      nullif(trim(coalesce(v_row ->> 'college', '')), ''), left(nullif(trim(coalesce(v_row ->> 'major', '')), ''), 80),
      left(nullif(trim(coalesce(v_row ->> 'phone', '')), ''), 30), true)
    returning id into v_id;
    perform public._activate_membership(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Imported rows find their owner when that person first signs in.
create or replace function public.link_imported_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships m set user_id = new.id, updated_at = now()
    where m.user_id is null and lower(m.email) = new.email
      and not exists (select 1 from public.memberships x where x.plan_id = m.plan_id and x.user_id = new.id);
  return null;
end;
$$;

create trigger on_profile_created_link_memberships
  after insert on public.profiles
  for each row execute function public.link_imported_memberships();

-- Committee: the roster for one society, newest plan first. Records an export when asked.
create or replace function public.log_membership_export(p_society_id uuid, p_rows int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_society_member(p_society_id) then
    raise exception 'Only committee members can export the member list';
  end if;
  insert into public.membership_exports (society_id, row_count) values (p_society_id, p_rows);
end;
$$;

-- Door check: is this member card valid for this society?
create or replace function public.check_member_card(p_society_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_plan public.membership_plans;
begin
  if not public.is_society_member(p_society_id) then
    raise exception 'Only society committee members can check member cards';
  end if;
  if trim(p_code) ~ '^#?[0-9]{1,6}$' then
    -- Typed member number from the card: the newest plan's member with that number.
    select m.* into v_m from public.memberships m
      join public.membership_plans p on p.id = m.plan_id
      where m.society_id = p_society_id and m.member_no = ltrim(trim(p_code), '#')::int
      order by p.valid_until desc limit 1;
  else
    select * into v_m from public.memberships where card_code = lower(trim(p_code));
  end if;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'message', 'Member card not found');
  end if;
  select * into v_plan from public.membership_plans where id = v_m.plan_id;
  if v_m.society_id <> p_society_id then
    return jsonb_build_object('ok', false, 'name', v_m.full_name, 'message', 'This card is for a different society');
  end if;
  if v_m.status <> 'active' then
    return jsonb_build_object('ok', false, 'name', v_m.full_name, 'message', 'This membership is not active');
  end if;
  if (now() at time zone 'Asia/Hong_Kong')::date > v_plan.valid_until then
    return jsonb_build_object('ok', false, 'name', v_m.full_name, 'message', 'This membership has expired',
      'valid_until', v_plan.valid_until);
  end if;
  return jsonb_build_object('ok', true, 'name', v_m.full_name, 'message', 'Active member',
    'member_no', v_m.member_no, 'valid_until', v_plan.valid_until, 'plan', v_plan.name);
end;
$$;

-- A new plan is a renewal: tell last term's members (those whose membership has ended or is about to).
create or replace function public.notify_membership_renewal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society text;
begin
  if not new.is_open then
    return null;
  end if;
  select coalesce(short_name, name) into v_society from public.societies where id = new.society_id;
  insert into public.notifications (user_id, kind, title, body, society_id)
  select distinct m.user_id, 'membership_renewal',
    public.localized(p.locale, 'Time to renew', '是時候續會'),
    public.localized(p.locale, v_society || ' has opened ' || new.name || '. Renew to keep your member card.',
      v_society || '已開放「' || new.name || '」，續會以保留會員證。'),
    new.society_id
  from public.memberships m
  join public.membership_plans prev on prev.id = m.plan_id
  join public.profiles p on p.id = m.user_id
  where m.society_id = new.society_id and m.status = 'active' and m.plan_id <> new.id
    and prev.valid_until < new.valid_until
    and not exists (select 1 from public.memberships x where x.plan_id = new.id and x.user_id = m.user_id);
  return null;
end;
$$;

create trigger membership_plan_created
  after insert on public.membership_plans
  for each row execute function public.notify_membership_renewal();
