import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260526100000_phase3_daily_unresolved_notifications.sql",
  "utf8"
);

describe("daily unresolved notification migration", () => {
  it("adds notification settings disabled by default", () => {
    expect(migration).toContain("create table public.household_notification_settings");
    expect(migration).toContain("daily_unresolved_enabled boolean not null default false");
    expect(migration).toContain("weekly_coverage_review_enabled boolean not null default false");
  });

  it("adds daily and weekly compatible notification run uniqueness", () => {
    expect(migration).toContain("create type public.notification_type");
    expect(migration).toContain("'daily_unresolved'");
    expect(migration).toContain("'weekly_coverage_review'");
    expect(migration).toContain("notification_runs_daily_unique_idx");
    expect(migration).toContain("household_id, recipient_member_id, notification_type, local_date");
    expect(migration).toContain("notification_runs_weekly_unique_idx");
    expect(migration).toContain("household_id, recipient_member_id, notification_type, period_start");
  });

  it("keeps notification settings and runs internal-admin readable only", () => {
    expect(migration).toContain("alter table public.household_notification_settings enable row level security");
    expect(migration).toContain("alter table public.notification_runs enable row level security");
    expect(migration).toContain("internal admins can read household notification settings");
    expect(migration).toContain("internal admins can read notification runs");
    expect(migration).not.toContain("helpers can read");
  });

  it("validates notification run household references", () => {
    expect(migration).toContain("create or replace function public.validate_notification_run_household_refs");
    expect(migration).toContain("recipient_member_id must belong to the notification household");
    expect(migration).toContain("create trigger notification_runs_validate_household_refs");
  });

  it("uses a service-role RPC for atomic run and job enqueue", () => {
    expect(migration).toContain("create or replace function public.enqueue_daily_notification_run");
    expect(migration).toContain("insert into public.notification_runs");
    expect(migration).toContain("insert into public.jobs");
    expect(migration).toContain("status in ('sent', 'skipped_empty', 'failed')");
    expect(migration).toContain("for update");
    expect(migration).toContain("jobs.status in ('pending', 'running')");
    expect(migration).toContain("grant execute on function public.enqueue_daily_notification_run(uuid, uuid, date) to service_role");
  });

  it("uses service-role RPCs for leased run start and terminal recording", () => {
    expect(migration).toContain("create or replace function public.start_notification_run");
    expect(migration).toContain("attempt_count = notification_runs.attempt_count + 1");
    expect(migration).toContain("processing_token = new_processing_token");
    expect(migration).toContain("notification_runs.updated_at < now() - interval '15 minutes'");
    expect(migration).toContain("grant execute on function public.start_notification_run(uuid) to service_role");
    expect(migration).toContain("create or replace function public.record_notification_run");
    expect(migration).toContain("record_notification_run only accepts terminal status");
    expect(migration).toContain("processing_token = p_processing_token");
    expect(migration).toContain("grant execute on function public.record_notification_run");
  });
});
