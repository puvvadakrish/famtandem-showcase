import { describe, expect, it, vi } from "vitest";
import { runExtractionForSourceInput, type ExtractorFn } from "@/lib/extraction/runner";
import { extractionSchemaVersion } from "@/lib/extraction/schema";

type RpcCall = { name: string; args: Record<string, unknown> };

function buildSupabaseStub(opts: {
  startResult?: { data: unknown; error: { message: string } | null };
  sourceRow?: { data: unknown; error: { message: string } | null };
  recordResult?: { data: unknown; error: { message: string } | null };
  createCardsResult?: { data: unknown; error: { message: string } | null };
}) {
  const calls: RpcCall[] = [];

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "start_extraction_run") {
      return opts.startResult ?? {
        data: [
          {
            id: args.p_run_id,
            household_id: "hh-1",
            source_input_id: "src-1",
            attempts: 1,
            max_attempts: 3
          }
        ],
        error: null
      };
    }
    if (name === "record_extraction_run") {
      return opts.recordResult ?? { data: null, error: null };
    }
    if (name === "create_extracted_cards") {
      return (
        opts.createCardsResult ?? {
          data: [{ card_id: "card-1" }, { card_id: "card-2" }],
          error: null
        }
      );
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });

  const single = vi.fn(async () =>
    opts.sourceRow ?? {
      data: {
        source_type: "paste",
        normalized_text: "Pickup at 3pm.",
        received_at: "2026-05-31T18:15:00.000Z",
        households: { timezone: "America/Chicago" }
      },
      error: null
    }
  );
  const from = vi.fn(() => {
    const eq = vi.fn(() => {
      return { single };
    });
    const select = vi.fn(() => ({ eq }));
    return { select };
  });

  return { supabase: { rpc, from } as never, calls };
}

