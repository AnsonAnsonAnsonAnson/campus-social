-- Allow manual check-in with the short code shown under each QR ticket.

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
  if v_reg.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'name', v_name, 'message', 'Already checked in at ' || to_char(v_reg.checked_in_at at time zone 'Asia/Hong_Kong', 'HH24:MI'));
  end if;

  update public.registrations set checked_in_at = now(), updated_at = now() where id = v_reg.id;
  return jsonb_build_object('ok', true, 'name', v_name, 'message', 'Checked in');
end;
$$;
