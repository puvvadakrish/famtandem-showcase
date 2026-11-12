create type public.child_status as enum ('active', 'inactive');
create type public.source_input_type as enum ('manual', 'forwarded_email', 'upload', 'paste', 'calendar_invite', 'manual_admin');
create type public.source_input_status as enum ('manual', 'pending', 'processing', 'processed', 'needs_review', 'failed');
create type public.card_type as enum ('event', 'deadline', 'decision', 'change_standalone');
create type public.coverage_state as enum ('needs_coverage', 'requested', 'accepted', 'declined', 'cancelled', 'covered_external');
create type public.coverage_slot_kind as enum ('dropoff', 'pickup', 'stay_attend', 'bring_prep', 'general_owner');
create type public.computed_coverage_state as enum ('covered', 'needs_coverage', 'pending', 'changed', 'needs_review', 'due_soon', 'overdue');
create type public.readiness_status as enum ('open', 'done', 'not_needed');
create type public.coverage_request_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.coverage_response_value as enum ('accept_dropoff', 'accept_pickup', 'accept_both', 'decline', 'comment');

create table public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  birth_year integer,
  grade text,
  status public.child_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_household_id_idx on public.children(household_id);

create table public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  relationship_label text,
  created_by uuid references public.household_members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index external_contacts_household_id_idx on public.external_contacts(household_id);

create table public.source_inputs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  submitted_by uuid references public.household_members(id) on delete set null,
  source_type public.source_input_type not null default 'manual',
  raw_subject text,
  normalized_text text,
  status public.source_input_status not null default 'manual',
  provider_event_id text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index source_inputs_household_id_idx on public.source_inputs(household_id);
create unique index source_inputs_provider_event_unique_idx
on public.source_inputs(source_type, provider_event_id)
where provider_event_id is not null;

create table public.coverage_cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_input_id uuid references public.source_inputs(id) on delete set null,
  card_type public.card_type not null default 'event',
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  attention_flags text[] not null default '{}'::text[],
  computed_coverage_state public.computed_coverage_state not null default 'needs_coverage',
  confidence numeric(4,3),
  source_summary text,
  full_source_ref text,
  review_reason text,
  manually_edited boolean not null default false,
  created_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coverage_cards_household_id_idx on public.coverage_cards(household_id);
create index coverage_cards_starts_at_idx on public.coverage_cards(starts_at);

create table public.coverage_slots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.coverage_cards(id) on delete cascade,
  kind public.coverage_slot_kind not null default 'general_owner',
  state public.coverage_state not null default 'needs_coverage',
  owner_member_id uuid references public.household_members(id) on delete set null,
  external_contact_id uuid references public.external_contacts(id) on delete set null,
  external_owner_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_slots_owner_required_for_accepted check (
    state <> 'accepted'
    or owner_member_id is not null
    or external_contact_id is not null
    or nullif(trim(coalesce(external_owner_text, '')), '') is not null
  ),
  constraint coverage_slots_external_owner_required check (
    state <> 'covered_external'
    or external_contact_id is not null
    or nullif(trim(coalesce(external_owner_text, '')), '') is not null
  )
);

create index coverage_slots_card_id_idx on public.coverage_slots(card_id);
create index coverage_slots_owner_member_id_idx on public.coverage_slots(owner_member_id);

create table public.readiness_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.coverage_cards(id) on delete cascade,
  label text not null,
  due_at timestamptz,
  status public.readiness_status not null default 'open',
  owner_member_id uuid references public.household_members(id) on delete set null,
  external_contact_id uuid references public.external_contacts(id) on delete set null,
  external_owner_text text,
  completed_at timestamptz,
  source_quote_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index readiness_items_card_id_idx on public.readiness_items(card_id);

