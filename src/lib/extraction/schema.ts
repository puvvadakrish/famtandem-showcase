import { z } from "zod";
import type { CardType, CoverageSlotKind } from "@/lib/types";

export const extractionSchemaVersion = "family-logistics-v1";

export const extractedCardTypeSchema = z.enum([
  "event",
  "deadline",
  "decision",
  "change_standalone"
]);

export const extractedSlotKindSchema = z.enum([
  "dropoff",
  "pickup",
  "stay_attend",
  "bring_prep",
  "general_owner"
]);

export const extractedDatePrecisionSchema = z.enum([
  "date_time",
  "date_only",
  "ambiguous"
]);

const nonEmptyString = z.string().trim().min(1);
const isoDateTime = z.string().datetime({ offset: true });
const sourceEvidenceRef = z.string().regex(/^source:line-\d+$/, "Use opaque source:line-N evidence references.");

function optionalLlmValue(value: unknown) {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.trim().length === 0 ? undefined : value;
  }

  return value;
}

function optionalNonEmptyString(max: number) {
  return z.preprocess(
    optionalLlmValue,
    z.string().trim().min(1).max(max).optional()
  );
}

function optionalIsoDateTime() {
  return z.preprocess(optionalLlmValue, isoDateTime.optional());
}

function optionalBoolean() {
  return z.preprocess(optionalLlmValue, z.boolean().optional());
}

function optionalObject<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(optionalLlmValue, schema.optional());
}

export const extractedFamilyLogisticsSchema = z.object({
  schemaVersion: z.literal(extractionSchemaVersion),
  sourceSummary: nonEmptyString.max(240),
  noActionReason: optionalNonEmptyString(240),
  cards: z
    .array(
      z.object({
        type: extractedCardTypeSchema,
        title: nonEmptyString.max(160),
        childNames: z.array(nonEmptyString.max(80)).default([]),
        startsAt: optionalIsoDateTime(),
        endsAt: optionalIsoDateTime(),
        allDay: optionalBoolean(),
        datePrecision: extractedDatePrecisionSchema.default("date_time"),
        location: optionalNonEmptyString(240),
        coverageRelevance: z
          .object({
            needsTransportation: z.boolean().optional(),
            suggestedSlots: z.array(extractedSlotKindSchema).default([]),
            reason: nonEmptyString.max(300)
          })
          .strict(),
        knownCoverage: optionalObject(
          z.object({
            ownerLabel: nonEmptyString.max(120),
            ownerType: z.enum(["household_member", "external_contact", "school_bus", "aftercare", "unknown"]),
            coveredSlots: z.array(extractedSlotKindSchema).min(1),
            reason: nonEmptyString.max(300)
          })
          .strict()
        ),
        readinessItems: z
          .array(
            z
              .object({
                label: nonEmptyString.max(160),
                dueAt: optionalIsoDateTime()
              })
              .strict()
          )
          .default([]),
        possibleMatch: optionalObject(
          z.object({
            existingCardHint: optionalNonEmptyString(160),
            reason: nonEmptyString.max(300)
          })
          .strict()
        ),
        dateAmbiguity: optionalObject(
          z.object({
            reason: nonEmptyString.max(300),
            possibleDates: z.array(isoDateTime).min(2).optional()
          })
          .strict()
        ),
        coercionNotes: z.array(nonEmptyString.max(180)).default([]),
        changedFields: z
          .array(
            z
              .object({
                field: nonEmptyString.max(80),
                previousValue: optionalNonEmptyString(240),
                newValue: nonEmptyString.max(240)
              })
              .strict()
          )
          .default([]),
        decisionNeeded: optionalNonEmptyString(240),
        confidence: z.number().min(0).max(1),
        reviewReasons: z.array(nonEmptyString.max(180)).default([]),
        sourceEvidence: z
          .array(
            z
              .object({
                label: nonEmptyString.max(80),
                excerptRef: sourceEvidenceRef
              })
              .strict()
          )
          .min(1)
      }).strict()
    )
    .default([])
}).strict().superRefine((value, ctx) => {
  if (value.cards.length === 0 && !value.noActionReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "noActionReason is required when no cards are extracted.",
      path: ["noActionReason"]
    });
  }
});

export type ExtractedFamilyLogistics = z.infer<typeof extractedFamilyLogisticsSchema>;
export type ExtractedCoverageCard = ExtractedFamilyLogistics["cards"][number];

const actionHeavyPattern =
  /\b(form|permission|waiver|pay|payment|fee|bring|pack|wear|medicine|medication|doctor|medical|appointment)\b/i;

export function parseExtractedFamilyLogistics(value: unknown): ExtractedFamilyLogistics {
  return extractedFamilyLogisticsSchema.parse(value);
}

export function deriveExtractionReviewReasons(card: ExtractedCoverageCard): string[] {
  const reasons = new Set(card.reviewReasons);

  if (card.confidence < 0.75) {
    reasons.add("Low extraction confidence.");
  }

  if ((card.type === "event" || card.type === "deadline") && !card.startsAt) {
    reasons.add("Missing date or time.");
  }

  if (card.datePrecision === "ambiguous") {
    reasons.add("Date or time precision needs parent review.");
  }

  if (
    card.coverageRelevance.suggestedSlots.some((slot) => slot === "dropoff" || slot === "pickup") &&
    !card.location
  ) {
    reasons.add("Transportation coverage is suggested but location is missing.");
  }

  if (card.type === "change_standalone" || card.changedFields.length > 0) {
    reasons.add("Source may change an existing plan.");
  }

  if (card.dateAmbiguity) {
    reasons.add("Multiple possible dates need parent review.");
  }

  if (card.coercionNotes.length > 0) {
    reasons.add("Extraction required normalization or coercion.");
  }

  const actionText = [
    card.title,
    card.decisionNeeded,
    ...card.readinessItems.map((item) => item.label),
    ...card.sourceEvidence.map((evidence) => evidence.label)
  ]
    .filter(Boolean)
    .join(" ");

  if (actionHeavyPattern.test(actionText)) {
    reasons.add("Action-heavy item needs parent review.");
  }

  return Array.from(reasons);
}

export function needsExtractionReview(card: ExtractedCoverageCard): boolean {
  return deriveExtractionReviewReasons(card).length > 0;
}

export function toCoverageCardType(type: ExtractedCoverageCard["type"]): CardType {
  return type;
}

export function toCoverageSlotKind(kind: ExtractedCoverageCard["coverageRelevance"]["suggestedSlots"][number]): CoverageSlotKind {
  return kind;
}
