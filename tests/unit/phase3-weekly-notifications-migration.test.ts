import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260526120000_phase3_weekly_coverage_review_notifications.sql",
  "utf8"
);

describe("weekly coverage review notification migration", () => {
  it("adds a service-role RPC for atomic weekly run and job enqueue", () => {
    expect(migration).toContain("create or replace function public.enqueue_weekly_notification_run");
    expect(migration).toContain("'weekly_coverage_review'");
    expect(migration).toContain("weekly notification recipient must be an active parent or household admin");
    expect(migration).toContain("role in ('parent', 'household_admin')");
    expect(migration).toContain("p_period_start");
    expect(migration).toContain("p_period_end");
    expect(migration).toContain("send_weekly_coverage_review");
    expect(migration).toContain("status in ('sent', 'skipped_empty', 'failed')");
    expect(migration).toContain("for update");
    expect(migration).toContain("jobs.status in ('pending', 'running')");
    expect(migration).toContain(
      "grant execute on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) to service_role"
    );
  });

  it("keeps weekly enqueue unavailable to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from public"
    );
    expect(migration).toContain(
      "revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from anon"
    );
    expect(migration).toContain(
      "revoke all on function public.enqueue_weekly_notification_run(uuid, uuid, date, date) from authenticated"
    );
  });

  it("extends start_notification_run with period fields for weekly rendering", () => {
    expect(migration).toContain("drop function public.start_notification_run(uuid)");
    expect(migration).toContain("period_start date");
    expect(migration).toContain("period_end date");
    expect(migration).toContain("metadata jsonb");
    expect(migration).toContain("notification_runs.period_start");
    expect(migration).toContain("notification_runs.period_end");
    expect(migration).toContain("notification_runs.metadata");
  });

  it("adds a service-role RPC for stable weekly content snapshots", () => {
    expect(migration).toContain("create or replace function public.snapshot_weekly_notification_run");
    expect(migration).toContain("and notification_type = 'weekly_coverage_review'");
    expect(migration).toContain("and processing_token = p_processing_token");
    expect(migration).toContain(
      "grant execute on function public.snapshot_weekly_notification_run(uuid, uuid, jsonb) to service_role"
    );
  });
});
