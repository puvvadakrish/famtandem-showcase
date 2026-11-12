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
  if p_provider not in ('local-stub', 'resend') then
    raise exception 'Unsupported coverage request provider.' using errcode = '22023';
  end if;

  if p_status not in ('stubbed', 'sent', 'failed') then
    raise exception 'Unsupported coverage request send status.' using errcode = '22023';
  end if;

  if p_provider = 'local-stub' and p_status not in ('stubbed', 'failed') then
    raise exception 'Unsupported local coverage request send status.' using errcode = '22023';
  end if;

  if p_provider = 'resend' and p_status not in ('sent', 'failed') then
    raise exception 'Unsupported Resend coverage request send status.' using errcode = '22023';
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
      when p_status = 'failed' then attempt_count + 1
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
    case
      when p_status = 'failed' then 'coverage_request_send_failed'
      when p_provider = 'local-stub' then 'coverage_request_send_stubbed'
      else 'coverage_request_sent'
    end,
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

revoke all on function public.mark_coverage_request_sent(uuid, text, text, text) from public;
revoke all on function public.mark_coverage_request_sent(uuid, text, text, text) from anon;
grant execute on function public.mark_coverage_request_sent(uuid, text, text, text) to authenticated;
