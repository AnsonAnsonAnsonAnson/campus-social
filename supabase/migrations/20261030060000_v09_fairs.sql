-- v0.9: fairs. A few times a year (O'Camp, the Christmas fair, the spring
-- market) dozens of societies run booths in one place over a day or two, and
-- each booth sells merch and food. Today that means a Google Form per booth,
-- PayMe screenshots, cash boxes and long queues, and nobody knows how many to
-- make until the day.
--
--   * An organiser society (e.g. the Student Union) creates a fair; a platform
--     admin approves it before it is listed.
--   * Societies ask for a booth; the organiser approves them and gives each a
--     booth number.
--   * A booth society puts products on presale for the fair: merch to collect
--     at the booth, and food vouchers ("bubble tea, HK$25") to use there.
--   * Fair items check out on their own (one booth, one fair per order), so the
--     order knows where it is collected, and the presale closes for the whole
--     fair at once.
--   * At the booth the committee scans the order QR. Merch is handed over; for
--     vouchers they choose how many are used now, so a buyer can use one of
--     three vouchers today and the rest later.
--   * The organiser sees presale sales per booth.

-- ---------------------------------------------------------------------------
-- Fairs
-- ---------------------------------------------------------------------------
create table public.fairs (
  id uuid primary key default gen_random_uuid(),
  organiser_society_id uuid not null references public.societies on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  venue text not null check (char_length(venue) between 2 and 120),
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Null: presale runs until the fair ends (buyers can still pre-pay in the queue).
  presale_closes_at timestamptz,
  -- Societies can ask for a booth while this is on.
  booths_open boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (presale_closes_at is null or presale_closes_at <= ends_at)
);

create index fairs_dates_idx on public.fairs (status, ends_at);

alter table public.fairs enable row level security;
create policy "read approved fairs, or your own" on public.fairs
  for select using (status = 'approved' or public.is_society_member(organiser_society_id) or public.is_platform_admin());
revoke insert, update, delete on public.fairs from anon, authenticated;

create table public.fair_booths (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs on delete cascade,
  society_id uuid not null references public.societies on delete cascade,
  -- Given by the organiser: "B12".
  label text check (char_length(label) <= 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- From the society: what they plan to sell.
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (fair_id, society_id)
);

alter table public.fair_booths enable row level security;
create policy "read approved booths, or your own" on public.fair_booths
  for select using (
    (status = 'approved' and exists (select 1 from public.fairs f where f.id = fair_id and f.status = 'approved'))
    or public.is_society_member(society_id)
    or exists (select 1 from public.fairs f where f.id = fair_id and public.is_society_member(f.organiser_society_id))
    or public.is_platform_admin()
  );
revoke insert, update, delete on public.fair_booths from anon, authenticated;

create or replace function public._has_booth(p_fair_id uuid, p_society_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fair_booths b join public.fairs f on f.id = b.fair_id
    where b.fair_id = p_fair_id and b.society_id = p_society_id and b.status = 'approved' and f.status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Fair news goes to a society's owners and admins.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'waitlist_promoted', 'event_cancelled', 'event_updated', 'new_event', 'society_approved', 'committee_added',
  'membership_active', 'membership_renewal', 'order_update', 'payment_settings_changed', 'product_available',
  'fair_update'
));

create or replace function public._notify_society_admins(p_society_id uuid, p_en_title text, p_zh_title text, p_en text, p_zh text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, society_id)
  select m.user_id, 'fair_update', public.localized(p.locale, p_en_title, p_zh_title), public.localized(p.locale, p_en, p_zh),
    p_society_id
  from public.society_members m
  join public.profiles p on p.id = m.user_id
  where m.society_id = p_society_id and m.role in ('owner', 'admin');
