create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  provider text not null default 'google',
  google_account_email text,
  google_account_subject text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token text,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_error_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_provider_check check (provider = 'google'),
  constraint google_calendar_connections_status_check check (status in ('active', 'disconnected', 'failed')),
  constraint google_calendar_connections_active_token_check check (
    status <> 'active' or encrypted_refresh_token is not null
  )
);

create index google_calendar_connections_household_id_idx
on public.google_calendar_connections(household_id);

create index google_calendar_connections_member_id_idx
on public.google_calendar_connections(member_id);

create unique index google_calendar_connections_member_provider_unique_idx
on public.google_calendar_connections(member_id, provider);

create table public.coverage_card_calendar_exports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  card_id uuid not null references public.coverage_cards(id) on delete cascade,
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  provider text not null default 'google',
  provider_event_id text,
  provider_html_link text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_bucket text,
  last_exported_snapshot jsonb not null default '{}'::jsonb,
  last_exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_card_calendar_exports_provider_check check (provider = 'google'),
  constraint coverage_card_calendar_exports_status_check check (status in ('pending', 'running', 'succeeded', 'failed'))
);

create index coverage_card_calendar_exports_household_id_idx
on public.coverage_card_calendar_exports(household_id);

create index coverage_card_calendar_exports_card_id_idx
on public.coverage_card_calendar_exports(card_id);

create unique index coverage_card_calendar_exports_connection_card_unique_idx
on public.coverage_card_calendar_exports(connection_id, card_id);

create or replace function public.validate_google_calendar_connection_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.household_role;
begin
  select role
  into target_role
  from public.household_members
  where id = new.member_id
    and household_id = new.household_id
    and active = true;

  if target_role is null then
    raise exception 'member_id must belong to the same active household'
      using errcode = '23514';
  end if;

  if target_role not in ('parent', 'household_admin') then
    raise exception 'Google Calendar connections are only available to parents and household admins'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger google_calendar_connections_validate_household_refs
before insert or update on public.google_calendar_connections
for each row execute function public.validate_google_calendar_connection_household_refs();

create or replace function public.validate_coverage_card_calendar_export_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.coverage_cards
    where id = new.card_id
      and household_id = new.household_id
  ) then
    raise exception 'card_id must belong to the same household'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.google_calendar_connections
    where id = new.connection_id
      and household_id = new.household_id
      and status = 'active'
  ) then
    raise exception 'connection_id must belong to the same active household'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger coverage_card_calendar_exports_validate_refs
before insert or update on public.coverage_card_calendar_exports
for each row execute function public.validate_coverage_card_calendar_export_refs();

alter table public.google_calendar_connections enable row level security;
alter table public.coverage_card_calendar_exports enable row level security;

revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.coverage_card_calendar_exports from anon, authenticated;

comment on table public.google_calendar_connections is
'Server-only Google Calendar OAuth connection metadata. Refresh tokens are encrypted and must not be exposed through RLS or card events.';

comment on table public.coverage_card_calendar_exports is
'Server-only mapping from FamTandem coverage cards to Google Calendar events for idempotent one-way export.';
