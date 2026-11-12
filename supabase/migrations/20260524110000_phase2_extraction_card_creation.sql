create or replace function public.create_extracted_cards(
  p_extraction_run_id uuid,
  p_cards jsonb
)
returns table(card_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row record;
  card_input jsonb;
  new_card_id uuid;
  card_type_value public.card_type;
  card_title text;
  card_starts_at timestamptz;
  card_ends_at timestamptz;
  card_all_day boolean;
  card_location text;
  card_confidence numeric;
  card_review_reasons jsonb;
  card_review_reason_text text;
  card_changed_fields jsonb;
  card_summary text;
  initial_attention_flags text[];
  initial_coverage_state public.computed_coverage_state;
  slot_kinds public.coverage_slot_kind[];
  slot_kind_value public.coverage_slot_kind;
  readiness_input jsonb;
begin
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then
    raise exception 'p_cards must be a JSON array' using errcode = '22023';
  end if;

  select id, household_id, source_input_id, card_count, status
  into run_row
  from public.extraction_runs
  where id = p_extraction_run_id;

  if run_row.id is null then
    raise exception 'extraction_run_id % does not exist', p_extraction_run_id
      using errcode = '23503';
  end if;

  if run_row.card_count > 0 then
    return query
    select id
    from public.coverage_cards
    where household_id = run_row.household_id
      and source_input_id = run_row.source_input_id;
    return;
  end if;

  if jsonb_array_length(p_cards) = 0 then
    return;
  end if;

  for card_input in select * from jsonb_array_elements(p_cards) loop
    card_type_value := (card_input->>'type')::public.card_type;
    card_title := nullif(trim(coalesce(card_input->>'title', '')), '');

    if card_title is null then
      raise exception 'extracted card is missing a title' using errcode = '23502';
    end if;

    card_starts_at := nullif(card_input->>'startsAt', '')::timestamptz;
    card_ends_at := nullif(card_input->>'endsAt', '')::timestamptz;
    card_all_day := coalesce((card_input->>'allDay')::boolean, false);
    card_location := nullif(trim(coalesce(card_input->>'location', '')), '');
    card_confidence := coalesce((card_input->>'confidence')::numeric, 0.500);

    card_review_reasons := coalesce(card_input->'reviewReasons', '[]'::jsonb);
    card_changed_fields := coalesce(card_input->'changedFields', '[]'::jsonb);

    card_review_reason_text := nullif(
      trim(
        coalesce(
          (
            select string_agg(value, '; ')
            from jsonb_array_elements_text(card_review_reasons) as value
          ),
          ''
        )
      ),
      ''
    );

    card_summary := nullif(
      trim(coalesce(card_input #>> '{coverageRelevance,reason}', '')),
      ''
    );
    if card_summary is null then
      card_summary := card_title;
    end if;
    if length(card_summary) > 240 then
      card_summary := left(card_summary, 240);
    end if;

    initial_attention_flags := array['needs_coverage']::text[];

    if jsonb_array_length(card_review_reasons) > 0 or card_confidence < 0.750 then
      initial_attention_flags := array_append(initial_attention_flags, 'needs_review');
    end if;

    if card_type_value = 'change_standalone' or jsonb_array_length(card_changed_fields) > 0 then
      initial_attention_flags := array_append(initial_attention_flags, 'changed');
    end if;

    initial_attention_flags := array(select distinct unnest(initial_attention_flags));

    initial_coverage_state := case
      when 'changed' = any(initial_attention_flags) then 'changed'::public.computed_coverage_state
      when 'needs_review' = any(initial_attention_flags) then 'needs_review'::public.computed_coverage_state
      when 'needs_coverage' = any(initial_attention_flags) then 'needs_coverage'::public.computed_coverage_state
      else 'pending'::public.computed_coverage_state
    end;

    insert into public.coverage_cards (
      household_id,
      source_input_id,
      card_type,
      title,
      starts_at,
      ends_at,
      all_day,
      location,
      attention_flags,
      computed_coverage_state,
      confidence,
      source_summary,
      full_source_ref,
      review_reason,
      manually_edited,
      created_by
    )
    values (
      run_row.household_id,
      run_row.source_input_id,
      card_type_value,
      card_title,
      card_starts_at,
      card_ends_at,
      card_all_day,
      card_location,
      initial_attention_flags,
      initial_coverage_state,
      card_confidence,
      card_summary,
      'source_inputs:' || run_row.source_input_id::text,
      card_review_reason_text,
      false,
      null
    )
    returning id into new_card_id;

    slot_kinds := array(
      select distinct (value)::public.coverage_slot_kind
      from jsonb_array_elements_text(
        coalesce(card_input #> '{coverageRelevance,suggestedSlots}', '[]'::jsonb)
      ) as value
    );

    if array_length(slot_kinds, 1) is null then
      slot_kinds := array['general_owner']::public.coverage_slot_kind[];
    end if;

    foreach slot_kind_value in array slot_kinds loop
      insert into public.coverage_slots (card_id, kind, state)
      values (new_card_id, slot_kind_value, 'needs_coverage');
    end loop;

    for readiness_input in
      select * from jsonb_array_elements(coalesce(card_input->'readinessItems', '[]'::jsonb))
    loop
      insert into public.readiness_items (card_id, label, due_at, status)
      values (
        new_card_id,
        coalesce(nullif(trim(coalesce(readiness_input->>'label', '')), ''), 'Prep item'),
        nullif(readiness_input->>'dueAt', '')::timestamptz,
        'open'
      );
    end loop;

    insert into public.card_events (
      household_id,
      card_id,
      actor_member_id,
      event_type,
      metadata
    )
    values (
      run_row.household_id,
      new_card_id,
      null,
      'extracted_source_card_created',
      jsonb_build_object(
        'extractionRunId', run_row.id,
        'sourceInputId', run_row.source_input_id,
        'cardType', card_type_value,
        'confidenceBucket', case
          when card_confidence >= 0.85 then 'high'
          when card_confidence >= 0.70 then 'medium'
          else 'low'
        end
      )
    );

    card_id := new_card_id;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.create_extracted_cards(uuid, jsonb) from public;
revoke all on function public.create_extracted_cards(uuid, jsonb) from anon;
revoke all on function public.create_extracted_cards(uuid, jsonb) from authenticated;
grant execute on function public.create_extracted_cards(uuid, jsonb) to service_role;
