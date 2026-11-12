import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { selectExtractor } from "@/lib/extraction/provider";
import { runExtractionForSourceInput } from "@/lib/extraction/runner";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type ExtractionRunRow = {
  id: string;
};

export type ProcessSourceInputExtractionResult =
  | { status: "processed"; extractionRunId: string }
  | { status: "missing_run" };

export async function processSourceInputExtractionNow(
  sourceInputId: string
): Promise<ProcessSourceInputExtractionResult> {
  const env = getServerEnv();
  const supabase = createSupabaseServiceClient();
  const extractionRun = await loadExtractionRunForSourceInput(supabase, sourceInputId);

  if (!extractionRun) {
    return { status: "missing_run" };
  }

  const selected = selectExtractor({
    EXTRACTION_PROVIDER: env.EXTRACTION_PROVIDER,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_MODEL: env.GEMINI_MODEL
  });

  await runExtractionForSourceInput({
    supabase,
    extractionRunId: extractionRun.id,
    extractor: selected.extractor,
    provider: selected.provider,
    model: selected.model
  });

  await markQueuedExtractionJobSucceeded(supabase, extractionRun.id);
  return { status: "processed", extractionRunId: extractionRun.id };
}

async function loadExtractionRunForSourceInput(
  supabase: SupabaseClient,
  sourceInputId: string
) {
  const { data, error } = await supabase
    .from("extraction_runs")
    .select("id")
    .eq("source_input_id", sourceInputId)
    .maybeSingle<ExtractionRunRow>();

  if (error) {
    throw new Error(`Unable to load extraction run for source ${sourceInputId}: ${error.message}`);
  }

  return data;
}

async function markQueuedExtractionJobSucceeded(
  supabase: SupabaseClient,
  extractionRunId: string
) {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      locked_at: null,
      processed_at: new Date().toISOString(),
      last_error: null
    })
    .eq("kind", "extract_source")
    .eq("payload->>extraction_run_id", extractionRunId)
    .in("status", ["pending", "running"]);

  if (error) {
    throw new Error(`Unable to mark queued extraction job succeeded: ${error.message}`);
  }
}
