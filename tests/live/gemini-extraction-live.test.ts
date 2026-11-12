import { describe, expect, it } from "vitest";
import { evaluateExtractionFixture } from "@/lib/extraction/eval";
import {
  defaultGeminiExtractionModel,
  extractFixtureWithGemini
} from "@/lib/extraction/gemini";
import { phase2ExtractionFixtures } from "../fixtures/extraction/phase2-fixtures";

const selectedFixtureIds = new Set(
  (process.env.GEMINI_EVAL_FIXTURE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

const selectedFixtures =
  selectedFixtureIds.size > 0
    ? phase2ExtractionFixtures.filter((fixture) => selectedFixtureIds.has(fixture.id))
    : phase2ExtractionFixtures;

describe("live Gemini extraction evals", () => {
  it(
    "evaluates Gemini output against the synthetic fixture suite",
    async () => {
      const apiKey = process.env.GEMINI_API_KEY?.trim();

      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY is required. Run: GEMINI_API_KEY=... npm run test:extraction:live"
        );
      }

      expect(selectedFixtures.length).toBeGreaterThan(0);

      const failures: string[] = [];

      for (const fixture of selectedFixtures) {
        try {
          const actualOutput = await extractFixtureWithGemini(fixture, {
            apiKey,
            model: process.env.GEMINI_EXTRACTION_MODEL || defaultGeminiExtractionModel
          });
          const result = evaluateExtractionFixture(fixture, actualOutput);

          if (!result.passed) {
            failures.push(`${fixture.id}:\n${result.failures.map((failure) => `  - ${failure}`).join("\n")}`);
          }
        } catch (error) {
          failures.push(
            `${fixture.id}:\n  - ${error instanceof Error ? error.message : "Unknown Gemini eval error."}`
          );
        }
      }

      expect(failures, failures.join("\n\n")).toEqual([]);
    },
    360_000
  );
});
