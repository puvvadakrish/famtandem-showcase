import { describe, expect, it, vi } from "vitest";
import {
  buildRuntimePrompt,
  createGeminiRuntimeExtractor
} from "@/lib/extraction/gemini-runtime";
import { extractionSchemaVersion } from "@/lib/extraction/schema";

describe("buildRuntimePrompt", () => {
  it("requests JSON-only output with the active schema version and opaque evidence refs", () => {
    const prompt = buildRuntimePrompt("Soccer practice Tuesday at 4pm.");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain(`schemaVersion "${extractionSchemaVersion}"`);
    expect(prompt).toContain("source:line-1");
    expect(prompt).toContain("Pickup owner is not confirmed");
  });

  it("includes the supplied source text verbatim", () => {
    const prompt = buildRuntimePrompt("Pickup at 3pm.");
    expect(prompt).toContain("Pickup at 3pm.");
  });

  it("includes household timezone context and tells the model to preserve local source times", () => {
    const prompt = buildRuntimePrompt("Soccer practice June 9, 2026 from 5:30 PM to 6:45 PM.", {
      householdTimezone: "America/Chicago",
      receivedAt: "2026-05-31T18:15:00.000Z"
    });

    expect(prompt).toContain("Household timezone: America/Chicago.");
    expect(prompt).toContain("Source receivedAt: 2026-05-31T18:15:00.000Z.");
    expect(prompt).toContain("Preserve explicit local clock times");
    expect(prompt).toContain("2026-06-09T17:30:00-05:00");
    expect(prompt).toContain("use the event start as startsAt and the event end as endsAt");
  });
});

describe("createGeminiRuntimeExtractor", () => {
  it("skips upload sources without text without making any network call", async () => {
    const fetchImpl = vi.fn();
    const extractor = createGeminiRuntimeExtractor({
      apiKey: "k",
      model: "gemini-3.5-flash",
      fetchImpl
    });
    const result = await extractor({ sourceType: "upload", normalizedText: null });
    expect(result).toEqual({ kind: "skipped", reason: "no_text_available" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips paste sources with no usable text without making any network call", async () => {
    const fetchImpl = vi.fn();
    const extractor = createGeminiRuntimeExtractor({
      apiKey: "k",
      model: "gemini-3.5-flash",
      fetchImpl
    });
    const result = await extractor({ sourceType: "paste", normalizedText: "  " });
    expect(result).toEqual({ kind: "skipped", reason: "no_text_available" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls the model endpoint and parses a valid schema response", async () => {
    const validOutput = {
      schemaVersion: extractionSchemaVersion,
      sourceSummary: "Test summary",
      noActionReason: "Test no-action reason",
      cards: []
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(validOutput) }] } }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const extractor = createGeminiRuntimeExtractor({
      apiKey: "k",
      model: "gemini-3.5-flash",
      fetchImpl
    });

    const result = await extractor({
      sourceType: "paste",
      normalizedText: "Soccer practice Tuesday at 4pm.",
      householdTimezone: "America/Chicago",
      receivedAt: "2026-05-31T18:15:00.000Z"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("gemini-3.5-flash:generateContent");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "k" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.contents[0].parts[0].text).toContain("Household timezone: America/Chicago.");

    expect(result.kind).toBe("extracted");
    if (result.kind === "extracted") {
      expect(result.output.cards).toEqual([]);
    }
  });

  it("aborts and reports a timeout when the fetch hangs longer than timeoutMs", async () => {
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const extractor = createGeminiRuntimeExtractor({
      apiKey: "k",
      model: "gemini-3.5-flash",
      fetchImpl,
      timeoutMs: 25
    });

    await expect(
      extractor({ sourceType: "paste", normalizedText: "any" })
    ).rejects.toThrow(/timed out after 25ms/);
  });

  it("throws when Gemini returns a non-200 with an error body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "model not found" } }), {
        status: 404
      })
    );

    const extractor = createGeminiRuntimeExtractor({
      apiKey: "k",
      model: "gemini-3.5-flash",
      fetchImpl
    });

    await expect(
      extractor({ sourceType: "paste", normalizedText: "any" })
    ).rejects.toThrow(/model not found/);
  });
});
