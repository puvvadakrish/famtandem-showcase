export type SourceProcessingErrorContext = "extraction" | "artifact_text";

export function sourceProcessingErrorMessage(
  value: string | null | undefined,
  context: SourceProcessingErrorContext
) {
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return context === "artifact_text"
      ? "This file took too long to read. Upload it again, or paste the details manually."
      : "This source took too long to read. Try again, or review it manually.";
  }

  if (
    normalized.includes("missing") ||
    normalized.includes("not found")
  ) {
    return context === "artifact_text"
      ? "FamTandem could not find this uploaded file. Upload it again, or paste the details manually."
      : "FamTandem could not find this source. Review it manually or add the details again.";
  }

  if (normalized.includes("could not be read") || normalized.includes("unable to read")) {
    return context === "artifact_text"
      ? "This file could not be read. Upload it again, or paste the details manually."
      : "This source could not be read. Try again, or review it manually.";
  }

  if (
    normalized.includes("schema") ||
    normalized.includes("parse") ||
    normalized.includes("json")
  ) {
    return context === "artifact_text"
      ? "This file could not be turned into reviewable text. Upload it again, or paste the details manually."
      : "This source could not be turned into coverage cards. Review it manually.";
  }

  return context === "artifact_text"
    ? "This file could not be read. Upload it again, or paste the details manually."
    : "This source could not be read. Try again, or review it manually.";
}