$$;
revoke execute on function public._notify_society_admins(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Organisers
-- ---------------------------------------------------------------------------
create or replace function public.save_fair(
  p_id uuid, p_society_id uuid, p_name text, p_description text, p_venue text, p_cover_url text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_presale_closes_at timestamptz, p_booths_open boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.fairs;
  v_id uuid;
begin
  if p_id is not null then
    select * into v_f from public.fairs where id = p_id for update;
    if v_f.id is null or not public.is_society_admin(v_f.organiser_society_id) then
      raise exception 'Only the organiser can change this fair';
    end if;
    -- A rejected fair goes back for review once it's fixed.
    update public.fairs set name = trim(p_name), description = coalesce(trim(p_description), ''), venue = trim(p_venue),
      cover_url = p_cover_url, starts_at = p_starts_at, ends_at = p_ends_at, presale_closes_at = p_presale_closes_at,
      booths_open = coalesce(p_booths_open, true),
      status = case when status = 'rejected' then 'pending' else status end, updated_at = now()
    where id = p_id;
    return p_id;
  end if;
  if not public.is_society_admin(p_society_id) then
    raise exception 'Only society admins can organise a fair';
  end if;
  if not exists (select 1 from public.societies where id = p_society_id and status = 'approved') then
    raise exception 'Your society must be approved first';
  end if;
  insert into public.fairs (organiser_society_id, name, description, venue, cover_url, starts_at, ends_at, presale_closes_at,
    booths_open, status)
  values (p_society_id, trim(p_name), coalesce(trim(p_description), ''), trim(p_venue), p_cover_url, p_starts_at, p_ends_at,
    p_presale_closes_at, coalesce(p_booths_open, true), case when public.is_platform_admin() then 'approved' else 'pending' end)
  returning id into v_id;
  -- The organiser runs a booth at its own fair.
  insert into public.fair_booths (fair_id, society_id, status) values (v_id, p_society_id, 'approved');
  return v_id;
end;
$$;

create or replace function public.review_fair(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.fairs;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can review fairs';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject';
  end if;
  update public.fairs set status = p_status, updated_at = now() where id = p_id returning * into v_f;
  if v_f.id is null then
    raise exception 'Fair not found';
  end if;
  perform public._notify_society_admins(v_f.organiser_society_id,
    case when p_status = 'approved' then 'Fair approved' else 'Fair not approved' end,
    case when p_status = 'approved' then '市集已獲批' else '市集未獲批' end,
    case when p_status = 'approved' then v_f.name || ' is listed. Societies can now ask for a booth.'
      else v_f.name || ' was not approved. Edit it and it will be checked again.' end,
    case when p_status = 'approved' then '「' || v_f.name || '」已上架，各學會現可申請攤位。'
      else '「' || v_f.name || '」未獲批。修改後會再次審批。' end);
end;
$$;

-- A society admin asks for a booth. Asking again after a rejection asks again.
create or replace function public.apply_for_booth(p_fair_id uuid, p_society_id uuid, p_note text default null)
returns public.fair_booths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.fairs;
  v_b public.fair_booths;
begin
  if not public.is_society_admin(p_society_id) then
    raise exception 'Only society admins can ask for a booth';
  end if;
  if not exists (select 1 from public.societies where id = p_society_id and status = 'approved') then
    raise exception 'Your society must be approved first';
  end if;
  select * into v_f from public.fairs where id = p_fair_id;
  if v_f.id is null or v_f.status <> 'approved' then
    raise exception 'Fair not found';
  end if;
  if not v_f.booths_open or v_f.ends_at < now() then
    raise exception 'This fair is not taking booth requests';
  end if;
  insert into public.fair_booths (fair_id, society_id, note, status)
  values (p_fair_id, p_society_id, nullif(trim(p_note), ''),
    case when public.is_society_admin(v_f.organiser_society_id) then 'approved' else 'pending' end)
  on conflict (fair_id, society_id) do update
    set note = excluded.note,
        status = case when public.fair_booths.status = 'rejected' then 'pending' else public.fair_booths.status end
  returning * into v_b;
  return v_b;
end;
$$;

create or replace function public.review_booth(p_booth_id uuid, p_status text, p_label text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.fair_booths;
  v_f public.fairs;
  v_was text;
begin
  select * into v_b from public.fair_booths where id = p_booth_id for update;
  select * into v_f from public.fairs where id = v_b.fair_id;
  if v_b.id is null or not public.is_society_admin(v_f.organiser_society_id) then
    raise exception 'Only the organiser can review booths';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Choose approve or reject';
  end if;
  v_was := v_b.status;
  update public.fair_booths set status = p_status, label = nullif(trim(p_label), '') where id = p_booth_id;
  if p_status <> v_was and p_status <> 'pending' then
    perform public._notify_society_admins(v_b.society_id,
      case when p_status = 'approved' then 'Booth confirmed' else 'Booth request declined' end,
      case when p_status = 'approved' then '攤位已確認' else '攤位申請未獲接納' end,
      case when p_status = 'approved'
        then 'You have a booth at ' || v_f.name || coalesce(' (' || nullif(trim(p_label), '') || ')', '')
          || '. Add presale items and food vouchers from your shop.'
        else v_f.name || ' could not give you a booth this time.' end,
      case when p_status = 'approved'
        then '你已獲得「' || v_f.name || '」的攤位' || coalesce('（' || nullif(trim(p_label), '') || '）', '')
          || '。可在商店加入預售貨品及食物券。'
        else '「' || v_f.name || '」今次未能安排攤位。' end);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Products: sold at a fair, and food vouchers
-- ---------------------------------------------------------------------------
alter table public.products
  add column fair_id uuid references public.fairs on delete set null,
  add column kind text not null default 'merch' check (kind in ('merch', 'voucher')),
  -- What a voucher is worth at the booth, when that is more than its price ("HK$30 of food for HK$25").
  add column voucher_value_hkd numeric(8, 2) check (voucher_value_hkd between 0 and 10000);

create index products_fair_idx on public.products (fair_id) where fair_id is not null;

grant insert (fair_id, kind, voucher_value_hkd), update (fair_id, kind, voucher_value_hkd) on public.products to authenticated;

create or replace function public.check_product_fair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fair_id is not null and (tg_op = 'INSERT' or new.fair_id is distinct from old.fair_id)
     and not public._has_booth(new.fair_id, new.society_id) then
    raise exception 'Your society needs a confirmed booth at this fair first';
  end if;
  return new;
end;
$$;

create trigger products_check_fair before insert or update of fair_id on public.products
  for each row execute function public.check_product_fair();

-- Products at a fair, with each booth, in the same shape as list_products.
create or replace function public.list_fair_products(p_fair_id uuid)
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
      'booth', b.label,
      'society', jsonb_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name, 'logo_url', s.logo_url,
        'verified', s.verified, 'category', s.category)
    ) order by b.label nulls last, s.name, p.created_at), '[]')
  from public.products p
  join public.societies s on s.id = p.society_id and s.status = 'approved'
  join public.fair_booths b on b.fair_id = p.fair_id and b.society_id = p.society_id and b.status = 'approved'
  where p.fair_id = p_fair_id and p.status = 'published';
