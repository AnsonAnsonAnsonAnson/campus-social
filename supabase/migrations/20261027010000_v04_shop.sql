-- v0.4 part 2: society shop (merch pre-orders). The app never holds money:
-- buyers pay the society directly by FPS or PayMe (the app shows an FPS QR with
-- the amount and order reference filled in), tap "I've paid", and the treasurer
-- ticks the order as paid after checking the bank's incoming list.

-- ---------------------------------------------------------------------------
-- Where buyers pay. Shown on every payment screen with the payee name, so a
-- buyer can spot a swapped account; every change is announced to the admins.
-- ---------------------------------------------------------------------------
create table public.society_payment_settings (
  society_id uuid primary key references public.societies on delete cascade,
  -- FPS proxy: a Hong Kong mobile number, an email, or a 7-9 digit FPS ID.
  fps_id text check (char_length(fps_id) <= 60),
  payee_name text check (char_length(payee_name) <= 60),
  payme_link text check (payme_link ~ '^https://'),
  instructions text check (char_length(instructions) <= 300),
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.society_payment_settings enable row level security;
create policy "buyers and committee read payment details" on public.society_payment_settings
  for select using (
    exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved')
    or public.is_society_member(society_id)
  );
revoke insert, update, delete on public.society_payment_settings from anon, authenticated;

create or replace function public.set_payment_settings(
  p_society_id uuid, p_fps_id text, p_payee_name text, p_payme_link text, p_instructions text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_society text;
begin
  if not public.is_society_admin(p_society_id) then
    raise exception 'Only society admins can change payment details';
  end if;
  insert into public.society_payment_settings (society_id, fps_id, payee_name, payme_link, instructions, updated_by, updated_at)
  values (p_society_id, nullif(trim(p_fps_id), ''), nullif(trim(p_payee_name), ''), nullif(trim(p_payme_link), ''),
    nullif(trim(p_instructions), ''), auth.uid(), now())
  on conflict (society_id) do update set
    fps_id = excluded.fps_id, payee_name = excluded.payee_name, payme_link = excluded.payme_link,
    instructions = excluded.instructions, updated_by = excluded.updated_by, updated_at = now();

  select coalesce(short_name, name) into v_society from public.societies where id = p_society_id;
  insert into public.notifications (user_id, kind, title, body, society_id)
  select m.user_id, 'payment_settings_changed',
    public.localized(p.locale, 'Payment details changed', '收款資料已更改'),
    public.localized(p.locale, 'Someone changed where ' || v_society || ' collects payments. Check it was meant to happen.',
      '有人更改了' || v_society || '的收款資料，請確認這是預期的更改。'),
    p_society_id
  from public.society_members m
  join public.profiles p on p.id = m.user_id
  where m.society_id = p_society_id and m.role in ('owner', 'admin') and m.user_id <> auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  image_url text,
  price_hkd numeric(8, 2) not null check (price_hkd >= 0 and price_hkd <= 10000),
  member_price_hkd numeric(8, 2) check (member_price_hkd >= 0 and member_price_hkd <= 10000),
  -- [{"name": "M", "stock": 20}]; stock null = pre-order with no limit; one variant named "" = one size.
  variants jsonb not null default '[{"name": "", "stock": null}]'
    check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 1 and 12),
  opens_at timestamptz,
  closes_at timestamptz,
  pickup_note text check (char_length(pickup_note) <= 300),
  max_per_order int not null default 5 check (max_per_order between 1 and 50),
  -- Unpaid FPS / PayMe orders stop holding stock after this many hours.
  payment_window_hours int not null default 48 check (payment_window_hours between 1 and 336),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_society_idx on public.products (society_id, status);

alter table public.products enable row level security;
create policy "read published products or your own" on public.products
  for select using (
    (status <> 'draft' and exists (select 1 from public.societies s where s.id = society_id and s.status = 'approved'))
    or public.is_society_member(society_id)
  );
create policy "committee writes products" on public.products
  for all to authenticated
  using (public.is_society_member(society_id))
  with check (public.is_society_member(society_id));

revoke insert, update, delete on public.products from anon, authenticated;
grant insert (society_id, title, description, image_url, price_hkd, member_price_hkd, variants, opens_at, closes_at,
  pickup_note, max_per_order, payment_window_hours, status),
  update (title, description, image_url, price_hkd, member_price_hkd, variants, opens_at, closes_at, pickup_note,
  max_per_order, payment_window_hours, status, updated_at), delete
  on public.products to authenticated;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Orders. One order is one product (any mix of its sizes). Prices are copied at
-- order time so later edits don't change old orders.
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies on delete cascade,
  product_id uuid references public.products on delete set null,
  -- Kept (without the buyer) after account deletion, for the treasurer's accounts.
  user_id uuid references auth.users on delete set null,
  ref text not null unique,
  product_title text not null,
  -- [{"variant": "M", "qty": 2, "unit_price": 120}]
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total_hkd numeric(10, 2) not null,
  member_price boolean not null default false,
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment', 'payment_claimed', 'paid', 'ready', 'collected', 'cancelled', 'refunded'
  )),
  payment_method text not null check (payment_method in ('fps', 'payme', 'cash')),
  buyer_note text check (char_length(buyer_note) <= 200),
  pickup_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- Unpaid FPS / PayMe orders stop holding stock at this time; cash orders don't expire.
  expires_at timestamptz,
  claimed_at timestamptz,
  paid_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_society_idx on public.orders (society_id, created_at desc);
