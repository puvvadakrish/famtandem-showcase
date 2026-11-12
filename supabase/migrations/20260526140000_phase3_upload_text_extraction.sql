alter table public.source_artifacts
add column finalized_at timestamptz,
add column text_extracted_at timestamptz,
add column text_extraction_error text;

create or replace function public.enqueue_source_input_extraction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
begin
  insert into public.extraction_runs (
    household_id,
    source_input_id,
    provider,
    model,
    schema_version,
    status
  )
  values (
    NEW.household_id,
    NEW.id,
    'local-stub',
    'local-stub-v1',
    'family-logistics-v1',
    'pending'
  )
  on conflict (source_input_id) do nothing
  returning id into new_run_id;

  if new_run_id is null then
    return NEW;
  end if;

  if NEW.source_type = 'upload' and nullif(trim(coalesce(NEW.normalized_text, '')), '') is null then
    return NEW;
  end if;

  insert into public.jobs (kind, payload)
  values (
    'extract_source',
    jsonb_build_object(
      'extraction_run_id', new_run_id,
      'source_input_id', NEW.id,
      'household_id', NEW.household_id,
      'source_type', NEW.source_type
    )
  );

  return NEW;
end;
$$;

revoke all on function public.enqueue_source_input_extraction() from public;
revoke all on function public.enqueue_source_input_extraction() from anon;
revoke all on function public.enqueue_source_input_extraction() from authenticated;

create or replace function public.finalize_upload_source_artifact(
  p_source_input_id uuid,
  p_source_artifact_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  artifact_row record;
begin
  if auth.uid() is null then
    raise exception 'finalize_upload_source_artifact requires authentication'
      using errcode = '42501';
  end if;

  select source_artifacts.*
  into artifact_row
  from public.source_artifacts
  join public.source_inputs
    on source_inputs.id = source_artifacts.source_input_id
  where source_artifacts.id = p_source_artifact_id
    and source_artifacts.source_input_id = p_source_input_id
    and source_inputs.source_type = 'upload'
  for update of source_artifacts;

  if artifact_row.id is null then
    raise exception 'upload source artifact not found'
      using errcode = '23503';
  end if;

  if not public.is_household_admin(artifact_row.household_id) then
    raise exception 'Only household admins can finalize upload source artifacts'
      using errcode = '42501';
  end if;

  if artifact_row.text_extraction_status not in ('not_started', 'failed') then
    return;
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = artifact_row.storage_bucket
      and name = artifact_row.storage_path
  ) then
    raise exception 'uploaded artifact object is not available'
      using errcode = '23503';
  end if;

  update public.source_artifacts
  set text_extraction_status = 'pending',
      text_extraction_error = null,
      finalized_at = coalesce(finalized_at, now()),
      updated_at = now()
  where id = artifact_row.id;

  insert into public.jobs (kind, payload)
  select
    'extract_artifact_text',
    jsonb_build_object(
      'source_artifact_id', artifact_row.id,
      'source_input_id', artifact_row.source_input_id,
      'household_id', artifact_row.household_id
    )
  where not exists (
    select 1
    from public.jobs
    where kind = 'extract_artifact_text'
      and status in ('pending', 'running')
      and payload->>'source_artifact_id' = artifact_row.id::text
  );
end;
$$;

revoke all on function public.finalize_upload_source_artifact(uuid, uuid) from public;
revoke all on function public.finalize_upload_source_artifact(uuid, uuid) from anon;
grant execute on function public.finalize_upload_source_artifact(uuid, uuid) to authenticated;

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
  target_run record;
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
  set text_extraction_status = p_status,
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
      status = 'pending',
      updated_at = now()
  where id = artifact_row.source_input_id;

  select *
  into target_run
  from public.extraction_runs
  where source_input_id = artifact_row.source_input_id
    and card_count = 0
  limit 1
  for update;

  if target_run.id is null then
    return;
  end if;

  update public.extraction_runs
  set status = 'pending',
      last_error = null,
      updated_at = now()
  where id = target_run.id
    and card_count = 0;

  insert into public.jobs (kind, payload)
  select
    'extract_source',
    jsonb_build_object(
      'extraction_run_id', target_run.id,
      'source_input_id', artifact_row.source_input_id,
      'household_id', artifact_row.household_id,
      'source_type', 'upload'
    )
  where not exists (
    select 1
    from public.jobs
    where kind = 'extract_source'
      and status in ('pending', 'running')
      and payload->>'extraction_run_id' = target_run.id::text
  );
end;
$$;

revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from public;
revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from anon;
revoke all on function public.record_artifact_text_extraction(uuid, text, text, text) from authenticated;
grant execute on function public.record_artifact_text_extraction(uuid, text, text, text) to service_role;
