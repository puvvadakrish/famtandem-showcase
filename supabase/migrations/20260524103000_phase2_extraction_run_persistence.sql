create type public.extraction_run_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped_no_text'
);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_input_id uuid not null references public.source_inputs(id) on delete cascade,
  provider text not null default 'local-stub',
  model text not null default 'local-stub-v1',
  schema_version text not null default 'family-logistics-v1',
  prompt_version text,
  status public.extraction_run_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  review_reasons jsonb not null default '[]'::jsonb,
  raw_output jsonb,
  no_action_reason text,
  card_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index extraction_runs_source_input_id_unique
on public.extraction_runs(source_input_id);

create index extraction_runs_household_id_idx on public.extraction_runs(household_id);
create index extraction_runs_status_idx on public.extraction_runs(status);

alter table public.extraction_runs enable row level security;

create policy "parents and household admins can read extraction runs"
on public.extraction_runs for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_members.household_id = extraction_runs.household_id
      and household_members.user_id = auth.uid()
      and household_members.role in ('parent', 'household_admin')
      and household_members.active = true
  )
);

create or replace function public.validate_extraction_run_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_household_id uuid;
begin
  select household_id
  into source_household_id
  from public.source_inputs
  where id = NEW.source_input_id;

  if source_household_id is null then
    raise exception 'source_input_id must reference an existing source input'
      using errcode = '23503';
  end if;

  if source_household_id <> NEW.household_id then
    raise exception 'extraction_runs.household_id must match source input household'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.validate_extraction_run_household() from public;
revoke all on function public.validate_extraction_run_household() from anon;
revoke all on function public.validate_extraction_run_household() from authenticated;

create trigger extraction_runs_validate_household
before insert or update on public.extraction_runs
for each row execute function public.validate_extraction_run_household();

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

create trigger source_inputs_enqueue_extraction
after insert on public.source_inputs
for each row execute function public.enqueue_source_input_extraction();

create or replace function public.start_extraction_run(p_run_id uuid)
returns table(
  id uuid,
  household_id uuid,
  source_input_id uuid,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.extraction_runs
  set status = 'running',
      attempts = extraction_runs.attempts + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now(),
      last_error = null
  where extraction_runs.id = p_run_id
    and extraction_runs.status in ('pending', 'running', 'failed')
  returning extraction_runs.id,
            extraction_runs.household_id,
            extraction_runs.source_input_id,
            extraction_runs.attempts,
            extraction_runs.max_attempts;
end;
$$;

revoke all on function public.start_extraction_run(uuid) from public;
revoke all on function public.start_extraction_run(uuid) from anon;
revoke all on function public.start_extraction_run(uuid) from authenticated;
grant execute on function public.start_extraction_run(uuid) to service_role;

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
