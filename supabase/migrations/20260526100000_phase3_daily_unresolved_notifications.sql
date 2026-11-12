create type public.notification_run_status as enum (
  'pending',
  'running',
  'sent',
  'failed',
  'skipped_empty'
);

create type public.notification_type as enum (
  'daily_unresolved',
  'weekly_coverage_review'
);

create table public.household_notification_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  daily_unresolved_enabled boolean not null default false,
  weekly_coverage_review_enabled boolean not null default false,
  daily_send_hour_local integer not null default 6,
  weekly_send_weekday integer not null default 0,
  weekly_send_hour_local integer not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_notification_settings_daily_hour_check check (
    daily_send_hour_local between 0 and 23
  ),
  constraint household_notification_settings_weekly_hour_check check (
    weekly_send_hour_local between 0 and 23
  ),
  constraint household_notification_settings_weekday_check check (
    weekly_send_weekday between 0 and 6
  )
);

create table public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_member_id uuid not null references public.household_members(id) on delete cascade,
  notification_type public.notification_type not null,
  local_date date,
  period_start date,
  period_end date,
  status public.notification_run_status not null default 'pending',
  provider text not null default 'local-stub',
  provider_message_id text,
  attempt_count integer not null default 0,
  processing_token uuid,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_runs_daily_date_check check (
    notification_type <> 'daily_unresolved'
    or local_date is not null
  ),
  constraint notification_runs_weekly_period_check check (
    notification_type <> 'weekly_coverage_review'
    or (period_start is not null and period_end is not null)
  )
);

create unique index notification_runs_daily_unique_idx
on public.notification_runs(household_id, recipient_member_id, notification_type, local_date)
where notification_type = 'daily_unresolved';

create unique index notification_runs_weekly_unique_idx
on public.notification_runs(household_id, recipient_member_id, notification_type, period_start)
where notification_type = 'weekly_coverage_review';

create index notification_runs_status_idx
on public.notification_runs(status);

create index notification_runs_household_id_idx
on public.notification_runs(household_id);

create or replace function public.validate_notification_run_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.household_members
    where id = NEW.recipient_member_id
      and household_id = NEW.household_id
  ) then
    raise exception 'recipient_member_id must belong to the notification household'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.validate_notification_run_household_refs() from public;
revoke all on function public.validate_notification_run_household_refs() from anon;
revoke all on function public.validate_notification_run_household_refs() from authenticated;

create trigger notification_runs_validate_household_refs
before insert or update on public.notification_runs
for each row execute function public.validate_notification_run_household_refs();

alter table public.household_notification_settings enable row level security;
alter table public.notification_runs enable row level security;

create policy "internal admins can read household notification settings"
on public.household_notification_settings for select
using (public.is_internal_admin());

create policy "internal admins can read notification runs"
on public.notification_runs for select
using (public.is_internal_admin());

create or replace function public.enqueue_daily_notification_run(
  p_household_id uuid,
  p_recipient_member_id uuid,
  p_local_date date
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
  insert into public.notification_runs (
    household_id,
    recipient_member_id,
    notification_type,
    local_date,
    status
  )
  values (
    p_household_id,
    p_recipient_member_id,
    'daily_unresolved',
    p_local_date,
    'pending'
  )
  on conflict (household_id, recipient_member_id, notification_type, local_date)
    where notification_type = 'daily_unresolved'
  do nothing
  returning id into target_run_id;

  inserted_run := target_run_id is not null;

  if target_run_id is null then
    select id
    into target_run_id
    from public.notification_runs
    where household_id = p_household_id
      and recipient_member_id = p_recipient_member_id
      and notification_type = 'daily_unresolved'
      and local_date = p_local_date
    limit 1
    for update;
  end if;

  if target_run_id is null then
    raise exception 'Unable to find or create daily notification run'
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
  where jobs.kind = 'send_daily_unresolved_nudge'
    and jobs.status in ('pending', 'running')
    and jobs.payload->>'notification_run_id' = target_run_id::text
  order by jobs.created_at asc
  limit 1;

  if target_job_id is null then
    insert into public.jobs (kind, payload)
    values (
      'send_daily_unresolved_nudge',
      jsonb_build_object('notification_run_id', target_run_id)
    )
    returning id into target_job_id;

    return query select target_run_id, target_job_id, inserted_run, true;
    return;
  end if;

  return query select target_run_id, target_job_id, inserted_run, false;
end;
$$;

revoke all on function public.enqueue_daily_notification_run(uuid, uuid, date) from public;
revoke all on function public.enqueue_daily_notification_run(uuid, uuid, date) from anon;
revoke all on function public.enqueue_daily_notification_run(uuid, uuid, date) from authenticated;
grant execute on function public.enqueue_daily_notification_run(uuid, uuid, date) to service_role;

create or replace function public.start_notification_run(p_run_id uuid)
returns table(
  id uuid,
  household_id uuid,
  recipient_member_id uuid,
  status public.notification_run_status,
  local_date date,
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
            notification_runs.attempt_count,
            notification_runs.processing_token;
end;
$$;

revoke all on function public.start_notification_run(uuid) from public;
revoke all on function public.start_notification_run(uuid) from anon;
revoke all on function public.start_notification_run(uuid) from authenticated;
grant execute on function public.start_notification_run(uuid) to service_role;

create or replace function public.record_notification_run(
  p_run_id uuid,
  p_processing_token uuid,
  p_status public.notification_run_status,
  p_provider text,
  p_provider_message_id text default null,
  p_last_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped_empty') then
    raise exception 'record_notification_run only accepts terminal status, got %', p_status
      using errcode = '22023';
  end if;

  update public.notification_runs
  set status = p_status,
      provider = nullif(trim(coalesce(p_provider, '')), ''),
      provider_message_id = nullif(trim(coalesce(p_provider_message_id, '')), ''),
      last_error = nullif(trim(coalesce(p_last_error, '')), ''),
      metadata = coalesce(p_metadata, '{}'::jsonb),
      processing_token = null,
      updated_at = now()
  where id = p_run_id
    and status = 'running'
    and processing_token = p_processing_token;

  if not found then
    raise exception 'notification run % is not recordable for this processing token', p_run_id
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.record_notification_run(
  uuid,
  uuid,
  public.notification_run_status,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function public.record_notification_run(
  uuid,
  uuid,
  public.notification_run_status,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function public.record_notification_run(
  uuid,
  uuid,
  public.notification_run_status,
  text,
  text,
  text,
  jsonb
) from authenticated;
grant execute on function public.record_notification_run(
  uuid,
  uuid,
  public.notification_run_status,
  text,
  text,
  text,
  jsonb
) to service_role;
