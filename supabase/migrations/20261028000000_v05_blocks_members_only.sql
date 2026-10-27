-- v0.5: hide a society you don't want to see, and members-only events.

-- ---------------------------------------------------------------------------
-- Hidden societies. Students can't message each other, so the only content
-- they can be shown against their wishes is a society's events, banners and
-- merch. Hiding a society removes those from Discover and the calendar and
-- unfollows it; the society page and search still find it, so it can be undone.
-- ---------------------------------------------------------------------------

create table public.society_blocks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  society_id uuid not null references public.societies on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, society_id)
);

alter table public.society_blocks enable row level security;

create policy "see own hidden societies" on public.society_blocks
  for select using (user_id = auth.uid());
create policy "hide a society" on public.society_blocks
  for insert to authenticated with check (user_id = auth.uid());
create policy "unhide a society" on public.society_blocks
  for delete using (user_id = auth.uid());

create or replace function public.unfollow_hidden_society()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows where user_id = new.user_id and society_id = new.society_id;
  return null;
end;
$$;

create trigger society_blocks_unfollow
  after insert on public.society_blocks
  for each row execute function public.unfollow_hidden_society();

-- ---------------------------------------------------------------------------
-- Members-only events: everyone can see them (they advertise the society),
-- only current members can sign up.
-- ---------------------------------------------------------------------------

alter table public.events add column members_only boolean not null default false;

create or replace function public.enforce_members_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  -- Only new sign-ups and re-sign-ups; moving up from the waitlist is not checked again.
  if tg_op = 'UPDATE' and not (old.status = 'cancelled' and new.status <> 'cancelled') then
    return new;
  end if;
  select * into v_event from public.events where id = new.event_id;
  if v_event.members_only
    and not public.is_society_member(v_event.society_id)
    and not public.is_current_member(v_event.society_id, new.user_id) then
    raise exception 'This event is for members only. Join the society first.';
  end if;
  return new;
end;
$$;

-- A trigger rather than an edit to register_for_event, so every way in is covered.
create trigger registrations_members_only
  before insert or update of status on public.registrations
  for each row execute function public.enforce_members_only();