create table public.card_children (
  card_id uuid not null references public.coverage_cards(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  primary key (card_id, child_id)
);

create index card_children_child_id_idx on public.card_children(child_id);

create table public.card_changes (
  id uuid primary key default gen_random_uuid(),
  source_input_id uuid references public.source_inputs(id) on delete set null,
  matched_card_id uuid references public.coverage_cards(id) on delete cascade,
  change_summary text not null,
  changed_fields jsonb not null default '[]'::jsonb,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  confirmation_status text not null default 'pending',
  confirmed_by uuid references public.household_members(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index card_changes_matched_card_id_idx on public.card_changes(matched_card_id);

create table public.coverage_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.coverage_slots(id) on delete cascade,
  requested_by uuid references public.household_members(id) on delete set null,
  requested_member_id uuid references public.household_members(id) on delete set null,
  requested_external_contact_id uuid references public.external_contacts(id) on delete set null,
  contact_snapshot jsonb not null default '{}'::jsonb,
  channel text not null default 'manual',
  token_hash text,
  expires_at timestamptz,
  status public.coverage_request_status not null default 'pending',
  attempt_count integer not null default 0,
  last_token_access_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coverage_requests_slot_id_idx on public.coverage_requests(slot_id);

create table public.coverage_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.coverage_requests(id) on delete cascade,
  responder_identity text,
  response public.coverage_response_value not null,
  raw_payload jsonb not null default '{}'::jsonb,
  responded_at timestamptz not null default now()
);

create index coverage_responses_request_id_idx on public.coverage_responses(request_id);

create table public.card_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  card_id uuid references public.coverage_cards(id) on delete cascade,
  actor_member_id uuid references public.household_members(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index card_events_household_id_idx on public.card_events(household_id);
create index card_events_card_id_idx on public.card_events(card_id);

create or replace function public.assert_household_member_reference(
  target_member_id uuid,
  target_household_id uuid,
  target_column text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_member_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.household_members
    where id = target_member_id
      and household_id = target_household_id
  ) then
    raise exception '% must belong to the same household', target_column
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_external_contact_reference(
  target_external_contact_id uuid,
  target_household_id uuid,
  target_column text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_external_contact_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.external_contacts
    where id = target_external_contact_id
      and household_id = target_household_id
  ) then
    raise exception '% must belong to the same household', target_column
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.card_household_id(target_card_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.coverage_cards
  where id = target_card_id;
$$;

create or replace function public.slot_household_id(target_slot_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coverage_cards.household_id
  from public.coverage_slots
  join public.coverage_cards on coverage_cards.id = coverage_slots.card_id
  where coverage_slots.id = target_slot_id;
$$;

create or replace function public.validate_external_contact_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_household_member_reference(NEW.created_by, NEW.household_id, 'created_by');
  return NEW;
end;
$$;

create trigger external_contacts_validate_household_refs
before insert or update on public.external_contacts
for each row execute function public.validate_external_contact_household_refs();

create or replace function public.validate_source_input_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_household_member_reference(NEW.submitted_by, NEW.household_id, 'submitted_by');
  return NEW;
end;
$$;

create trigger source_inputs_validate_household_refs
before insert or update on public.source_inputs
for each row execute function public.validate_source_input_household_refs();

create or replace function public.validate_coverage_card_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_household_member_reference(NEW.created_by, NEW.household_id, 'created_by');
  return NEW;
end;
$$;

create trigger coverage_cards_validate_household_refs
before insert or update on public.coverage_cards
for each row execute function public.validate_coverage_card_household_refs();

create or replace function public.validate_coverage_slot_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  current_member_id uuid;
begin
  target_household_id := public.card_household_id(NEW.card_id);

  if target_household_id is null then
    raise exception 'card_id must reference an existing coverage card'
      using errcode = '23503';
  end if;

  if TG_OP = 'UPDATE'
    and not public.is_internal_admin()
    and not public.is_household_admin(target_household_id)
  then
    select id
    into current_member_id
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and active = true
    limit 1;

    if current_member_id is null then
      raise exception 'coverage slot update requires household membership'
        using errcode = '42501';
    end if;

    if OLD.state = 'accepted'
      or NEW.state <> 'accepted'
      or NEW.owner_member_id is distinct from current_member_id
      or NEW.card_id is distinct from OLD.card_id
      or NEW.kind is distinct from OLD.kind
      or NEW.external_contact_id is distinct from OLD.external_contact_id
      or NEW.external_owner_text is distinct from OLD.external_owner_text
    then
      raise exception 'members can only accept an unaccepted slot for themselves'
        using errcode = '42501';
    end if;
  end if;

  perform public.assert_household_member_reference(
    NEW.owner_member_id,
    target_household_id,
    'owner_member_id'
  );
  perform public.assert_external_contact_reference(
    NEW.external_contact_id,
    target_household_id,
    'external_contact_id'
  );

  return NEW;
end;
$$;

create trigger coverage_slots_validate_household_refs
before insert or update on public.coverage_slots
for each row execute function public.validate_coverage_slot_household_refs();

create or replace function public.validate_readiness_item_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  target_household_id := public.card_household_id(NEW.card_id);

  if target_household_id is null then
    raise exception 'card_id must reference an existing coverage card'
      using errcode = '23503';
  end if;

  perform public.assert_household_member_reference(
    NEW.owner_member_id,
    target_household_id,
    'owner_member_id'
  );
  perform public.assert_external_contact_reference(
    NEW.external_contact_id,
    target_household_id,
    'external_contact_id'
  );

  return NEW;
end;
$$;

create trigger readiness_items_validate_household_refs
before insert or update on public.readiness_items
for each row execute function public.validate_readiness_item_household_refs();

create or replace function public.validate_card_child_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  target_household_id := public.card_household_id(NEW.card_id);

  if target_household_id is null then
    raise exception 'card_id must reference an existing coverage card'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.children
    where id = NEW.child_id
      and household_id = target_household_id
  ) then
    raise exception 'child_id must belong to the same household'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create trigger card_children_validate_household_refs
before insert or update on public.card_children
for each row execute function public.validate_card_child_household_refs();

create or replace function public.validate_coverage_request_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  target_household_id := public.slot_household_id(NEW.slot_id);

  if target_household_id is null then
    raise exception 'slot_id must reference an existing coverage slot'
      using errcode = '23503';
  end if;

  perform public.assert_household_member_reference(
    NEW.requested_by,
    target_household_id,
    'requested_by'
  );
  perform public.assert_household_member_reference(
    NEW.requested_member_id,
    target_household_id,
    'requested_member_id'
  );
  perform public.assert_external_contact_reference(
    NEW.requested_external_contact_id,
    target_household_id,
    'requested_external_contact_id'
  );

  return NEW;
end;
$$;

create trigger coverage_requests_validate_household_refs
before insert or update on public.coverage_requests
for each row execute function public.validate_coverage_request_household_refs();

create or replace function public.validate_card_event_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.card_id is not null and public.card_household_id(NEW.card_id) <> NEW.household_id then
    raise exception 'card_id must belong to the same household'
      using errcode = '23514';
  end if;

  perform public.assert_household_member_reference(
    NEW.actor_member_id,
    NEW.household_id,
    'actor_member_id'
  );

  return NEW;
end;
$$;

create trigger card_events_validate_household_refs
before insert or update on public.card_events
for each row execute function public.validate_card_event_household_refs();

revoke all on function public.assert_household_member_reference(uuid, uuid, text) from public;
revoke all on function public.assert_household_member_reference(uuid, uuid, text) from anon;
revoke all on function public.assert_household_member_reference(uuid, uuid, text) from authenticated;
revoke all on function public.assert_external_contact_reference(uuid, uuid, text) from public;
revoke all on function public.assert_external_contact_reference(uuid, uuid, text) from anon;
revoke all on function public.assert_external_contact_reference(uuid, uuid, text) from authenticated;
revoke all on function public.card_household_id(uuid) from public;
revoke all on function public.card_household_id(uuid) from anon;
revoke all on function public.card_household_id(uuid) from authenticated;
revoke all on function public.slot_household_id(uuid) from public;
revoke all on function public.slot_household_id(uuid) from anon;
revoke all on function public.slot_household_id(uuid) from authenticated;
revoke all on function public.validate_external_contact_household_refs() from public;
revoke all on function public.validate_external_contact_household_refs() from anon;
revoke all on function public.validate_external_contact_household_refs() from authenticated;
revoke all on function public.validate_source_input_household_refs() from public;
revoke all on function public.validate_source_input_household_refs() from anon;
revoke all on function public.validate_source_input_household_refs() from authenticated;
revoke all on function public.validate_coverage_card_household_refs() from public;
revoke all on function public.validate_coverage_card_household_refs() from anon;
revoke all on function public.validate_coverage_card_household_refs() from authenticated;
revoke all on function public.validate_coverage_slot_household_refs() from public;
revoke all on function public.validate_coverage_slot_household_refs() from anon;
revoke all on function public.validate_coverage_slot_household_refs() from authenticated;
revoke all on function public.validate_readiness_item_household_refs() from public;
revoke all on function public.validate_readiness_item_household_refs() from anon;
revoke all on function public.validate_readiness_item_household_refs() from authenticated;
revoke all on function public.validate_card_child_household_refs() from public;
revoke all on function public.validate_card_child_household_refs() from anon;
revoke all on function public.validate_card_child_household_refs() from authenticated;
revoke all on function public.validate_coverage_request_household_refs() from public;
revoke all on function public.validate_coverage_request_household_refs() from anon;
revoke all on function public.validate_coverage_request_household_refs() from authenticated;
revoke all on function public.validate_card_event_household_refs() from public;
revoke all on function public.validate_card_event_household_refs() from anon;
revoke all on function public.validate_card_event_household_refs() from authenticated;

alter table public.children enable row level security;
alter table public.external_contacts enable row level security;
alter table public.source_inputs enable row level security;
alter table public.coverage_cards enable row level security;
alter table public.coverage_slots enable row level security;
alter table public.readiness_items enable row level security;
alter table public.card_children enable row level security;
alter table public.card_changes enable row level security;
alter table public.coverage_requests enable row level security;
alter table public.coverage_responses enable row level security;
alter table public.card_events enable row level security;

create or replace function public.is_household_admin(target_household_id uuid)
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
      and role = 'household_admin'
      and active = true
  );
$$;

create policy "household admins can create household members"
on public.household_members for insert
to authenticated
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can read children"
on public.children for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "household admins can manage children"
on public.children for all
to authenticated
using (public.is_household_admin(household_id) or public.is_internal_admin())
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can read external contacts"
on public.external_contacts for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "household admins can manage external contacts"
on public.external_contacts for all
to authenticated
using (public.is_household_admin(household_id) or public.is_internal_admin())
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can read source inputs"
on public.source_inputs for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "household admins can manage manual source inputs"
on public.source_inputs for all
to authenticated
using (public.is_household_admin(household_id) or public.is_internal_admin())
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can read coverage cards"
on public.coverage_cards for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "household admins can manage coverage cards"
on public.coverage_cards for all
to authenticated
using (public.is_household_admin(household_id) or public.is_internal_admin())
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can read coverage slots"
on public.coverage_slots for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = coverage_slots.card_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "household admins can manage coverage slots"
on public.coverage_slots for all
to authenticated
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = coverage_slots.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
)
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = coverage_slots.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
);

create policy "members can accept their own coverage slots"
on public.coverage_slots for update
to authenticated
using (
  exists (
    select 1
    from public.coverage_cards
    join public.household_members
      on household_members.household_id = coverage_cards.household_id
     and household_members.user_id = auth.uid()
     and household_members.active = true
    where coverage_cards.id = coverage_slots.card_id
  )
)
with check (
  exists (
    select 1
    from public.coverage_cards
    join public.household_members
      on household_members.household_id = coverage_cards.household_id
     and household_members.user_id = auth.uid()
     and household_members.active = true
    where coverage_cards.id = coverage_slots.card_id
      and coverage_slots.owner_member_id = household_members.id
      and coverage_slots.state = 'accepted'
  )
);

create policy "members can read readiness items"
on public.readiness_items for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = readiness_items.card_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "household admins can manage readiness items"
on public.readiness_items for all
to authenticated
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = readiness_items.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
)
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = readiness_items.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
);

