import { describe, expect, it } from "vitest";
import { deriveSourceReviewState, type SourceReviewInput } from "@/lib/source-review-state";

const baseInput: SourceReviewInput = {
  artifacts: [],
  extractionRun: null,
  linkedCardCount: 0,
  sourceStatus: "pending",
  sourceType: "paste"
};

describe("deriveSourceReviewState", () => {
  it("prioritizes created cards when cards are linked", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      linkedCardCount: 2,
      sourceStatus: "processed"
    });

    expect(state).toMatchObject({
      label: "Cards created",
      filter: "created_cards",
      tone: "moss"
    });
    expect(state.detail).toBe("2 linked cards");
  });

  it("flags upload text that is waiting for parent approval", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      artifacts: [{ textExtractionStatus: "needs_review" }],
      extractionRun: {
        cardCount: 0,
        status: "skipped_no_text"
      },
      sourceStatus: "needs_review",
      sourceType: "upload"
    });

    expect(state).toMatchObject({
      label: "Ready to approve text",
      filter: "needs_review",
      tone: "amber"
    });
    expect(state.nextAction).toMatch(/Review extracted text/);
  });

  it("shows reading state for pending extraction runs", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      extractionRun: {
        cardCount: 0,
        status: "running"
      },
      sourceStatus: "processing"
    });

    expect(state).toMatchObject({
      label: "Reading source",
      filter: "reading",
      tone: "sky"
    });
  });

  it("shows failed state without requiring provider internals", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      extractionRun: {
        cardCount: 0,
        status: "failed"
      },
      sourceStatus: "failed"
    });

    expect(state).toMatchObject({
      label: "Extraction failed",
      filter: "failed",
      tone: "coral"
    });
    expect(state.detail).toBe("FamTandem could not finish reading this source.");
  });

  it("explains upload sources where OCR is unavailable", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      artifacts: [{ textExtractionStatus: "not_applicable" }],
      extractionRun: {
        cardCount: 0,
        status: "skipped_no_text"
      },
      sourceStatus: "needs_review",
      sourceType: "upload"
    });

    expect(state).toMatchObject({
      label: "OCR disabled or unavailable",
      filter: "no_cards",
      tone: "graphite"
    });
    expect(state.nextAction).toMatch(/Paste the text/);
  });

  it("shows no-action source state after successful extraction with no cards", () => {
    const state = deriveSourceReviewState({
      ...baseInput,
      extractionRun: {
        cardCount: 0,
        status: "succeeded"
      },
      sourceStatus: "needs_review"
    });

    expect(state).toMatchObject({
      label: "No actionable cards found",
      filter: "no_cards"
    });
  });
});
