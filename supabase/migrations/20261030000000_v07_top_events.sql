-- v0.7: "Most anticipated" (this week / month) on Discover.
--
-- Events are ranked in the app from what every student can already see:
-- sign-ups (confirmed + waitlist), saves, and a "major event" flag that only
-- platform admins can set (O'Camp, Inter-U finals, the big college nights).
-- Saves stay private: societies and students only see the total.

alter table public.events
  add column featured_at timestamptz,
  add column save_count int not null default 0;

-- Neither column is in the column-level insert/update grants, so committees
-- can't feature their own events or inflate the count.

update public.events e set save_count = s.n
from (select event_id, count(*)::int as n from public.saved_events group by event_id) s
where s.event_id = e.id;

create or replace function public.count_event_saves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.events set save_count = save_count + 1 where id = new.event_id;
  else
    update public.events set save_count = greatest(save_count - 1, 0) where id = old.event_id;
  end if;
  return null;
end;
$$;

create trigger saved_events_count after insert or delete on public.saved_events
  for each row execute function public.count_event_saves();

revoke execute on function public.count_event_saves() from public, anon, authenticated;

create or replace function public.set_event_featured(p_event_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only';
  end if;
  update public.events
    set featured_at = case when p_featured then coalesce(featured_at, now()) end
    where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
end;
$$;

revoke execute on function public.set_event_featured(uuid, boolean) from public, anon;
grant execute on function public.set_event_featured(uuid, boolean) to authenticated;
