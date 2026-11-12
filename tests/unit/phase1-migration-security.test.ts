import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260519010000_phase1_manual_board.sql"),
  "utf8"
);

describe("phase 1 manual board migration", () => {
  it("creates the core manual board tables", () => {
    for (const table of [
      "children",
      "external_contacts",
      "source_inputs",
      "coverage_cards",
      "coverage_slots",
      "readiness_items",
      "card_children",
      "coverage_requests",
      "coverage_responses",
      "card_events"
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps child profiles attached to cards but not slot ownership", () => {
    expect(migration).toContain("create table public.card_children");
    expect(migration).not.toContain("owner_child_id");
    expect(migration).not.toContain("requested_child_id");
  });

  it("requires an owner when a slot is accepted or externally covered", () => {
    expect(migration).toContain("coverage_slots_owner_required_for_accepted");
    expect(migration).toContain("coverage_slots_external_owner_required");
    expect(migration).toContain("state <> 'accepted'");
    expect(migration).toContain("state <> 'covered_external'");
  });

  it("uses household membership/admin helpers for RLS", () => {
    expect(migration).toContain("create or replace function public.is_household_admin");
    expect(migration).toContain('create policy "household admins can create household members"');
    expect(migration).toContain('create policy "members can read coverage cards"');
    expect(migration).toContain('create policy "household admins can manage coverage cards"');
    expect(migration).toContain('create policy "members can accept their own coverage slots"');
    expect(migration).toContain('create policy "members can create their own card events"');
  });

  it("validates household-aligned references at the database layer", () => {
    for (const trigger of [
      "external_contacts_validate_household_refs",
      "source_inputs_validate_household_refs",
      "coverage_cards_validate_household_refs",
      "coverage_slots_validate_household_refs",
      "readiness_items_validate_household_refs",
      "card_children_validate_household_refs",
      "coverage_requests_validate_household_refs",
      "card_events_validate_household_refs"
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
    }

    expect(migration).toContain("assert_household_member_reference");
    expect(migration).toContain("assert_external_contact_reference");
    expect(migration).toContain("members can only accept an unaccepted slot for themselves");
    expect(migration).toContain("NEW.kind is distinct from OLD.kind");
    expect(migration).toContain("revoke all on function public.card_household_id(uuid) from authenticated");
    expect(migration).toContain(
      "revoke all on function public.validate_coverage_slot_household_refs() from authenticated"
    );
    expect(migration).toContain("child_id must belong to the same household");
    expect(migration).toContain("card_id must belong to the same household");
  });
});
