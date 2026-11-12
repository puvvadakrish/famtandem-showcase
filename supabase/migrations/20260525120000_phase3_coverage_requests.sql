create table public.coverage_request_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  card_id uuid not null references public.coverage_cards(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.household_members(id) on delete set null,
  request_context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_request_tokens_hash_not_blank check (length(trim(token_hash)) >= 32)
);

create index coverage_request_tokens_household_id_idx on public.coverage_request_tokens(household_id);
create index coverage_request_tokens_card_id_idx on public.coverage_request_tokens(card_id);
create index coverage_request_tokens_expires_at_idx on public.coverage_request_tokens(expires_at);

alter table public.coverage_requests
add column request_token_id uuid references public.coverage_request_tokens(id) on delete cascade,
add column request_note text,
add column provider text;

create index coverage_requests_request_token_id_idx on public.coverage_requests(request_token_id);
create unique index coverage_requests_one_pending_per_slot_idx
on public.coverage_requests(slot_id)
where status = 'pending';

create unique index coverage_responses_one_per_request_idx
on public.coverage_responses(request_id);

alter table public.coverage_request_tokens enable row level security;

create or replace function public.refresh_coverage_card_state(target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row record;
  slot_count integer;
  resolved_slot_count integer;
  flags text[] := array[]::text[];
  next_state public.computed_coverage_state;
begin
  select id, card_type, confidence, review_reason
  into card_row
  from public.coverage_cards
  where id = target_card_id;

  if card_row.id is null then
    raise exception 'coverage card % does not exist', target_card_id using errcode = '23503';
  end if;

  if card_row.review_reason is not null
    or (card_row.confidence is not null and card_row.confidence < 0.750)
  then
    flags := array_append(flags, 'needs_review');
  end if;

  if card_row.card_type = 'change_standalone'
    or exists (
      select 1
      from public.card_changes
      where matched_card_id = target_card_id
        and confirmation_status = 'pending'
    )
  then
    flags := array_append(flags, 'changed');
  end if;

  if exists (
    select 1
    from public.coverage_slots
    where card_id = target_card_id
      and state in ('needs_coverage', 'declined')
  ) then
    flags := array_append(flags, 'needs_coverage');
  end if;

  if exists (
    select 1
    from public.coverage_slots
    where card_id = target_card_id
      and state = 'requested'
  ) then
    flags := array_append(flags, 'pending');
  end if;

  if exists (
    select 1
    from public.readiness_items
    where card_id = target_card_id
      and status = 'open'
      and due_at is not null
      and due_at < now()
  ) then
    flags := array_append(flags, 'overdue');
  elsif exists (
    select 1
    from public.readiness_items
    where card_id = target_card_id
      and status = 'open'
      and due_at is not null
      and due_at <= now() + interval '48 hours'
  ) then
    flags := array_append(flags, 'due_soon');
  end if;

  select count(*),
    count(*) filter (where state in ('accepted', 'cancelled', 'covered_external'))
  into slot_count, resolved_slot_count
  from public.coverage_slots
  where card_id = target_card_id;

  if slot_count > 0 and slot_count = resolved_slot_count then
    flags := array_remove(flags, 'needs_coverage');
    flags := array_remove(flags, 'pending');
  end if;

  flags := array(select distinct unnest(flags));

  next_state := case
    when 'overdue' = any(flags) then 'overdue'::public.computed_coverage_state
    when 'changed' = any(flags) then 'changed'::public.computed_coverage_state
    when 'needs_review' = any(flags) then 'needs_review'::public.computed_coverage_state
    when 'needs_coverage' = any(flags) then 'needs_coverage'::public.computed_coverage_state
    when 'pending' = any(flags) then 'pending'::public.computed_coverage_state
    when 'due_soon' = any(flags) then 'due_soon'::public.computed_coverage_state
    else 'covered'::public.computed_coverage_state
  end;

  update public.coverage_cards
  set attention_flags = flags,
    computed_coverage_state = next_state,
    updated_at = now()
  where id = target_card_id;
end;
$$;

create or replace function public.validate_coverage_request_token_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.card_household_id(NEW.card_id) <> NEW.household_id then
    raise exception 'card_id must belong to the same household'
      using errcode = '23514';
  end if;

  perform public.assert_household_member_reference(
    NEW.created_by,
    NEW.household_id,
    'created_by'
  );

  return NEW;
end;
$$;

create trigger coverage_request_tokens_validate_household_refs
before insert or update on public.coverage_request_tokens
for each row execute function public.validate_coverage_request_token_household_refs();

create or replace function public.validate_coverage_request_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  target_card_id uuid;
  token_row record;
begin
  select coverage_slots.card_id,
    public.slot_household_id(NEW.slot_id)
  into target_card_id,
    target_household_id
  from public.coverage_slots
  where id = NEW.slot_id;

  if target_household_id is null then
    raise exception 'slot_id must reference an existing coverage slot'
      using errcode = '23503';
  end if;

  if NEW.request_token_id is not null then
    select household_id, card_id
    into token_row
    from public.coverage_request_tokens
    where id = NEW.request_token_id;

    if token_row.household_id is null then
      raise exception 'request_token_id must reference an existing coverage request token'
        using errcode = '23503';
    end if;

    if token_row.household_id <> target_household_id
      or token_row.card_id <> target_card_id
    then
      raise exception 'request_token_id must belong to the same coverage card and household as slot_id'
        using errcode = '23514';
    end if;
  end if;

  perform public.assert_household_member_reference(
    NEW.requested_by,
    target_household_id,
    'requested_by'
  );
  perform public.assert_household_member_reference(
    NEW.requested_member_id,
    target_household_id,
    'requested_member_id'
  );
  perform public.assert_external_contact_reference(
    NEW.requested_external_contact_id,
    target_household_id,
    'requested_external_contact_id'
  );

  return NEW;
end;
$$;

create or replace function public.validate_coverage_slot_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  current_member_id uuid;
begin
  target_household_id := public.card_household_id(NEW.card_id);

  if target_household_id is null then
    raise exception 'card_id must reference an existing coverage card'
      using errcode = '23503';
  end if;

  if TG_OP = 'UPDATE'
    and coalesce(current_setting('famtandem.coverage_request_response', true), '') <> 'on'
    and not public.is_internal_admin()
    and not public.is_household_admin(target_household_id)
  then
    select id
    into current_member_id
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and active = true
    limit 1;

    if current_member_id is null then
      raise exception 'coverage slot update requires household membership'
        using errcode = '42501';
    end if;

    if OLD.state = 'accepted'
      or NEW.state <> 'accepted'
      or NEW.owner_member_id is distinct from current_member_id
      or NEW.card_id is distinct from OLD.card_id
      or NEW.kind is distinct from OLD.kind
      or NEW.external_contact_id is distinct from OLD.external_contact_id
      or NEW.external_owner_text is distinct from OLD.external_owner_text
    then
      raise exception 'members can only accept an unaccepted slot for themselves'
        using errcode = '42501';
    end if;
  end if;

  perform public.assert_household_member_reference(
    NEW.owner_member_id,
    target_household_id,
    'owner_member_id'
  );
  perform public.assert_external_contact_reference(
    NEW.external_contact_id,
    target_household_id,
    'external_contact_id'
  );

  return NEW;
end;
$$;

create or replace function public.create_coverage_request(
  p_card_id uuid,
  p_slot_ids uuid[],
  p_token_hash text,
  p_channel text default 'manual_link',
  p_requested_member_id uuid default null,
  p_requested_external_contact_id uuid default null,
  p_external_display_name text default null,
  p_external_email text default null,
  p_external_phone text default null,
  p_note text default null
)
returns table(
  request_token_id uuid,
  request_ids uuid[],
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member record;
  card_row record;
  selected_slot record;
  recipient_contact_id uuid := p_requested_external_contact_id;
  recipient_label text;
  contact_snapshot jsonb;
  new_request_ids uuid[] := array[]::uuid[];
  new_request_id uuid;
  new_token_id uuid;
  selected_slot_ids uuid[];
  token_expires_at timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then
    raise exception 'create_coverage_request requires authentication' using errcode = '42501';
  end if;

  select household_members.id,
    household_members.household_id,
    household_members.role,
    household_members.display_name
  into current_member
  from public.household_members
  join public.coverage_cards on coverage_cards.household_id = household_members.household_id
  where user_id = auth.uid()
    and coverage_cards.id = p_card_id
    and active = true
  limit 1;

  if current_member.id is null or current_member.role <> 'household_admin' then
    raise exception 'Only household admins can request coverage.' using errcode = '42501';
  end if;

  if p_token_hash is null or length(trim(p_token_hash)) < 32 then
    raise exception 'token hash is required' using errcode = '23502';
  end if;

  if p_channel not in ('sms', 'email', 'manual_link') then
    raise exception 'Unsupported coverage request channel' using errcode = '22023';
  end if;

  selected_slot_ids := array(
    select distinct slot_id
    from unnest(p_slot_ids) as slot_id
    where slot_id is not null
  );

  if array_length(selected_slot_ids, 1) is null
    or array_length(selected_slot_ids, 1) < 1
    or array_length(selected_slot_ids, 1) > 2
  then
    raise exception 'Choose one or two coverage slots.' using errcode = '22023';
  end if;

  select id, household_id, title, starts_at, location
  into card_row
  from public.coverage_cards
  where id = p_card_id
    and household_id = current_member.household_id;

  if card_row.id is null then
    raise exception 'Coverage card not found.' using errcode = '23503';
  end if;

  if array_length(selected_slot_ids, 1) = 2 and not (
    select array_agg(kind order by kind) = array['dropoff', 'pickup']::public.coverage_slot_kind[]
    from public.coverage_slots
    where id = any(selected_slot_ids)
      and card_id = card_row.id
  ) then
    raise exception 'Two-slot requests must be drop-off and pickup on the same card.' using errcode = '22023';
  end if;

  if p_requested_member_id is not null and recipient_contact_id is not null then
    raise exception 'Choose either a household member or an external contact.' using errcode = '22023';
  end if;

  if p_requested_member_id is null and recipient_contact_id is null then
    if nullif(trim(coalesce(p_external_display_name, '')), '') is null then
      raise exception 'Recipient name is required.' using errcode = '23502';
    end if;

    insert into public.external_contacts (
      household_id,
      display_name,
      email,
      phone,
      created_by
    )
    values (
      current_member.household_id,
      trim(p_external_display_name),
      nullif(trim(coalesce(p_external_email, '')), ''),
      nullif(trim(coalesce(p_external_phone, '')), ''),
      current_member.id
    )
    returning id into recipient_contact_id;
  end if;

  if p_requested_member_id is not null then
    select display_name
    into recipient_label
    from public.household_members
    where id = p_requested_member_id
      and household_id = current_member.household_id
      and active = true;

    if recipient_label is null then
      raise exception 'Requested member must belong to this household.' using errcode = '23514';
    end if;
  else
    select display_name
    into recipient_label
    from public.external_contacts
    where id = recipient_contact_id
      and household_id = current_member.household_id
      and active = true;

    if recipient_label is null then
      raise exception 'Requested contact must belong to this household.' using errcode = '23514';
    end if;
  end if;

  contact_snapshot := jsonb_build_object(
    'recipientLabel', recipient_label,
    'recipientType', case when p_requested_member_id is not null then 'household_member' else 'external_contact' end,
    'channel', p_channel
  );

  insert into public.coverage_request_tokens (
    household_id,
    card_id,
    token_hash,
    expires_at,
    created_by,
    request_context_snapshot
  )
  values (
    current_member.household_id,
    card_row.id,
    trim(p_token_hash),
    token_expires_at,
    current_member.id,
    jsonb_build_object(
      'cardTitle', card_row.title,
      'startsAt', card_row.starts_at,
      'location', card_row.location,
      'requesterLabel', current_member.display_name,
      'recipientLabel', recipient_label,
      'channel', p_channel,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  )
  returning id into new_token_id;

  for selected_slot in
    select id, kind, state
    from public.coverage_slots
    where id = any(selected_slot_ids)
      and card_id = card_row.id
    for update
  loop
    if selected_slot.state not in ('needs_coverage', 'declined') then
      raise exception 'Only uncovered or declined slots can be requested.' using errcode = '22023';
    end if;

    insert into public.coverage_requests (
      slot_id,
      request_token_id,
      requested_by,
      requested_member_id,
      requested_external_contact_id,
      contact_snapshot,
      channel,
      status,
      request_note,
      provider
    )
    values (
      selected_slot.id,
      new_token_id,
      current_member.id,
      p_requested_member_id,
      recipient_contact_id,
      contact_snapshot,
      p_channel,
      'pending',
      nullif(trim(coalesce(p_note, '')), ''),
      'local-stub'
    )
    returning id into new_request_id;

    new_request_ids := array_append(new_request_ids, new_request_id);

    update public.coverage_slots
    set state = 'requested',
      owner_member_id = null,
      external_contact_id = null,
      external_owner_text = null,
      updated_at = now()
    where id = selected_slot.id;
  end loop;

  if coalesce(array_length(new_request_ids, 1), 0) <> array_length(selected_slot_ids, 1) then
    raise exception 'All requested slots must belong to the selected card.' using errcode = '23514';
  end if;

  insert into public.card_events (
    household_id,
    card_id,
    actor_member_id,
    event_type,
    metadata
  )
  values (
    current_member.household_id,
    card_row.id,
    current_member.id,
    'coverage_request_created',
    jsonb_build_object(
      'requestTokenId', new_token_id,
      'requestIds', new_request_ids,
      'slotIds', selected_slot_ids,
      'channel', p_channel,
      'recipientType', case when p_requested_member_id is not null then 'household_member' else 'external_contact' end
    )
  );

  perform public.refresh_coverage_card_state(card_row.id);

  request_token_id := new_token_id;
  request_ids := new_request_ids;
  expires_at := token_expires_at;
  return next;
end;
$$;

create or replace function public.get_coverage_request_by_token_hash(p_token_hash text)
returns table(
  token_id uuid,
  token_status text,
  expires_at timestamptz,
  card_id uuid,
  card_title text,
  starts_at timestamptz,
  location text,
  requester_label text,
  recipient_label text,
  note text,
  requests jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row record;
begin
  select
    coverage_request_tokens.id,
    coverage_request_tokens.expires_at,
    coverage_request_tokens.used_at,
    coverage_request_tokens.revoked_at,
    coverage_request_tokens.request_context_snapshot,
    coverage_cards.id as card_id,
    coverage_cards.title,
    coverage_cards.starts_at,
    coverage_cards.location
  into token_row
  from public.coverage_request_tokens
  join public.coverage_cards on coverage_cards.id = coverage_request_tokens.card_id
  where coverage_request_tokens.token_hash = p_token_hash;

  if token_row.id is null then
    token_status := 'invalid';
    return next;
    return;
  end if;

  update public.coverage_request_tokens
  set last_accessed_at = now(),
    updated_at = now()
  where id = token_row.id;

  insert into public.card_events (
    household_id,
    card_id,
    actor_member_id,
    event_type,
    metadata
  )
  values (
    (
      select household_id
      from public.coverage_request_tokens
      where id = token_row.id
    ),
    token_row.card_id,
    null,
    'coverage_request_link_opened',
    jsonb_build_object('requestTokenId', token_row.id)
  );

  token_id := token_row.id;
  token_status := case
    when token_row.revoked_at is not null then 'revoked'
    when token_row.expires_at <= now() then 'expired'
    when token_row.used_at is not null then 'used'
    when not exists (
      select 1
      from public.coverage_requests
      join public.coverage_slots on coverage_slots.id = coverage_requests.slot_id
      where coverage_requests.request_token_id = token_row.id
        and coverage_requests.status = 'pending'
        and coverage_slots.state = 'requested'
    ) then 'used'
    else 'pending'
  end;
  expires_at := token_row.expires_at;
  if token_status = 'pending' then
    card_id := token_row.card_id;
    card_title := token_row.title;
    starts_at := token_row.starts_at;
    location := token_row.location;
    requester_label := coalesce(token_row.request_context_snapshot->>'requesterLabel', 'FamTandem');
    recipient_label := coalesce(token_row.request_context_snapshot->>'recipientLabel', 'you');
    note := token_row.request_context_snapshot->>'note';
    requests := coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'requestId', coverage_requests.id,
            'slotId', coverage_slots.id,
            'slotKind', coverage_slots.kind,
            'slotState', coverage_slots.state,
            'requestStatus', coverage_requests.status
          )
          order by coverage_slots.kind
        )
        from public.coverage_requests
        join public.coverage_slots on coverage_slots.id = coverage_requests.slot_id
        where coverage_requests.request_token_id = token_row.id
          and coverage_requests.status = 'pending'
          and coverage_slots.state = 'requested'
      ),
      '[]'::jsonb
    );
  else
    card_id := null;
    card_title := null;
    starts_at := null;
    location := null;
    requester_label := null;
    recipient_label := null;
    note := null;
    requests := '[]'::jsonb;
  end if;
  return next;
