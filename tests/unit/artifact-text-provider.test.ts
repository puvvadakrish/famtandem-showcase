import { describe, expect, it } from "vitest";
import { selectArtifactTextProvider } from "@/lib/artifact-text/provider";

describe("selectArtifactTextProvider", () => {
  it("defaults to disabled without provider calls", () => {
    const selected = selectArtifactTextProvider({});

    expect(selected.provider).toBe("disabled");
    expect(selected.model).toBe("disabled");
    expect(selected.extractor).toBeNull();
  });

  it("selects Gemini only when explicitly enabled with a key", () => {
    const selected = selectArtifactTextProvider({
      ARTIFACT_TEXT_PROVIDER: "gemini",
      ARTIFACT_TEXT_MODEL: "gemini-3.5-flash",
      GEMINI_API_KEY: "test-key"
    });

    expect(selected.provider).toBe("gemini");
    expect(selected.model).toBe("gemini-3.5-flash");
    expect(selected.extractor).toEqual(expect.any(Function));
  });

  it("falls back to disabled when Gemini has no key", () => {
    const selected = selectArtifactTextProvider({
      ARTIFACT_TEXT_PROVIDER: "gemini",
      ARTIFACT_TEXT_MODEL: "gemini-3.5-flash"
    });

    expect(selected.provider).toBe("disabled");
    expect(selected.extractor).toBeNull();
  });
});
