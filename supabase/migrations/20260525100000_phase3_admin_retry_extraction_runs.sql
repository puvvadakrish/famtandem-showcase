create or replace function public.retry_failed_extraction_run(p_run_id uuid)
returns table(extraction_run_id uuid, job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.is_internal_admin() then
    raise exception 'Only internal admins can retry extraction runs' using errcode = '42501';
  end if;

  select
    extraction_runs.id,
    extraction_runs.household_id,
    extraction_runs.source_input_id,
    extraction_runs.status,
    source_inputs.source_type
  into run_row
  from public.extraction_runs
  join public.source_inputs on source_inputs.id = extraction_runs.source_input_id
  where extraction_runs.id = p_run_id
  for update of extraction_runs;

  if not found then
    raise exception 'extraction_run_id % does not exist', p_run_id using errcode = '23503';
  end if;

  if run_row.status <> 'failed'::public.extraction_run_status then
    raise exception 'Only failed extraction runs can be retried' using errcode = '22023';
  end if;

  update public.extraction_runs
  set status = 'pending',
      last_error = null,
      updated_at = now()
  where id = run_row.id;

  insert into public.jobs (kind, payload)
  select
    'extract_source',
    jsonb_build_object(
      'extraction_run_id', run_row.id,
      'source_input_id', run_row.source_input_id,
      'household_id', run_row.household_id,
      'source_type', run_row.source_type
    )
  where not exists (
    select 1
    from public.jobs
    where jobs.kind = 'extract_source'
      and jobs.status in ('pending', 'running')
      and jobs.payload->>'extraction_run_id' = run_row.id::text
  )
  returning id into job_id;

  if job_id is null then
    select jobs.id
    into job_id
    from public.jobs
    where jobs.kind = 'extract_source'
      and jobs.status in ('pending', 'running')
      and jobs.payload->>'extraction_run_id' = run_row.id::text
    order by jobs.created_at asc
    limit 1;
  end if;

  extraction_run_id := run_row.id;
  return next;
end;
$$;

revoke all on function public.retry_failed_extraction_run(uuid) from public;
revoke all on function public.retry_failed_extraction_run(uuid) from anon;
revoke all on function public.retry_failed_extraction_run(uuid) from authenticated;
grant execute on function public.retry_failed_extraction_run(uuid) to authenticated;
