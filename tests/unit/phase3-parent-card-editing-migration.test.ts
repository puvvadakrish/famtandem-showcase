import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526160000_phase3_parent_card_editing.sql"),
  "utf8"
);

describe("phase 3 parent card editing migration", () => {
  it("adds a parent-or-admin helper without granting direct execute", () => {
    expect(migration).toContain("create or replace function public.is_household_parent_or_admin");
    expect(migration).toContain("role in ('parent', 'household_admin')");
    expect(migration).toContain("revoke all on function public.is_household_parent_or_admin(uuid) from authenticated");
  });

  it("uses constrained RPCs instead of broad parent table update policies", () => {
    expect(migration).toContain("create or replace function public.correct_coverage_card");
    expect(migration).toContain("create or replace function public.correct_readiness_item");
    expect(migration).toContain("create or replace function public.add_readiness_item_to_card");
    expect(migration).toContain("grant execute on function public.correct_coverage_card");
    expect(migration).toContain("grant execute on function public.correct_readiness_item");
    expect(migration).toContain("grant execute on function public.add_readiness_item_to_card");
    expect(migration).toContain("parents can only correct source-backed coverage cards");
    expect(migration).toContain("parents can only correct source-backed readiness items");
    expect(migration).toContain("parents can only add readiness items to source-backed cards");
    expect(migration).toContain("p_child_ids uuid[]");
    expect(migration).not.toContain("p_source_summary");
    expect(migration).not.toContain("p_review_reason");
    expect(migration).not.toContain("p_confidence");
    expect(migration).not.toContain('create policy "parents and household admins can correct coverage cards"');
    expect(migration).not.toContain("on public.coverage_cards for update");
  });

  it("does not widen provider, source, or household setup policies", () => {
    expect(migration).not.toContain("source_inputs");
    expect(migration).not.toContain("source_artifacts");
    expect(migration).not.toContain("coverage_request");
    expect(migration).not.toContain("on public.household_members");
    expect(migration).not.toContain("storage.objects");
  });
});
