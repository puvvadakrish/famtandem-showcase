import "server-only";
import {
  extractionSchemaVersion,
  parseExtractedFamilyLogistics,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";
import { normalizeTimezone } from "@/lib/timezone";
import type {
  LocalExtractorInput,
  LocalExtractorResult
} from "@/lib/extraction/local-extractor";

export type GeminiRuntimeOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_GEMINI_TIMEOUT_MS = 60_000;

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export function createGeminiRuntimeExtractor(options: GeminiRuntimeOptions) {
  return async function extractWithGeminiRuntime(
    input: LocalExtractorInput
  ): Promise<LocalExtractorResult> {
    const text = (input.normalizedText ?? "").trim();
    if (text.length === 0) {
      return { kind: "skipped", reason: "no_text_available" };
    }

    const output = await callGemini(input, options);
    return { kind: "extracted", output };
  };
}

async function callGemini(
  input: LocalExtractorInput,
  options: GeminiRuntimeOptions
): Promise<ExtractedFamilyLogistics> {
  const normalizedText = (input.normalizedText ?? "").trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildRuntimePrompt(normalizedText, {
                    householdTimezone: input.householdTimezone,
                    receivedAt: input.receivedAt
                  })
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json"
          }
        })
      }
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Gemini request failed with status ${response.status}.`
    );
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

export function buildRuntimePrompt(
  normalizedText: string,
  context: { householdTimezone?: string | null; receivedAt?: string | null } = {}
): string {
  const householdTimezone = normalizeTimezone(context.householdTimezone);
  const receivedAt = (context.receivedAt ?? "").trim() || "unknown";

  return [
    "Extract family logistics from the parent-supplied source text below.",
    "",
    "Return JSON only. Do not include markdown, commentary, or copied source excerpts.",
    `Use schemaVersion "${extractionSchemaVersion}".`,
    "Do not add fields that are not listed in the output shape. Unknown fields are rejected by the validator.",
    "Use opaque sourceEvidence excerptRef values like source:line-1, never copied excerpts.",
    "If the source contains no actionable logistics, return cards: [] with a noActionReason explaining why.",
    `Household timezone: ${householdTimezone}.`,
    `Source receivedAt: ${receivedAt}.`,
    "Interpret explicit source times in the household timezone unless the source itself names a different timezone.",
    "Preserve explicit local clock times from the source when producing startsAt/endsAt. For example, if the source says June 9, 2026 at 5:30 PM in America/Chicago, emit a startsAt like 2026-06-09T17:30:00-05:00 rather than converting the clock time to UTC or another timezone.",
    "When an event gives both a start and end time, use the event start as startsAt and the event end as endsAt. Do not replace the event start with pickup, dismissal, practice end, or return time unless the source only gives that logistics moment.",
    "Only set startsAt/endsAt when the source includes an explicit date or a relative date that can be resolved from receivedAt. If a source gives a time without any date context, omit startsAt/endsAt.",
    "",
    "REQUIRED fields on every card: type, title, datePrecision, coverageRelevance (with suggestedSlots array and reason), confidence (0..1), reviewReasons (array, may be empty), sourceEvidence (array with at least one {label, excerptRef}). Do not omit these.",
    "OPTIONAL fields: childNames, startsAt, endsAt, allDay, location, knownCoverage, readinessItems, possibleMatch, dateAmbiguity, coercionNotes, changedFields, decisionNeeded. Omit any optional field when not applicable; do not emit nulls.",
    "When the source asks if someone can handle pickup/drop-off, says no one is confirmed, or otherwise leaves the owner unclear, do not fill knownCoverage; include the unresolved slot in suggestedSlots, add decisionNeeded to confirm the owner, and include a reviewReasons item such as Pickup owner is not confirmed.",
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
              possibleDates: ["ISO date-time with offset"]
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
    "Source text:",
    normalizedText
  ].join("\n");
}
