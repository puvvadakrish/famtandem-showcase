import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const haveLocalSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

const describeIfLocal = haveLocalSupabase ? describe : describe.skip;

describeIfLocal("local db: parent card editing", () => {
  it("allows same-household parents/admins to correct cards while denying helpers and cross-household parents", () => {
    expect(() =>
      runLocalSql(`
do $$
declare
  v_household_id uuid := gen_random_uuid();
  v_other_household_id uuid := gen_random_uuid();
  v_admin_user_id uuid := gen_random_uuid();
  v_parent_user_id uuid := gen_random_uuid();
  v_helper_user_id uuid := gen_random_uuid();
  v_other_parent_user_id uuid := gen_random_uuid();
  v_admin_member_id uuid := gen_random_uuid();
  v_parent_member_id uuid := gen_random_uuid();
  v_helper_member_id uuid := gen_random_uuid();
  v_other_parent_member_id uuid := gen_random_uuid();
  v_child_id uuid := gen_random_uuid();
  v_second_child_id uuid := gen_random_uuid();
  v_other_child_id uuid := gen_random_uuid();
  v_source_id uuid := gen_random_uuid();
  v_card_id uuid := gen_random_uuid();
  v_manual_card_id uuid := gen_random_uuid();
  v_readiness_id uuid := gen_random_uuid();
  v_manual_readiness_id uuid := gen_random_uuid();
  v_title text;
  v_child_links integer;
  v_readiness_label text;
  v_readiness_owner uuid;
  v_source_input_id uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (v_admin_user_id, 'authenticated', 'authenticated', 'edit-admin-' || left(v_admin_user_id::text, 8) || '@example.test', now(), now()),
    (v_parent_user_id, 'authenticated', 'authenticated', 'edit-parent-' || left(v_parent_user_id::text, 8) || '@example.test', now(), now()),
    (v_helper_user_id, 'authenticated', 'authenticated', 'edit-helper-' || left(v_helper_user_id::text, 8) || '@example.test', now(), now()),
    (v_other_parent_user_id, 'authenticated', 'authenticated', 'edit-other-parent-' || left(v_other_parent_user_id::text, 8) || '@example.test', now(), now());

  insert into public.households (id, name, slug, timezone)
  values
    (v_household_id, 'Parent Edit Test', 'parent-edit-test-' || left(v_household_id::text, 8), 'America/Chicago'),
    (v_other_household_id, 'Other Parent Edit Test', 'other-parent-edit-test-' || left(v_other_household_id::text, 8), 'America/Chicago');

  insert into public.household_members (id, household_id, user_id, role, display_name, email, active)
  values
    (v_admin_member_id, v_household_id, v_admin_user_id, 'household_admin', 'Edit Admin', 'edit-admin@example.test', true),
    (v_parent_member_id, v_household_id, v_parent_user_id, 'parent', 'Edit Parent', 'edit-parent@example.test', true),
    (v_helper_member_id, v_household_id, v_helper_user_id, 'helper', 'Edit Helper', 'edit-helper@example.test', true),
    (v_other_parent_member_id, v_other_household_id, v_other_parent_user_id, 'parent', 'Other Parent', 'edit-other-parent@example.test', true);

  insert into public.children (id, household_id, display_name, status)
  values
    (v_child_id, v_household_id, 'Maya', 'active'),
    (v_second_child_id, v_household_id, 'Leo', 'active'),
    (v_other_child_id, v_other_household_id, 'Other Child', 'active');

  insert into public.source_inputs (id, household_id, submitted_by, source_type, raw_subject, normalized_text, status)
  values (v_source_id, v_household_id, v_admin_member_id, 'paste', 'School email', 'Original source text', 'processed');

  insert into public.coverage_cards (
    id,
    household_id,
    source_input_id,
    card_type,
    title,
    source_summary,
    computed_coverage_state,
    attention_flags,
    created_by
  )
  values (
    v_card_id,
    v_household_id,
    v_source_id,
    'event',
    'Original title',
    'School email',
    'needs_coverage',
    array['needs_coverage'],
    v_admin_member_id
  );

  insert into public.coverage_cards (
    id,
    household_id,
    card_type,
    title,
    source_summary,
    computed_coverage_state,
    attention_flags,
    created_by
  )
  values (
    v_manual_card_id,
    v_household_id,
    'event',
    'Manual admin card',
    'Manual entry',
    'needs_coverage',
    array['needs_coverage'],
    v_admin_member_id
  );

  insert into public.card_children (card_id, child_id)
  values (v_card_id, v_child_id), (v_card_id, v_second_child_id);

  insert into public.readiness_items (id, card_id, label, status)
  values
    (v_readiness_id, v_card_id, 'Bring old form', 'open'),
    (v_manual_readiness_id, v_manual_card_id, 'Manual old form', 'open');

  perform set_config('request.jwt.claim.sub', v_helper_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.correct_coverage_card(
      v_card_id,
      'event',
      'Helper edit',
      null,
      null,
      array[v_child_id, v_second_child_id]
    );
    raise exception 'helper unexpectedly edited coverage card';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_other_parent_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.correct_coverage_card(
      v_card_id,
      'event',
      'Cross-household edit',
      null,
      null,
      array[v_child_id, v_second_child_id]
    );
    raise exception 'cross-household parent unexpectedly edited coverage card';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_parent_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.correct_coverage_card(
      v_manual_card_id,
      'event',
      'Parent manual card edit',
      null,
      null,
      array[]::uuid[]
    );
    raise exception 'parent unexpectedly edited a manual card';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.correct_readiness_item(
      v_manual_readiness_id,
      'Parent manual readiness edit',
      'open',
      null,
      null,
      null
    );
    raise exception 'parent unexpectedly edited readiness on a manual card';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.add_readiness_item_to_card(
      v_manual_card_id,
      'Parent manual readiness add',
      null,
      null
    );
    raise exception 'parent unexpectedly added readiness to a manual card';
  exception
    when insufficient_privilege then
      null;
  end;

  perform public.correct_coverage_card(
    v_card_id,
    'event',
    'Corrected by parent',
    '2026-05-22T13:00:00Z',
    'Gym',
    array[v_child_id, v_second_child_id]
  );

  perform public.correct_readiness_item(
    v_readiness_id,
    'Bring display board',
    'open',
    '2026-05-22T13:00:00Z',
    v_parent_member_id,
    null
  );

  perform public.add_readiness_item_to_card(
    v_card_id,
    'Pack snack',
    '2026-05-23T13:00:00Z',
    v_parent_member_id
  );

  update public.coverage_cards
  set source_input_id = gen_random_uuid()
  where id = v_card_id;
  if found then
    raise exception 'parent unexpectedly updated system/source fields directly';
  end if;
  execute 'reset role';

  select title
  into v_title
  from public.coverage_cards
  where id = v_card_id;

  if v_title <> 'Corrected by parent' then
    raise exception 'parent edit did not persist: %', v_title;
  end if;

  select count(*)
  into v_child_links
  from public.card_children
  where card_id = v_card_id
    and child_id = v_child_id;

  if v_child_links <> 1 then
    raise exception 'parent card child link changed unexpectedly: %', v_child_links;
  end if;

  select count(*)
  into v_child_links
  from public.card_children
  where card_id = v_card_id
    and child_id = v_second_child_id;

  if v_child_links <> 1 then
    raise exception 'parent correction dropped a multi-child link: %', v_child_links;
  end if;

  select label, owner_member_id
  into v_readiness_label, v_readiness_owner
  from public.readiness_items
  where id = v_readiness_id;

  if v_readiness_label <> 'Bring display board' or v_readiness_owner <> v_parent_member_id then
    raise exception 'parent readiness update did not persist: %, %', v_readiness_label, v_readiness_owner;
  end if;

  perform set_config('request.jwt.claim.sub', v_parent_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.correct_coverage_card(
      v_card_id,
      'event',
      'Bad child edit',
      null,
      null,
      array[v_other_child_id]
    );
    raise exception 'parent unexpectedly linked cross-household child';
  exception
    when check_violation then
      null;
  end;
  execute 'reset role';

  select source_input_id
  into v_source_input_id
  from public.coverage_cards
  where id = v_card_id;

  if v_source_input_id <> v_source_id then
    raise exception 'source_input_id was unexpectedly changed: %', v_source_input_id;
  end if;

  raise notice 'parent card editing local db assertions passed';
end;
$$;
      `)
    ).not.toThrow();
  });
});

function runLocalSql(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), "famtandem-sql-"));
  const file = join(dir, "query.sql");

  try {
    writeFileSync(file, sql);
    return execFileSync("npx", ["supabase", "db", "query", "--local", "--file", file], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
