create or replace function public.create_paste_source_input(
  p_pasted_text text,
  p_raw_subject text default 'Pasted logistics'
)
returns table(source_input_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member record;
  created_source_input_id uuid;
  normalized_pasted_text text := nullif(trim(coalesce(p_pasted_text, '')), '');
  normalized_raw_subject text := coalesce(nullif(trim(coalesce(p_raw_subject, '')), ''), 'Pasted logistics');
begin
  if auth.uid() is null then
    raise exception 'create_paste_source_input requires authentication'
      using errcode = '42501';
  end if;

  if normalized_pasted_text is null then
    raise exception 'pasted text is required'
      using errcode = '23502';
  end if;

  select id, household_id
  into current_member
  from public.household_members
  where user_id = auth.uid()
    and role = 'household_admin'
    and active = true
  order by created_at
  limit 1;

  if current_member.id is null then
    raise exception 'Only household admins can create pasted sources'
      using errcode = '42501';
  end if;

  insert into public.source_inputs (
    household_id,
    submitted_by,
    source_type,
    raw_subject,
    normalized_text,
    status
  )
  values (
    current_member.household_id,
    current_member.id,
    'paste',
    normalized_raw_subject,
    normalized_pasted_text,
    'pending'
  )
  returning id into created_source_input_id;

  return query select created_source_input_id;
end;
$$;

revoke all on function public.create_paste_source_input(text, text) from public;
revoke all on function public.create_paste_source_input(text, text) from anon;
revoke all on function public.create_paste_source_input(text, text) from authenticated;
grant execute on function public.create_paste_source_input(text, text) to authenticated;

revoke all on function public.create_paste_source_card(
  text,
  text,
  text,
  public.card_type,
  public.coverage_slot_kind,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  timestamptz,
  numeric
) from authenticated;

create or replace function public.record_extraction_run(
  p_run_id uuid,
  p_status public.extraction_run_status,
  p_review_reasons jsonb default '[]'::jsonb,
  p_raw_output jsonb default null,
  p_no_action_reason text default null,
  p_card_count integer default 0,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  synced_source_status public.source_input_status;
begin
  if p_status not in ('succeeded', 'failed', 'skipped_no_text') then
    raise exception 'record_extraction_run only accepts terminal-or-failed status, got %', p_status
      using errcode = '22023';
  end if;

  update public.extraction_runs
  set status = p_status,
      review_reasons = coalesce(p_review_reasons, '[]'::jsonb),
      raw_output = p_raw_output,
      no_action_reason = nullif(trim(coalesce(p_no_action_reason, '')), ''),
      card_count = greatest(coalesce(p_card_count, 0), 0),
      last_error = case
        when p_status = 'failed' then nullif(trim(coalesce(p_last_error, '')), '')
        else null
      end,
      finished_at = case
        when p_status in ('succeeded', 'skipped_no_text') then now()
        else finished_at
      end,
      updated_at = now()
  where id = p_run_id;

  if p_status = 'failed' then
    synced_source_status := 'failed';
  elsif p_status = 'skipped_no_text' or greatest(coalesce(p_card_count, 0), 0) = 0 then
    synced_source_status := 'needs_review';
  else
    synced_source_status := 'processed';
  end if;

  update public.source_inputs
  set status = synced_source_status,
      updated_at = now()
  where id = (
    select source_input_id
    from public.extraction_runs
    where extraction_runs.id = p_run_id
  );
end;
$$;

revoke all on function public.record_extraction_run(
  uuid,
  public.extraction_run_status,
  jsonb,
  jsonb,
  text,
  integer,
  text
) from public;
revoke all on function public.record_extraction_run(
  uuid,
  public.extraction_run_status,
  jsonb,
  jsonb,
  text,
  integer,
  text
) from anon;
revoke all on function public.record_extraction_run(
  uuid,
  public.extraction_run_status,
  jsonb,
  jsonb,
  text,
  integer,
  text
) from authenticated;
grant execute on function public.record_extraction_run(
  uuid,
  public.extraction_run_status,
  jsonb,
  jsonb,
  text,
  integer,
  text
) to service_role;