create index orders_product_idx on public.orders (product_id, status);
create index orders_user_idx on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;
create policy "see own orders" on public.orders for select using (user_id = auth.uid());
revoke insert, update, delete on public.orders from anon, authenticated;

-- Does this order still hold stock?
create or replace function public._order_holds_stock(o public.orders)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select o.status not in ('cancelled', 'refunded')
    and not (o.status = 'awaiting_payment' and o.expires_at is not null and o.expires_at < now());
$$;

-- Units taken per variant: {"M": 3, "L": 1}
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
    where o.product_id = p_product_id and public._order_holds_stock(o)
    group by 1
  ) x;
$$;

-- Products for a society's shop (or every open shop when p_society_id is null), with units sold.
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
      'society', jsonb_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name, 'logo_url', s.logo_url,
        'verified', s.verified, 'category', s.category)
    ) order by p.created_at desc), '[]')
  from public.products p
  join public.societies s on s.id = p.society_id
  where (p_society_id is null and p.status = 'published' and s.status = 'approved'
         and (p.closes_at is null or p.closes_at > now()))
     or p.society_id = p_society_id;
$$;

create or replace function public.place_order(
  p_product_id uuid, p_items jsonb, p_payment_method text, p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.products;
  v_item jsonb;
  v_variant jsonb;
  v_sold jsonb;
  v_qty int;
  v_total_qty int := 0;
  v_member boolean;
  v_unit numeric;
  v_total numeric := 0;
  v_lines jsonb := '[]';
  v_prefix text;
  v_ref text;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Sign in to order';
  end if;
  -- One buyer at a time per product, so stock can't be oversold.
  select * into v_p from public.products where id = p_product_id for update;
  if v_p.id is null or v_p.status <> 'published'
    or not exists (select 1 from public.societies s where s.id = v_p.society_id and s.status = 'approved') then
    raise exception 'This item is not on sale';
  end if;
  if v_p.opens_at is not null and now() < v_p.opens_at then
    raise exception 'Orders have not opened yet';
  end if;
  if v_p.closes_at is not null and now() > v_p.closes_at then
    raise exception 'Orders have closed';
  end if;
  if coalesce(p_payment_method, '') not in ('fps', 'payme', 'cash') then
    raise exception 'Choose how you will pay';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item';
  end if;

  v_member := v_p.member_price_hkd is not null and public.is_current_member(v_p.society_id, v_uid);
  v_unit := case when v_member then v_p.member_price_hkd else v_p.price_hkd end;
  v_sold := public.product_sold(v_p.id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'qty')::int, 0);
    continue when v_qty <= 0;
    select v into v_variant from jsonb_array_elements(v_p.variants) v where v ->> 'name' = coalesce(v_item ->> 'variant', '');
    if v_variant is null then
      raise exception 'Choose a size';
    end if;
    if v_variant ->> 'stock' is not null
      and coalesce((v_sold ->> (v_variant ->> 'name'))::int, 0) + v_qty > (v_variant ->> 'stock')::int then
      raise exception 'Not enough stock left';
    end if;
    v_total_qty := v_total_qty + v_qty;
    v_total := v_total + v_qty * v_unit;
    v_lines := v_lines || jsonb_build_object('variant', v_variant ->> 'name', 'qty', v_qty, 'unit_price', v_unit);
  end loop;

  if v_total_qty = 0 then
    raise exception 'Choose at least one item';
  end if;
  if v_total_qty > v_p.max_per_order then
    raise exception 'That is more than the limit per order';
  end if;

  -- Short reference for the bank transfer: society initials + 4 digits, e.g. CSM-4821.
  select upper(left(coalesce(nullif(regexp_replace(coalesce(short_name, name), '[^A-Za-z]', '', 'g'), ''), 'CS'), 3))
    into v_prefix from public.societies where id = v_p.society_id;
  loop
    v_ref := v_prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.orders where ref = v_ref);
  end loop;

  insert into public.orders (society_id, product_id, user_id, ref, product_title, items, total_hkd, member_price,
    status, payment_method, buyer_note, expires_at, paid_at)
  values (v_p.society_id, v_p.id, v_uid, v_ref, v_p.title, v_lines, v_total, v_member,
    case when v_total = 0 then 'paid' else 'awaiting_payment' end, p_payment_method, nullif(trim(p_note), ''),
    case when v_total > 0 and p_payment_method <> 'cash' then now() + make_interval(hours => v_p.payment_window_hours) end,
    case when v_total = 0 then now() end)
  returning * into v_order;
  return v_order;