create policy "members can read card children"
on public.card_children for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = card_children.card_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "household admins can manage card children"
on public.card_children for all
to authenticated
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = card_children.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
)
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = card_children.card_id
      and public.is_household_admin(coverage_cards.household_id)
  )
);

create policy "members can read card changes"
on public.card_changes for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_cards
    where coverage_cards.id = card_changes.matched_card_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "members can read coverage requests"
on public.coverage_requests for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_slots
    join public.coverage_cards on coverage_cards.id = coverage_slots.card_id
    where coverage_slots.id = coverage_requests.slot_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "members can read coverage responses"
on public.coverage_responses for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.coverage_requests
    join public.coverage_slots on coverage_slots.id = coverage_requests.slot_id
    join public.coverage_cards on coverage_cards.id = coverage_slots.card_id
    where coverage_requests.id = coverage_responses.request_id
      and public.is_household_member(coverage_cards.household_id)
  )
);

create policy "members can read card events"
on public.card_events for select
using (public.is_household_member(household_id) or public.is_internal_admin());

create policy "household admins can create card events"
on public.card_events for insert
to authenticated
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "members can create their own card events"
on public.card_events for insert
to authenticated
with check (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_members.id = card_events.actor_member_id
      and household_members.household_id = card_events.household_id
      and household_members.user_id = auth.uid()
      and household_members.active = true
  )
);
