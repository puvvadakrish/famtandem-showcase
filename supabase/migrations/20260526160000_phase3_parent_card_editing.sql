create or replace function public.is_household_parent_or_admin(target_household_id uuid)
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
      and role in ('parent', 'household_admin')
  );
$$;

create or replace function public.correct_coverage_card(
  p_card_id uuid,
  p_card_type public.card_type,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_child_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  target_source_input_id uuid;
  current_is_household_admin boolean;
  child_id uuid;
begin
  select household_id, source_input_id
  into target_household_id, target_source_input_id
  from public.coverage_cards
  where id = p_card_id
  for update;

  if target_household_id is null then
    raise exception 'coverage card does not exist'
      using errcode = '23503';
  end if;

  current_is_household_admin := public.is_household_admin(target_household_id);

  if not public.is_household_parent_or_admin(target_household_id)
    and not public.is_internal_admin() then
    raise exception 'only parents and household admins can correct coverage cards'
      using errcode = '42501';
  end if;

  if not current_is_household_admin
    and not public.is_internal_admin()
    and target_source_input_id is null then
    raise exception 'parents can only correct source-backed coverage cards'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'card title is required'
      using errcode = '23514';
  end if;

  foreach child_id in array coalesce(p_child_ids, array[]::uuid[]) loop
    if not exists (
      select 1
      from public.children
      where id = child_id
        and household_id = target_household_id
        and status = 'active'
    ) then
      raise exception 'child_id must belong to the same household'
        using errcode = '23514';
    end if;
  end loop;

  update public.coverage_cards
  set card_type = p_card_type,
    title = trim(p_title),
    starts_at = p_starts_at,
    location = nullif(trim(coalesce(p_location, '')), ''),
    manually_edited = true,
    updated_at = now()
  where id = p_card_id;

  delete from public.card_children
  where card_id = p_card_id;

  insert into public.card_children (card_id, child_id)
  select p_card_id, distinct_child_id
  from unnest(coalesce(p_child_ids, array[]::uuid[])) as child_ids(distinct_child_id)
  group by distinct_child_id;

  perform public.refresh_coverage_card_state(p_card_id);
end;
$$;

create or replace function public.correct_readiness_item(
  p_item_id uuid,
  p_label text,
  p_status public.readiness_status,
  p_due_at timestamptz,
  p_owner_member_id uuid,
  p_external_owner_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_card_id uuid;
  target_household_id uuid;
  target_source_input_id uuid;
  current_is_household_admin boolean;
begin
  select readiness_items.card_id,
    coverage_cards.household_id,
    coverage_cards.source_input_id
  into target_card_id,
    target_household_id,
    target_source_input_id
  from public.readiness_items
  join public.coverage_cards on coverage_cards.id = readiness_items.card_id
  where readiness_items.id = p_item_id
  for update of readiness_items;

  if target_card_id is null then
    raise exception 'readiness item does not exist'
      using errcode = '23503';
  end if;

  if not public.is_household_parent_or_admin(target_household_id)
    and not public.is_internal_admin()
  then
    raise exception 'only parents and household admins can correct readiness items'
      using errcode = '42501';
  end if;

  current_is_household_admin := public.is_household_admin(target_household_id);

  if not current_is_household_admin
    and not public.is_internal_admin()
    and target_source_input_id is null then
    raise exception 'parents can only correct source-backed readiness items'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_label, ''))) = 0 then
    raise exception 'readiness label is required'
      using errcode = '23514';
  end if;

  if p_owner_member_id is not null then
    perform public.assert_household_member_reference(
      p_owner_member_id,
      target_household_id,
      'owner_member_id'
    );
  end if;

  update public.readiness_items
  set label = trim(p_label),
    status = p_status,
    due_at = p_due_at,
    owner_member_id = p_owner_member_id,
    external_owner_text = case
      when p_owner_member_id is not null then null
      else nullif(trim(coalesce(p_external_owner_text, '')), '')
    end,
    completed_at = case
      when p_status = 'done' then now()
      else null
    end,
    updated_at = now()
  where id = p_item_id;

  perform public.refresh_coverage_card_state(target_card_id);
  return target_card_id;
end;
$$;

create or replace function public.add_readiness_item_to_card(
  p_card_id uuid,
  p_label text,
  p_due_at timestamptz,
  p_owner_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  target_source_input_id uuid;
  current_is_household_admin boolean;
  new_item_id uuid;
begin
  select household_id, source_input_id
  into target_household_id, target_source_input_id
  from public.coverage_cards
  where id = p_card_id
  for update;

  if target_household_id is null then
    raise exception 'coverage card does not exist'
      using errcode = '23503';
  end if;

  if not public.is_household_parent_or_admin(target_household_id)
    and not public.is_internal_admin()
  then
    raise exception 'only parents and household admins can add readiness items'
      using errcode = '42501';
  end if;

  current_is_household_admin := public.is_household_admin(target_household_id);

  if not current_is_household_admin
    and not public.is_internal_admin()
    and target_source_input_id is null then
    raise exception 'parents can only add readiness items to source-backed cards'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_label, ''))) = 0 then
    raise exception 'readiness label is required'
      using errcode = '23514';
  end if;

  if p_owner_member_id is not null then
    perform public.assert_household_member_reference(
      p_owner_member_id,
      target_household_id,
      'owner_member_id'
    );
  end if;

  insert into public.readiness_items (
    card_id,
    label,
    due_at,
    status,
    owner_member_id
  )
  values (
    p_card_id,
    trim(p_label),
    p_due_at,
    'open',
    p_owner_member_id
  )
  returning id into new_item_id;

  perform public.refresh_coverage_card_state(p_card_id);
  return new_item_id;
end;
$$;

revoke all on function public.is_household_parent_or_admin(uuid) from public;
revoke all on function public.is_household_parent_or_admin(uuid) from anon;
revoke all on function public.is_household_parent_or_admin(uuid) from authenticated;

revoke all on function public.correct_coverage_card(uuid, public.card_type, text, timestamptz, text, uuid[]) from public;
revoke all on function public.correct_coverage_card(uuid, public.card_type, text, timestamptz, text, uuid[]) from anon;
grant execute on function public.correct_coverage_card(uuid, public.card_type, text, timestamptz, text, uuid[]) to authenticated;

revoke all on function public.correct_readiness_item(uuid, text, public.readiness_status, timestamptz, uuid, text) from public;
revoke all on function public.correct_readiness_item(uuid, text, public.readiness_status, timestamptz, uuid, text) from anon;
grant execute on function public.correct_readiness_item(uuid, text, public.readiness_status, timestamptz, uuid, text) to authenticated;

revoke all on function public.add_readiness_item_to_card(uuid, text, timestamptz, uuid) from public;
revoke all on function public.add_readiness_item_to_card(uuid, text, timestamptz, uuid) from anon;
grant execute on function public.add_readiness_item_to_card(uuid, text, timestamptz, uuid) to authenticated;