end;
$$;

-- Buyer: "I've paid".
create or replace function public.claim_order_paid(p_order_id uuid, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if v_o.id is null then
    raise exception 'Order not found';
  end if;
  if v_o.status <> 'awaiting_payment' then
    raise exception 'This order is not waiting for payment';
  end if;
  if not public._order_holds_stock(v_o) then
    raise exception 'This order expired. Please order again.';
  end if;
  update public.orders set status = 'payment_claimed', claimed_at = now(), updated_at = now(),
      buyer_note = coalesce(nullif(trim(p_note), ''), buyer_note)
    where id = p_order_id
    returning * into v_o;
  return v_o;
end;
$$;

-- Buyer: cancel before the committee has confirmed payment.
create or replace function public.cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = p_order_id and user_id = auth.uid() and status in ('awaiting_payment', 'payment_claimed');
  if not found then
    raise exception 'This order can no longer be cancelled here. Contact the society.';
  end if;
end;
$$;

-- Committee: every order for the society, with the buyer's name and email.
create or replace function public.list_orders(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_society_member(p_society_id) then
    raise exception 'Only committee members can see orders';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'buyer_name', coalesce(nullif(p.display_name, ''), p.email, ''),
      'buyer_email', coalesce(p.email, ''),
      'expired', not public._order_holds_stock(o) and o.status = 'awaiting_payment'
    ) order by o.created_at desc), '[]')
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    where o.society_id = p_society_id
  );
end;
$$;

create or replace function public._notify_order(o public.orders)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if o.user_id is null then
    return;
  end if;
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
      when 'ready' then public.localized(p.locale, 'Show the pickup QR in Tickets to collect ' || o.product_title || '.',
        '在「門票」出示取貨二維碼，領取「' || o.product_title || '」。')
      when 'awaiting_payment' then public.localized(p.locale, 'The society could not find a payment for ' || o.ref || '. Check the reference and amount.',
        '學會未找到訂單 ' || o.ref || ' 的付款，請檢查參考編號及金額。')
      else public.localized(p.locale, o.product_title || ' (' || o.ref || ')', '「' || o.product_title || '」（' || o.ref || '）')
    end,
    o.society_id
  from public.profiles p where p.id = o.user_id;
