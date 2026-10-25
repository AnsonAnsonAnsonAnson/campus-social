-- v0.3: Traditional Chinese first, English second. Each person's app language
-- is saved on their profile so notifications (and the pushes sent from them)
-- are written in that language. Campus dates get an optional Chinese title.

alter table public.profiles add column locale text not null default 'zh-Hant' check (locale in ('zh-Hant', 'en'));
grant update (locale) on public.profiles to authenticated;

alter table public.campus_dates add column title_zh text;

-- Picks the text for a recipient's language.
create or replace function public.localized(p_locale text, p_en text, p_zh text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_locale = 'en' then p_en else p_zh end;
$$;

-- The functions below are the v0.2 versions with each notification written in
-- the recipient's language.

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
    select new.user_id, 'waitlist_promoted',
      public.localized(p.locale, 'You got a spot!', '你已獲得名額！'),
      public.localized(p.locale, 'A place opened up for ' || v_title || '. Your QR ticket is ready.',
        '「' || v_title || '」有名額空出，你的二維碼門票已準備好。'),
      new.event_id
    from public.profiles p where p.id = new.user_id;
  end if;
  return null;
end;
$$;

create or replace function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society text;
  v_time boolean;
  v_place boolean;
begin
  select coalesce(short_name, name) into v_society from public.societies where id = new.society_id;

  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'cancelled' then
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select r.user_id, 'event_cancelled',
      public.localized(p.locale, 'Event cancelled', '活動已取消'),
      public.localized(p.locale, new.title || ' by ' || v_society || ' has been cancelled.',
        v_society || ' 的「' || new.title || '」已取消。'),
      new.id, new.society_id
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    where r.event_id = new.id and r.status <> 'cancelled' and r.user_id is distinct from auth.uid();

  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status = 'published'
    and (old.starts_at is distinct from new.starts_at or old.location is distinct from new.location) then
    v_time := old.starts_at is distinct from new.starts_at;
    v_place := old.location is distinct from new.location;
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select r.user_id, 'event_updated',
      public.localized(p.locale, 'Event details changed', '活動資料有變'),
      public.localized(p.locale,
        new.title || ' has a new ' ||
          case when v_time and v_place then 'time and place' when v_time then 'time' else 'place' end || '. Check the details.',
        '「' || new.title || '」的' ||
          case when v_time and v_place then '時間及地點' when v_time then '時間' else '地點' end || '有變，請查看詳情。'),
      new.id, new.society_id
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    where r.event_id = new.id and r.status <> 'cancelled' and r.user_id is distinct from auth.uid();

  elsif new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') and new.starts_at > now() then
    insert into public.notifications (user_id, kind, title, body, event_id, society_id)
    select f.user_id, 'new_event',
      public.localized(p.locale, 'New from ' || v_society, v_society || ' 有新活動'),
      new.title, new.id, new.society_id
    from public.follows f
    join public.profiles p on p.id = f.user_id
    where f.society_id = new.society_id and f.user_id is distinct from auth.uid();
  end if;
  return null;
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
  v_locale text;
  v_name text;
begin
  if not public.is_society_admin(p_society_id) then
    raise exception 'Only society admins can add committee members';
  end if;
  if p_role = 'owner' then
    raise exception 'Use transfer ownership instead';
  end if;
  select id, locale into v_user, v_locale from public.profiles where email = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account for that email yet. Ask them to sign in to the app once, then try again.';
  end if;
  insert into public.society_members (society_id, user_id, role)
  values (p_society_id, v_user, p_role)
  on conflict (society_id, user_id) do update set role = excluded.role
  where public.society_members.role <> 'owner';

  select coalesce(short_name, name) into v_name from public.societies where id = p_society_id;
  insert into public.notifications (user_id, kind, title, body, society_id)
  values (v_user, 'committee_added',
    public.localized(v_locale, 'You joined a committee', '你已加入幹事會'),
    public.localized(v_locale, 'You can now manage events for ' || v_name || '.', '你現在可以管理 ' || v_name || ' 的活動。'),
    p_society_id);
end;
$$;

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
    select m.user_id, 'society_approved',
      public.localized(p.locale, 'Your society is live', '你的學會已上線'),
      public.localized(p.locale, v_name || ' is now visible to every student.', v_name || ' 現已向所有學生公開。'),
      p_id
    from public.society_members m
    join public.profiles p on p.id = m.user_id
    where m.society_id = p_id;
  end if;
end;
$$;
