-- v0.5 part 2: paid event tickets and payment screenshots.
--
-- Tickets reuse the shop: a confirmed sign-up to a paid event gets an order
-- with a reference, the buyer pays the society directly (FPS / PayMe / cash),
-- and the treasurer marks it paid. The QR ticket only works at the door once
-- the order is paid. Unpaid tickets free their place when the payment window
-- runs out, and the next person on the waitlist moves up.
--
-- Payment screenshots are optional and kept small: the app compresses them to a
-- ~1000px JPEG before upload, the bucket refuses anything else or over 300 KB,
-- each order or membership has exactly one file (re-uploading replaces it), and
-- a scheduled job deletes them once they have done their job.

-- ---------------------------------------------------------------------------
-- Prices on events
-- ---------------------------------------------------------------------------
alter table public.events
  add column price_hkd numeric(8, 2) check (price_hkd >= 0 and price_hkd <= 10000),
  add column member_price_hkd numeric(8, 2) check (member_price_hkd >= 0 and member_price_hkd <= 10000),
  add column payment_window_hours int not null default 48 check (payment_window_hours between 1 and 336);

grant insert (price_hkd, member_price_hkd, payment_window_hours),
  update (price_hkd, member_price_hkd, payment_window_hours) on public.events to authenticated;

alter table public.registrations
  add column payment_method text check (payment_method in ('fps', 'payme', 'cash'));

alter table public.orders
  add column event_id uuid references public.events on delete set null,
  add column registration_id uuid references public.registrations on delete set null,
  add column receipt_path text,
  add column receipt_at timestamptz;

create index orders_registration_idx on public.orders (registration_id);
create index orders_event_idx on public.orders (event_id, status);

alter table public.memberships
  add column receipt_path text,
  add column receipt_at timestamptz;

-- Short reference for the bank transfer: society initials + 4 digits, e.g. CSM-4821 (as place_order).
create or replace function public._new_order_ref(p_society_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_ref text;
begin
  select upper(left(coalesce(nullif(regexp_replace(coalesce(short_name, name), '[^A-Za-z]', '', 'g'), ''), 'CS'), 3))
    into v_prefix from public.societies where id = p_society_id;
  loop
    v_ref := v_prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.orders where ref = v_ref);
  end loop;
  return v_ref;
end;
$$;

