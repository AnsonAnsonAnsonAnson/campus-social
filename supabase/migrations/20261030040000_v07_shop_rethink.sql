-- v0.7: the shop, rethought around how society merch actually sells.
--
-- What went wrong in v0.4 and what this changes:
--   * One order per product, so a hoodie and a tote were two transfers, two
--     references and two QR codes. Buyers now fill a bag per society and pay
--     once: one order, one reference, one pickup QR, any number of products.
--   * "Pickup: Tue and Thu 1-2pm" was free text, so the whole year turned up
--     at once and the desk could not pre-pack. Committees now publish pickup
--     times (with an optional cap), buyers book one, and the desk gets a pick
--     list for each time. Moving or cancelling a time tells everyone booked.
--   * Buyers guessed sizes. Products carry a size guide and several photos.
--   * XXL costs more to make. Each size can add an extra charge.
--   * Pre-orders had no story. A product can show a goal ("40 of 60 ordered")
--     and an expected ready date.
--   * Limited drops were bought out by one person ordering twice. A per-buyer
--     limit now counts across all their live orders.
--   * Sold out was a dead end. Buyers can ask to be told when more stock is
--     added or the item goes on sale.
--   * "Cash at pickup" orders could not be collected until an admin marked them
--     paid. The pickup desk can now take the cash and hand over in one step.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

-- Each size: {"name": "XXL", "stock": 10, "extra_hkd": 20}. stock null = no limit.
create or replace function public._valid_variants(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 12 and not exists (
    select 1 from jsonb_array_elements(p) v
    where jsonb_typeof(v -> 'name') is distinct from 'string'
      or char_length(v ->> 'name') > 20
      or (v ->> 'stock' is not null and (jsonb_typeof(v -> 'stock') <> 'number' or (v ->> 'stock')::numeric < 0))
      or (v ->> 'extra_hkd' is not null and (jsonb_typeof(v -> 'extra_hkd') <> 'number'
          or (v ->> 'extra_hkd')::numeric not between 0 and 1000))
  );
$$;

alter table public.products
  add constraint products_variants_valid check (public._valid_variants(variants)),
  -- Extra photos after image_url (the cover).
  add column images text[] not null default '{}' check (cardinality(images) <= 6),
  -- A small table, one row per line, cells separated by commas: "Size, Chest, Length".
  add column size_chart text check (char_length(size_chart) <= 1500),
  -- Pre-orders: how many the society needs to go ahead, and when it should arrive.
  add column goal_qty int check (goal_qty between 1 and 10000),
  add column ready_on date,
  -- Across all of one buyer's live orders, not just one.
  add column max_per_buyer int check (max_per_buyer between 1 and 50);

grant insert (images, size_chart, goal_qty, ready_on, max_per_buyer),
  update (images, size_chart, goal_qty, ready_on, max_per_buyer) on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- Pickup times
-- ---------------------------------------------------------------------------
create table public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (char_length(location) between 2 and 120),
  -- Orders that can book this time; null = no cap.
  capacity int check (capacity between 1 and 2000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index pickup_slots_society_idx on public.pickup_slots (society_id, starts_at);

alter table public.pickup_slots enable row level security;
create policy "read pickup times of open shops" on public.pickup_slots
  for select using (
    exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved')
    or public.is_society_member(society_id)
  );
create policy "committee writes pickup times" on public.pickup_slots
  for all to authenticated
  using (public.is_society_member(society_id))
  with check (public.is_society_member(society_id));

revoke insert, update, delete on public.pickup_slots from anon, authenticated;
grant insert (society_id, starts_at, ends_at, location, capacity), update (starts_at, ends_at, location, capacity), delete
  on public.pickup_slots to authenticated;

alter table public.orders add column pickup_slot_id uuid references public.pickup_slots on delete set null;
create index orders_slot_idx on public.orders (pickup_slot_id);

-- Orders still coming to collect at a time.
create or replace function public._slot_booked(p_slot_id uuid, p_except uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.orders o
  where o.pickup_slot_id = p_slot_id and public._order_holds_stock(o) and o.id is distinct from p_except;
$$;

revoke execute on function public._slot_booked(uuid, uuid) from public, anon, authenticated;

-- A society's pickup times with how many orders booked each (past ones only for the committee).
create or replace function public.list_pickup_slots(p_society_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('booked', public._slot_booked(s.id)) order by s.starts_at), '[]')
  from public.pickup_slots s
  where s.society_id = p_society_id
    and (exists (select 1 from public.societies x where x.id = p_society_id and x.status = 'approved')
         or public.is_society_member(p_society_id))
    and (s.ends_at > now() - interval '1 day' or public.is_society_member(p_society_id));
$$;

-- "Thu 13 Nov 13:00, Room 1009" in Hong Kong time.
create or replace function public._slot_label(s public.pickup_slots)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(s.starts_at at time zone 'Asia/Hong_Kong', 'Dy DD Mon HH24:MI') || ', ' || s.location;
$$;

-- Moving or cancelling a pickup time tells everyone booked on it.
create or replace function public.notify_slot_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.ends_at = old.ends_at and new.location = old.location then
    return new;
  end if;
  insert into public.notifications (user_id, kind, title, body, society_id)
  select distinct o.user_id, 'order_update',
    case when tg_op = 'DELETE'
      then public.localized(p.locale, 'Pickup time cancelled', '取貨時段已取消')
      else public.localized(p.locale, 'Pickup time changed', '取貨時段已更改') end,
    case when tg_op = 'DELETE'
      then public.localized(p.locale, 'Choose a new time to collect ' || o.ref || '.', '請為訂單 ' || o.ref || ' 選擇新的取貨時段。')
      else public.localized(p.locale, 'Now ' || public._slot_label(new) || ' for ' || o.ref || '.',
        '訂單 ' || o.ref || ' 改為 ' || public._slot_label(new) || '。') end,
    o.society_id
  from public.orders o
  join public.profiles p on p.id = o.user_id
  where o.pickup_slot_id = old.id and o.status in ('awaiting_payment', 'payment_claimed', 'paid', 'ready')
    and public._order_holds_stock(o);
  return coalesce(new, old);
end;
$$;

-- Before, so the orders still point at the time (the foreign key clears them after).
create trigger pickup_slots_notify before update or delete on public.pickup_slots
  for each row execute function public.notify_slot_change();

-- ---------------------------------------------------------------------------
-- Stock counts read the product on each line (orders can hold several products).
-- Older orders have no product_id on their lines and fall back to the order's.
-- ---------------------------------------------------------------------------
create or replace function public.product_sold(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(variant, qty), '{}')
  from (
    select i ->> 'variant' as variant, sum((i ->> 'qty')::int) as qty
    from public.orders o, jsonb_array_elements(o.items) i
    where coalesce((i ->> 'product_id')::uuid, o.product_id) = p_product_id and public._order_holds_stock(o)
    group by 1
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- "Tell me when it's back"
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'waitlist_promoted', 'event_cancelled', 'event_updated', 'new_event', 'society_approved', 'committee_added',
  'membership_active', 'membership_renewal', 'order_update', 'payment_settings_changed', 'product_available'
));

create table public.product_alerts (
  product_id uuid not null references public.products on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);

alter table public.product_alerts enable row level security;
create policy "own alerts" on public.product_alerts for select using (user_id = auth.uid());
create policy "ask for an alert" on public.product_alerts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.products p where p.id = product_id and p.status <> 'draft'));
create policy "drop an alert" on public.product_alerts for delete using (user_id = auth.uid());
revoke update on public.product_alerts from anon, authenticated;

