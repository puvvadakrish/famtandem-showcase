import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260530120000_phase4_google_calendar_export.sql",
  "utf8"
);

describe("phase 4 Google Calendar export migration", () => {
  it("stores Google refresh tokens only in a server-only connection table", () => {
    expect(migration).toContain("create table public.google_calendar_connections");
    expect(migration).toContain("encrypted_refresh_token text");
    expect(migration).toContain("status <> 'active' or encrypted_refresh_token is not null");
    expect(migration).toContain("revoke all on public.google_calendar_connections from anon, authenticated");
    expect(migration).not.toContain("grant select on public.google_calendar_connections to authenticated");
  });

  it("keeps card exports idempotent per connection and card", () => {
    expect(migration).toContain("create table public.coverage_card_calendar_exports");
    expect(migration).toContain("status in ('pending', 'running', 'succeeded', 'failed')");
    expect(migration).toContain("coverage_card_calendar_exports_connection_card_unique_idx");
    expect(migration).toContain("on public.coverage_card_calendar_exports(connection_id, card_id)");
  });

  it("guards same-household references and parent/admin connection ownership", () => {
    expect(migration).toContain("validate_google_calendar_connection_household_refs");
    expect(migration).toContain("target_role not in ('parent', 'household_admin')");
    expect(migration).toContain("validate_coverage_card_calendar_export_refs");
  });
});
