create or replace function public.validate_coverage_card_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_household_id uuid;
begin
  perform public.assert_household_member_reference(NEW.created_by, NEW.household_id, 'created_by');

  if NEW.source_input_id is not null then
    select household_id
    into source_household_id
    from public.source_inputs
    where id = NEW.source_input_id;

    if source_household_id is null then
      raise exception 'source_input_id must reference an existing source input'
        using errcode = '23503';
    end if;

    if source_household_id <> NEW.household_id then
      raise exception 'source_input_id must belong to the same household'
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.validate_coverage_card_household_refs() from public;
revoke all on function public.validate_coverage_card_household_refs() from anon;
revoke all on function public.validate_coverage_card_household_refs() from authenticated;

drop policy if exists "members can read source inputs" on public.source_inputs;

create policy "parents and household admins can read source inputs"
on public.source_inputs for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_members.household_id = source_inputs.household_id
      and household_members.user_id = auth.uid()
      and household_members.role in ('parent', 'household_admin')
      and household_members.active = true
  )
);

create or replace function public.create_paste_source_card(
  p_pasted_text text,
  p_raw_subject text,
  p_card_title text,
  p_card_type public.card_type,
  p_slot_kind public.coverage_slot_kind,
  p_child_id uuid default null,
  p_starts_at timestamptz default null,
  p_location text default null,
  p_source_summary text default null,
  p_review_reason text default null,
  p_readiness_label text default null,
  p_readiness_due_at timestamptz default null,
  p_confidence numeric default 0.800
)
returns table(source_input_id uuid, card_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member record;
  created_source_input_id uuid;
  created_card_id uuid;
  normalized_pasted_text text := nullif(trim(coalesce(p_pasted_text, '')), '');
  normalized_card_title text := nullif(trim(coalesce(p_card_title, '')), '');
  normalized_raw_subject text := coalesce(nullif(trim(coalesce(p_raw_subject, '')), ''), 'Pasted logistics');
  normalized_source_summary text := nullif(trim(coalesce(p_source_summary, '')), '');
  normalized_review_reason text := nullif(trim(coalesce(p_review_reason, '')), '');
  normalized_readiness_label text := nullif(trim(coalesce(p_readiness_label, '')), '');
  initial_attention_flags text[];
  initial_coverage_state public.computed_coverage_state;
begin
  if auth.uid() is null then
    raise exception 'create_paste_source_card requires authentication'
      using errcode = '42501';
  end if;

  if normalized_pasted_text is null then
    raise exception 'pasted text is required'
      using errcode = '23502';
  end if;

  if normalized_card_title is null then
    raise exception 'card title is required'
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
    raise exception 'Only household admins can create pasted source cards'
      using errcode = '42501';
  end if;

  if p_child_id is not null and not exists (
    select 1
    from public.children
    where id = p_child_id
      and household_id = current_member.household_id
      and status = 'active'
  ) then
    raise exception 'child_id must belong to the same household'
      using errcode = '23514';
  end if;

  initial_attention_flags := array['needs_coverage']::text[];

  if normalized_review_reason is not null or p_confidence < 0.750 then
    initial_attention_flags := array_append(initial_attention_flags, 'needs_review');
  end if;

  if p_card_type = 'change_standalone' then
    initial_attention_flags := array_append(initial_attention_flags, 'changed');
  end if;

  if normalized_readiness_label is not null and p_readiness_due_at is not null then
    if p_readiness_due_at < now() then
      initial_attention_flags := array_append(initial_attention_flags, 'overdue');
    elsif p_readiness_due_at - now() <= interval '48 hours' then
      initial_attention_flags := array_append(initial_attention_flags, 'due_soon');
    end if;
  end if;

  initial_attention_flags := array(select distinct unnest(initial_attention_flags));

  initial_coverage_state := case
    when 'overdue' = any(initial_attention_flags) then 'overdue'::public.computed_coverage_state
    when 'changed' = any(initial_attention_flags) then 'changed'::public.computed_coverage_state
    when 'needs_review' = any(initial_attention_flags) then 'needs_review'::public.computed_coverage_state
    when 'needs_coverage' = any(initial_attention_flags) then 'needs_coverage'::public.computed_coverage_state
    when 'pending' = any(initial_attention_flags) then 'pending'::public.computed_coverage_state
    when 'due_soon' = any(initial_attention_flags) then 'due_soon'::public.computed_coverage_state
    else 'covered'::public.computed_coverage_state
  end;

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

  insert into public.coverage_cards (
    household_id,
    source_input_id,
    card_type,
    title,
    starts_at,
    location,
    source_summary,
    full_source_ref,
    review_reason,
    confidence,
    attention_flags,
    computed_coverage_state,
    created_by,
    manually_edited
  )
  values (
    current_member.household_id,
    created_source_input_id,
    p_card_type,
    normalized_card_title,
    p_starts_at,
    nullif(trim(coalesce(p_location, '')), ''),
    normalized_source_summary,
    'source_inputs:' || created_source_input_id::text,
    normalized_review_reason,
    p_confidence,
    initial_attention_flags,
    initial_coverage_state,
    current_member.id,
    false
  )
  returning id into created_card_id;

  insert into public.coverage_slots (card_id, kind, state)
  values (created_card_id, p_slot_kind, 'needs_coverage');

  if p_child_id is not null then
    insert into public.card_children (card_id, child_id)
    values (created_card_id, p_child_id);
  end if;

  if normalized_readiness_label is not null then
    insert into public.readiness_items (card_id, label, due_at, status)
    values (created_card_id, normalized_readiness_label, p_readiness_due_at, 'open');
  end if;

  insert into public.card_events (
    household_id,
    card_id,
    actor_member_id,
    event_type,
    metadata
  )
  values (
    current_member.household_id,
    created_card_id,
    current_member.id,
    'paste_source_card_created',
    jsonb_build_object(
      'sourceInputId', created_source_input_id,
      'cardType', p_card_type,
      'slotKind', p_slot_kind
    )
  );

  update public.source_inputs
  set status = 'processed',
      updated_at = now()
  where id = created_source_input_id;

  return query select created_source_input_id, created_card_id;
end;
$$;

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
) from public;
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
) from anon;
grant execute on function public.create_paste_source_card(
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
) to authenticated;
