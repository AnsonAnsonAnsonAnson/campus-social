-- v0.7: rotating QR tickets.
--
-- The ticket QR is now a short-lived token "<registration id>.<step>.<sig>"
-- made on the attendee's phone every 30 seconds (src/lib/ticketToken.ts):
-- sig is the first 24 hex characters of HMAC-SHA256("<id>.<step>") keyed with
-- the ticket code, so it needs no signal at the door but a screenshot stops
-- working after a minute or two. The full ticket code on its own no longer
-- checks anyone in; door staff can still type the 8-character backup code.

-- HMAC-SHA256 (RFC 2104) with the built-in sha256(), so no extension is needed.
create or replace function public._hmac_sha256_hex(p_key text, p_msg text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key bytea := convert_to(p_key, 'UTF8');
  v_ipad bytea;
  v_opad bytea;
begin
  if length(v_key) > 64 then
    v_key := sha256(v_key);
  end if;
  v_key := v_key || decode(repeat('00', 64 - length(v_key)), 'hex');
  v_ipad := v_key;
  v_opad := v_key;
  for i in 0..63 loop
    v_ipad := set_byte(v_ipad, i, get_byte(v_key, i) # 54);
    v_opad := set_byte(v_opad, i, get_byte(v_key, i) # 92);
  end loop;
  return encode(sha256(v_opad || sha256(v_ipad || convert_to(p_msg, 'UTF8'))), 'hex');
end;
$$;

revoke execute on function public._hmac_sha256_hex(text, text) from public, anon, authenticated;

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
  v_input text := lower(regexp_replace(coalesce(p_ticket_code, ''), '\s', '', 'g'));
  v_parts text[];
  v_step bigint := floor(extract(epoch from now()) / 30);
  v_expired boolean := false;
begin
  select society_id into v_society from public.events where id = p_event_id;
  if v_society is null or not public.is_society_member(v_society) then
    raise exception 'Only society committee members can check people in';
  end if;

  if v_input ~ '^[0-9a-f]{32}\.[0-9]{1,12}\.[0-9a-f]{24}$' then
    -- Rotating QR token from the app.
    v_parts := string_to_array(v_input, '.');
    select * into v_reg from public.registrations where id = v_parts[1]::uuid;
    if v_reg.id is null
      or left(public._hmac_sha256_hex(v_reg.ticket_code, v_parts[1] || '.' || v_parts[2]), 24) <> v_parts[3] then
      return jsonb_build_object('ok', false, 'message', 'Ticket not found');
    end if;
    -- Two steps back (about a minute) and one ahead, for phone clocks that are a little off.
    v_expired := v_parts[2]::bigint not between v_step - 2 and v_step + 1;
  elsif char_length(v_input) = 8 then
    -- Door staff can also type the 8-character backup code shown under the QR.
    select count(*) into v_matches from public.registrations
      where event_id = p_event_id and ticket_code like v_input || '%';
    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'message', 'Several tickets match that code, please scan the QR instead');
    end if;
    select * into v_reg from public.registrations
      where event_id = p_event_id and ticket_code like v_input || '%';
  elsif v_input ~ '^[0-9a-f]{32}$' and exists (select 1 from public.registrations where ticket_code = v_input) then
    -- A fixed QR from an old version of the app.
    return jsonb_build_object('ok', false, 'message', 'Old QR code. Ask them to update the app, or type the backup code');
  end if;

  if v_reg.id is null then
    return jsonb_build_object('ok', false, 'message', 'Ticket not found');
  end if;

  select coalesce(nullif(p.display_name, ''), p.email) into v_name
    from public.profiles p where p.id = v_reg.user_id;

  if v_reg.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'This ticket is for a different event');
  end if;
  if v_expired then
    return jsonb_build_object('ok', false, 'name', v_name,
      'message', 'QR code expired. Ask them to open the ticket in the app, or type the backup code');
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
