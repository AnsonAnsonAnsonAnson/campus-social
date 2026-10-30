-- v0.4 fixes found in review.

-- 1. Stock: a size repeated on two lines of one order was checked line by line, so
--    "M x2, M x2" passed with 3 left. Each line now counts the lines before it.
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
    -- Count this line too, so a size repeated on a later line is checked against what's left.
    v_sold := jsonb_set(v_sold, array[v_variant ->> 'name'],
      to_jsonb(coalesce((v_sold ->> (v_variant ->> 'name'))::int, 0) + v_qty));
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

-- 2. Uses now(), so it is stable, not immutable.
alter function public._order_holds_stock(public.orders) stable;

-- 3. Membership is only answered for yourself or for your society's committee.
create or replace function public.is_current_member(p_society_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_user = auth.uid() or public.is_society_member(p_society_id)) and exists (
    select 1 from public.memberships m
    join public.membership_plans p on p.id = m.plan_id
    where m.society_id = p_society_id and m.user_id = p_user and m.status = 'active'
      and (now() at time zone 'Asia/Hong_Kong')::date between p.valid_from and p.valid_until
  );
$$;
