import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260525100000_phase3_admin_retry_extraction_runs.sql"
  ),
  "utf8"
);

describe("phase 3 admin retry extraction runs migration", () => {
  it("defines an internal-admin retry RPC with authenticated execution only", () => {
    expect(migration).toContain(
      "create or replace function public.retry_failed_extraction_run(p_run_id uuid)"
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("if not public.is_internal_admin() then");
    expect(migration).toContain("Only internal admins can retry extraction runs");
    expect(migration).toContain(
      "revoke all on function public.retry_failed_extraction_run(uuid) from anon"
    );
    expect(migration).toContain(
      "grant execute on function public.retry_failed_extraction_run(uuid) to authenticated"
    );
  });

  it("only resets failed extraction runs to pending and clears last_error", () => {
    expect(migration).toContain(
      "if run_row.status <> 'failed'::public.extraction_run_status then"
    );
    expect(migration).toContain("Only failed extraction runs can be retried");
    expect(migration).toContain("set status = 'pending'");
    expect(migration).toContain("last_error = null");
  });

  it("re-enqueues one active extract_source job idempotently", () => {
    expect(migration).toContain("insert into public.jobs (kind, payload)");
    expect(migration).toContain("'extract_source'");
    expect(migration).toContain("'extraction_run_id', run_row.id");
    expect(migration).toContain("where not exists (");
    expect(migration).toContain("jobs.status in ('pending', 'running')");
    expect(migration).toContain("jobs.payload->>'extraction_run_id' = run_row.id::text");
  });
});
