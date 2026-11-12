import { describe, expect, it } from "vitest";
import { sourceProcessingErrorMessage } from "@/lib/source-processing-errors";

describe("sourceProcessingErrorMessage", () => {
  it("redacts extraction provider details and private paths", () => {
    expect(
      sourceProcessingErrorMessage(
        "Gemini request timed out after 60000ms for household/source/private.pdf",
        "extraction"
      )
    ).toBe("This source took too long to read. Try again, or review it manually.");
  });

  it("redacts artifact text extraction details and private paths", () => {
    expect(
      sourceProcessingErrorMessage(
        "Unable to read household/source/private.pdf from source-artifacts",
        "artifact_text"
      )
    ).toBe("This file could not be read. Upload it again, or paste the details manually.");
  });

  it("returns null when there is no stored error", () => {
    expect(sourceProcessingErrorMessage(null, "extraction")).toBeNull();
  });
});