$$;

-- ---------------------------------------------------------------------------
-- Orders: one fair per order, and vouchers used at the booth
-- ---------------------------------------------------------------------------
alter table public.orders
  add column fair_id uuid references public.fairs on delete set null,
  add column vouchers_total int not null default 0,
  add column vouchers_used int not null default 0,
  add constraint orders_vouchers_check check (vouchers_used between 0 and vouchers_total);

create index orders_fair_idx on public.orders (fair_id) where fair_id is not null;

create or replace function public.prepare_fair_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fairs uuid[];
  v_plain boolean;
  v_f public.fairs;
begin
  if new.event_id is not null then
    return new;
  end if;
  select coalesce(array_agg(distinct p.fair_id) filter (where p.fair_id is not null), '{}'),
    coalesce(bool_or(p.fair_id is null), false),
    coalesce(sum((i ->> 'qty')::int) filter (where p.kind = 'voucher'), 0),
    coalesce(jsonb_agg(case when p.kind = 'voucher' then i || '{"kind": "voucher"}' else i end order by n), '[]')
  into v_fairs, v_plain, new.vouchers_total, new.items
  from jsonb_array_elements(new.items) with ordinality as x(i, n)
  left join public.products p on p.id = coalesce((i ->> 'product_id')::uuid, new.product_id);

  if cardinality(v_fairs) > 1 or (cardinality(v_fairs) = 1 and v_plain) then
    raise exception 'Check out fair presale items on their own';
  end if;
  if cardinality(v_fairs) = 1 then
    select * into v_f from public.fairs where id = v_fairs[1];
    if not public._has_booth(v_f.id, new.society_id) then
      raise exception 'This item is not on sale';
    end if;
    if coalesce(v_f.presale_closes_at, v_f.ends_at) < now() then
      raise exception 'Presale for this fair has closed';
    end if;
    new.fair_id := v_f.id;
  end if;
  return new;
end;
$$;

create trigger orders_prepare_fair before insert on public.orders
  for each row execute function public.prepare_fair_order();

