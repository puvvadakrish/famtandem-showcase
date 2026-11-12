import { describe, expect, it } from "vitest";
import { runLocalExtractor } from "@/lib/extraction/local-extractor";
import { extractionSchemaVersion } from "@/lib/extraction/schema";

describe("runLocalExtractor", () => {
  it("returns a no-card schema-valid result for paste sources with normalized text", () => {
    const result = runLocalExtractor({
      sourceType: "paste",
      normalizedText: "Soccer practice Tuesday at 4pm. Bring shin guards."
    });

    expect(result.kind).toBe("extracted");
    if (result.kind !== "extracted") return;

    expect(result.output.schemaVersion).toBe(extractionSchemaVersion);
    expect(result.output.cards).toEqual([]);
    expect(result.output.noActionReason).toMatch(/stub-extractor/);
    expect(result.output.sourceSummary).toMatch(/Local stub summary/);
  });

  it("is deterministic for identical inputs", () => {
    const a = runLocalExtractor({ sourceType: "paste", normalizedText: "Pickup at 3pm." });
    const b = runLocalExtractor({ sourceType: "paste", normalizedText: "Pickup at 3pm." });
    expect(a).toEqual(b);
  });

  it("extracts upload sources after artifact text is available", () => {
    const result = runLocalExtractor({
      sourceType: "upload",
      normalizedText: "Uploaded team schedule text."
    });

    expect(result.kind).toBe("extracted");
  });

  it("skips paste sources that lack usable text", () => {
    expect(runLocalExtractor({ sourceType: "paste", normalizedText: "   " })).toEqual({
      kind: "skipped",
      reason: "no_text_available"
    });
    expect(runLocalExtractor({ sourceType: "paste", normalizedText: null })).toEqual({
      kind: "skipped",
      reason: "no_text_available"
    });
  });
});