-- On sale again (published, or more stock added): tell everyone waiting, once.
create or replace function public.notify_product_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_more boolean;
begin
  if new.status <> 'published' then
    return new;
  end if;
  select exists (
    select 1 from jsonb_array_elements(new.variants) nv
    left join jsonb_array_elements(old.variants) ov on ov ->> 'name' = nv ->> 'name'
    where ov is null
      or (nv ->> 'stock' is null and ov ->> 'stock' is not null)
      or (nv ->> 'stock')::int > (ov ->> 'stock')::int
  ) into v_more;
  if old.status = 'published' and not v_more then
    return new;
  end if;
  insert into public.notifications (user_id, kind, title, body, society_id)
  select a.user_id, 'product_available',
    public.localized(p.locale, 'Back on sale', '已重新開售'),
    public.localized(p.locale, new.title || ' is available again. Get it before it goes.', '「' || new.title || '」已重新開售，售完即止。'),
    new.society_id
  from public.product_alerts a
  join public.profiles p on p.id = a.user_id
  where a.product_id = new.id;
  delete from public.product_alerts where product_id = new.id;
  return new;
end;
$$;

create trigger products_notify_alerts after update of status, variants on public.products
  for each row execute function public.notify_product_alerts();

-- Products, now with whether you asked to be told about each.
create or replace function public.list_products(p_society_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    to_jsonb(p) || jsonb_build_object(
      'sold', public.product_sold(p.id),
      'alert', exists (select 1 from public.product_alerts a where a.product_id = p.id and a.user_id = auth.uid()),
      'society', jsonb_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name, 'logo_url', s.logo_url,
        'verified', s.verified, 'category', s.category)
    ) order by p.created_at desc), '[]')
  from public.products p
  join public.societies s on s.id = p.society_id
  where (p_society_id is null and p.status = 'published' and s.status = 'approved'
         and (p.closes_at is null or p.closes_at > now()))
     or p.society_id = p_society_id;
