-- Address three issues surfaced by the cursor-agent review of commit 22dbb77:
-- 1. create_extracted_cards now stamps extraction_runs.card_count inside the
--    same transaction as the card inserts, so a retry after a record_extraction_run
--    failure no longer creates duplicate cards.
-- 2. start_extraction_run accepts optional provider/model so the active extractor
--    (e.g., gemini-3.5-flash) is recorded on the run instead of always
--    appearing as 'local-stub' on the row.
-- 3. No behavior change to RLS or the AFTER INSERT enqueue trigger.

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
  inserted_card_count integer := 0;
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

    inserted_card_count := inserted_card_count + 1;
    card_id := new_card_id;
    return next;
  end loop;

  -- Stamp card_count inside the same transaction as the inserts so a crashed
  -- runner that fails before calling record_extraction_run does not create
  -- duplicate cards on retry. The next pickup sees card_count > 0 and the
  -- idempotency branch above returns the existing card ids.
  if inserted_card_count > 0 then
    update public.extraction_runs
    set card_count = inserted_card_count,
        updated_at = now()
    where id = run_row.id;
  end if;

  return;
end;
$$;

create or replace function public.start_extraction_run(
  p_run_id uuid,
  p_provider text default null,
  p_model text default null
)
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
declare
  normalized_provider text := nullif(trim(coalesce(p_provider, '')), '');
  normalized_model text := nullif(trim(coalesce(p_model, '')), '');
begin
  return query
  update public.extraction_runs
  set status = 'running',
      attempts = extraction_runs.attempts + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now(),
      last_error = null,
      provider = coalesce(normalized_provider, extraction_runs.provider),
      model = coalesce(normalized_model, extraction_runs.model)
  where extraction_runs.id = p_run_id
    and extraction_runs.status in ('pending', 'running', 'failed')
  returning extraction_runs.id,
            extraction_runs.household_id,
            extraction_runs.source_input_id,
            extraction_runs.attempts,
            extraction_runs.max_attempts;
end;
$$;

-- The previous two-arg version is replaced; revoke and grant on the new signature.
revoke all on function public.start_extraction_run(uuid, text, text) from public;
revoke all on function public.start_extraction_run(uuid, text, text) from anon;
revoke all on function public.start_extraction_run(uuid, text, text) from authenticated;
grant execute on function public.start_extraction_run(uuid, text, text) to service_role;

-- Drop the prior single-argument signature so callers cannot keep using the
-- version that did not record provider/model.
drop function if exists public.start_extraction_run(uuid);
