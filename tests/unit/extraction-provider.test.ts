import { describe, expect, it } from "vitest";
import { selectExtractor } from "@/lib/extraction/provider";
import {
  localExtractorModel,
  localExtractorProvider,
  runLocalExtractor
} from "@/lib/extraction/local-extractor";

describe("selectExtractor", () => {
  it("defaults to the local stub when no env vars are set", () => {
    const selected = selectExtractor({});
    expect(selected.provider).toBe(localExtractorProvider);
    expect(selected.model).toBe(localExtractorModel);
    expect(selected.extractor).toBe(runLocalExtractor);
  });

  it("falls back to the local stub when only GEMINI_API_KEY is set", () => {
    const selected = selectExtractor({ GEMINI_API_KEY: "stub-key" });
    expect(selected.provider).toBe(localExtractorProvider);
  });

  it("falls back to the local stub when only EXTRACTION_PROVIDER=gemini is set without an API key", () => {
    const selected = selectExtractor({ EXTRACTION_PROVIDER: "gemini" });
    expect(selected.provider).toBe(localExtractorProvider);
  });

  it("returns the Gemini runtime extractor when EXTRACTION_PROVIDER=gemini and GEMINI_API_KEY are both set", () => {
    const selected = selectExtractor({
      EXTRACTION_PROVIDER: "gemini",
      GEMINI_API_KEY: "stub-key"
    });
    expect(selected.provider).toBe("gemini");
    expect(selected.model).toBe("gemini-3.5-flash");
    expect(selected.extractor).not.toBe(runLocalExtractor);
  });

  it("honors GEMINI_MODEL override when Gemini provider is active", () => {
    const selected = selectExtractor({
      EXTRACTION_PROVIDER: "gemini",
      GEMINI_API_KEY: "stub-key",
      GEMINI_MODEL: "gemini-2.5-flash"
    });
    expect(selected.model).toBe("gemini-2.5-flash");
  });

  it("treats an empty GEMINI_API_KEY as missing", () => {
    const selected = selectExtractor({
      EXTRACTION_PROVIDER: "gemini",
      GEMINI_API_KEY: "   "
    });
    expect(selected.provider).toBe(localExtractorProvider);
  });
});
