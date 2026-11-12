import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260524103000_phase2_extraction_run_persistence.sql"
  ),
  "utf8"
);

describe("phase 2 extraction run persistence migration", () => {
  it("defines an extraction_run_status enum with all expected states", () => {
    expect(migration).toContain("create type public.extraction_run_status as enum");
    for (const state of ["pending", "running", "succeeded", "failed", "skipped_no_text"]) {
      expect(migration).toContain(`'${state}'`);
    }
  });

  it("creates a single-run-per-source extraction_runs table with RLS enabled", () => {
    expect(migration).toContain("create table public.extraction_runs");
    expect(migration).toContain("schema_version text not null default 'family-logistics-v1'");
    expect(migration).toContain("create unique index extraction_runs_source_input_id_unique");
    expect(migration).toContain("alter table public.extraction_runs enable row level security");
  });

  it("limits extraction run reads to parents, household admins, and internal admins", () => {
    expect(migration).toContain('create policy "parents and household admins can read extraction runs"');
    expect(migration).toContain("household_members.role in ('parent', 'household_admin')");
    expect(migration).toContain("public.is_internal_admin()");
  });

  it("enforces same-household linkage between extraction runs and source inputs", () => {
    expect(migration).toContain("create or replace function public.validate_extraction_run_household");
    expect(migration).toContain("extraction_runs.household_id must match source input household");
    expect(migration).toContain("create trigger extraction_runs_validate_household");
  });

  it("enqueues an extraction run + job exactly once per source input via AFTER INSERT trigger", () => {
    expect(migration).toContain("create or replace function public.enqueue_source_input_extraction");
    expect(migration).toContain("on conflict (source_input_id) do nothing");
    expect(migration).toContain("'extract_source'");
    expect(migration).toContain("create trigger source_inputs_enqueue_extraction");
    expect(migration).toContain("after insert on public.source_inputs");
  });

  it("exposes start_extraction_run and record_extraction_run only to service_role", () => {
    expect(migration).toContain("create or replace function public.start_extraction_run(p_run_id uuid)");
    expect(migration).toContain("grant execute on function public.start_extraction_run(uuid) to service_role");

    expect(migration).toContain("create or replace function public.record_extraction_run");
    expect(migration).toContain("p_status public.extraction_run_status");
    expect(migration).toContain(
      "grant execute on function public.record_extraction_run(\n  uuid,\n  public.extraction_run_status,\n  jsonb,\n  jsonb,\n  text,\n  integer,\n  text\n) to service_role"
    );
  });

  it("rejects non-terminal statuses in record_extraction_run", () => {
    expect(migration).toContain(
      "record_extraction_run only accepts terminal-or-failed status"
    );
  });
});
