create or replace function public.record_artifact_text_extraction(
  p_source_artifact_id uuid,
  p_status text,
  p_normalized_text text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  artifact_row record;
  text_value text := nullif(trim(coalesce(p_normalized_text, '')), '');
begin
  if p_status not in ('succeeded', 'failed', 'needs_review', 'not_applicable') then
    raise exception 'unsupported artifact text extraction status'
      using errcode = '22023';
  end if;

  select *
  into artifact_row
  from public.source_artifacts
  where id = p_source_artifact_id
  for update;

  if artifact_row.id is null then
    raise exception 'source artifact not found'
      using errcode = '23503';
  end if;

  if artifact_row.text_extraction_status in ('succeeded', 'needs_review', 'not_applicable') then
    return;
  end if;

  if p_status = 'succeeded' and text_value is null then
    raise exception 'successful text extraction requires normalized text'
      using errcode = '23502';
  end if;

  update public.source_artifacts
  set text_extraction_status = case
        when p_status = 'succeeded' then 'needs_review'
        else p_status
      end,
      text_extraction_error = case when p_status = 'succeeded' then null else nullif(trim(coalesce(p_error, '')), '') end,
      text_extracted_at = case when p_status = 'succeeded' then now() else text_extracted_at end,
      updated_at = now()
  where id = artifact_row.id;

  if p_status <> 'succeeded' then
    update public.source_inputs
    set status = 'needs_review',
        updated_at = now()
    where id = artifact_row.source_input_id;

    update public.extraction_runs
    set status = 'skipped_no_text',
        no_action_reason = coalesce(nullif(trim(coalesce(p_error, '')), ''), 'upload artifact text extraction did not produce text'),
        finished_at = now(),
        updated_at = now()
    where source_input_id = artifact_row.source_input_id
      and card_count = 0
      and status in ('pending', 'running', 'failed', 'skipped_no_text');
    return;
  end if;

  update public.source_inputs
  set normalized_text = text_value,
      status = 'needs_review',
      updated_at = now()
  where id = artifact_row.source_input_id;

  update public.extraction_runs
  set status = 'skipped_no_text',
      no_action_reason = 'upload artifact text is awaiting parent review before card creation',
      finished_at = now(),
      updated_at = now()
  where source_input_id = artifact_row.source_input_id
    and card_count = 0
    and status in ('pending', 'running', 'failed', 'skipped_no_text');
end;
$$;

revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from public;
revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from anon;
revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from authenticated;
grant execute on function public.record_artifact_text_extraction(uuid, text, text, text) to service_role;

create or replace function public.approve_upload_extracted_text(
  p_source_input_id uuid,
  p_source_artifact_id uuid,
  p_approved_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row record;
  artifact_row record;
  target_run record;
  text_value text := nullif(trim(coalesce(p_approved_text, '')), '');
begin
  if auth.uid() is null then
    raise exception 'approve_upload_extracted_text requires authentication'
      using errcode = '42501';
  end if;

  if text_value is null then
    raise exception 'approved text is required'
      using errcode = '23514';
  end if;

  select *
  into source_row
  from public.source_inputs
  where id = p_source_input_id
  for update;

  if source_row.id is null or source_row.source_type <> 'upload' then
    raise exception 'upload source input not found'
      using errcode = '23503';
  end if;

  if not public.is_household_parent_or_admin(source_row.household_id)
    and not public.is_internal_admin()
  then
    raise exception 'only parents and household admins can approve extracted upload text'
      using errcode = '42501';
  end if;

  select *
  into artifact_row
  from public.source_artifacts
  where id = p_source_artifact_id
    and source_input_id = p_source_input_id
    and household_id = source_row.household_id
  for update;

  if artifact_row.id is null then
    raise exception 'source artifact not found for upload source'
      using errcode = '23503';
  end if;

  select *
  into target_run
  from public.extraction_runs
  where source_input_id = p_source_input_id
    and household_id = source_row.household_id
    and card_count = 0
  limit 1
  for update;

  if target_run.id is null then
    raise exception 'source extraction run not found'
      using errcode = '23503';
  end if;

  if artifact_row.text_extraction_status = 'succeeded'
    and source_row.status = 'pending'
    and target_run.status in ('pending', 'running')
    and target_run.card_count = 0
  then
    return target_run.id;
  end if;

  if artifact_row.text_extraction_status <> 'needs_review'
    or nullif(trim(coalesce(source_row.normalized_text, '')), '') is null
    or source_row.status <> 'needs_review'
    or target_run.status <> 'skipped_no_text'
    or target_run.no_action_reason <> 'upload artifact text is awaiting parent review before card creation'
  then
    raise exception 'upload artifact text is not awaiting approval'
      using errcode = '23514';
  end if;

  update public.source_inputs
  set normalized_text = text_value,
      status = 'pending',
      updated_at = now()
  where id = p_source_input_id;

  update public.source_artifacts
  set text_extraction_status = 'succeeded',
      text_extraction_error = null,
      text_extracted_at = coalesce(text_extracted_at, now()),
      updated_at = now()
  where id = p_source_artifact_id;

  update public.extraction_runs
  set status = 'pending',
      last_error = null,
      no_action_reason = null,
      finished_at = null,
      updated_at = now()
  where id = target_run.id
    and card_count = 0;

  insert into public.jobs (kind, payload)
  select
    'extract_source',
    jsonb_build_object(
      'extraction_run_id', target_run.id,
      'source_input_id', p_source_input_id,
      'household_id', source_row.household_id,
      'source_type', 'upload'
    )
  where not exists (
    select 1
    from public.jobs
    where kind = 'extract_source'
      and status in ('pending', 'running')
      and payload->>'extraction_run_id' = target_run.id::text
  );

  return target_run.id;
end;
$$;

revoke all on function public.approve_upload_extracted_text(uuid, uuid, text) from public;
revoke all on function public.approve_upload_extracted_text(uuid, uuid, text) from anon;
grant execute on function public.approve_upload_extracted_text(uuid, uuid, text) to authenticated;
