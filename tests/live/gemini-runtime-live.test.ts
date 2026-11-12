import { describe, expect, it } from "vitest";
import { createGeminiRuntimeExtractor } from "@/lib/extraction/gemini-runtime";
import { extractionSchemaVersion } from "@/lib/extraction/schema";

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_EXTRACTION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";

const describeIfKey = apiKey ? describe : describe.skip;

describeIfKey("live Gemini runtime extractor", () => {
  it(
    "produces schema-valid extraction output for a synthetic paste source",
    async () => {
      const extractor = createGeminiRuntimeExtractor({
        apiKey: apiKey!,
        model,
        timeoutMs: 60_000
      });

      const result = await extractor({
        sourceType: "paste",
        normalizedText:
          "Synthetic school note for Maya: Friday May 22, 2026 — please send permission slip and $5 for the field trip by Wednesday."
      });

      expect(result.kind).toBe("extracted");
      if (result.kind !== "extracted") return;

      expect(result.output.schemaVersion).toBe(extractionSchemaVersion);
      expect(result.output.sourceSummary.length).toBeGreaterThan(0);
      // Cards may be 0 or 1+ depending on the model; the contract test is that
      // the runtime path validates through family-logistics-v1 either way.
    },
    180_000
  );

  it(
    "skips upload sources without making any network call",
    async () => {
      const extractor = createGeminiRuntimeExtractor({
        apiKey: apiKey!,
        model
      });

      const result = await extractor({ sourceType: "upload", normalizedText: null });
      expect(result).toEqual({ kind: "skipped", reason: "no_text_available" });
    }
  );
});
