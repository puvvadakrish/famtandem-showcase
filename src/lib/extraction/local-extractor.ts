import {
  extractionSchemaVersion,
  parseExtractedFamilyLogistics,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";

export const localExtractorProvider = "local-stub";
export const localExtractorModel = "local-stub-v1";

export type LocalExtractorInput = {
  sourceType: "paste" | "upload" | string;
  normalizedText: string | null | undefined;
  householdTimezone?: string | null;
  receivedAt?: string | null;
};

export type LocalExtractorResult =
  | { kind: "extracted"; output: ExtractedFamilyLogistics }
  | { kind: "skipped"; reason: "no_text_available" };

const PASTE_NO_ACTION_REASON = "stub-extractor: pasted source not yet processed by a model";

export function runLocalExtractor(input: LocalExtractorInput): LocalExtractorResult {
  const text = (input.normalizedText ?? "").trim();

  if (text.length === 0) {
    return { kind: "skipped", reason: "no_text_available" };
  }

  const summary = buildSummary(text);

  const output: ExtractedFamilyLogistics = parseExtractedFamilyLogistics({
    schemaVersion: extractionSchemaVersion,
    sourceSummary: summary,
    noActionReason: PASTE_NO_ACTION_REASON,
    cards: []
  });

  return { kind: "extracted", output };
}

function buildSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const sizeBucket = bucketize(collapsed.length);
  return `Local stub summary (${sizeBucket})`;
}

function bucketize(length: number): string {
  if (length <= 200) return "<=200 chars";
  if (length <= 800) return "201-800 chars";
  if (length <= 2400) return "801-2400 chars";
  return ">2400 chars";
}
