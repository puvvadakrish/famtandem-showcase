import {
  extractionSchemaVersion,
  parseExtractedFamilyLogistics,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";
import type { ExtractionEvalFixture } from "@/lib/extraction/eval";

export const defaultGeminiExtractionModel = "gemini-2.5-flash";

export type GeminiExtractionOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function extractFixtureWithGemini(
  fixture: ExtractionEvalFixture,
  options: GeminiExtractionOptions
): Promise<ExtractedFamilyLogistics> {
  const apiKey = options.apiKey.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to run live extraction evals.");
  }

  const model = options.model ?? defaultGeminiExtractionModel;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiExtractionPrompt(fixture) }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const payload = (await response.json()) as GeminiGenerateContentResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini request failed with ${response.status}.`);
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response did not include JSON text.");
  }

  return parseExtractedFamilyLogistics(JSON.parse(text));
}

export function buildGeminiExtractionPrompt(fixture: ExtractionEvalFixture) {
  return [
    "Extract family logistics from the synthetic source below.",
    "",
    "Return JSON only. Do not include markdown, commentary, or copied source excerpts.",
    `Use schemaVersion \"${extractionSchemaVersion}\".`,
    "Do not add fields that are not listed in the output shape. Unknown fields are rejected by the validator.",
    "Use opaque sourceEvidence excerptRef values like source:line-1, never copied excerpts.",
    "Use synthetic child names only when they appear in the source.",
    "If the source does not name a child, omit childNames or return an empty childNames array.",
    "If the source contains no actionable logistics, return cards: [] with a noActionReason explaining why.",
    "For upload fixtures, treat the synthetic source text as already-extracted document text and evaluate it.",
    "Assume household timezone America/Chicago and receivedAt 2026-05-22T09:00:00-05:00.",
    "Only set startsAt/endsAt when the source includes an explicit date or a relative date that can be resolved from receivedAt. If a source gives a time without any date context, omit startsAt/endsAt.",
    "When pickup, dismissal, practice end, or return time is the logistics moment, use that time as startsAt for the coverage card.",
    "For dateAmbiguity.possibleDates, include at least two ISO date-times. If you only have one possible date, omit dateAmbiguity.possibleDates.",
    "When no cards are extracted, use a noActionReason that includes: No time-bound coverage, readiness, decision, or change item was found.",
    "",
    "REQUIRED fields on every card: type, title, datePrecision, coverageRelevance (with suggestedSlots array and reason), confidence (0..1), reviewReasons (array, may be empty), sourceEvidence (array with at least one {label, excerptRef}). Do not omit these.",
    "OPTIONAL fields: childNames, startsAt, endsAt, allDay, location, knownCoverage, readinessItems, possibleMatch, dateAmbiguity, coercionNotes, changedFields, decisionNeeded. Omit any optional field when not applicable; do not emit nulls.",
    "",
    "Card typing guidance:",
    "- Use event for a concrete logistics event, including an event whose time/location/coverage has changed.",
    "- Use change_standalone only when the source is mainly a change/cancellation and no concrete event card can be safely represented without matching an existing plan.",
    "- Use deadline for time-bound forms, payments, supplies, or prep that need a parent action.",
    "- Use decision for RSVP, opt-in, or explicit family choice items.",
    "- If an event also has an RSVP or explicit family choice, extract a separate decision card for that decision.",
    "- If the source says coverage is already handled by a carpool, school bus, aftercare, or another adult, still extract the logistics card and fill knownCoverage instead of returning no cards.",
    "- When school bus, aftercare, or another named external owner already handles the only transportation need, use knownCoverage.coveredSlots and leave coverageRelevance.suggestedSlots empty unless a parent must still act.",
    "- When the source asks if someone can handle pickup/drop-off, says no one is confirmed, or otherwise leaves the owner unclear, do not fill knownCoverage; include the unresolved slot in suggestedSlots, add decisionNeeded to confirm the owner, and include a reviewReasons item such as Pickup owner is not confirmed.",
    "- Return, pickup, dismissal, or ride home coverage maps to pickup. Drop-off maps only to arrival, start, or getting the child to an event.",
    "- For deadline cards, include the parent action as readinessItems. If only a date is known, set allDay: true and datePrecision: date_only.",
    "- For deadline cards that represent prep, forms, payment, or supply actions, include bring_prep in coverageRelevance.suggestedSlots.",
    "- For event cards with explicit wear, bring, pack, form, payment, medication, or early-arrival prep, include those prep actions as readinessItems and include bring_prep in coverageRelevance.suggestedSlots.",
    "- Only include bring_prep on an event card when that same event card includes readinessItems; do not duplicate a separate prep/deadline card's bring_prep slot onto plain event cards.",
    "- When a single relative weekday can be resolved from receivedAt, use datePrecision: date_only for all-day decision or deadline cards, not ambiguous.",
    "- When the source says moved, changed, now, instead, cancelled, or closes early, include changedFields and possibleMatch when a previous plan is implied.",
    "- When pickup, dismissal, practice end, return, or closing time changes the logistics moment used as startsAt, record the changed field as startsAt rather than endsAt.",
    "- Use confidence below 0.75 for ambiguous dates/times. Use 0.75-0.84 for partial logistics, known external coverage, or action-heavy prep. Use 0.85+ only for explicit event facts.",
    "",
    "Output shape (omit optional fields when not applicable; never invent extra fields):",
    JSON.stringify(
      {
        schemaVersion: extractionSchemaVersion,
        sourceSummary: "Compact summary, max 240 chars",
        noActionReason: "Required when no cards are extracted; otherwise omit",
        cards: [
          {
            type: "event | deadline | decision | change_standalone",
            title: "Short parent-facing title",
            childNames: ["Child first name as written in source"],
            startsAt: "ISO date-time with offset, when known",
            endsAt: "ISO date-time with offset, when known",
            allDay: false,
            datePrecision: "date_time | date_only | ambiguous",
            location: "Short location, when known",
            coverageRelevance: {
              needsTransportation: false,
              suggestedSlots: ["dropoff | pickup | stay_attend | bring_prep | general_owner"],
              reason: "Why this needs or does not need coverage"
            },
            knownCoverage: {
              ownerLabel: "External known owner, if source says already covered",
              ownerType: "household_member | external_contact | school_bus | aftercare | unknown",
              coveredSlots: ["pickup"],
              reason: "Why source indicates known coverage"
            },
            readinessItems: [{ label: "Prep item", dueAt: "ISO date-time with offset, when known" }],
            possibleMatch: {
              existingCardHint: "Existing card hint, if source appears to update a plan",
              reason: "Why it may match an existing card"
            },
            dateAmbiguity: {
              reason: "Why date/time needs review",
              possibleDates: [
                "First possible ISO date-time with offset",
                "Second possible ISO date-time with offset"
              ]
            },
            coercionNotes: ["Any normalization or assumptions"],
            changedFields: [{ field: "startsAt | location | status", previousValue: "old", newValue: "new" }],
            decisionNeeded: "Decision text, if any",
            confidence: 0.85,
            reviewReasons: ["Only explicit review reasons from extraction"],
            sourceEvidence: [{ label: "Evidence label", excerptRef: "source:line-1" }]
          }
        ]
      },
      null,
      2
    ),
    "",
    `Fixture id: ${fixture.id}`,
    `Source type: ${fixture.sourceType}`,
    "Synthetic source text:",
    fixture.sourceText
  ].join("\n");
}
