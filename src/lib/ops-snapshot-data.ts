import {
  buildOpsSnapshot,
  type OpsArtifactTextRow,
  type OpsCoverageSendEventRow,
  type OpsExtractionRunRow,
  type OpsJobSummary,
  type OpsJobRow,
  type OpsNotificationRunRow
} from "@/lib/ops-snapshot";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const coverageRequestSendEvents = [
  "coverage_request_sent",
  "coverage_request_send_failed",
  "coverage_request_send_stubbed"
];
const jobStatuses = ["pending", "running", "succeeded", "failed"];
const jobKinds = [
  "noop",
  "extract_source",
  "extract_artifact_text",
  "send_daily_unresolved_nudge",
  "send_weekly_coverage_review"
];
const staleJobMs = 15 * 60 * 1000;

export async function loadOpsSnapshotAfterAdminGate() {
  const adminSupabase = createSupabaseServiceClient();
  const [
    jobSummary,
    failedJobsResult,
    extractionRunsResult,
    artifactsResult,
    notificationRunsResult,
    coverageSendEventsResult
  ] = await Promise.all([
    loadJobSummary(adminSupabase),
    adminSupabase
      .from("jobs")
      .select("kind, status, run_after, locked_at, updated_at, processed_at, last_error")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(200),
    adminSupabase
      .from("extraction_runs")
      .select("status, provider, updated_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(200),
    adminSupabase
      .from("source_artifacts")
      .select("mime_type, text_extraction_status, updated_at, text_extraction_error")
      .order("updated_at", { ascending: false })
      .limit(200),
    adminSupabase
      .from("notification_runs")
      .select("notification_type, status, provider, updated_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(200),
    adminSupabase
      .from("card_events")
      .select("event_type, metadata, created_at")
      .in("event_type", coverageRequestSendEvents)
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  if (failedJobsResult.error) throw new Error(failedJobsResult.error.message);
  if (extractionRunsResult.error) throw new Error(extractionRunsResult.error.message);
  if (artifactsResult.error) throw new Error(artifactsResult.error.message);
  if (notificationRunsResult.error) throw new Error(notificationRunsResult.error.message);
  if (coverageSendEventsResult.error) throw new Error(coverageSendEventsResult.error.message);

  return buildOpsSnapshot({
    jobs: (failedJobsResult.data ?? []) as OpsJobRow[],
    jobSummary,
    extractionRuns: (extractionRunsResult.data ?? []) as OpsExtractionRunRow[],
    artifactTextRows: (artifactsResult.data ?? []) as OpsArtifactTextRow[],
    notificationRuns: (notificationRunsResult.data ?? []) as OpsNotificationRunRow[],
    coverageSendEvents: (coverageSendEventsResult.data ?? []) as OpsCoverageSendEventRow[]
  });
}

async function loadJobSummary(
  adminSupabase: ReturnType<typeof createSupabaseServiceClient>
): Promise<OpsJobSummary> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - staleJobMs).toISOString();
  const statusCountsPromise = Promise.all(
    jobStatuses.map(async (status) => ({
      label: status,
      count: await exactCount(adminSupabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", status))
    }))
  );
  const kindStatusCountsPromise = Promise.all(
    jobKinds.flatMap((kind) =>
      jobStatuses.map(async (status) => ({
        kind,
        status,
        count: await exactCount(
          adminSupabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("kind", kind)
            .eq("status", status)
        )
      }))
    )
  );
  const oldestPendingPromise = adminSupabase
    .from("jobs")
    .select("run_after")
    .eq("status", "pending")
    .lte("run_after", now.toISOString())
    .order("run_after", { ascending: true })
    .limit(1)
    .maybeSingle<{ run_after: string }>();
  const staleRunningPromise = exactCount(
    adminSupabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .lte("locked_at", staleCutoff)
  );

  const [statusCounts, kindStatusCounts, oldestPendingResult, staleRunningCount] = await Promise.all([
    statusCountsPromise,
    kindStatusCountsPromise,
    oldestPendingPromise,
    staleRunningPromise
  ]);

  if (oldestPendingResult.error) throw new Error(oldestPendingResult.error.message);

  return {
    byStatus: statusCounts.filter((row) => row.count > 0),
    byKindAndStatus: kindStatusCounts.filter((row) => row.count > 0),
    oldestPendingMinutes: oldestPendingResult.data
      ? Math.floor((now.getTime() - new Date(oldestPendingResult.data.run_after).getTime()) / 60000)
      : null,
    staleRunningCount
  };
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>
) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}
