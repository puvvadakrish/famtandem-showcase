create extension if not exists pgcrypto;

create type public.household_role as enum ('parent', 'helper', 'household_admin');
create type public.job_status as enum ('pending', 'running', 'succeeded', 'failed');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Chicago',
  cohort_label text,
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role public.household_role not null default 'parent',
  display_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_members_household_id_idx on public.household_members(household_id);
create index household_members_user_id_idx on public.household_members(user_id);
create unique index household_members_household_user_unique_idx
on public.household_members(household_id, user_id)
where user_id is not null;

create table public.cohort_consents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  version text not null,
  accepted_at timestamptz not null default now(),
  sensitive_data_warning_acknowledged boolean not null default false
);

create index cohort_consents_household_id_idx on public.cohort_consents(household_id);

create table public.internal_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'internal_admin',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_run_after_idx on public.jobs(status, run_after);
create index jobs_locked_at_idx on public.jobs(locked_at) where locked_at is not null;

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index job_events_job_id_idx on public.job_events(job_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-artifacts',
  'source-artifacts',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.cohort_consents enable row level security;
alter table public.internal_admins enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;

create or replace function public.is_internal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_admins
    where user_id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and active = true
  );
$$;

create policy "members can read their households"
on public.households for select
using (public.is_household_member(id) or public.is_internal_admin());

create policy "internal admins can create households directly"
on public.households for insert
to authenticated
with check (public.is_internal_admin());

create policy "household admins can update households"
on public.households for update
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_id = households.id
      and user_id = auth.uid()
      and role = 'household_admin'
      and active = true
  )
)
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_id = households.id
      and user_id = auth.uid()
      and role = 'household_admin'
      and active = true
  )
);

create policy "members can read household members"
on public.household_members for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "internal admins can create household members"
on public.household_members for insert
to authenticated
with check (public.is_internal_admin());

create policy "household admins can manage household members"
on public.household_members for update
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members admin_member
    where admin_member.household_id = household_members.household_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'household_admin'
      and admin_member.active = true
  )
)
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members admin_member
    where admin_member.household_id = household_members.household_id
      and admin_member.user_id = auth.uid()
      and admin_member.role = 'household_admin'
      and admin_member.active = true
  )
);

create policy "members can read household consents"
on public.cohort_consents for select
using (
  public.is_household_member(household_id)
  or public.is_internal_admin()
);

create policy "members can accept household consent"
on public.cohort_consents for insert
to authenticated
with check (public.is_household_member(household_id));

create policy "internal admins can read admin table"
on public.internal_admins for select
using (public.is_internal_admin());

create policy "internal admins can read jobs"
on public.jobs for select
using (public.is_internal_admin());

create policy "internal admins can read job events"
on public.job_events for select
using (public.is_internal_admin());

create policy "members can read their source artifact objects"
on storage.objects for select
using (
  bucket_id = 'source-artifacts'
  and (
    public.is_internal_admin()
    or exists (
      select 1
      from public.households h
      where h.id::text = split_part(storage.objects.name, '/', 1)
        and public.is_household_member(h.id)
    )
  )
);

create or replace function public.claim_due_jobs(batch_size integer default 5)
returns table(id uuid, kind text, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select jobs.id
    from public.jobs
    where (
        jobs.status = 'pending'
        and jobs.run_after <= now()
      )
      or (
        jobs.status = 'running'
        and jobs.locked_at < now() - interval '15 minutes'
      )
    order by jobs.run_after asc, jobs.created_at asc
    limit least(greatest(batch_size, 1), 50)
    for update skip locked
  )
  update public.jobs
  set status = 'running',
      locked_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  from claimable
  where jobs.id = claimable.id
  returning jobs.id, jobs.kind, jobs.payload;
end;
$$;

revoke all on function public.claim_due_jobs(integer) from public;
revoke all on function public.claim_due_jobs(integer) from anon;
revoke all on function public.claim_due_jobs(integer) from authenticated;
grant execute on function public.claim_due_jobs(integer) to service_role;

create or replace function public.mark_job_failed(job_id uuid, error_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
  set status = case
      when attempts >= max_attempts then 'failed'::public.job_status
      else 'pending'::public.job_status
    end,
    locked_at = null,
    run_after = case
      when attempts >= max_attempts then run_after
      else now() + (attempts * interval '1 minute')
    end,
    last_error = error_message,
    updated_at = now()
  where id = job_id;

  insert into public.job_events (job_id, event_type, message)
  values (job_id, 'failed_attempt', error_message);
end;
$$;

revoke all on function public.mark_job_failed(uuid, text) from public;
revoke all on function public.mark_job_failed(uuid, text) from anon;
revoke all on function public.mark_job_failed(uuid, text) from authenticated;
grant execute on function public.mark_job_failed(uuid, text) to service_role;

create or replace function public.create_household_bootstrap(
  household_name text,
  household_slug text,
  household_timezone text,
  consent_version text,
  member_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text := nullif(auth.jwt() ->> 'email', '');
  new_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(household_name), '') is null then
    raise exception 'Household name is required';
  end if;

  if nullif(trim(member_display_name), '') is null then
    raise exception 'Member display name is required';
  end if;

  insert into public.households (
    name,
    slug,
    timezone,
    consent_version
  )
  values (
    trim(household_name),
    trim(household_slug),
    coalesce(nullif(trim(household_timezone), ''), 'America/Chicago'),
    trim(consent_version)
  )
  returning id into new_household_id;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    display_name,
    email
  )
  values (
    new_household_id,
    current_user_id,
    'household_admin',
    trim(member_display_name),
    current_user_email
  );

  insert into public.cohort_consents (
    household_id,
    accepted_by,
    version,
    sensitive_data_warning_acknowledged
  )
  values (
    new_household_id,
    current_user_id,
    trim(consent_version),
    true
  );

  return new_household_id;
end;
$$;

revoke all on function public.create_household_bootstrap(text, text, text, text, text) from public;
revoke all on function public.create_household_bootstrap(text, text, text, text, text) from anon;
grant execute on function public.create_household_bootstrap(text, text, text, text, text) to authenticated;
