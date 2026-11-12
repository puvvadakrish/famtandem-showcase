import type { SourceInputStatus } from "@/lib/types";

export type SourceArtifactReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "needs_review"
  | "not_applicable";

export type SourceReviewExtractionRun = {
  status: "pending" | "running" | "succeeded" | "failed" | "skipped_no_text";
  cardCount: number;
};

export type SourceReviewArtifact = {
  textExtractionStatus: SourceArtifactReviewStatus;
};

export type SourceReviewInput = {
  sourceType: string;
  sourceStatus: SourceInputStatus;
  linkedCardCount: number;
  extractionRun: SourceReviewExtractionRun | null;
  artifacts: SourceReviewArtifact[];
};

export type SourceReviewFilter = "needs_review" | "reading" | "created_cards" | "no_cards" | "failed";
export type SourceReviewTone = "moss" | "sky" | "amber" | "coral" | "graphite";

export type SourceReviewState = {
  label: string;
  nextAction: string;
  detail: string;
  filter: SourceReviewFilter;
  tone: SourceReviewTone;
  priority: number;
};

export function deriveSourceReviewState(input: SourceReviewInput): SourceReviewState {
  const statuses = input.artifacts.map((artifact) => artifact.textExtractionStatus);
  const hasReviewableText = statuses.includes("needs_review");
  const hasPendingArtifact = statuses.some((status) =>
    status === "not_started" || status === "pending" || status === "processing"
  );
  const hasFailedArtifact = statuses.includes("failed");
  const allArtifactsNotApplicable = statuses.length > 0
    && statuses.every((status) => status === "not_applicable");
  const run = input.extractionRun;

  if (input.linkedCardCount > 0 || (run?.cardCount ?? 0) > 0 || input.sourceStatus === "processed") {
    const linkedCardCount = input.linkedCardCount || run?.cardCount || 0;
    return {
      label: "Cards created",
      nextAction: "Review the linked coverage cards.",
      detail: cardCountLabel(linkedCardCount),
      filter: "created_cards",
      tone: "moss",
      priority: 30
    };
  }

  if (hasReviewableText) {
    return {
      label: "Ready to approve text",
      nextAction: "Review extracted text before cards are created.",
      detail: "Upload text is waiting for parent review.",
      filter: "needs_review",
      tone: "amber",
      priority: 100
    };
  }

  if (run?.status === "failed" || input.sourceStatus === "failed") {
    return {
      label: "Extraction failed",
      nextAction: "Open the source to see the retry or error details.",
      detail: "FamTandem could not finish reading this source.",
      filter: "failed",
      tone: "coral",
      priority: 95
    };
  }

  if (hasFailedArtifact) {
    return {
      label: "Text extraction failed",
      nextAction: "Open the source to review the upload status.",
      detail: "FamTandem could not read text from this upload.",
      filter: "failed",
      tone: "coral",
      priority: 90
    };
  }

  if (hasPendingArtifact) {
    return {
      label: "Upload still finalizing",
      nextAction: "Check back after FamTandem finishes reading the file.",
      detail: "The uploaded file is queued for text extraction.",
      filter: "reading",
      tone: "sky",
      priority: 80
    };
  }

  if (run?.status === "pending" || run?.status === "running" || input.sourceStatus === "pending" || input.sourceStatus === "processing") {
    return {
      label: "Reading source",
      nextAction: "Cards will appear when extraction finishes.",
      detail: "FamTandem is reading this source now.",
      filter: "reading",
      tone: "sky",
      priority: 70
    };
  }

  if (run?.status === "skipped_no_text" && allArtifactsNotApplicable) {
    return {
      label: "OCR disabled or unavailable",
      nextAction: "Paste the text too if you need cards right away.",
      detail: "This upload did not produce extractable text.",
      filter: "no_cards",
      tone: "graphite",
      priority: 60
    };
  }

  if (run?.status === "skipped_no_text") {
    return {
      label: "No cards yet",
      nextAction: "Open the source to see what FamTandem needs next.",
      detail: "No cards were created from this source.",
      filter: "no_cards",
      tone: "graphite",
      priority: 55
    };
  }

  if (run?.status === "succeeded" || input.sourceStatus === "needs_review") {
    return {
      label: "No actionable cards found",
      nextAction: "Review the source if something should have become a card.",
      detail: "FamTandem did not find a clear coverage item.",
      filter: "no_cards",
      tone: "graphite",
      priority: 50
    };
  }

  return {
    label: "Needs review",
    nextAction: "Open the source and check what happened.",
    detail: "This source needs a parent review.",
    filter: "needs_review",
    tone: "amber",
    priority: 65
  };
}

function cardCountLabel(count: number) {
  return `${count} linked card${count === 1 ? "" : "s"}`;
}
