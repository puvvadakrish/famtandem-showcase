import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260527100000_phase3_household_member_email_claim.sql"),
  "utf8"
);

describe("phase 3 household member email claim migration", () => {
  it("claims pending members from the authenticated jwt email only", () => {
    expect(migration).toContain("create or replace function public.claim_household_member_by_email()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("auth.jwt() ->> 'email'");
    expect(migration).toContain("from auth.users");
    expect(migration).toContain("email_confirmed_at");
    expect(migration).toContain("'unverified_email'");
    expect(migration).not.toContain("p_email");
  });

  it("keeps claim narrow and rejects ambiguous matches", () => {
    expect(migration).toContain("and user_id is null");
    expect(migration).toContain("if matching_count > 1 then");
    expect(migration).toContain("into target_member_id");
    expect(migration).toContain("where id = target_member_id");
    expect(migration).toContain("'ambiguous_match'");
    expect(migration).toContain("'already_member'");
  });

  it("exposes the claim rpc only to authenticated users", () => {
    expect(migration).toContain(
      "revoke all on function public.claim_household_member_by_email() from public"
    );
    expect(migration).toContain(
      "grant execute on function public.claim_household_member_by_email() to authenticated"
    );
  });
});
