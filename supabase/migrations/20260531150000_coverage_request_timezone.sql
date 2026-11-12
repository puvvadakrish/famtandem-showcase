drop function if exists public.get_coverage_request_by_token_hash(text);

create function public.get_coverage_request_by_token_hash(p_token_hash text)
returns table(
  token_id uuid,
  token_status text,
  expires_at timestamptz,
  card_id uuid,
  card_title text,
  starts_at timestamptz,
  household_timezone text,
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
    coverage_cards.location,
    households.timezone as household_timezone
  into token_row
  from public.coverage_request_tokens
  join public.coverage_cards on coverage_cards.id = coverage_request_tokens.card_id
  join public.households on households.id = coverage_cards.household_id
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
    household_timezone := token_row.household_timezone;
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
    household_timezone := null;
    location := null;
    requester_label := null;
    recipient_label := null;
    note := null;
    requests := '[]'::jsonb;
  end if;
  return next;
end;
$$;

revoke all on function public.get_coverage_request_by_token_hash(text) from public;
revoke all on function public.get_coverage_request_by_token_hash(text) from anon;
revoke all on function public.get_coverage_request_by_token_hash(text) from authenticated;
grant execute on function public.get_coverage_request_by_token_hash(text) to service_role;
