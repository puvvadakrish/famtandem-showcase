export type SourceDetailExtractionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped_no_text";

export function emptyLinkedCardsMessage(status: SourceDetailExtractionStatus | null) {
  if (!status) return "No cards are linked to this source yet.";

  if (status === "pending" || status === "running") {
    return "FamTandem is still reading this source. Cards will appear here when extraction finishes.";
  }

  if (status === "failed") {
    return "Extraction failed before cards could be created. Review the run error above.";
  }

  if (status === "skipped_no_text") {
    return "No cards were created because this source does not have extractable text yet.";
  }

  return "No actionable coverage cards were found in this source.";
}
