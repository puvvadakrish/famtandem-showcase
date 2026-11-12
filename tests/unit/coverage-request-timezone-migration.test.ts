import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260531150000_coverage_request_timezone.sql"),
  "utf8"
);

describe("coverage request timezone migration", () => {
  it("returns household timezone from service-role token lookup", () => {
    expect(migration).toContain("drop function if exists public.get_coverage_request_by_token_hash(text)");
    expect(migration).toContain("household_timezone text");
    expect(migration).toContain("join public.households on households.id = coverage_cards.household_id");
    expect(migration).toContain("households.timezone as household_timezone");
    expect(migration).toContain("household_timezone := token_row.household_timezone");
  });

  it("keeps the token lookup service-role only after replacement", () => {
    expect(migration).toContain("revoke all on function public.get_coverage_request_by_token_hash(text) from anon");
    expect(migration).toContain("revoke all on function public.get_coverage_request_by_token_hash(text) from authenticated");
    expect(migration).toContain("grant execute on function public.get_coverage_request_by_token_hash(text) to service_role");
  });
});
