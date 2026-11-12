import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runLocalExtractor,
  localExtractorModel,
  localExtractorProvider,
  type LocalExtractorInput,
  type LocalExtractorResult
} from "@/lib/extraction/local-extractor";
import {
  deriveExtractionReviewReasons,
  parseExtractedFamilyLogistics,
  type ExtractedCoverageCard,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";
import { normalizeTimezone } from "@/lib/timezone";

export type ExtractorFn = (
  input: LocalExtractorInput
) => LocalExtractorResult | Promise<LocalExtractorResult>;

type StartExtractionRow = {
  id: string;
  household_id: string;
  source_input_id: string;
  attempts: number;
  max_attempts: number;
};

type SourceInputRow = {
  source_type: string;
  normalized_text: string | null;
  received_at: string | null;
  households?: { timezone?: string | null } | Array<{ timezone?: string | null }> | null;
};

export type RunExtractionForSourceInput = {
  supabase: SupabaseClient;
  extractionRunId: string;
  extractor?: ExtractorFn;
  provider?: string;
  model?: string;
};

export async function runExtractionForSourceInput({
  supabase,
  extractionRunId,
  extractor = runLocalExtractor,
  provider = localExtractorProvider,
  model = localExtractorModel
}: RunExtractionForSourceInput): Promise<void> {
  const started = await startExtractionRun(supabase, extractionRunId, provider, model);
  const source = await loadSourceInput(supabase, started.source_input_id);

  try {
    const result = await extractor({
      sourceType: source.source_type,
      normalizedText: source.normalized_text,
      householdTimezone: sourceHouseholdTimezone(source),
      receivedAt: source.received_at
    });

    if (result.kind === "skipped") {
      await recordExtractionRun(supabase, extractionRunId, {
        status: "skipped_no_text",
        reviewReasons: [],
        rawOutput: null,
        noActionReason: `${provider}: ${result.reason}`,
        cardCount: 0,
        lastError: null
      });
      return;
    }

    const validated = parseExtractedFamilyLogistics(result.output);
    const cardsWithDerivedReview = augmentReviewReasons(validated);
    const reviewReasons = collectReviewReasons(cardsWithDerivedReview);

    let createdCardCount = 0;
    if (cardsWithDerivedReview.length > 0) {
      const createdCards = await createExtractedCards(
        supabase,
        extractionRunId,
        cardsWithDerivedReview as unknown as Record<string, unknown>[]
      );
      createdCardCount = createdCards.length;
    }

    await recordExtractionRun(supabase, extractionRunId, {
      status: "succeeded",
      reviewReasons,
      rawOutput: validated as unknown as Record<string, unknown>,
      noActionReason: validated.noActionReason ?? null,
      cardCount: createdCardCount,
      lastError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction failure";
    await recordExtractionRun(supabase, extractionRunId, {
      status: "failed",
      reviewReasons: [],
      rawOutput: null,
      noActionReason: null,
      cardCount: 0,
      lastError: message
    });
    throw error;
  }
}

function augmentReviewReasons(
  extracted: ExtractedFamilyLogistics
): ExtractedCoverageCard[] {
  return extracted.cards.map((card) => {
    const merged = Array.from(new Set(deriveExtractionReviewReasons(card)));
    return { ...card, reviewReasons: merged };
  });
}

function collectReviewReasons(cards: ExtractedCoverageCard[]): string[] {
  const set = new Set<string>();
  for (const card of cards) {
    for (const reason of card.reviewReasons) {
      set.add(reason);
    }
  }
  return Array.from(set);
}

async function startExtractionRun(
  supabase: SupabaseClient,
  runId: string,
  provider: string,
  model: string
): Promise<StartExtractionRow> {
  const { data, error } = await supabase.rpc("start_extraction_run", {
    p_run_id: runId,
    p_provider: provider,
    p_model: model
  });

  if (error) {
    throw new Error(`Unable to start extraction run ${runId}: ${error.message}`);
  }

  const row = Array.isArray(data) ? (data[0] as StartExtractionRow | undefined) : null;

  if (!row) {
    throw new Error(`Extraction run ${runId} is not startable (missing or terminal).`);
  }

  return row;
}

async function loadSourceInput(
  supabase: SupabaseClient,
  sourceInputId: string
): Promise<SourceInputRow> {
  const { data, error } = await supabase
    .from("source_inputs")
    .select("source_type, normalized_text, received_at, households(timezone)")
    .eq("id", sourceInputId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to load source input ${sourceInputId}: ${error?.message ?? "not found"}`);
  }

  return data as SourceInputRow;
}

function sourceHouseholdTimezone(source: SourceInputRow) {
  const households = source.households;
  const household = Array.isArray(households) ? households[0] : households;
  return normalizeTimezone(household?.timezone);
}

type RecordExtractionInput = {
  status: "succeeded" | "failed" | "skipped_no_text";
  reviewReasons: string[];
  rawOutput: Record<string, unknown> | null;
  noActionReason: string | null;
  cardCount: number;
  lastError: string | null;
};

async function createExtractedCards(
  supabase: SupabaseClient,
  extractionRunId: string,
  cards: Record<string, unknown>[]
): Promise<Array<{ card_id: string }>> {
  const { data, error } = await supabase.rpc("create_extracted_cards", {
    p_extraction_run_id: extractionRunId,
    p_cards: cards
  });

  if (error) {
    throw new Error(`Unable to create extracted cards for run ${extractionRunId}: ${error.message}`);
  }

  return (data ?? []) as Array<{ card_id: string }>;
}

async function recordExtractionRun(
  supabase: SupabaseClient,
  runId: string,
  input: RecordExtractionInput
) {
  const { error } = await supabase.rpc("record_extraction_run", {
    p_run_id: runId,
    p_status: input.status,
    p_review_reasons: input.reviewReasons,
    p_raw_output: input.rawOutput,
    p_no_action_reason: input.noActionReason,
    p_card_count: input.cardCount,
    p_last_error: input.lastError
  });

  if (error) {
    throw new Error(`Unable to record extraction run ${runId}: ${error.message}`);
  }
}
