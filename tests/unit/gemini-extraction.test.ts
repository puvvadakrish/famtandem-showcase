import { describe, expect, it, vi } from "vitest";
import {
  buildGeminiExtractionPrompt,
  extractFixtureWithGemini
} from "@/lib/extraction/gemini";
import { extractionSchemaVersion } from "@/lib/extraction/schema";
import { phase2ExtractionFixtures } from "../fixtures/extraction/phase2-fixtures";

describe("Gemini extraction client", () => {
  it("builds a privacy-safe fixture prompt without expected answers", () => {
    const fixture = phase2ExtractionFixtures[0];
    const prompt = buildGeminiExtractionPrompt(fixture);

    expect(prompt).toContain(extractionSchemaVersion);
    expect(prompt).toContain(fixture.sourceText);
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("never copied excerpts");
    expect(prompt).toContain("Do not add fields that are not listed in the output shape");
    expect(prompt).toContain("REQUIRED fields on every card");
    expect(prompt).toContain("OPTIONAL fields");
    expect(prompt).toContain("If the source does not name a child");
    expect(prompt).toContain("Pickup owner is not confirmed");
    expect(prompt).not.toContain(fixture.expectedOutput.sourceSummary);
  });

  it("requires a non-empty API key", async () => {
    await expect(
      extractFixtureWithGemini(phase2ExtractionFixtures[0], {
        apiKey: "",
        fetchImpl: vi.fn()
      })
    ).rejects.toThrow("GEMINI_API_KEY is required");
  });

  it("parses Gemini JSON text through the extraction schema", async () => {
    const fixture = phase2ExtractionFixtures[0];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(fixture.expectedOutput) }]
            }
          }
        ]
      })
    });

    const parsed = await extractFixtureWithGemini(fixture, {
      apiKey: "test-key",
      fetchImpl
    });

    expect(parsed).toEqual(fixture.expectedOutput);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(":generateContent"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key"
        })
      })
    );
  });
});
