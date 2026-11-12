import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525120000_phase3_coverage_requests.sql"),
  "utf8"
);

describe("phase 3 coverage requests migration", () => {
  it("adds a dedicated token table without direct client access", () => {
    expect(migration).toContain("create table public.coverage_request_tokens");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("alter table public.coverage_request_tokens enable row level security");
    expect(migration).toContain("revoke all on table public.coverage_request_tokens from anon");
    expect(migration).toContain("revoke all on table public.coverage_request_tokens from authenticated");
    expect(migration).not.toContain("create policy");
  });

  it("keeps token lookup and response RPCs service-role only", () => {
    expect(migration).toContain("create or replace function public.get_coverage_request_by_token_hash");
    expect(migration).toContain("create or replace function public.respond_to_coverage_request");
    expect(migration).toContain("grant execute on function public.get_coverage_request_by_token_hash(text) to service_role");
    expect(migration).toContain("grant execute on function public.respond_to_coverage_request(text, public.coverage_response_value) to service_role");
    expect(migration).toContain("revoke all on function public.get_coverage_request_by_token_hash(text) from authenticated");
    expect(migration).toContain("revoke all on function public.respond_to_coverage_request(text, public.coverage_response_value) from authenticated");
  });

  it("adds database idempotency guards for active requests and responses", () => {
    expect(migration).toContain("coverage_requests_one_pending_per_slot_idx");
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toContain("coverage_responses_one_per_request_idx");
    expect(migration).toContain("for update");
    expect(migration).toContain("on conflict (request_id) do nothing");
    expect(migration).toContain("request_token_id must belong to the same coverage card and household as slot_id");
    expect(migration).toContain("Two-slot requests must be drop-off and pickup on the same card.");
  });

  it("updates slot validation for the narrow service-role response path", () => {
    expect(migration).toContain("create or replace function public.validate_coverage_slot_household_refs");
    expect(migration).toContain("current_setting('famtandem.coverage_request_response', true)");
    expect(migration).toContain("perform set_config('famtandem.coverage_request_response', 'on', true)");
  });

  it("keeps stub send marking constrained to local provider values", () => {
    expect(migration).toContain("p_provider <> 'local-stub'");
    expect(migration).toContain("p_status not in ('stubbed', 'failed')");
    expect(migration).toContain("provider_message_id is distinct from p_provider_message_id");
  });
});