$$;

-- ---------------------------------------------------------------------------
-- Checkout: a whole bag from one society in one order.
-- p_lines: [{"product_id": "...", "variant": "M", "qty": 2}]
-- ---------------------------------------------------------------------------
create or replace function public.place_cart_order(
  p_society_id uuid, p_lines jsonb, p_payment_method text, p_slot_id uuid default null, p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_line jsonb;
  v_p public.products;
  v_variant jsonb;
  v_name text;
  v_qty int;
  v_taken int;
  v_per int;
  v_mine int;
  v_sold jsonb := '{}';
  v_per_product jsonb := '{}';
  v_is_member boolean;
  v_member boolean;
  v_member_any boolean := false;
  v_unit numeric;
  v_total numeric := 0;
  v_lines jsonb := '[]';
  v_titles text[] := '{}';
  v_window int;
  v_slot public.pickup_slots;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Sign in to order';
  end if;
  if coalesce(p_payment_method, '') not in ('fps', 'payme', 'cash') then
    raise exception 'Choose how you will pay';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one item';
  end if;
  if jsonb_array_length(p_lines) > 30 then
    raise exception 'That is more than the limit per order';
  end if;
  if not exists (select 1 from public.societies s where s.id = p_society_id and s.status = 'approved') then
    raise exception 'This item is not on sale';
  end if;

  -- Lock every product in the bag, always in the same order, so two buyers can
  -- neither oversell the last units nor deadlock each other.
  perform 1 from public.products
    where id in (select (l ->> 'product_id')::uuid from jsonb_array_elements(p_lines) l)
    order by id for update;

  v_is_member := public._is_member_now(p_society_id, v_uid);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line ->> 'qty')::int, 0);
    continue when v_qty <= 0;
    select * into v_p from public.products where id = (v_line ->> 'product_id')::uuid;
    if v_p.id is null or v_p.society_id <> p_society_id or v_p.status <> 'published' then
      raise exception 'This item is not on sale';
    end if;
    if v_p.opens_at is not null and now() < v_p.opens_at then
      raise exception 'Orders have not opened yet';
    end if;
    if v_p.closes_at is not null and now() > v_p.closes_at then
      raise exception 'Orders have closed';
    end if;
    select v into v_variant from jsonb_array_elements(v_p.variants) v where v ->> 'name' = coalesce(v_line ->> 'variant', '');
    if v_variant is null then
      raise exception 'Choose a size';
    end if;
    v_name := v_variant ->> 'name';

    -- Stock: what live orders hold, plus earlier lines of this bag.
    if not v_sold ? v_p.id::text then
      v_sold := v_sold || jsonb_build_object(v_p.id::text, public.product_sold(v_p.id));
    end if;
    v_taken := coalesce((v_sold -> v_p.id::text ->> v_name)::int, 0);
    if v_variant ->> 'stock' is not null and v_taken + v_qty > (v_variant ->> 'stock')::int then
      raise exception 'Not enough stock left';
    end if;
    v_sold := jsonb_set(v_sold, array[v_p.id::text, v_name], to_jsonb(v_taken + v_qty));

    v_per := coalesce((v_per_product ->> v_p.id::text)::int, 0) + v_qty;
    v_per_product := v_per_product || jsonb_build_object(v_p.id::text, v_per);
    if v_per > v_p.max_per_order then
      raise exception 'That is more than the limit per order';
    end if;
    if v_p.max_per_buyer is not null then
      select coalesce(sum((i ->> 'qty')::int), 0) into v_mine
      from public.orders o, jsonb_array_elements(o.items) i
      where o.user_id = v_uid and public._order_holds_stock(o)
        and coalesce((i ->> 'product_id')::uuid, o.product_id) = v_p.id;
      if v_mine + v_per > v_p.max_per_buyer then
        raise exception 'You have reached the limit for this item';
      end if;
    end if;

    v_member := v_p.member_price_hkd is not null and v_is_member;
    v_member_any := v_member_any or v_member;
    v_unit := case when v_member then v_p.member_price_hkd else v_p.price_hkd end + coalesce((v_variant ->> 'extra_hkd')::numeric, 0);
    v_total := v_total + v_qty * v_unit;
    v_lines := v_lines || jsonb_build_object('product_id', v_p.id, 'title', v_p.title, 'variant', v_name, 'qty', v_qty, 'unit_price', v_unit);
    if not v_p.title = any(v_titles) then
      v_titles := v_titles || v_p.title;
    end if;
    -- The bag gives the buyer the shortest window of anything in it.
    v_window := least(coalesce(v_window, v_p.payment_window_hours), v_p.payment_window_hours);
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Choose at least one item';
  end if;

  if p_slot_id is not null then
    select * into v_slot from public.pickup_slots where id = p_slot_id and society_id = p_society_id for update;
    if v_slot.id is null then
      raise exception 'Choose another pickup time';
    end if;
    if v_slot.ends_at < now() then
      raise exception 'That pickup time has passed';
    end if;
    if v_slot.capacity is not null and public._slot_booked(v_slot.id) >= v_slot.capacity then
      raise exception 'That pickup time is full';
    end if;
  end if;

  insert into public.orders (society_id, product_id, user_id, ref, product_title, items, total_hkd, member_price,
    status, payment_method, buyer_note, expires_at, paid_at, pickup_slot_id)
  values (p_society_id,
    case when (select count(*) from jsonb_object_keys(v_per_product)) = 1 then v_p.id end,
    v_uid, public._new_order_ref(p_society_id), array_to_string(v_titles, ', '), v_lines, v_total, v_member_any,
    case when v_total = 0 then 'paid' else 'awaiting_payment' end, p_payment_method, nullif(trim(p_note), ''),
    case when v_total > 0 and p_payment_method <> 'cash' then now() + make_interval(hours => v_window) end,
    case when v_total = 0 then now() end,
    p_slot_id)
  returning * into v_order;
  return v_order;
