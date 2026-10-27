-- v0.6: save an event for later (the heart on Discover and the event page).
-- Private to the student: societies never see who saved their events, only
-- sign-ups. Saving needs the event to be visible to you, so drafts and
-- removed events can't be saved.

create table public.saved_events (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.saved_events enable row level security;

create policy "see own saved events" on public.saved_events
  for select using (user_id = auth.uid());
-- The events subquery runs under the saver's own RLS, so only visible events qualify.
create policy "save a visible event" on public.saved_events
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_id));
create policy "unsave an event" on public.saved_events
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.saved_events to authenticated;
