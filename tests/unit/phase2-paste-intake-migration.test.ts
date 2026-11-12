import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260520010000_phase2_paste_source_intake.sql"),
  "utf8"
);
const aiFirstPasteMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525090000_phase3_ai_first_paste_intake.sql"),
  "utf8"
);

describe("phase 2 paste source intake migration", () => {
  it("enforces that source-backed cards reference same-household source inputs", () => {
    expect(migration).toContain("create or replace function public.validate_coverage_card_household_refs");
    expect(migration).toContain("NEW.source_input_id is not null");
    expect(migration).toContain("from public.source_inputs");
    expect(migration).toContain("source_input_id must belong to the same household");
  });

  it("limits full source input reads to household admins and internal admins", () => {
    expect(migration).toContain('drop policy if exists "members can read source inputs"');
    expect(migration).toContain('create policy "parents and household admins can read source inputs"');
    expect(migration).toContain("household_members.role in ('parent', 'household_admin')");
  });

  it("creates source-only paste inputs through one authenticated RPC", () => {
    expect(aiFirstPasteMigration).toContain("create or replace function public.create_paste_source_input");
    expect(aiFirstPasteMigration).toContain("returns table(source_input_id uuid)");
    expect(aiFirstPasteMigration).toContain("role = 'household_admin'");
    expect(aiFirstPasteMigration).toContain("source_type");
    expect(aiFirstPasteMigration).toContain("'paste'");
    expect(aiFirstPasteMigration).toContain("normalized_pasted_text");
    expect(aiFirstPasteMigration).toContain("'pending'");
    expect(aiFirstPasteMigration).toContain("grant execute on function public.create_paste_source_input");
    expect(aiFirstPasteMigration).not.toContain("insert into public.coverage_cards");
  });

  it("revokes the old paste-card RPC from authenticated users", () => {
    expect(aiFirstPasteMigration).toContain("revoke all on function public.create_paste_source_card");
    expect(aiFirstPasteMigration).toContain("from authenticated");
    expect(aiFirstPasteMigration).not.toContain("grant execute on function public.create_paste_source_card");
  });

  it("syncs source input status inside record_extraction_run transactionally", () => {
    expect(aiFirstPasteMigration).toContain("create or replace function public.record_extraction_run");
    expect(aiFirstPasteMigration).toContain("synced_source_status public.source_input_status");
    expect(aiFirstPasteMigration).toContain("synced_source_status := 'failed'");
    expect(aiFirstPasteMigration).toContain("synced_source_status := 'needs_review'");
    expect(aiFirstPasteMigration).toContain("synced_source_status := 'processed'");
    expect(aiFirstPasteMigration).toContain("update public.source_inputs");
    expect(aiFirstPasteMigration).toContain("where extraction_runs.id = p_run_id");
    expect(aiFirstPasteMigration).toContain("grant execute on function public.record_extraction_run");
  });

  it("previously created pasted source cards through one authenticated RPC", () => {
    expect(migration).toContain("create or replace function public.create_paste_source_card");
    expect(migration).toContain("returns table(source_input_id uuid, card_id uuid)");
    expect(migration).toContain("role = 'household_admin'");
    expect(migration).toContain("initial_attention_flags := array['needs_coverage']::text[]");
    expect(migration).toContain("initial_coverage_state := case");
    expect(migration).toContain("status = 'processed'");
    expect(migration).toContain("grant execute on function public.create_paste_source_card");
  });
});