end;
$$;

-- The one-product order older app versions still call.
create or replace function public.place_order(
  p_product_id uuid, p_items jsonb, p_payment_method text, p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society uuid;
begin
  select society_id into v_society from public.products where id = p_product_id;
  if v_society is null then
    raise exception 'This item is not on sale';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Choose at least one item';
  end if;
  return public.place_cart_order(v_society,
    (select coalesce(jsonb_agg(i || jsonb_build_object('product_id', p_product_id)), '[]') from jsonb_array_elements(p_items) i),
    p_payment_method, null, p_note);
end;
$$;

-- Buyer: book or change the time they'll collect.
create or replace function public.choose_pickup_slot(p_order_id uuid, p_slot_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_slot public.pickup_slots;
begin
  select * into v_o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if v_o.id is null then
    raise exception 'Order not found';
  end if;
  if v_o.event_id is not null or v_o.status not in ('awaiting_payment', 'payment_claimed', 'paid', 'ready')
    or not public._order_holds_stock(v_o) then
    raise exception 'This order can no longer change its pickup time';
  end if;
  select * into v_slot from public.pickup_slots where id = p_slot_id and society_id = v_o.society_id for update;
  if v_slot.id is null then
    raise exception 'Choose another pickup time';
  end if;
  if v_slot.ends_at < now() then
    raise exception 'That pickup time has passed';
  end if;
  if v_slot.capacity is not null and public._slot_booked(v_slot.id, v_o.id) >= v_slot.capacity then
    raise exception 'That pickup time is full';
  end if;
  update public.orders set pickup_slot_id = v_slot.id, updated_at = now() where id = v_o.id returning * into v_o;
  return v_o;
end;
$$;

-- "Ready for pickup" now says when and where, if the buyer booked a time.
create or replace function public._notify_order(o public.orders)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot text;
begin
  if o.user_id is null then
    return;
  end if;
  select public._slot_label(s) into v_slot from public.pickup_slots s where s.id = o.pickup_slot_id;
  insert into public.notifications (user_id, kind, title, body, society_id)
  select o.user_id, 'order_update',
    case o.status
      when 'paid' then public.localized(p.locale, 'Payment received', '已收到付款')
      when 'ready' then public.localized(p.locale, 'Ready for pickup', '可以取貨')
      when 'awaiting_payment' then public.localized(p.locale, 'Payment not found yet', '暫未找到你的付款')
      when 'cancelled' then public.localized(p.locale, 'Order cancelled', '訂單已取消')
      else public.localized(p.locale, 'Order updated', '訂單已更新')
    end,
    case o.status
      when 'paid' then public.localized(p.locale, o.product_title || ' (' || o.ref || ') is paid.',
        '「' || o.product_title || '」（' || o.ref || '）已付款。')
      when 'ready' then case when v_slot is not null
        then public.localized(p.locale, 'Collect ' || o.product_title || ' at ' || v_slot || '. Show the pickup QR in Tickets.',
          '請於 ' || v_slot || ' 領取「' || o.product_title || '」，並在「門票」出示取貨二維碼。')
        else public.localized(p.locale, 'Show the pickup QR in Tickets to collect ' || o.product_title || '.',
          '在「門票」出示取貨二維碼，領取「' || o.product_title || '」。') end
      when 'awaiting_payment' then public.localized(p.locale, 'The society could not find a payment for ' || o.ref || '. Check the reference and amount.',
        '學會未找到訂單 ' || o.ref || ' 的付款，請檢查參考編號及金額。')
      else public.localized(p.locale, o.product_title || ' (' || o.ref || ')', '「' || o.product_title || '」（' || o.ref || '）')
    end,
    o.society_id
  from public.profiles p where p.id = o.user_id;
end;
$$;

revoke execute on function public._notify_order(public.orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pickup desk. Lists every line with its product, says which time the buyer
-- booked, and takes cash: an unpaid cash order can be paid and handed over in
-- one step by whoever is at the desk (they are holding the money).
-- ---------------------------------------------------------------------------
drop function if exists public.collect_order(uuid, text);
create or replace function public.collect_order(p_society_id uuid, p_code text, p_cash_received boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_name text;
  v_summary text;
  v_slot text;
  v_products int;
  v_base jsonb;
begin
  if not public.is_society_member(p_society_id) then
    raise exception 'Only society committee members can hand out orders';
  end if;
  -- The QR holds the pickup code; at the counter the committee can also type the order ref.
  select * into v_o from public.orders
    where pickup_code = lower(trim(p_code)) or (society_id = p_society_id and ref = upper(trim(p_code)))
    limit 1 for update;
  if v_o.id is null then
    return jsonb_build_object('ok', false, 'message', 'Order not found');
  end if;
  select coalesce(nullif(display_name, ''), email) into v_name from public.profiles where id = v_o.user_id;
  if v_o.society_id <> p_society_id then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'This order is for a different society');
  end if;
  select count(distinct coalesce(i ->> 'title', v_o.product_title)) into v_products from jsonb_array_elements(v_o.items) i;
  select string_agg(case when v_products > 1 then (i ->> 'title') || ' ' else '' end
      || case when i ->> 'variant' = '' then '' else (i ->> 'variant') || ' ' end || '×' || (i ->> 'qty'), ', ')
    into v_summary from jsonb_array_elements(v_o.items) i;
  if v_products = 1 then
    v_summary := v_o.product_title || ' · ' || v_summary;
  end if;
  select public._slot_label(s) into v_slot from public.pickup_slots s where s.id = v_o.pickup_slot_id;
  v_base := jsonb_build_object('name', v_name, 'ref', v_o.ref, 'items', v_summary, 'slot', v_slot,
    'total_hkd', v_o.total_hkd, 'payment_method', v_o.payment_method);
  if v_o.event_id is not null then
    return v_base || jsonb_build_object('ok', false, 'message', 'This is an event ticket. Check it in from the event instead.');
  end if;
  if v_o.status = 'collected' then
    return v_base || jsonb_build_object('ok', false, 'message', 'Already collected', 'collected_at', v_o.collected_at);
  end if;
  if v_o.status = 'awaiting_payment' and v_o.payment_method = 'cash' and p_cash_received then
    update public.orders set status = 'collected', paid_at = now(), collected_at = now(), updated_at = now() where id = v_o.id;
    return v_base || jsonb_build_object('ok', true, 'message', 'Cash taken and collected');
  end if;
  if v_o.status not in ('paid', 'ready') then
    return v_base || jsonb_build_object('ok', false, 'message', case
      when v_o.status = 'awaiting_payment' and v_o.payment_method = 'cash' then 'Take cash'
      when v_o.status in ('cancelled', 'refunded') then 'This order was cancelled'
      else 'Not paid yet' end);
  end if;
  update public.orders set status = 'collected', collected_at = now(), updated_at = now() where id = v_o.id;
  return v_base || jsonb_build_object('ok', true, 'message', 'Collected');
end;
$$;
