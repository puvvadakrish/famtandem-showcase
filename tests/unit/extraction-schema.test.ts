import { describe, expect, it } from "vitest";
import {
  deriveExtractionReviewReasons,
  extractionSchemaVersion,
  needsExtractionReview,
  parseExtractedFamilyLogistics
} from "@/lib/extraction/schema";

describe("extraction schema", () => {
  it("validates the versioned family logistics extraction contract", () => {
    const parsed = parseExtractedFamilyLogistics({
      schemaVersion: extractionSchemaVersion,
      sourceSummary: "Team email says pickup is at the north field.",
      cards: [
        {
          type: "event",
          title: "Soccer pickup",
          startsAt: "2026-05-22T17:30:00-05:00",
          location: "North field",
          coverageRelevance: {
            needsTransportation: true,
            suggestedSlots: ["pickup"],
            reason: "A pickup owner is needed."
          },
          confidence: 0.91,
          sourceEvidence: [{ label: "Pickup line", excerptRef: "source:line-1" }]
        }
      ]
    });

    expect(parsed.schemaVersion).toBe("family-logistics-v1");
    expect(parsed.cards[0].childNames).toEqual([]);
    expect(parsed.cards[0].readinessItems).toEqual([]);
    expect(parsed.cards[0].changedFields).toEqual([]);
  });

  it("rejects malformed model-shaped output before app state creation", () => {
    expect(() =>
      parseExtractedFamilyLogistics({
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "No evidence card.",
        cards: [
          {
            type: "event",
            title: "Pickup",
            coverageRelevance: {
              suggestedSlots: ["pickup"],
              reason: "Pickup is mentioned."
            },
            confidence: 1,
            sourceEvidence: []
          }
        ]
      })
    ).toThrow();
  });

  it("rejects unknown fields instead of silently stripping prompt drift", () => {
    expect(() =>
      parseExtractedFamilyLogistics({
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "Team email says pickup is at the north field.",
        ignoredTopLevelField: true,
        cards: [
          {
            type: "event",
            title: "Soccer pickup",
            startsAt: "2026-05-22T17:30:00-05:00",
            location: "North field",
            coverageRelevance: {
              needsTransportation: true,
              suggestedSlots: ["pickup"],
              reason: "A pickup owner is needed.",
              ignoredCoverageField: true
            },
            confidence: 0.91,
            sourceEvidence: [{ label: "Pickup line", excerptRef: "source:line-1" }]
          }
        ]
      })
    ).toThrow();
  });

  it("rejects copied source evidence excerpts instead of opaque line refs", () => {
    expect(() =>
      parseExtractedFamilyLogistics({
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "Team email says pickup is at the north field.",
        cards: [
          {
            type: "event",
            title: "Soccer pickup",
            startsAt: "2026-05-22T17:30:00-05:00",
            location: "North field",
            coverageRelevance: {
              needsTransportation: true,
              suggestedSlots: ["pickup"],
              reason: "A pickup owner is needed."
            },
            confidence: 0.91,
            sourceEvidence: [{ label: "Pickup line", excerptRef: "Pickup moved to field 2" }]
          }
        ]
      })
    ).toThrow();
  });

  it("allows no-action sources only when a no-action reason is present", () => {
    expect(
      parseExtractedFamilyLogistics({
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "Informational update.",
        noActionReason: "No time-bound logistics item was found.",
        cards: []
      }).cards
    ).toEqual([]);

    expect(() =>
      parseExtractedFamilyLogistics({
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "Informational update.",
        cards: []
      })
    ).toThrow();
  });

  it("normalizes null optional fields from model-shaped JSON", () => {
    const parsed = parseExtractedFamilyLogistics({
      schemaVersion: extractionSchemaVersion,
      sourceSummary: "Team email says pickup is at the north field.",
      noActionReason: null,
      cards: [
        {
          type: "event",
          title: "Soccer pickup",
          childNames: [],
          startsAt: null,
          endsAt: null,
          allDay: null,
          datePrecision: "ambiguous",
          location: null,
          coverageRelevance: {
            needsTransportation: true,
            suggestedSlots: ["pickup"],
            reason: "A pickup owner is needed."
          },
          knownCoverage: null,
          readinessItems: [{ label: "Bring cleats", dueAt: null }],
          possibleMatch: null,
          dateAmbiguity: null,
          coercionNotes: [],
          changedFields: [],
          decisionNeeded: null,
          confidence: 0.78,
          reviewReasons: [],
          sourceEvidence: [{ label: "Pickup line", excerptRef: "source:line-1" }]
        }
      ]
    });

    expect(parsed.noActionReason).toBeUndefined();
    expect(parsed.cards[0].startsAt).toBeUndefined();
    expect(parsed.cards[0].allDay).toBeUndefined();
    expect(parsed.cards[0].location).toBeUndefined();
    expect(parsed.cards[0].knownCoverage).toBeUndefined();
    expect(parsed.cards[0].readinessItems[0].dueAt).toBeUndefined();
    expect(parsed.cards[0].possibleMatch).toBeUndefined();
    expect(parsed.cards[0].dateAmbiguity).toBeUndefined();
    expect(parsed.cards[0].decisionNeeded).toBeUndefined();
  });

  it("derives Needs Review reasons for low-confidence and action-heavy cards", () => {
    const parsed = parseExtractedFamilyLogistics({
      schemaVersion: extractionSchemaVersion,
      sourceSummary: "School note asks for a form and payment.",
      cards: [
        {
          type: "deadline",
          title: "Field trip permission slip and payment due",
          coverageRelevance: {
            suggestedSlots: ["bring_prep"],
            reason: "A parent needs to complete the paperwork."
          },
          readinessItems: [{ label: "Sign permission slip" }],
          confidence: 0.62,
          sourceEvidence: [{ label: "Payment due", excerptRef: "source:line-3" }]
        }
      ]
    });

    expect(needsExtractionReview(parsed.cards[0])).toBe(true);
    expect(deriveExtractionReviewReasons(parsed.cards[0])).toEqual(
      expect.arrayContaining([
        "Low extraction confidence.",
        "Action-heavy item needs parent review.",
        "Missing date or time."
      ])
    );
  });

  it("derives Needs Review reasons for ambiguous dates and coercion notes", () => {
    const parsed = parseExtractedFamilyLogistics({
      schemaVersion: extractionSchemaVersion,
      sourceSummary: "Reminder has two possible pickup dates.",
      cards: [
        {
          type: "event",
          title: "Confirm pickup date",
          startsAt: "2026-05-22T17:30:00-05:00",
          location: "North field",
          coverageRelevance: {
            suggestedSlots: ["pickup"],
            reason: "Pickup is mentioned."
          },
          dateAmbiguity: {
            reason: "The source mentions Friday and Saturday.",
            possibleDates: ["2026-05-22T17:30:00-05:00", "2026-05-23T17:30:00-05:00"]
          },
          coercionNotes: ["Converted 5:30 to household timezone."],
          confidence: 0.86,
          sourceEvidence: [{ label: "Two date mentions", excerptRef: "source:line-2" }]
        }
      ]
    });

    expect(deriveExtractionReviewReasons(parsed.cards[0])).toEqual(
      expect.arrayContaining([
        "Multiple possible dates need parent review.",
        "Extraction required normalization or coercion."
      ])
    );
  });
});
