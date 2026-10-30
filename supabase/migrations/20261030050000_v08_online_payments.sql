-- v0.8: online payments for the shop (cards, Apple Pay, Google Pay, Alipay,
-- WeChat Pay) through Stripe Connect, with a platform fee.
--
-- Each society connects its own payout account (Stripe checks the treasurer's
-- ID). A buyer pays on Stripe's checkout page; Stripe sends the money to the
-- society minus the platform fee, so the app still never holds money. Only the
-- payment webhook can mark an online order paid or refunded: the edge
-- functions in supabase/functions/payments and stripe-webhook call the
-- service-role functions below. FPS, PayMe and cash keep working as before.

-- ---------------------------------------------------------------------------
-- The platform fee: a percentage plus a fixed amount per online order, taken
-- from the society's share. One row for the whole app; a society can have its
-- own rate (set by a platform admin) on its payout account.
-- ---------------------------------------------------------------------------
create table public.platform_fee (
  id boolean primary key default true check (id),
  percent numeric(5, 2) not null default 5 check (percent between 0 and 30),
  fixed_hkd numeric(10, 2) not null default 3 check (fixed_hkd between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.platform_fee default values;

alter table public.platform_fee enable row level security;
create policy "anyone signed in reads the fee" on public.platform_fee for select to authenticated using (true);
revoke insert, update, delete on public.platform_fee from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A society's payout account at the payment provider. Written only by the edge
-- functions (service role) from what the provider reports.
-- ---------------------------------------------------------------------------
create table public.society_payout_accounts (
  society_id uuid primary key references public.societies on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  account_id text not null unique,
  -- Buyers can pay once the provider has verified the account.
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  -- How many things the provider still needs (ID photo, bank account...).
  requirements_due int not null default 0,
  disabled_reason text,
  -- A platform admin can give a society its own rate; null means the app's rate.
  fee_percent numeric(5, 2) check (fee_percent between 0 and 30),
  fee_fixed_hkd numeric(10, 2) check (fee_fixed_hkd between 0 and 100),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.society_payout_accounts enable row level security;
create policy "committee and platform admins read payout accounts" on public.society_payout_accounts
  for select using (public.is_society_member(society_id) or public.is_platform_admin());
revoke insert, update, delete on public.society_payout_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders can be paid online. The fee is copied onto the order when it is paid,
-- so the treasurer's export shows what the society actually received.
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('fps', 'payme', 'cash', 'online'));
alter table public.orders add column platform_fee_hkd numeric(10, 2);

-- One row per checkout attempt. A buyer who closes the page and tries again gets
-- a new attempt; the old one is expired at the provider first.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  society_id uuid not null references public.societies on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  session_id text not null unique,
  payment_intent text unique,
  amount_hkd numeric(10, 2) not null,
  fee_hkd numeric(10, 2) not null,
  -- card, alipay, wechat_pay... as the provider reports it.
  method text,
  status text not null default 'open' check (status in ('open', 'succeeded', 'expired', 'failed', 'refunded')),
  refunded_hkd numeric(10, 2) not null default 0,
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id, created_at desc);

alter table public.payments enable row level security;
create policy "buyer and society admins read payments" on public.payments
  for select using (
    public.is_society_admin(society_id)
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );
revoke insert, update, delete on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fee and readiness
-- ---------------------------------------------------------------------------

-- What the society pays the platform on an online order of this total.
create or replace function public._platform_fee_hkd(p_society_id uuid, p_total numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_total <= 0 then 0 else least(p_total, round(
    p_total * coalesce(a.fee_percent, f.percent) / 100 + coalesce(a.fee_fixed_hkd, f.fixed_hkd), 2)) end
  from public.platform_fee f
  left join public.society_payout_accounts a on a.society_id = p_society_id;
$$;

-- The rate a society pays, for its committee's settings screen.
create or replace function public.platform_fee_for(p_society_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'percent', coalesce(a.fee_percent, f.percent),
    'fixed_hkd', coalesce(a.fee_fixed_hkd, f.fixed_hkd))
  from public.platform_fee f
  left join public.society_payout_accounts a on a.society_id = p_society_id;
$$;

-- Can buyers pay this society online right now?
create or replace function public.shop_online_ready(p_society_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.society_payout_accounts a
    join public.societies s on s.id = a.society_id
    where a.society_id = p_society_id and a.charges_enabled and s.status = 'approved'
  );
$$;

-- Platform admins set the app's rate, or one society's (null percent and fixed
-- with a society clears its own rate).
create or replace function public.set_platform_fee(p_percent numeric, p_fixed_hkd numeric, p_society_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can change the fee';
  end if;
  if p_society_id is null then
    update public.platform_fee set percent = p_percent, fixed_hkd = p_fixed_hkd, updated_at = now();
  else
    update public.society_payout_accounts set fee_percent = p_percent, fee_fixed_hkd = p_fixed_hkd, updated_at = now()
      where society_id = p_society_id;
    if not found then
      raise exception 'This society has not set up online payments';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guard: an online order only changes payment state through the webhook
-- functions below, which set app.payment_webhook for their transaction. The
-- committee can still cancel an unpaid online order and mark paid ones ready
-- or collected; refunds go through the refund function, which talks to the
-- provider first.
-- ---------------------------------------------------------------------------
create or replace function public.guard_online_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_method <> 'online' or new.status = old.status
    or coalesce(current_setting('app.payment_webhook', true), '') = 'on' then
    return new;
  end if;
  if new.status in ('paid', 'awaiting_payment', 'payment_claimed') then
    raise exception 'Online payments are confirmed automatically';
  end if;
  if new.status = 'refunded' or (new.status = 'cancelled' and old.status not in ('awaiting_payment', 'payment_claimed')) then
    raise exception 'Refund online payments with the Refund button';
  end if;
  return new;
end;
$$;

create trigger orders_guard_online
  before update of status on public.orders
  for each row execute function public.guard_online_order();

-- An online order holds stock for 30 minutes while the buyer is on the payment
-- page (each new attempt extends it), and only for societies that can take it.
create or replace function public.prepare_online_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_method = 'online' then
    if new.event_id is not null then
      raise exception 'Choose how you will pay';
    end if;
    if not public.shop_online_ready(new.society_id) then
      raise exception 'This society does not take online payments yet';
    end if;
    if new.status = 'awaiting_payment' then
      new.expires_at := now() + interval '30 minutes';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_prepare_online
  before insert on public.orders
  for each row execute function public.prepare_online_order();

-- Checkout now accepts 'online'; the rest is unchanged from v0.7.
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
  if coalesce(p_payment_method, '') not in ('fps', 'payme', 'cash', 'online') then
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


-- ---------------------------------------------------------------------------
-- Service-role functions for the edge functions. Each takes the signed-in user
-- the edge function verified, and checks what they may do.
-- ---------------------------------------------------------------------------

-- Before onboarding: may this person connect the society, and is there already an account?
create or replace function public.payout_onboarding_info(p_society_id uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.societies;
begin
  if not exists (select 1 from public.society_members m
      where m.society_id = p_society_id and m.user_id = p_user and m.role in ('owner', 'admin')) then
    raise exception 'Only society admins can set up online payments';
  end if;
  select * into v_s from public.societies where id = p_society_id;
  if v_s.status <> 'approved' then
    raise exception 'Your society needs to be approved first';
  end if;
  return jsonb_build_object(
    'account_id', (select account_id from public.society_payout_accounts where society_id = p_society_id),
    'name', v_s.name,
    'email', (select email from public.profiles where id = p_user));
end;
$$;

-- Records what the provider says about a payout account (after onboarding and on account.updated).
create or replace function public.sync_payout_account(
  p_society_id uuid, p_account_id text, p_charges boolean, p_payouts boolean, p_details boolean,
  p_due int, p_disabled_reason text, p_user uuid default null
)
returns public.society_payout_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.society_payout_accounts;
begin
  if p_society_id is null then
    select society_id into p_society_id from public.society_payout_accounts where account_id = p_account_id;
    if p_society_id is null then
      return null;
    end if;
  end if;
  insert into public.society_payout_accounts (society_id, account_id, charges_enabled, payouts_enabled,
    details_submitted, requirements_due, disabled_reason, created_by)
  values (p_society_id, p_account_id, p_charges, p_payouts, p_details, coalesce(p_due, 0), p_disabled_reason, p_user)
  on conflict (society_id) do update set
    account_id = excluded.account_id, charges_enabled = excluded.charges_enabled,
    payouts_enabled = excluded.payouts_enabled, details_submitted = excluded.details_submitted,
    requirements_due = excluded.requirements_due, disabled_reason = excluded.disabled_reason, updated_at = now()
  returning * into v_a;
  return v_a;
end;
$$;

-- Before checkout: the order, the amount and fee, and earlier attempts to close.
create or replace function public.online_checkout_info(p_order_id uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_a public.society_payout_accounts;
begin
  select * into v_o from public.orders where id = p_order_id and user_id = p_user for update;
  if v_o.id is null then
    raise exception 'Order not found';
  end if;
  if v_o.payment_method <> 'online' then
    raise exception 'This order is paid another way';
  end if;
  if v_o.status <> 'awaiting_payment' then
    raise exception 'This order is not waiting for payment';
  end if;
  if not public._order_holds_stock(v_o) then
    raise exception 'This order expired. Please order again.';
  end if;
  select * into v_a from public.society_payout_accounts where society_id = v_o.society_id;
  if v_a.account_id is null or not public.shop_online_ready(v_o.society_id) then
    raise exception 'This society does not take online payments yet';
  end if;
  return jsonb_build_object(
    'order_id', v_o.id,
    'ref', v_o.ref,
    'society_id', v_o.society_id,
    'society_name', (select coalesce(short_name, name) from public.societies where id = v_o.society_id),
    'items', v_o.items,
    'product_title', v_o.product_title,
    'total_hkd', v_o.total_hkd,
    'fee_hkd', public._platform_fee_hkd(v_o.society_id, v_o.total_hkd),
    'account_id', v_a.account_id,
    'email', (select email from public.profiles where id = p_user),
    'locale', (select locale from public.profiles where id = p_user),
    'open_sessions', (select coalesce(jsonb_agg(session_id), '[]') from public.payments
      where order_id = v_o.id and status = 'open'));
end;
$$;

-- After the provider created a checkout page. The order keeps its stock while the page is open.
create or replace function public.record_checkout_session(
  p_order_id uuid, p_session_id text, p_url text, p_expires_at timestamptz, p_amount numeric, p_fee numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  update public.payments set status = 'expired', updated_at = now() where order_id = p_order_id and status = 'open';
  insert into public.payments (order_id, society_id, session_id, amount_hkd, fee_hkd, checkout_url, expires_at)
  values (p_order_id, v_o.society_id, p_session_id, p_amount, p_fee, p_url, p_expires_at);
  perform set_config('app.payment_webhook', 'on', true);
  update public.orders set expires_at = greatest(expires_at, p_expires_at + interval '5 minutes'), updated_at = now()
    where id = p_order_id and status = 'awaiting_payment';
end;
$$;

-- Webhook: a checkout page was paid. Stripe retries webhooks, so this is safe to
-- call again for the same page. Returns what the edge function should do:
--   'paid'     the order is now paid
--   'already'  this payment was handled before
--   'refund'   the money has nowhere to go (order cancelled, or paid twice); refund
--              it (again on a retry, until the refund is recorded)
--   'unknown'  not one of ours
create or replace function public.online_payment_succeeded(
  p_session_id text, p_payment_intent text, p_method text, p_amount numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_o public.orders;
begin
  select * into v_p from public.payments where session_id = p_session_id for update;
  if v_p.id is null then
    return 'unknown';
  end if;
  if v_p.status = 'refunded' then
    return 'already';
  end if;
  if v_p.status = 'succeeded' then
    select * into v_o from public.orders where id = v_p.order_id;
    return case when v_o.status in ('cancelled', 'refunded') or exists (select 1 from public.payments p
        where p.order_id = v_p.order_id and p.status = 'succeeded' and p.id <> v_p.id and p.paid_at < v_p.paid_at)
      then 'refund' else 'already' end;
  end if;
  update public.payments set status = 'succeeded', payment_intent = p_payment_intent, method = p_method,
      amount_hkd = coalesce(p_amount, amount_hkd), paid_at = now(), updated_at = now()
    where id = v_p.id;

  perform set_config('app.payment_webhook', 'on', true);
  select * into v_o from public.orders where id = v_p.order_id for update;
  -- A late payment for an order whose window just passed still counts: the
  -- buyer was on the payment page, so the order is theirs.
  if v_o.status in ('awaiting_payment', 'payment_claimed') then
    update public.orders set status = 'paid', paid_at = now(), platform_fee_hkd = v_p.fee_hkd,
        claimed_at = null, updated_at = now()
      where id = v_o.id
      returning * into v_o;
    perform public._notify_order(v_o);
    return 'paid';
  end if;
  return 'refund';
end;
$$;

-- Webhook: a checkout page expired or failed without payment.
create or replace function public.online_payment_closed(p_session_id text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = p_status, updated_at = now()
    where session_id = p_session_id and status = 'open' and p_status in ('expired', 'failed');
$$;

-- Before a committee refund: may this person refund it, and which payment?
create or replace function public.online_refund_info(p_order_id uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_p public.payments;
begin
  select * into v_o from public.orders where id = p_order_id;
  if v_o.id is null or not exists (select 1 from public.society_members m
      where m.society_id = v_o.society_id and m.user_id = p_user and m.role in ('owner', 'admin')) then
    raise exception 'Only society admins can confirm payments';
  end if;
  if v_o.payment_method <> 'online' or v_o.status not in ('paid', 'ready', 'collected') then
    raise exception 'That change is not possible for this order';
  end if;
  select * into v_p from public.payments where order_id = v_o.id and status = 'succeeded'
    order by paid_at desc limit 1;
  if v_p.payment_intent is null then
    raise exception 'That change is not possible for this order';
  end if;
  return jsonb_build_object('payment_intent', v_p.payment_intent, 'amount_hkd', v_p.amount_hkd);
end;
$$;

-- After the provider refunded a payment (from the app, a duplicate, or the
-- provider's dashboard). Refunding the order's only payment refunds the order.
create or replace function public.record_online_refund(p_payment_intent text, p_refunded numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_o public.orders;
begin
  select * into v_p from public.payments where payment_intent = p_payment_intent for update;
  if v_p.id is null then
    return;
  end if;
  update public.payments set refunded_hkd = least(amount_hkd, coalesce(p_refunded, amount_hkd)),
      status = case when coalesce(p_refunded, amount_hkd) >= amount_hkd then 'refunded' else status end,
      refunded_at = now(), updated_at = now()
    where id = v_p.id
    returning * into v_p;
  if v_p.status <> 'refunded' then
    return;
  end if;
  perform set_config('app.payment_webhook', 'on', true);
  select * into v_o from public.orders where id = v_p.order_id for update;
  if v_o.status in ('paid', 'ready', 'collected')
    and not exists (select 1 from public.payments where order_id = v_o.id and status = 'succeeded') then
    update public.orders set status = 'refunded', cancelled_at = now(), updated_at = now()
      where id = v_o.id
      returning * into v_o;
    perform public._notify_order(v_o);
  end if;
end;
$$;

revoke execute on function public.payout_onboarding_info(uuid, uuid),
  public.sync_payout_account(uuid, text, boolean, boolean, boolean, int, text, uuid),
  public.online_checkout_info(uuid, uuid),
  public.record_checkout_session(uuid, text, text, timestamptz, numeric, numeric),
  public.online_payment_succeeded(text, text, text, numeric),
  public.online_payment_closed(text, text),
  public.online_refund_info(uuid, uuid),
  public.record_online_refund(text, numeric),
  public._platform_fee_hkd(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.payout_onboarding_info(uuid, uuid),
  public.sync_payout_account(uuid, text, boolean, boolean, boolean, int, text, uuid),
  public.online_checkout_info(uuid, uuid),
  public.record_checkout_session(uuid, text, text, timestamptz, numeric, numeric),
  public.online_payment_succeeded(text, text, text, numeric),
  public.online_payment_closed(text, text),
  public.online_refund_info(uuid, uuid),
  public.record_online_refund(text, numeric),
  public._platform_fee_hkd(uuid, numeric)
  to service_role;

-- "Refunded" also tells the buyer, now that online refunds happen in the app.
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
      when 'refunded' then public.localized(p.locale, 'Refunded', '已退款')
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
      when 'refunded' then public.localized(p.locale,
        'HK$' || o.total_hkd || ' for ' || o.ref || ' is on its way back to your card or wallet. It can take 5 to 10 days to appear.',
        '訂單 ' || o.ref || ' 的 HK$' || o.total_hkd || ' 已退回你的信用卡或電子錢包，可能需要 5 至 10 日才會顯示。')
      else public.localized(p.locale, o.product_title || ' (' || o.ref || ')', '「' || o.product_title || '」（' || o.ref || '）')
    end,
    o.society_id
  from public.profiles p where p.id = o.user_id;
end;
$$;

revoke execute on function public._notify_order(public.orders) from public, anon, authenticated;
