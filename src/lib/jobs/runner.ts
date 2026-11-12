import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTextForSourceArtifact } from "@/lib/artifact-text/runner";
import type { ArtifactTextExtractor } from "@/lib/artifact-text/provider";
import { runExtractionForSourceInput, type ExtractorFn } from "@/lib/extraction/runner";
import { sendDailyUnresolvedNudge } from "@/lib/notifications/daily-unresolved";
import { sendWeeklyCoverageReview } from "@/lib/notifications/weekly-coverage-review";

export type ClaimedJob = {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
};

export type ProcessJobBatchInput = {
  supabase: SupabaseClient;
  batchSize: number;
  extractor?: ExtractorFn;
  extractorProvider?: string;
  extractorModel?: string;
  artifactTextExtractor?: ArtifactTextExtractor | null;
};

export type ProcessJobBatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
};

export async function processJobBatch({
  supabase,
  batchSize,
  extractor,
  extractorProvider,
  extractorModel,
  artifactTextExtractor
}: ProcessJobBatchInput): Promise<ProcessJobBatchResult> {
  const { data, error } = await supabase.rpc("claim_due_jobs", {
    batch_size: batchSize
  });

  if (error) {
    throw new Error(`Unable to claim due jobs: ${error.message}`);
  }

  const jobs = (data ?? []) as ClaimedJob[];
  const result: ProcessJobBatchResult = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    jobIds: jobs.map((job) => job.id)
  };

  for (const job of jobs) {
    try {
      await processSingleJob(
        supabase,
        job,
        extractor,
        extractorProvider,
        extractorModel,
        artifactTextExtractor
      );
      await markJobSucceeded(supabase, job.id);
      result.succeeded += 1;
    } catch (jobError) {
      await markJobFailed(supabase, job.id, getErrorMessage(jobError));
      result.failed += 1;
    }
  }

  return result;
}

async function processSingleJob(
  supabase: SupabaseClient,
  job: ClaimedJob,
  extractor?: ExtractorFn,
  extractorProvider?: string,
  extractorModel?: string,
  artifactTextExtractor?: ArtifactTextExtractor | null
) {
  if (job.kind === "noop") {
    return;
  }

  if (job.kind === "extract_source") {
    const payload = job.payload ?? {};
    const extractionRunId = readUuid(payload, "extraction_run_id");
    await runExtractionForSourceInput({
      supabase,
      extractionRunId,
      extractor,
      provider: extractorProvider,
      model: extractorModel
    });
    return;
  }

  if (job.kind === "extract_artifact_text") {
    const payload = job.payload ?? {};
    const sourceArtifactId = readUuid(payload, "source_artifact_id");
    await extractTextForSourceArtifact({
      supabase,
      sourceArtifactId,
      artifactTextExtractor
    });
    return;
  }

  if (job.kind === "send_daily_unresolved_nudge") {
    const payload = job.payload ?? {};
    const notificationRunId = readUuid(payload, "notification_run_id");
    await sendDailyUnresolvedNudge({
      supabase,
      notificationRunId
    });
    return;
  }

  if (job.kind === "send_weekly_coverage_review") {
    const payload = job.payload ?? {};
    const notificationRunId = readUuid(payload, "notification_run_id");
    await sendWeeklyCoverageReview({
      supabase,
      notificationRunId
    });
    return;
  }

  throw new Error(`No processor registered for job kind: ${job.kind}`);
}

function readUuid(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Job payload is missing required field: ${key}`);
  }
  return value;
}

async function markJobSucceeded(supabase: SupabaseClient, jobId: string) {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      locked_at: null,
      processed_at: new Date().toISOString(),
      last_error: null
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Unable to mark job ${jobId} succeeded: ${error.message}`);
  }
}

async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  message: string
) {
  const { error } = await supabase.rpc("mark_job_failed", {
    job_id: jobId,
    error_message: message
  });

  if (error) {
    throw new Error(`Unable to mark job ${jobId} failed: ${error.message}`);
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown job failure";
}