end;
$$;

revoke execute on function public._notify_order(public.orders) from public, anon, authenticated;

-- Committee: move orders along. Payments (paid, not received, cancel, refund) are for
-- owners and admins; any committee member can mark orders ready or collected.
create or replace function public.set_order_status(p_ids uuid[], p_status text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_count int := 0;
  v_hours int;
begin
  if p_status not in ('awaiting_payment', 'paid', 'ready', 'collected', 'cancelled', 'refunded') then
    raise exception 'Unknown status';
  end if;
  for v_o in select * from public.orders where id = any(p_ids) for update loop
    if not public.is_society_member(v_o.society_id)
      or (p_status in ('awaiting_payment', 'paid', 'cancelled', 'refunded') and not public.is_society_admin(v_o.society_id)) then
      raise exception 'Only society admins can confirm payments';
    end if;
    continue when v_o.status = p_status;
    if not (
      (p_status = 'paid' and v_o.status in ('awaiting_payment', 'payment_claimed'))
      or (p_status = 'awaiting_payment' and v_o.status = 'payment_claimed')
      or (p_status = 'ready' and v_o.status = 'paid')
      or (p_status = 'collected' and v_o.status in ('paid', 'ready'))
      or (p_status = 'cancelled' and v_o.status in ('awaiting_payment', 'payment_claimed', 'paid', 'ready'))
      or (p_status = 'refunded' and v_o.status in ('paid', 'ready', 'collected'))
    ) then
      raise exception 'That change is not possible for this order';
    end if;
    select payment_window_hours into v_hours from public.products where id = v_o.product_id;
    update public.orders set
      status = p_status,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      ready_at = case when p_status = 'ready' then now() else ready_at end,
      collected_at = case when p_status = 'collected' then now() else collected_at end,
      cancelled_at = case when p_status in ('cancelled', 'refunded') then now() else cancelled_at end,
      claimed_at = case when p_status = 'awaiting_payment' then null else claimed_at end,
      -- "Not received" gives the buyer a fresh window to pay.
      expires_at = case when p_status = 'awaiting_payment' and v_o.payment_method <> 'cash'
        then now() + make_interval(hours => coalesce(v_hours, 48)) else expires_at end,
      updated_at = now()
    where id = v_o.id
    returning * into v_o;
    if p_status in ('paid', 'ready', 'awaiting_payment', 'cancelled') then
      perform public._notify_order(v_o);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Pickup desk: scan the buyer's order QR.
create or replace function public.collect_order(p_society_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_name text;
  v_summary text;
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
  select string_agg(case when i ->> 'variant' = '' then '' else (i ->> 'variant') || ' ' end || '×' || (i ->> 'qty'), ', ')
    into v_summary from jsonb_array_elements(v_o.items) i;
  v_summary := v_o.product_title || ' · ' || v_summary;
  if v_o.society_id <> p_society_id then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'This order is for a different society');
  end if;
  if v_o.status = 'collected' then
    return jsonb_build_object('ok', false, 'name', v_name, 'ref', v_o.ref, 'items', v_summary,
      'message', 'Already collected', 'collected_at', v_o.collected_at);
  end if;
  if v_o.status not in ('paid', 'ready') then
    return jsonb_build_object('ok', false, 'name', v_name, 'ref', v_o.ref, 'items', v_summary, 'message', 'Not paid yet');
  end if;
  update public.orders set status = 'collected', collected_at = now(), updated_at = now() where id = v_o.id;
  return jsonb_build_object('ok', true, 'name', v_name, 'ref', v_o.ref, 'items', v_summary, 'message', 'Collected');
end;
$$;
