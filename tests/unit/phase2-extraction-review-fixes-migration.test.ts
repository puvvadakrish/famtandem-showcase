import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260524120000_phase2_extraction_review_fixes.sql"
  ),
  "utf8"
);

describe("phase 2 extraction review fixes migration", () => {
  it("stamps card_count inside create_extracted_cards so retries are idempotent", () => {
    expect(migration).toContain("create or replace function public.create_extracted_cards");
    expect(migration).toContain("if inserted_card_count > 0 then");
    expect(migration).toContain("update public.extraction_runs");
    expect(migration).toContain("set card_count = inserted_card_count");
  });

  it("accepts optional provider and model on start_extraction_run", () => {
    expect(migration).toContain(
      "create or replace function public.start_extraction_run(\n  p_run_id uuid,\n  p_provider text default null,\n  p_model text default null\n)"
    );
    expect(migration).toContain("provider = coalesce(normalized_provider, extraction_runs.provider)");
    expect(migration).toContain("model = coalesce(normalized_model, extraction_runs.model)");
  });

  it("drops the prior single-argument signature and grants service_role on the new one", () => {
    expect(migration).toContain("drop function if exists public.start_extraction_run(uuid)");
    expect(migration).toContain(
      "grant execute on function public.start_extraction_run(uuid, text, text) to service_role"
    );
  });
});