-- The pickup desk, now also at a booth: hand over merch, and use vouchers.
-- p_vouchers: how many of the buyer's vouchers to use now. Without it, an order
-- with vouchers left answers "How many vouchers?" so the desk can ask.
drop function if exists public.collect_order(uuid, text, boolean);
create or replace function public.collect_order(
  p_society_id uuid, p_code text, p_cash_received boolean default false, p_vouchers int default null
)
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
  v_left int;
  v_cash boolean := false;
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
    'total_hkd', v_o.total_hkd, 'payment_method', v_o.payment_method,
    'vouchers_total', v_o.vouchers_total, 'vouchers_left', v_o.vouchers_total - v_o.vouchers_used);
  if v_o.event_id is not null then
    return v_base || jsonb_build_object('ok', false, 'message', 'This is an event ticket. Check it in from the event instead.');
  end if;
  if v_o.status = 'collected' then
    return v_base || jsonb_build_object('ok', false,
      'message', case when v_o.vouchers_total > 0 then 'All vouchers used' else 'Already collected' end,
      'collected_at', v_o.collected_at);
  end if;
  if v_o.status = 'awaiting_payment' and v_o.payment_method = 'cash' and p_cash_received then
    if v_o.vouchers_total = 0 then
      update public.orders set status = 'collected', paid_at = now(), collected_at = now(), updated_at = now() where id = v_o.id;
      return v_base || jsonb_build_object('ok', true, 'message', 'Cash taken and collected');
    end if;
    update public.orders set status = 'paid', paid_at = now(), updated_at = now() where id = v_o.id;
    v_o.status := 'paid';
    v_cash := true;
  end if;
  if v_o.status not in ('paid', 'ready') then
    return v_base || jsonb_build_object('ok', false, 'message', case
      when v_o.status = 'awaiting_payment' and v_o.payment_method = 'cash' then 'Take cash'
      when v_o.status in ('cancelled', 'refunded') then 'This order was cancelled'
      else 'Not paid yet' end);
  end if;

  if v_o.vouchers_total > 0 then
    v_left := v_o.vouchers_total - v_o.vouchers_used;
    if p_vouchers is null then
      return v_base || jsonb_build_object('ok', false, 'cash_taken', v_cash, 'message', 'How many vouchers?');
    end if;
    if p_vouchers < 1 or p_vouchers > v_left then
      return v_base || jsonb_build_object('ok', false, 'message', 'Not that many vouchers left');
    end if;
    update public.orders set vouchers_used = vouchers_used + p_vouchers,
      status = case when p_vouchers = v_left then 'collected' else status end,
      collected_at = case when p_vouchers = v_left then now() end,
      updated_at = now()
    where id = v_o.id;
    return v_base || jsonb_build_object('ok', true, 'message', 'Vouchers used', 'used_now', p_vouchers,
      'vouchers_left', v_left - p_vouchers);
  end if;

  update public.orders set status = 'collected', collected_at = now(), updated_at = now() where id = v_o.id;
  return v_base || jsonb_build_object('ok', true, 'message', 'Collected');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading fairs
-- ---------------------------------------------------------------------------
create or replace function public._fair_json(f public.fairs)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(f) || jsonb_build_object(
    'organiser', (select jsonb_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name, 'logo_url', s.logo_url,
        'verified', s.verified, 'category', s.category) from public.societies s where s.id = f.organiser_society_id),
    'booth_count', (select count(*) from public.fair_booths b where b.fair_id = f.id and b.status = 'approved'),
    'product_count', (select count(*) from public.products p
        join public.fair_booths b on b.fair_id = p.fair_id and b.society_id = p.society_id and b.status = 'approved'
        where p.fair_id = f.id and p.status = 'published'),
    'can_manage', public.is_society_admin(f.organiser_society_id));
$$;

-- Fairs that are coming up or on now (and, for organisers, theirs from the last month).
create or replace function public.list_fairs()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(public._fair_json(f) order by f.starts_at), '[]')
  from public.fairs f
  where f.ends_at > now() - case when public.is_society_member(f.organiser_society_id) then interval '30 days' else interval '0' end;
$$;

create or replace function public.get_fair(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public._fair_json(f) || jsonb_build_object('booths', coalesce((
    select jsonb_agg(to_jsonb(b) || jsonb_build_object('society', jsonb_build_object('id', s.id, 'name', s.name,
        'short_name', s.short_name, 'logo_url', s.logo_url, 'verified', s.verified, 'category', s.category))
      order by b.status <> 'pending', b.label nulls last, s.name)
    from public.fair_booths b join public.societies s on s.id = b.society_id
    where b.fair_id = f.id), '[]'))
  from public.fairs f where f.id = p_id;
$$;

-- The organiser's view: presale per booth (totals only, never buyers).
create or replace function public.fair_sales(p_fair_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_f public.fairs;
begin
  select * into v_f from public.fairs where id = p_fair_id;
  if v_f.id is null or not (public.is_society_member(v_f.organiser_society_id) or public.is_platform_admin()) then
    raise exception 'Only the organiser can see fair sales';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'society_id', b.society_id, 'society_name', s.name, 'booth', b.label,
      'orders', coalesce(x.orders, 0), 'sales_hkd', coalesce(x.sales, 0),
      'vouchers_sold', coalesce(x.vouchers, 0), 'vouchers_used', coalesce(x.used, 0),
      'collected', coalesce(x.collected, 0)
    ) order by coalesce(x.sales, 0) desc, s.name)
    from public.fair_booths b
    join public.societies s on s.id = b.society_id
    left join lateral (
      select count(*) as orders, sum(o.total_hkd) as sales, sum(o.vouchers_total) as vouchers, sum(o.vouchers_used) as used,
        count(*) filter (where o.status = 'collected') as collected
      from public.orders o
      where o.fair_id = b.fair_id and o.society_id = b.society_id and o.status in ('paid', 'ready', 'collected')
    ) x on true
    where b.fair_id = p_fair_id and b.status = 'approved'
  ), '[]');
end;
$$;