describe("runExtractionForSourceInput", () => {
  it("starts the run, invokes the local stub, and records a succeeded outcome with no cards", async () => {
    const { supabase, calls } = buildSupabaseStub({});

    await runExtractionForSourceInput({ supabase, extractionRunId: "run-1" });

    const start = calls.find((c) => c.name === "start_extraction_run");
    expect(start?.args.p_run_id).toBe("run-1");
    expect(start?.args.p_provider).toBe("local-stub");
    expect(start?.args.p_model).toBe("local-stub-v1");

    const record = calls.find((c) => c.name === "record_extraction_run");
    expect(record?.args.p_status).toBe("succeeded");
    expect(record?.args.p_card_count).toBe(0);
    expect(record?.args.p_no_action_reason).toMatch(/stub-extractor/);
    expect(record?.args.p_last_error).toBeNull();
  });

  it("stamps the supplied provider and model on the run via start_extraction_run", async () => {
    const { supabase, calls } = buildSupabaseStub({});

    await runExtractionForSourceInput({
      supabase,
      extractionRunId: "run-prov",
      provider: "gemini",
      model: "gemini-3.5-flash"
    });

    const start = calls.find((c) => c.name === "start_extraction_run");
    expect(start?.args.p_provider).toBe("gemini");
    expect(start?.args.p_model).toBe("gemini-3.5-flash");
  });

  it("passes household timezone and source received time into the extractor", async () => {
    const { supabase } = buildSupabaseStub({
      sourceRow: {
        data: {
          source_type: "paste",
          normalized_text: "Soccer practice June 9, 2026 from 5:30 PM to 6:45 PM.",
          received_at: "2026-05-31T18:15:00.000Z",
          households: { timezone: "America/Chicago" }
        },
        error: null
      }
    });
    const extractor: ExtractorFn = vi.fn(async () => ({
      kind: "extracted" as const,
      output: {
        schemaVersion: extractionSchemaVersion as "family-logistics-v1",
        sourceSummary: "No cards needed for this test.",
        noActionReason: "No time-bound coverage, readiness, decision, or change item was found.",
        cards: []
      }
    }));

    await runExtractionForSourceInput({
      supabase,
      extractionRunId: "run-context",
      extractor,
      provider: "gemini",
      model: "gemini-3.5-flash"
    });

    expect(extractor).toHaveBeenCalledWith({
      sourceType: "paste",
      normalizedText: "Soccer practice June 9, 2026 from 5:30 PM to 6:45 PM.",
      householdTimezone: "America/Chicago",
      receivedAt: "2026-05-31T18:15:00.000Z"
    });
  });

  it("records skipped_no_text for upload sources without persisting cards", async () => {
    const { supabase, calls } = buildSupabaseStub({
      sourceRow: {
        data: {
          source_type: "upload",
          normalized_text: null,
          received_at: "2026-05-31T18:15:00.000Z",
          households: { timezone: "America/Chicago" }
        },
        error: null
      }
    });

    await runExtractionForSourceInput({ supabase, extractionRunId: "run-2" });

    const record = calls.find((c) => c.name === "record_extraction_run");
    expect(record?.args.p_status).toBe("skipped_no_text");
    expect(record?.args.p_card_count).toBe(0);
    expect(record?.args.p_no_action_reason).toMatch(/no_text_available/);
  });

  it("records a failed run and re-throws when record_extraction_run rejects schema-shaped output", async () => {
    const { supabase, calls } = buildSupabaseStub({
      recordResult: { data: null, error: { message: "boom" } }
    });

    await expect(
      runExtractionForSourceInput({ supabase, extractionRunId: "run-3" })
    ).rejects.toThrow(/run-3/);

    // First record call attempts to mark succeeded; throwing causes runner to rethrow.
    const recordCalls = calls.filter((c) => c.name === "record_extraction_run");
    expect(recordCalls.length).toBeGreaterThanOrEqual(1);
    expect(recordCalls[0]?.args.p_status).toBe("succeeded");
  });

  it("throws when start_extraction_run returns no row (run is missing or terminal)", async () => {
    const { supabase } = buildSupabaseStub({
      startResult: { data: [], error: null }
    });

    await expect(
      runExtractionForSourceInput({ supabase, extractionRunId: "run-4" })
    ).rejects.toThrow(/not startable/);
  });

  it("creates extracted cards and uses the returned count when extractor yields cards", async () => {
    const { supabase, calls } = buildSupabaseStub({});

    const cardBearingExtractor: ExtractorFn = vi.fn(async () => ({
      kind: "extracted" as const,
      output: {
        schemaVersion: extractionSchemaVersion as "family-logistics-v1",
        sourceSummary: "Card-bearing test fixture",
        cards: [
          {
            type: "event" as const,
            title: "Soccer pickup",
            childNames: [],
            datePrecision: "date_time" as const,
            coverageRelevance: {
              suggestedSlots: ["pickup" as const],
              reason: "Pickup needed for soccer practice."
            },
            readinessItems: [],
            coercionNotes: [],
            changedFields: [],
            confidence: 0.9,
            reviewReasons: [],
            sourceEvidence: [{ label: "Practice ends", excerptRef: "source:line-1" }]
          }
        ]
      }
    }));

    await runExtractionForSourceInput({
      supabase,
      extractionRunId: "run-cards",
      extractor: cardBearingExtractor
    });

    const create = calls.find((c) => c.name === "create_extracted_cards");
    expect(create).toBeDefined();
    expect(create?.args.p_extraction_run_id).toBe("run-cards");
    expect(Array.isArray(create?.args.p_cards)).toBe(true);
    expect((create?.args.p_cards as unknown[]).length).toBe(1);

    const record = calls.find((c) => c.name === "record_extraction_run");
    expect(record?.args.p_status).toBe("succeeded");
    expect(record?.args.p_card_count).toBe(2);
  });

  it("derives review reasons in the runner and forwards them to create_extracted_cards", async () => {
    const { supabase, calls } = buildSupabaseStub({});

    const lowConfidenceExtractor: ExtractorFn = vi.fn(async () => ({
      kind: "extracted" as const,
      output: {
        schemaVersion: extractionSchemaVersion as "family-logistics-v1",
        sourceSummary: "Low confidence event",
        cards: [
          {
            type: "event" as const,
            title: "Permission form due tomorrow",
            childNames: [],
            datePrecision: "ambiguous" as const,
            coverageRelevance: {
              suggestedSlots: [],
              reason: "Form needs to be returned but no exact date given."
            },
            readinessItems: [],
            coercionNotes: [],
            changedFields: [],
            confidence: 0.55,
            reviewReasons: [],
            sourceEvidence: [{ label: "Form", excerptRef: "source:line-1" }]
          }
        ]
      }
    }));

    await runExtractionForSourceInput({
      supabase,
      extractionRunId: "run-derive",
      extractor: lowConfidenceExtractor
    });

    const create = calls.find((c) => c.name === "create_extracted_cards");
    expect(create).toBeDefined();
    const forwarded = (create?.args.p_cards as Array<{ reviewReasons: string[] }>)[0];
    expect(forwarded.reviewReasons.length).toBeGreaterThan(0);
    expect(forwarded.reviewReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Low extraction confidence/),
        expect.stringMatching(/Action-heavy/)
      ])
    );
  });

  it("does not call create_extracted_cards when the extractor returns zero cards", async () => {
    const { supabase, calls } = buildSupabaseStub({});

    await runExtractionForSourceInput({ supabase, extractionRunId: "run-no-cards" });

    expect(calls.find((c) => c.name === "create_extracted_cards")).toBeUndefined();
  });
});
