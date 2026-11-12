import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { captureServerEvent } from "@/lib/posthog/server";
import { isAuthorizedCronRequest } from "@/lib/jobs/cron-auth";
import { processJobBatch } from "@/lib/jobs/runner";
import { enqueueDailyUnresolvedNudges } from "@/lib/notifications/daily-unresolved";
import { enqueueWeeklyCoverageReviews } from "@/lib/notifications/weekly-coverage-review";
import { selectExtractor } from "@/lib/extraction/provider";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const env = getServerEnv();

  if (!isAuthorizedCronRequest(request.headers, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const dailyNudgeEnqueue = await safelyEnqueueDailyUnresolvedNudges(supabase);
  const weeklyReviewEnqueue = await safelyEnqueueWeeklyCoverageReviews(supabase);
  const selected = selectExtractor({
    EXTRACTION_PROVIDER: env.EXTRACTION_PROVIDER,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_MODEL: env.GEMINI_MODEL
  });

  const result = await processJobBatch({
    supabase,
    batchSize: env.JOB_BATCH_SIZE,
    extractor: selected.extractor,
    extractorProvider: selected.provider,
    extractorModel: selected.model
  });

  await captureServerEvent("cron_jobs_processed", {
    claimed: result.claimed,
    succeeded: result.succeeded,
    failed: result.failed,
    provider: selected.provider,
    daily_nudge_runs_created: dailyNudgeEnqueue.createdRuns,
    daily_nudge_jobs_created: dailyNudgeEnqueue.createdJobs,
    daily_nudge_enqueue_failed: dailyNudgeEnqueue.failed,
    weekly_review_runs_created: weeklyReviewEnqueue.createdRuns,
    weekly_review_jobs_created: weeklyReviewEnqueue.createdJobs,
    weekly_review_enqueue_failed: weeklyReviewEnqueue.failed
  });

  return NextResponse.json({ ...result, dailyNudgeEnqueue, weeklyReviewEnqueue });
}

async function safelyEnqueueDailyUnresolvedNudges(
  supabase: ReturnType<typeof createSupabaseServiceClient>
) {
  try {
    return {
      ...(await enqueueDailyUnresolvedNudges({ supabase })),
      failed: false,
      error: null
    };
  } catch (error) {
    return {
      eligibleHouseholds: 0,
      dueHouseholds: 0,
      createdRuns: 0,
      createdJobs: 0,
      failed: true,
      error: error instanceof Error ? error.message : "Unknown daily nudge enqueue failure"
    };
  }
}

async function safelyEnqueueWeeklyCoverageReviews(
  supabase: ReturnType<typeof createSupabaseServiceClient>
) {
  try {
    return {
      ...(await enqueueWeeklyCoverageReviews({ supabase })),
      failed: false,
      error: null
    };
  } catch (error) {
    return {
      eligibleHouseholds: 0,
      dueHouseholds: 0,
      createdRuns: 0,
      createdJobs: 0,
      failed: true,
      error: error instanceof Error ? error.message : "Unknown weekly review enqueue failure"
    };
  }
}