-- What this person pays for this event: null when it is free for them.
create or replace function public._ticket_price(p_event public.events, p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(case
    when p_event.member_price_hkd is not null and public.is_current_member(p_event.society_id, p_user)
      then p_event.member_price_hkd
    else coalesce(p_event.price_hkd, 0)
  end, 0);
$$;

-- Cancels a sign-up, frees its place and moves the waitlist up. Locks the event.
create or replace function public._drop_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if v_reg.id is null or v_reg.status = 'cancelled' then
    return;
  end if;
  perform 1 from public.events where id = v_reg.event_id for update;
  update public.registrations set status = 'cancelled', updated_at = now() where id = v_reg.id;
  if v_reg.status = 'confirmed' then
    update public.events set confirmed_count = greatest(confirmed_count - 1, 0) where id = v_reg.event_id;
    perform public._fill_from_waitlist(v_reg.event_id);
  else
    update public.events set waitlist_count = greatest(waitlist_count - 1, 0) where id = v_reg.event_id;
  end if;
end;
$$;

-- A confirmed place on a paid event gets an order to pay; a cancelled one loses its unpaid order.
create or replace function public.sync_ticket_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_price numeric;
  v_member boolean;
  v_method text;
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    select * into v_event from public.events where id = new.event_id;
    v_price := public._ticket_price(v_event, new.user_id);
    if v_price is null then
      return null;
    end if;
    -- Paid before (cancelled, then signed up again without a refund): that payment still counts.
    if exists (select 1 from public.orders o where o.registration_id = new.id
        and (o.status in ('paid', 'payment_claimed') or (o.status = 'awaiting_payment' and public._order_holds_stock(o)))) then
      return null;
    end if;
    v_member := v_event.member_price_hkd is not null and public.is_current_member(v_event.society_id, new.user_id);
    v_method := coalesce(new.payment_method, 'fps');
    insert into public.orders (society_id, event_id, registration_id, user_id, ref, product_title, items, total_hkd,
      member_price, status, payment_method, expires_at)
    values (v_event.society_id, v_event.id, new.id, new.user_id, public._new_order_ref(v_event.society_id), v_event.title,
      jsonb_build_array(jsonb_build_object('variant', '', 'qty', 1, 'unit_price', v_price)), v_price,
      v_member,
      'awaiting_payment', v_method,
      case when v_method <> 'cash' then least(now() + make_interval(hours => v_event.payment_window_hours), v_event.starts_at) end);
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.orders set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where registration_id = new.id and status in ('awaiting_payment', 'payment_claimed');
  end if;
  return null;
end;
$$;

create trigger registrations_ticket_order
  after insert or update of status on public.registrations
  for each row execute function public.sync_ticket_order();

-- Cancelling or refunding a ticket order gives the place up.
create or replace function public.sync_ticket_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_id is not null and new.status in ('cancelled', 'refunded')
    and old.status not in ('cancelled', 'refunded') then
    perform public._drop_registration(new.registration_id);
  end if;
  return null;
end;
$$;

create trigger orders_ticket_registration
  after update of status on public.orders
  for each row execute function public.sync_ticket_registration();

-- Tickets are checked in at the event, not handed out at the merch desk.
create or replace function public.guard_ticket_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is not null and new.status in ('ready', 'collected') and old.status <> new.status then
    raise exception 'This is an event ticket. Check it in from the event instead.';
  end if;
  return new;
end;
$$;

create trigger orders_guard_ticket
  before update of status on public.orders
  for each row execute function public.guard_ticket_order();

-- Unpaid FPS / PayMe tickets whose window has passed: cancel them, which frees the place.
create or replace function public._release_unpaid_tickets(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  for v_o in
    select o.* from public.orders o
    where o.event_id = p_event_id and o.status = 'awaiting_payment' and o.expires_at < now()
    for update
  loop
    update public.orders set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_o.id returning * into v_o;
    perform public._notify_order(v_o);
  end loop;
end;
$$;

-- Run by the scheduled job, so places free up even when nobody new signs up.
create or replace function public.release_expired_tickets()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_count int := 0;
begin
  for v_event in
    select distinct event_id from public.orders
    where event_id is not null and status = 'awaiting_payment' and expires_at < now()
  loop
    perform public._release_unpaid_tickets(v_event);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Same as before, plus: frees expired unpaid places first, and paid events need a payment method.
drop function public.register_for_event(uuid, text);
create or replace function public.register_for_event(p_event_id uuid, p_answer text default null, p_payment_method text default null)
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
  v_method text := nullif(trim(p_payment_method), '');
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

  if public._ticket_price(v_event, v_uid) is not null then
    if coalesce(v_method, '') not in ('fps', 'payme', 'cash') then
      raise exception 'Choose how you will pay';
    end if;
  else
    v_method := null;
  end if;

  perform public._release_unpaid_tickets(p_event_id);
  select * into v_event from public.events where id = p_event_id;

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
      set status = v_status, answer = v_answer, payment_method = v_method, checked_in_at = null,
        created_at = now(), updated_at = now()
      where id = v_reg.id
      returning * into v_reg;
  else
    insert into public.registrations (event_id, user_id, status, answer, payment_method)
      values (p_event_id, v_uid, v_status, v_answer, v_method)
      returning * into v_reg;
  end if;

  update public.events
    set confirmed_count = confirmed_count + (v_status = 'confirmed')::int,
        waitlist_count = waitlist_count + (v_status = 'waitlisted')::int
    where id = p_event_id;

  return v_reg;
end;
$$;

-- Check-in: as before, but an unpaid ticket doesn't get in.
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
  v_matches int;
  v_ref text;
begin
  select society_id into v_society from public.events where id = p_event_id;
  if v_society is null or not public.is_society_member(v_society) then
    raise exception 'Only society committee members can check people in';
  end if;

  select * into v_reg from public.registrations where ticket_code = lower(trim(p_ticket_code));

  -- Door staff can also type the 8-character code printed under the QR.
  if v_reg.id is null and char_length(trim(p_ticket_code)) = 8 then
    select count(*) into v_matches from public.registrations
      where event_id = p_event_id and ticket_code like lower(trim(p_ticket_code)) || '%';
    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'message', 'Several tickets match that code, please scan the QR instead');
    end if;
    select * into v_reg from public.registrations
      where event_id = p_event_id and ticket_code like lower(trim(p_ticket_code)) || '%';
  end if;

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
  select ref into v_ref from public.orders
    where registration_id = v_reg.id and status in ('awaiting_payment', 'payment_claimed') limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', false, 'name', v_name, 'ref', v_ref, 'message', 'Not paid yet');
  end if;
  if v_reg.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'Already checked in at ' || to_char(v_reg.checked_in_at at time zone 'Asia/Hong_Kong', 'HH24:MI'));
  end if;

  update public.registrations set checked_in_at = now(), updated_at = now() where id = v_reg.id;
  return jsonb_build_object('ok', true, 'name', v_name, 'message', 'Checked in');
end;
$$;

-- The attendee list's manual check-in goes through this too.
create or replace function public.guard_unpaid_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.checked_in_at is not null and old.checked_in_at is null and exists (
    select 1 from public.orders where registration_id = new.id and status in ('awaiting_payment', 'payment_claimed')
  ) then
    raise exception 'Not paid yet';
  end if;
  return new;
end;
$$;

create trigger registrations_guard_unpaid
  before update of checked_in_at on public.registrations
  for each row execute function public.guard_unpaid_check_in();

-- ---------------------------------------------------------------------------
-- Payment screenshots. Path: {society_id}/{order|membership}/{record_id}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 307200, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 307200, allowed_mime_types = array['image/jpeg'];

