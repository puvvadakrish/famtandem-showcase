import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processJobBatch } from "@/lib/jobs/runner";
import { selectExtractor } from "@/lib/extraction/provider";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const geminiKey = process.env.GEMINI_API_KEY?.trim();

const haveLocalSupabase = Boolean(supabaseUrl && serviceRoleKey);
const haveGeminiKey = Boolean(geminiKey);

const describeIfReady =
  haveLocalSupabase && haveGeminiKey ? describe : describe.skip;

describeIfReady("live extraction loop: intake -> trigger -> job -> Gemini -> cards", () => {
  let supabase: SupabaseClient;
  let householdId: string;
  let memberId: string;
  const sourceInputIds: string[] = [];

  beforeAll(async () => {
    supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const householdSlug = `live-${randomUUID().slice(0, 8)}`;
    const { data: household, error: householdError } = await supabase
      .from("households")
      .insert({
        name: "Live Extraction Test",
        slug: householdSlug,
        timezone: "America/Chicago",
        consent_version: "live-test-v1"
      })
      .select("id")
      .single();

    if (householdError || !household) {
      throw new Error(`bootstrap household failed: ${householdError?.message}`);
    }
    householdId = household.id;

    const { data: member, error: memberError } = await supabase
      .from("household_members")
      .insert({
        household_id: householdId,
        role: "household_admin",
        display_name: "Live Test Admin",
        email: `live-${householdSlug}@example.test`,
        active: true
      })
      .select("id")
      .single();

    if (memberError || !member) {
      throw new Error(`bootstrap member failed: ${memberError?.message}`);
    }
    memberId = member.id;

    // Drain any pending extract_source jobs from prior test runs (e.g., the
    // Playwright e2e suite leaves source_inputs behind, and their associated
    // jobs would otherwise be claimed first by the oldest-first runner).
    const { error: drainError } = await supabase
      .from("jobs")
      .update({ status: "succeeded", processed_at: new Date().toISOString() })
      .eq("status", "pending")
      .eq("kind", "extract_source");

    if (drainError) {
      throw new Error(`drain prior jobs failed: ${drainError.message}`);
    }
  });

  afterAll(async () => {
    if (!householdId) return;
    // Cascade deletes via ON DELETE CASCADE; deleting the household cleans up
    // members, source_inputs, extraction_runs, jobs (via source_inputs cascade),
    // coverage_cards, slots, readiness, card_events.
    await supabase.from("households").delete().eq("id", householdId);
  });

  it(
    "processes a pasted source through Gemini and records a succeeded run with provider/model stamped",
    async () => {
      const selected = selectExtractor({
        EXTRACTION_PROVIDER: "gemini",
        GEMINI_API_KEY: geminiKey,
        GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash"
      });
      expect(selected.provider).toBe("gemini");

      const sourceText = [
        "Synthetic school note for the test household:",
        "Friday, May 22, 2026 — Maya has a field trip permission slip due by Wednesday May 20, 2026.",
        "Please send $5 with the slip. Bus leaves at 8:15 AM and returns at 2:45 PM.",
        "Pickup is at the main entrance."
      ].join("\n");

      const { data: sourceRow, error: sourceError } = await supabase
        .from("source_inputs")
        .insert({
          household_id: householdId,
          submitted_by: memberId,
          source_type: "paste",
          raw_subject: "Live extraction smoke",
          normalized_text: sourceText,
          status: "pending"
        })
        .select("id")
        .single();

      if (sourceError || !sourceRow) {
        throw new Error(`insert source failed: ${sourceError?.message}`);
      }
      const sourceInputId = sourceRow.id as string;
      sourceInputIds.push(sourceInputId);

      // AFTER INSERT trigger should have created exactly one extraction_runs row
      // and one extract_source job pointing at this source.
      const { data: initialRun, error: initialRunError } = await supabase
        .from("extraction_runs")
        .select("id, status, attempts, provider, model")
        .eq("source_input_id", sourceInputId)
        .single();

      if (initialRunError || !initialRun) {
        throw new Error(
          `extraction_runs row not created by AFTER INSERT trigger: ${initialRunError?.message}`
        );
      }
      expect(initialRun.status).toBe("pending");
      expect(initialRun.attempts).toBe(0);
      expect(initialRun.provider).toBe("local-stub");
      expect(initialRun.model).toBe("local-stub-v1");

      // Drive the real job runner exactly the way /api/cron/jobs does.
      const result = await processJobBatch({
        supabase,
        batchSize: 5,
        extractor: selected.extractor,
        extractorProvider: selected.provider,
        extractorModel: selected.model
      });

      expect(result.failed).toBe(0);
      expect(result.succeeded).toBeGreaterThanOrEqual(1);

      const { data: finalRun, error: finalRunError } = await supabase
        .from("extraction_runs")
        .select(
          "id, status, attempts, provider, model, card_count, last_error, no_action_reason, review_reasons, raw_output"
        )
        .eq("id", initialRun.id)
        .single();

      if (finalRunError || !finalRun) {
        throw new Error(`failed to reload extraction_run: ${finalRunError?.message}`);
      }

      expect(finalRun.status).toBe("succeeded");
      expect(finalRun.provider).toBe("gemini");
      expect(finalRun.model).toBe(process.env.GEMINI_MODEL || "gemini-3.5-flash");
      expect(finalRun.attempts).toBeGreaterThanOrEqual(1);
      expect(finalRun.last_error).toBeNull();
      expect(finalRun.raw_output).toBeTruthy();

      // The model may return 0 or N cards. Both are valid. If N > 0 we expect
      // coverage_cards to be linked via source_input_id.
      expect(finalRun.card_count).toBeGreaterThanOrEqual(0);

      const { data: linkedCards, error: cardsError } = await supabase
        .from("coverage_cards")
        .select("id, title, card_type, attention_flags, computed_coverage_state, full_source_ref")
        .eq("source_input_id", sourceInputId);

      if (cardsError) {
        throw new Error(`failed to query linked cards: ${cardsError.message}`);
      }

      expect(linkedCards?.length ?? 0).toBe(finalRun.card_count);

      if ((linkedCards?.length ?? 0) > 0) {
        for (const card of linkedCards ?? []) {
          expect(card.full_source_ref).toBe(`source_inputs:${sourceInputId}`);
          expect(card.attention_flags).toContain("needs_coverage");
        }
      }

      // Log result so the e2e signal is visible in CI/local console output.
      console.log(
        `[live-e2e] provider=${finalRun.provider} model=${finalRun.model} cards=${finalRun.card_count} reviewReasons=${
          Array.isArray(finalRun.review_reasons) ? finalRun.review_reasons.length : 0
        }`
      );
    },
    180_000
  );
});
