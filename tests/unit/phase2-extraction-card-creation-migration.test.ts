import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260524110000_phase2_extraction_card_creation.sql"
  ),
  "utf8"
);

describe("phase 2 extraction card creation migration", () => {
  it("defines create_extracted_cards as service_role-only", () => {
    expect(migration).toContain(
      "create or replace function public.create_extracted_cards(\n  p_extraction_run_id uuid,\n  p_cards jsonb\n)"
    );
    expect(migration).toContain(
      "grant execute on function public.create_extracted_cards(uuid, jsonb) to service_role"
    );
    expect(migration).toContain(
      "revoke all on function public.create_extracted_cards(uuid, jsonb) from authenticated"
    );
  });

  it("is idempotent: returns existing card ids when card_count > 0", () => {
    expect(migration).toContain("if run_row.card_count > 0 then");
    expect(migration).toContain("from public.coverage_cards");
    expect(migration).toContain("where household_id = run_row.household_id");
  });

  it("rejects non-array p_cards payloads", () => {
    expect(migration).toContain("p_cards must be a JSON array");
  });

  it("derives needs_review and changed attention flags from card fields", () => {
    expect(migration).toContain("initial_attention_flags := array['needs_coverage']::text[]");
    expect(migration).toContain(
      "jsonb_array_length(card_review_reasons) > 0 or card_confidence < 0.750"
    );
    expect(migration).toContain(
      "card_type_value = 'change_standalone' or jsonb_array_length(card_changed_fields) > 0"
    );
  });

  it("defaults to a general_owner slot when suggestedSlots is empty", () => {
    expect(migration).toContain("slot_kinds := array['general_owner']::public.coverage_slot_kind[]");
  });

  it("links every created card back to the source input via full_source_ref", () => {
    expect(migration).toContain("'source_inputs:' || run_row.source_input_id::text");
  });

  it("records an extracted_source_card_created audit event with a confidence bucket", () => {
    expect(migration).toContain("'extracted_source_card_created'");
    expect(migration).toContain("'confidenceBucket'");
    expect(migration).toContain("'extractionRunId'");
  });
});