-- Who the record behind a receipt path belongs to. Null when the path is malformed or unknown.
create or replace function public._receipt_record(p_name text)
returns table (society_id uuid, user_id uuid, open_for_upload boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_id uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3
    or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then
    return;
  end if;
  v_id := left(v_parts[3], 36)::uuid;
  if v_parts[2] = 'order' then
    return query select o.society_id, o.user_id, o.status in ('awaiting_payment', 'payment_claimed')
      from public.orders o where o.id = v_id and o.society_id::text = v_parts[1];
  elsif v_parts[2] = 'membership' then
    return query select m.society_id, m.user_id, m.status = 'pending'
      from public.memberships m where m.id = v_id and m.society_id::text = v_parts[1];
  end if;
end;
$$;

create or replace function public.can_write_receipt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public._receipt_record(p_name) r where r.user_id = auth.uid() and r.open_for_upload);
$$;

-- The payer, and the society's owners and admins (who confirm payments).
create or replace function public.can_read_receipt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public._receipt_record(p_name) r
    where r.user_id = auth.uid() or public.is_society_admin(r.society_id)
  );
$$;

create policy "upload own receipt" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write_receipt(name));
create policy "replace own receipt" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.can_write_receipt(name))
  with check (bucket_id = 'receipts' and public.can_write_receipt(name));
create policy "payer and treasurer read receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.can_read_receipt(name));

-- After uploading: link the screenshot and tell the treasurer to check (same as "I've paid").
create or replace function public.attach_receipt(p_kind text, p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_m public.memberships;
  v_path text;
begin
  if p_kind = 'order' then
    select * into v_o from public.orders where id = p_id and user_id = auth.uid() for update;
    if v_o.id is null then
      raise exception 'Order not found';
    end if;
    if v_o.status not in ('awaiting_payment', 'payment_claimed') then
      raise exception 'This order is not waiting for payment';
    end if;
    if not public._order_holds_stock(v_o) then
      raise exception 'This order expired. Please order again.';
    end if;
    v_path := v_o.society_id || '/order/' || v_o.id || '.jpg';
  elsif p_kind = 'membership' then
    select * into v_m from public.memberships where id = p_id and user_id = auth.uid() and status = 'pending' for update;
    if v_m.id is null then
      raise exception 'Membership not found';
    end if;
    v_path := v_m.society_id || '/membership/' || v_m.id || '.jpg';
  else
    raise exception 'Unknown status';
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = v_path) then
    raise exception 'Upload the screenshot first';
  end if;

  if p_kind = 'order' then
    update public.orders set receipt_path = v_path, receipt_at = now(), status = 'payment_claimed',
        claimed_at = coalesce(claimed_at, now()), updated_at = now()
      where id = p_id;
  else
    update public.memberships set receipt_path = v_path, receipt_at = now(),
        claimed_paid_at = coalesce(claimed_paid_at, now()), updated_at = now()
      where id = p_id;
  end if;
  return v_path;
end;
$$;

-- Retention, for the scheduled purge-receipts job: a screenshot is only needed
-- until the payment is settled. Kept 30 days after confirming (for disputes),
-- 7 days after a cancellation or rejection, and never more than 90 days.
-- Uploads never linked to a record (the app closed mid-upload) go after a day.
create or replace function public.receipts_to_purge(p_limit int default 500)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(path), '{}') from (
    select receipt_path as path from public.orders
    where receipt_path is not null and (
      receipt_at < now() - interval '90 days'
      or (status in ('paid', 'ready', 'collected') and paid_at < now() - interval '30 days')
      or (status in ('cancelled', 'refunded') and cancelled_at < now() - interval '7 days'))
    union all
    select receipt_path from public.memberships
    where receipt_path is not null and (
      receipt_at < now() - interval '90 days'
      or (status = 'active' and paid_at < now() - interval '30 days')
      or (status in ('rejected', 'cancelled') and updated_at < now() - interval '7 days'))
    union all
    select so.name from storage.objects so
    where so.bucket_id = 'receipts' and so.created_at < now() - interval '1 day'
      and not exists (select 1 from public.orders o where o.receipt_path = so.name)
      and not exists (select 1 from public.memberships m where m.receipt_path = so.name)
    limit p_limit
  ) x;
$$;

-- After the files are deleted. receipt_at stays, so people can see one was sent.
create or replace function public.forget_receipts(p_paths text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set receipt_path = null where receipt_path = any(p_paths);
  update public.memberships set receipt_path = null where receipt_path = any(p_paths);
$$;

revoke execute on function public._drop_registration(uuid) from public, anon, authenticated;
revoke execute on function public._release_unpaid_tickets(uuid) from public, anon, authenticated;
revoke execute on function public._new_order_ref(uuid) from public, anon, authenticated;
revoke execute on function public._receipt_record(text) from public, anon, authenticated;
revoke execute on function public._ticket_price(public.events, uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_tickets() from public, anon, authenticated;
revoke execute on function public.receipts_to_purge(int) from public, anon, authenticated;
revoke execute on function public.forget_receipts(text[]) from public, anon, authenticated;
grant execute on function public.release_expired_tickets() to service_role;
grant execute on function public.receipts_to_purge(int) to service_role;
grant execute on function public.forget_receipts(text[]) to service_role;
