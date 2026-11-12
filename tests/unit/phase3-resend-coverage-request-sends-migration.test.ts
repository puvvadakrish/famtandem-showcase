import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525173000_phase3_resend_coverage_request_sends.sql"),
  "utf8"
);

describe("phase 3 Resend coverage request send migration", () => {
  it("allows only local stub and Resend providers", () => {
    expect(migration).toContain("p_provider not in ('local-stub', 'resend')");
    expect(migration).toContain("p_provider = 'resend'");
    expect(migration).not.toContain("twilio");
  });

  it("allows sent and failed send results without weakening auth", () => {
    expect(migration).toContain("p_status not in ('stubbed', 'sent', 'failed')");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("household_members.role = 'household_admin'");
    expect(migration).toContain("grant execute on function public.mark_coverage_request_sent(uuid, text, text, text) to authenticated");
  });

  it("records send events without adding provider callbacks", () => {
    expect(migration).toContain("coverage_request_send_failed");
    expect(migration).toContain("coverage_request_send_stubbed");
    expect(migration).toContain("coverage_request_sent");
    expect(migration).not.toContain("webhook");
    expect(migration).not.toContain("callback");
  });

  it("increments attempt count for failed sends even without provider message ids", () => {
    expect(migration).toContain("when p_status = 'failed' then attempt_count + 1");
    expect(migration).toContain("provider_message_id is distinct from p_provider_message_id");
  });
});
