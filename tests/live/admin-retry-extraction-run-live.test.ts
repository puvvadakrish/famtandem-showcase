import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const haveLocalSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

const describeIfLocal = haveLocalSupabase ? describe : describe.skip;

describeIfLocal("local db: retry_failed_extraction_run", () => {
  it("allows internal admins to retry failed runs idempotently and denies non-admins", () => {
    expect(() =>
      runLocalSql(`
do $$
declare
  household_id uuid := gen_random_uuid();
  admin_user_id uuid := gen_random_uuid();
  non_admin_user_id uuid := gen_random_uuid();
  source_id uuid := gen_random_uuid();
  run_id uuid;
  first_job_id uuid;
  second_job_id uuid;
  active_job_count integer;
  run_status public.extraction_run_status;
  run_error text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (admin_user_id, 'authenticated', 'authenticated', 'admin-' || admin_user_id::text || '@example.test', now(), now()),
    (non_admin_user_id, 'authenticated', 'authenticated', 'parent-' || non_admin_user_id::text || '@example.test', now(), now());

  insert into public.households (id, name, slug, timezone)
  values (household_id, 'Retry RPC Test', 'retry-rpc-test-' || left(household_id::text, 8), 'America/Chicago');

  insert into public.internal_admins (user_id)
  values (admin_user_id);

  insert into public.source_inputs (id, household_id, source_type, raw_subject, normalized_text, status)
  values (
    source_id,
    household_id,
    'paste',
    'Failed source',
    'Practice moved to 4 PM.',
    'failed'
  );

  select id into run_id from public.extraction_runs where source_input_id = source_id;

  update public.jobs
  set status = 'failed'
  where kind = 'extract_source'
    and payload->>'extraction_run_id' = run_id::text;

  update public.extraction_runs
  set status = 'failed', last_error = 'Gemini timeout'
  where id = run_id;

  perform set_config('request.jwt.claim.sub', non_admin_user_id::text, true);

  begin
    perform * from public.retry_failed_extraction_run(run_id);
    raise exception 'non-admin unexpectedly retried an extraction run';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  select job_id
  into first_job_id
  from public.retry_failed_extraction_run(run_id);

  select status, last_error
  into run_status, run_error
  from public.extraction_runs
  where id = run_id;

  if run_status <> 'pending'::public.extraction_run_status or run_error is not null then
    raise exception 'retry did not reset failed run: status=%, error=%', run_status, run_error;
  end if;

  update public.extraction_runs
  set status = 'failed', last_error = 'second failure'
  where id = run_id;

  select job_id
  into second_job_id
  from public.retry_failed_extraction_run(run_id);

  if second_job_id <> first_job_id then
    raise exception 'retry created a duplicate active job: first=%, second=%', first_job_id, second_job_id;
  end if;

  select count(*)
  into active_job_count
  from public.jobs
  where kind = 'extract_source'
    and status in ('pending', 'running')
    and payload->>'extraction_run_id' = run_id::text;

  if active_job_count <> 1 then
    raise exception 'retry left % active jobs, expected 1', active_job_count;
  end if;

  update public.extraction_runs
  set status = 'succeeded'
  where id = run_id;

  begin
    perform * from public.retry_failed_extraction_run(run_id);
    raise exception 'succeeded run unexpectedly retried';
  exception
    when invalid_parameter_value then
      null;
  end;

  raise notice 'retry_failed_extraction_run local db assertions passed';
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
