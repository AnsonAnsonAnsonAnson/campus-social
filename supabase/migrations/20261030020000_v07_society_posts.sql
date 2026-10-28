-- v0.7: society posts. A society page gets a feed where its committee posts
-- updates, photos and event promotions. Only the committee can post (no
-- student feed, no comments), every post is reportable, and moderators can
-- take a post down. Likes are private to the student, like saved events:
-- societies only see the count.

create table public.society_posts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  -- Who on the committee wrote it, for moderators; students only see the society.
  author_id uuid default auth.uid() references auth.users on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 4),
  -- An event this post promotes; shown as a card under the post.
  event_id uuid references public.events on delete set null,
  pinned boolean not null default false,
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- Set when moderators take the post down; only its committee still sees it.
  removed_at timestamptz
);

create index society_posts_feed_idx on public.society_posts (society_id, pinned desc, created_at desc);

create table public.post_likes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  post_id uuid not null references public.society_posts on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.society_posts enable row level security;
alter table public.post_likes enable row level security;

create policy "read live posts" on public.society_posts
  for select using (
    (removed_at is null
      and exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved'))
    or public.is_society_member(society_id)
    or public.is_platform_admin()
  );
-- A promoted event must belong to the same society.
create policy "committee posts" on public.society_posts
  for insert to authenticated with check (
    public.is_society_member(society_id)
    and author_id = auth.uid()
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.society_id = society_posts.society_id))
  );
create policy "committee edits posts" on public.society_posts
  for update using (public.is_society_member(society_id))
  with check (
    public.is_society_member(society_id)
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.society_id = society_posts.society_id))
  );
create policy "committee deletes posts" on public.society_posts
  for delete using (public.is_society_member(society_id));

-- Supabase grants everything on new tables by default; take writes back to the columns below.
revoke insert, update, delete on public.society_posts, public.post_likes from anon, authenticated;
grant select on public.society_posts to anon, authenticated;
grant insert (society_id, body, image_urls, event_id, pinned) on public.society_posts to authenticated;
grant update (body, image_urls, event_id, pinned) on public.society_posts to authenticated;
grant delete on public.society_posts to authenticated;

create policy "see own likes" on public.post_likes
  for select using (user_id = auth.uid());
-- The posts subquery runs under the liker's own RLS, so only visible posts qualify.
create policy "like a visible post" on public.post_likes
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.society_posts p where p.id = post_id));
create policy "unlike a post" on public.post_likes
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.post_likes to authenticated;

-- One pinned post per society: pinning a post unpins the others. Editing the
-- text or photos marks the post as edited.
create or replace function public._society_post_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  if tg_op = 'UPDATE' and (new.body is distinct from old.body or new.image_urls is distinct from old.image_urls) then
    new.edited_at := now();
  end if;
  if new.pinned and (tg_op = 'INSERT' or not old.pinned) then
    update public.society_posts set pinned = false
      where society_id = new.society_id and pinned and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger society_posts_write
  before insert or update on public.society_posts
  for each row execute function public._society_post_write();

create or replace function public._post_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.society_posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.society_posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public._post_like_count();

revoke execute on function public._society_post_write() from public, anon, authenticated;
revoke execute on function public._post_like_count() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports: posts can be reported, and taking one down hides it.
-- ---------------------------------------------------------------------------
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('event', 'society', 'banner', 'post'));

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
      coalesce(e.title, s.name, b.title, ps.name || ': ' || left(p.body, 80), 'Unknown') as target_name,
      r.reason,
      count(*) over (partition by r.target_type, r.target_id) as report_count,
      r.created_at
    from public.reports r
    left join public.events e on r.target_type = 'event' and e.id = r.target_id
    left join public.societies s on r.target_type = 'society' and s.id = r.target_id
    left join public.banners b on r.target_type = 'banner' and b.id = r.target_id
    left join public.society_posts p on r.target_type = 'post' and p.id = r.target_id
    left join public.societies ps on ps.id = p.society_id
    where r.resolved_at is null
    order by r.created_at;
end;
$$;

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
    elsif v_report.target_type = 'post' then
      update public.society_posts set removed_at = now(), pinned = false where id = v_report.target_id;
    end if;
  end if;
  update public.reports set resolved_at = now(), resolution = p_action
    where target_type = v_report.target_type and target_id = v_report.target_id and resolved_at is null;
end;
$$;