end;
$$;

create or replace function public.respond_to_coverage_request(
  p_token_hash text,
  p_response public.coverage_response_value
)
returns table(
  token_id uuid,
  response_status text,
  card_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row record;
  request_row record;
  should_accept boolean;
  any_pending boolean := false;
  selected_active_count integer := 0;
begin
  perform set_config('famtandem.coverage_request_response', 'on', true);

  select *
  into token_row
  from public.coverage_request_tokens
  where token_hash = p_token_hash
  for update;

  if token_row.id is null then
    response_status := 'invalid';
    return next;
    return;
  end if;

  token_id := token_row.id;
  card_id := token_row.card_id;

  if token_row.revoked_at is not null then
    response_status := 'revoked';
    return next;
    return;
  end if;

  if token_row.expires_at <= now() then
    with expired_requests as (
      update public.coverage_requests
      set status = 'expired',
        updated_at = now()
      where request_token_id = token_row.id
        and status = 'pending'
      returning slot_id
    )
    update public.coverage_slots
    set state = 'needs_coverage',
      owner_member_id = null,
      external_contact_id = null,
      external_owner_text = null,
      updated_at = now()
    where id in (select slot_id from expired_requests)
      and state = 'requested'
      and not exists (
        select 1
        from public.coverage_requests newer_request
        where newer_request.slot_id = coverage_slots.id
          and newer_request.request_token_id <> token_row.id
          and newer_request.status = 'pending'
      );

    perform public.refresh_coverage_card_state(token_row.card_id);
    response_status := 'expired';
    return next;
    return;
  end if;

  if token_row.used_at is not null then
    response_status := 'already_used';
    return next;
    return;
  end if;

  select count(*)
  into selected_active_count
  from public.coverage_requests
  join public.coverage_slots on coverage_slots.id = coverage_requests.slot_id
  where coverage_requests.request_token_id = token_row.id
    and coverage_requests.status = 'pending'
    and coverage_slots.state = 'requested'
    and (
      p_response = 'accept_both'
      or (p_response = 'accept_dropoff' and coverage_slots.kind = 'dropoff')
      or (p_response = 'accept_pickup' and coverage_slots.kind = 'pickup')
      or (
        p_response = 'comment'
        and coverage_slots.kind = 'general_owner'
      )
      or p_response = 'decline'
    );

  for request_row in
    select
      coverage_requests.*,
      coverage_slots.kind as slot_kind,
      coverage_slots.state as slot_state
    from public.coverage_requests
    join public.coverage_slots on coverage_slots.id = coverage_requests.slot_id
    where coverage_requests.request_token_id = token_row.id
    order by coverage_slots.kind
    for update of coverage_requests, coverage_slots
  loop
    if request_row.status <> 'pending' then
      continue;
    end if;

    should_accept := p_response = 'accept_both'
      or (p_response = 'accept_dropoff' and request_row.slot_kind = 'dropoff')
      or (p_response = 'accept_pickup' and request_row.slot_kind = 'pickup')
      or (
        p_response = 'comment'
        and request_row.slot_kind = 'general_owner'
      );

    if request_row.slot_state <> 'requested' then
      update public.coverage_requests
      set status = 'cancelled',
        updated_at = now()
      where id = request_row.id;
      continue;
    end if;

    if p_response in ('accept_dropoff', 'accept_pickup') and selected_active_count = 0 then
      continue;
    end if;

    any_pending := true;

    if should_accept then
      update public.coverage_requests
      set status = 'accepted',
        updated_at = now()
      where id = request_row.id;

      update public.coverage_slots
      set state = 'accepted',
        owner_member_id = request_row.requested_member_id,
        external_contact_id = request_row.requested_external_contact_id,
        external_owner_text = null,
        updated_at = now()
      where id = request_row.slot_id;

      insert into public.coverage_responses (
        request_id,
        responder_identity,
        response,
        raw_payload
      )
      values (
        request_row.id,
        coalesce(request_row.contact_snapshot->>'recipientLabel', 'Coverage recipient'),
        p_response,
        jsonb_build_object('requestTokenId', token_row.id)
      )
      on conflict (request_id) do nothing;
    else
      update public.coverage_requests
      set status = 'declined',
        updated_at = now()
      where id = request_row.id;

      update public.coverage_slots
      set state = 'declined',
        owner_member_id = null,
        external_contact_id = null,
        external_owner_text = null,
        updated_at = now()
      where id = request_row.slot_id;

      insert into public.coverage_responses (
        request_id,
        responder_identity,
        response,
        raw_payload
      )
      values (
        request_row.id,
        coalesce(request_row.contact_snapshot->>'recipientLabel', 'Coverage recipient'),
        'decline',
        jsonb_build_object('requestTokenId', token_row.id)
      )
      on conflict (request_id) do nothing;
    end if;
  end loop;

  if not any_pending then
    response_status := 'already_used';
    return next;
    return;
  end if;

  update public.coverage_request_tokens
  set used_at = now(),
    updated_at = now()
  where id = token_row.id;

  insert into public.card_events (
    household_id,
    card_id,
    actor_member_id,
    event_type,
    metadata
  )
  values (
    token_row.household_id,
    token_row.card_id,
    null,
    case when p_response in ('accept_dropoff', 'accept_pickup', 'accept_both', 'comment')
      then 'coverage_request_accepted'
      else 'coverage_request_declined'
    end,
    jsonb_build_object(
      'requestTokenId', token_row.id,
      'responseValue', p_response
    )
  );

  perform public.refresh_coverage_card_state(token_row.card_id);

  response_status := case when p_response in ('accept_dropoff', 'accept_pickup', 'accept_both', 'comment')
    then 'accepted'
    else 'declined'
  end;
  return next;
end;
$$;

create or replace function public.mark_coverage_request_sent(
  p_request_token_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row record;
begin
  if p_provider <> 'local-stub' then
    raise exception 'Coverage request provider is local-stub only in this slice.' using errcode = '22023';
  end if;

  if p_status not in ('stubbed', 'failed') then
    raise exception 'Unsupported coverage request send status.' using errcode = '22023';
  end if;

  if auth.uid() is null then
    raise exception 'mark_coverage_request_sent requires authentication' using errcode = '42501';
  end if;

  select coverage_request_tokens.id, coverage_request_tokens.household_id, coverage_request_tokens.card_id
  into token_row
  from public.coverage_request_tokens
  join public.household_members on household_members.household_id = coverage_request_tokens.household_id
  where coverage_request_tokens.id = p_request_token_id
    and household_members.user_id = auth.uid()
    and household_members.active = true
    and household_members.role = 'household_admin';

  if token_row.id is null then
    raise exception 'Coverage request token not found.' using errcode = '23503';
  end if;

  update public.coverage_requests
  set attempt_count = case
      when provider_message_id is distinct from p_provider_message_id then attempt_count + 1
      else attempt_count
    end,
    provider = p_provider,
    provider_message_id = p_provider_message_id,
    updated_at = now()
  where request_token_id = token_row.id;

  insert into public.card_events (
    household_id,
    card_id,
    actor_member_id,
    event_type,
    metadata
  )
  select
    token_row.household_id,
    token_row.card_id,
    household_members.id,
    'coverage_request_send_stubbed',
    jsonb_build_object(
      'requestTokenId', token_row.id,
      'provider', p_provider,
      'status', p_status
    )
  from public.household_members
  where household_members.user_id = auth.uid()
    and household_members.household_id = token_row.household_id
    and household_members.active = true
  limit 1;
end;
$$;

revoke all on table public.coverage_request_tokens from public;
revoke all on table public.coverage_request_tokens from anon;
revoke all on table public.coverage_request_tokens from authenticated;

revoke all on function public.refresh_coverage_card_state(uuid) from public;
revoke all on function public.refresh_coverage_card_state(uuid) from anon;
revoke all on function public.refresh_coverage_card_state(uuid) from authenticated;
grant execute on function public.refresh_coverage_card_state(uuid) to service_role;

revoke all on function public.validate_coverage_request_token_household_refs() from public;
revoke all on function public.validate_coverage_request_token_household_refs() from anon;
revoke all on function public.validate_coverage_request_token_household_refs() from authenticated;

revoke all on function public.validate_coverage_request_household_refs() from public;
revoke all on function public.validate_coverage_request_household_refs() from anon;
revoke all on function public.validate_coverage_request_household_refs() from authenticated;

revoke all on function public.create_coverage_request(uuid, uuid[], text, text, uuid, uuid, text, text, text, text) from public;
revoke all on function public.create_coverage_request(uuid, uuid[], text, text, uuid, uuid, text, text, text, text) from anon;
grant execute on function public.create_coverage_request(uuid, uuid[], text, text, uuid, uuid, text, text, text, text) to authenticated;

revoke all on function public.get_coverage_request_by_token_hash(text) from public;
revoke all on function public.get_coverage_request_by_token_hash(text) from anon;
revoke all on function public.get_coverage_request_by_token_hash(text) from authenticated;
grant execute on function public.get_coverage_request_by_token_hash(text) to service_role;

revoke all on function public.respond_to_coverage_request(text, public.coverage_response_value) from public;
revoke all on function public.respond_to_coverage_request(text, public.coverage_response_value) from anon;
revoke all on function public.respond_to_coverage_request(text, public.coverage_response_value) from authenticated;
grant execute on function public.respond_to_coverage_request(text, public.coverage_response_value) to service_role;

revoke all on function public.mark_coverage_request_sent(uuid, text, text, text) from public;
revoke all on function public.mark_coverage_request_sent(uuid, text, text, text) from anon;
grant execute on function public.mark_coverage_request_sent(uuid, text, text, text) to authenticated;
