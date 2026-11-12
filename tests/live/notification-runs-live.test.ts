import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const haveLocalSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

const describeIfLocal = haveLocalSupabase ? describe : describe.skip;

describeIfLocal("local db: notification run RPCs", () => {
  it("keeps enqueue/start/record service-role scoped and idempotent", () => {
    expect(() =>
      runLocalSql(`
do $$
declare
  v_household_id uuid := '00000000-0000-4000-8000-000000000101';
  v_member_id uuid := '00000000-0000-4000-8000-000000000102';
  v_user_id uuid := '00000000-0000-4000-8000-000000000103';
  v_helper_member_id uuid := '00000000-0000-4000-8000-000000000104';
  v_inactive_member_id uuid := '00000000-0000-4000-8000-000000000105';
  v_helper_user_id uuid := '00000000-0000-4000-8000-000000000106';
  v_inactive_user_id uuid := '00000000-0000-4000-8000-000000000107';
  first_result record;
  second_result record;
  repaired_result record;
  weekly_result record;
  weekly_second_result record;
  weekly_repaired_result record;
  run_row record;
  active_jobs integer;
  visible_runs integer;
  visible_settings integer;
begin
  delete from public.jobs
  where kind = 'send_daily_unresolved_nudge'
    and payload->>'notification_run_id' in (
      select id::text
      from public.notification_runs
      where household_id = v_household_id
    );
  delete from public.households where id = v_household_id;
  delete from auth.users where id = v_user_id;

  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'notify-admin@example.test', now(), now()),
    (v_helper_user_id, 'authenticated', 'authenticated', 'notify-helper@example.test', now(), now()),
    (v_inactive_user_id, 'authenticated', 'authenticated', 'notify-inactive@example.test', now(), now())
  on conflict (id) do nothing;

  insert into public.households (id, name, slug, timezone)
  values (v_household_id, 'Notification RPC Test', 'notification-rpc-test', 'America/Chicago')
  on conflict (id) do nothing;

  insert into public.household_members (id, household_id, user_id, role, display_name, email, active)
  values (v_member_id, v_household_id, v_user_id, 'household_admin', 'Notify Admin', 'notify-admin@example.test', true)
  on conflict (id) do nothing;

  insert into public.household_members (id, household_id, user_id, role, display_name, email, active)
  values
    (v_helper_member_id, v_household_id, v_helper_user_id, 'helper', 'Helper', 'helper@example.test', true),
    (v_inactive_member_id, v_household_id, v_inactive_user_id, 'parent', 'Inactive Parent', 'inactive@example.test', false)
  on conflict (id) do update
  set role = excluded.role,
      email = excluded.email,
      active = excluded.active;

  execute 'set local role authenticated';
  begin
    perform public.enqueue_daily_notification_run(
      v_household_id,
      v_member_id,
      '2026-05-26'::date
    );
    raise exception 'authenticated unexpectedly enqueued a daily notification run';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.enqueue_weekly_notification_run(
      v_household_id,
      v_member_id,
      '2026-05-31'::date,
      '2026-06-06'::date
    );
    raise exception 'authenticated unexpectedly enqueued a weekly notification run';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.start_notification_run(gen_random_uuid());
    raise exception 'authenticated unexpectedly started a notification run';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.record_notification_run(
      gen_random_uuid(),
      gen_random_uuid(),
      'failed',
      'local-stub',
      null,
      'denied',
      '{}'::jsonb
    );
    raise exception 'authenticated unexpectedly recorded a notification run';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.snapshot_weekly_notification_run(
      gen_random_uuid(),
      gen_random_uuid(),
      '{}'::jsonb
    );
    raise exception 'authenticated unexpectedly snapshotted a weekly notification run';
  exception
    when insufficient_privilege then
      null;
  end;

  select count(*) into visible_runs from public.notification_runs;
  select count(*) into visible_settings from public.household_notification_settings;

  if visible_runs <> 0 or visible_settings <> 0 then
    raise exception 'non-internal authenticated role saw notification private tables: runs=%, settings=%',
      visible_runs,
      visible_settings;
  end if;
  execute 'reset role';

  insert into public.household_notification_settings (household_id, daily_unresolved_enabled)
  values (v_household_id, true)
  on conflict (household_id) do update
  set daily_unresolved_enabled = excluded.daily_unresolved_enabled;

  insert into public.internal_admins (user_id, active)
  values (v_user_id, true)
  on conflict (user_id) do update
  set active = excluded.active;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  execute 'set local role authenticated';
  select count(*) into visible_settings from public.household_notification_settings;
  execute 'reset role';

  if visible_settings = 0 then
    raise exception 'active internal admin could not read notification settings';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);

  select *
  into first_result
  from public.enqueue_daily_notification_run(v_household_id, v_member_id, '2026-05-26'::date);

  if first_result.created_run is not true or first_result.created_job is not true then
    raise exception 'first enqueue did not create run and job: %', row_to_json(first_result);
  end if;

  select *
  into second_result
  from public.enqueue_daily_notification_run(v_household_id, v_member_id, '2026-05-26'::date);

  if second_result.created_run is not false or second_result.created_job is not false then
    raise exception 'second enqueue was not idempotent: %', row_to_json(second_result);
  end if;

  update public.jobs
  set status = 'failed'
  where id = first_result.job_id;

  select *
  into repaired_result
  from public.enqueue_daily_notification_run(v_household_id, v_member_id, '2026-05-26'::date);

  if repaired_result.created_run is not false or repaired_result.created_job is not true then
    raise exception 'enqueue did not repair missing active job: %', row_to_json(repaired_result);
  end if;

  select *
  into run_row
  from public.start_notification_run(first_result.run_id);

  if run_row.id is null or run_row.processing_token is null or run_row.attempt_count <> 1 then
    raise exception 'start_notification_run did not lease run correctly: %', row_to_json(run_row);
  end if;

  begin
    perform public.record_notification_run(
      first_result.run_id,
      gen_random_uuid(),
      'sent',
      'local-stub',
      'wrong-token',
      null,
      '{}'::jsonb
    );
    raise exception 'record_notification_run unexpectedly accepted a stale processing token';
  exception
    when serialization_failure then
      null;
  end;

  select *
  into run_row
  from public.notification_runs
  where id = first_result.run_id;

  if run_row.status <> 'running' then
    raise exception 'stale record changed run status: %', run_row.status;
  end if;

  perform public.record_notification_run(
    first_result.run_id,
    run_row.processing_token,
    'sent',
    'local-stub',
    'local-stub:run:daily',
    null,
    '{"item_count": 1}'::jsonb
  );

  select *
  into run_row
  from public.notification_runs
  where id = first_result.run_id;

  if run_row.status <> 'sent'
    or run_row.processing_token is not null
    or run_row.provider_message_id <> 'local-stub:run:daily'
  then
    raise exception 'record_notification_run did not terminalize run: %', row_to_json(run_row);
  end if;

  select count(*)
  into active_jobs
  from public.jobs
  where kind = 'send_daily_unresolved_nudge'
    and status in ('pending', 'running')
    and payload->>'notification_run_id' = first_result.run_id::text;

  if active_jobs <> 1 then
    raise exception 'expected exactly one active repaired job, found %', active_jobs;
  end if;

  select *
  into weekly_result
  from public.enqueue_weekly_notification_run(
    v_household_id,
    v_member_id,
    '2026-05-31'::date,
    '2026-06-06'::date
  );

  if weekly_result.created_run is not true or weekly_result.created_job is not true then
    raise exception 'first weekly enqueue did not create run and job: %', row_to_json(weekly_result);
  end if;

  begin
    perform public.enqueue_weekly_notification_run(
      v_household_id,
      v_helper_member_id,
      '2026-06-07'::date,
      '2026-06-13'::date
    );
    raise exception 'weekly enqueue unexpectedly accepted a helper recipient';
  exception
    when check_violation then
      null;
  end;

  begin
    perform public.enqueue_weekly_notification_run(
      v_household_id,
      v_inactive_member_id,
      '2026-06-07'::date,
      '2026-06-13'::date
    );
    raise exception 'weekly enqueue unexpectedly accepted an inactive recipient';
  exception
    when check_violation then
      null;
  end;

  select *
  into weekly_second_result
  from public.enqueue_weekly_notification_run(
    v_household_id,
    v_member_id,
    '2026-05-31'::date,
    '2026-06-06'::date
  );

  if weekly_second_result.created_run is not false or weekly_second_result.created_job is not false then
    raise exception 'second weekly enqueue was not idempotent: %', row_to_json(weekly_second_result);
  end if;

  update public.jobs
  set status = 'failed'
  where id = weekly_result.job_id;

  select *
  into weekly_repaired_result
  from public.enqueue_weekly_notification_run(
    v_household_id,
    v_member_id,
    '2026-05-31'::date,
    '2026-06-06'::date
  );

  if weekly_repaired_result.created_run is not false or weekly_repaired_result.created_job is not true then
    raise exception 'weekly enqueue did not repair missing active job: %', row_to_json(weekly_repaired_result);
  end if;

  select *
  into run_row
  from public.start_notification_run(weekly_result.run_id);

  if run_row.id is null
    or run_row.processing_token is null
    or run_row.period_start <> '2026-05-31'::date
    or run_row.period_end <> '2026-06-06'::date
  then
    raise exception 'start_notification_run did not return weekly period fields: %', row_to_json(run_row);
  end if;

  perform public.snapshot_weekly_notification_run(
    weekly_result.run_id,
    run_row.processing_token,
    '{"item_count": 1, "weekly_snapshot": {"subject": "Weekly", "text": "Body", "html": "<p>Body</p>", "itemCount": 1, "previewCount": 1, "periodStart": "2026-05-31", "periodEnd": "2026-06-06"}}'::jsonb
  );

  select *
  into run_row
  from public.notification_runs
  where id = weekly_result.run_id;

  if run_row.metadata->'weekly_snapshot'->>'subject' <> 'Weekly' then
    raise exception 'snapshot_weekly_notification_run did not persist snapshot metadata: %',
      row_to_json(run_row);
  end if;
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
