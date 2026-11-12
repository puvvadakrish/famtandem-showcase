create or replace function public.enqueue_weekly_notification_run(
  p_household_id uuid,
  p_recipient_member_id uuid,
  p_period_start date,
  p_period_end date
)
returns table(run_id uuid, job_id uuid, created_run boolean, created_job boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run_id uuid;
  target_job_id uuid;
  inserted_run boolean := false;
begin
  if not exists (
    select 1
    from public.household_members
    where id = p_recipient_member_id
      and household_id = p_household_id
      and active = true
      and user_id is not null
      and email is not null
      and role in ('parent', 'household_admin')
  ) then
    raise exception 'weekly notification recipient must be an active parent or household admin'
      using errcode = '23514';
  end if;

  insert into public.notification_runs (
    household_id,
    recipient_member_id,
    notification_type,
    period_start,
    period_end,
    status
  )
  values (
    p_household_id,
    p_recipient_member_id,
    'weekly_coverage_review',
    p_period_start,
    p_period_end,
    'pending'
  )
  on conflict (household_id, recipient_member_id, notification_type, period_start)
    where notification_type = 'weekly_coverage_review'
  do nothing
  returning id into target_run_id;

  inserted_run := target_run_id is not null;

  if target_run_id is null then
    select id
    into target_run_id
    from public.notification_runs
    where household_id = p_household_id
      and recipient_member_id = p_recipient_member_id
      and notification_type = 'weekly_coverage_review'
      and period_start = p_period_start
    limit 1
    for update;
  end if;

  if target_run_id is null then
    raise exception 'Unable to find or create weekly notification run'
      using errcode = '23503';
  end if;

  perform 1
  from public.notification_runs
  where id = target_run_id
  for update;

  if exists (
    select 1
    from public.notification_runs
    where id = target_run_id
      and status in ('sent', 'skipped_empty', 'failed')
  ) then
    return query select target_run_id, null::uuid, inserted_run, false;
    return;
  end if;

  select jobs.id
  into target_job_id
  from public.jobs
  where jobs.kind = 'send_weekly_coverage_review'
    and jobs.status in ('pending', 'running')
    and jobs.payload->>'notification_run_id' = target_run_id::text
  order by jobs.created_at asc
  limit 1;

  if target_job_id is null then
    insert into public.jobs (kind, payload)
    values (
      'send_weekly_coverage_review',
      jsonb_build_object('notification_run_id', target_run_id)
    )
    returning id into target_job_id;

    return query select target_run_id, target_job_id, inserted_run, true;
    return;
  end if;

  return query select target_run_id, target_job_id, inserted_run, false;
end;
$$;

revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from public;
revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from anon;
revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from authenticated;
grant execute on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) to service_role;

drop function public.start_notification_run(uuid);

create or replace function public.start_notification_run(p_run_id uuid)
returns table(
  id uuid,
  household_id uuid,
  recipient_member_id uuid,
  status public.notification_run_status,
  local_date date,
  period_start date,
  period_end date,
  metadata jsonb,
  attempt_count integer,
  processing_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_processing_token uuid := gen_random_uuid();
begin
  return query
  update public.notification_runs
  set status = 'running',
      attempt_count = notification_runs.attempt_count + 1,
      processing_token = new_processing_token,
      last_error = null,
      updated_at = now()
  where notification_runs.id = p_run_id
    and (
      notification_runs.status in ('pending', 'failed')
      or (
        notification_runs.status = 'running'
        and notification_runs.updated_at < now() - interval '15 minutes'
      )
    )
  returning notification_runs.id,
            notification_runs.household_id,
            notification_runs.recipient_member_id,
            notification_runs.status,
            notification_runs.local_date,
            notification_runs.period_start,
            notification_runs.period_end,
            notification_runs.metadata,
            notification_runs.attempt_count,
            notification_runs.processing_token;
end;
$$;

revoke all on function public.start_notification_run(uuid) from public;
revoke all on function public.start_notification_run(uuid) from anon;
revoke all on function public.start_notification_run(uuid) from authenticated;
grant execute on function public.start_notification_run(uuid) to service_role;

create or replace function public.snapshot_weekly_notification_run(
  p_run_id uuid,
  p_processing_token uuid,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_runs
  set metadata = coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
  where id = p_run_id
    and notification_type = 'weekly_coverage_review'
    and status = 'running'
    and processing_token = p_processing_token;

  if not found then
    raise exception 'weekly notification run % is not snapshotable for this processing token', p_run_id
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.snapshot_weekly_notification_run(uuid, uuid, jsonb) from public;
revoke all on function public.snapshot_weekly_notification_run(uuid, uuid, jsonb) from anon;
revoke all on function public.snapshot_weekly_notification_run(uuid, uuid, jsonb) from authenticated;
grant execute on function public.snapshot_weekly_notification_run(uuid, uuid, jsonb) to service_role;
