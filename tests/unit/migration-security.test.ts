import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260519000000_phase0_foundation.sql"),
  "utf8"
);

describe("phase 0 migration security posture", () => {
  it("does not allow arbitrary self-insert membership bootstrap", () => {
    expect(migration).toContain(
      'create policy "internal admins can create household members"'
    );
    expect(migration).not.toContain(
      'create policy "authenticated users can create their first membership"'
    );
    expect(migration).not.toContain(
      "with check (user_id = auth.uid() or public.is_internal_admin())"
    );
  });

  it("uses a transactional household bootstrap RPC for authenticated users", () => {
    expect(migration).toContain("create or replace function public.create_household_bootstrap");
    expect(migration).toContain(
      'create policy "internal admins can create households directly"'
    );
    expect(migration).toContain("on public.households for insert");
    expect(migration).toContain("with check (public.is_internal_admin())");
    expect(migration).not.toContain(
      'create policy "authenticated users can create households"'
    );
    expect(migration).not.toContain("on public.households for insert\nto authenticated\nwith check (true)");
    expect(migration).toContain("insert into public.households");
    expect(migration).toContain("insert into public.household_members");
    expect(migration).toContain("insert into public.cohort_consents");
    expect(migration).toContain(
      "grant execute on function public.create_household_bootstrap(text, text, text, text, text) to authenticated"
    );
  });

  it("restricts job RPC execution to the service role", () => {
    expect(migration).toContain("revoke all on function public.claim_due_jobs(integer) from authenticated");
    expect(migration).toContain("grant execute on function public.claim_due_jobs(integer) to service_role");
    expect(migration).toContain("revoke all on function public.mark_job_failed(uuid, text) from authenticated");
    expect(migration).toContain("grant execute on function public.mark_job_failed(uuid, text) to service_role");
  });
});
