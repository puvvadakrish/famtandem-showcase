import {
  deriveExtractionReviewReasons,
  parseExtractedFamilyLogistics,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";
import type { CardType, CoverageSlotKind } from "@/lib/types";

export type ExtractionEvalFixture = {
  id: string;
  description: string;
  sourceType: "paste" | "forwarded_email" | "upload" | "calendar_invite";
  sourceText: string;
  expectedOutput: ExtractedFamilyLogistics;
  expected: {
    cardCount: number;
    noActionReasonIncludes?: string;
    cards: Array<{
      title: string;
      type: CardType;
      childNames?: string[];
      startsAt?: string;
      endsAt?: string;
      location?: string;
      allDay?: boolean;
      datePrecision?: "date_time" | "date_only" | "ambiguous";
      needsTransportation?: boolean;
      suggestedSlots?: CoverageSlotKind[];
      knownCoverageOwner?: string;
      knownCoverageSlots?: CoverageSlotKind[];
      readinessLabels?: string[];
      changedFields?: string[];
      hasDateAmbiguity?: boolean;
      possibleMatchReasonIncludes?: string;
      decisionNeededIncludes?: string;
      sourceEvidenceLabels?: string[];
      confidenceBand?: "high" | "medium" | "low";
      needsReview?: boolean;
      reviewReasonIncludes?: string[];
    }>;
  };
};

export type ExtractionEvalResult = {
  fixtureId: string;
  passed: boolean;
  failures: string[];
};

export function evaluateExtractionFixture(
  fixture: ExtractionEvalFixture,
  actualOutput: unknown = fixture.expectedOutput
): ExtractionEvalResult {
  const failures: string[] = [];
  const parsed = parseSafely(actualOutput, failures);

  if (!parsed) {
    return { fixtureId: fixture.id, passed: false, failures };
  }

  if (parsed.cards.length !== fixture.expected.cardCount) {
    failures.push(
      `Expected ${fixture.expected.cardCount} cards, received ${parsed.cards.length}.`
    );
  }

  if (
    fixture.expected.noActionReasonIncludes &&
    !parsed.noActionReason?.includes(fixture.expected.noActionReasonIncludes)
  ) {
    failures.push(
      `Expected noActionReason to include "${fixture.expected.noActionReasonIncludes}".`
    );
  }

  const matchedCardIndexes = new Set<number>();

  for (const expectedCard of fixture.expected.cards) {
    const actualCardIndex = findMatchingCardIndex(parsed.cards, expectedCard, matchedCardIndexes);
    const actualCard = actualCardIndex >= 0 ? parsed.cards[actualCardIndex] : undefined;

    if (!actualCard) {
      failures.push(`Missing card "${expectedCard.title}".`);
      continue;
    }
    matchedCardIndexes.add(actualCardIndex);

    if (!cardTypesCompatible(actualCard, expectedCard)) {
      failures.push(
        `Card "${expectedCard.title}" expected type ${expectedCard.type}, received ${actualCard.type}.`
      );
    }

    if (expectedCard.childNames) {
      compareStringArrays({
        actual: actualCard.childNames,
        expected: expectedCard.childNames,
        failures,
        label: `Card "${expectedCard.title}" child names`
      });
    }

    compareDateTimeValue({
      actual: actualCard.startsAt,
      expected: expectedCard.startsAt,
      failures,
      label: `Card "${expectedCard.title}" startsAt`,
      compareDateOnly: expectedCard.allDay === true && expectedCard.datePrecision === "date_only"
    });
    compareOptionalValue({
      actual: actualCard.endsAt,
      expected: expectedCard.endsAt,
      failures,
      label: `Card "${expectedCard.title}" endsAt`
    });
    compareSemanticTextValue({
      actual: actualCard.location,
      expected: expectedCard.location,
      failures,
      label: `Card "${expectedCard.title}" location`
    });
    compareOptionalValue({
      actual: actualCard.allDay,
      expected: expectedCard.allDay,
      failures,
      label: `Card "${expectedCard.title}" allDay`
    });
    compareOptionalValue({
      actual: actualCard.datePrecision,
      expected: expectedCard.datePrecision,
      failures,
      label: `Card "${expectedCard.title}" datePrecision`
    });
    compareOptionalValue({
      actual: actualCard.coverageRelevance.needsTransportation,
      expected: expectedCard.needsTransportation,
      failures,
      label: `Card "${expectedCard.title}" needsTransportation`
    });

    if (expectedCard.suggestedSlots) {
      compareStringArrays({
        actual: actualCard.coverageRelevance.suggestedSlots,
        expected: expectedCard.suggestedSlots,
        failures,
        label: `Card "${expectedCard.title}" suggested slots`
      });
    }

    compareOptionalValue({
      actual: actualCard.knownCoverage?.ownerLabel,
      expected: expectedCard.knownCoverageOwner,
      failures,
      label: `Card "${expectedCard.title}" known coverage owner`
    });

    if (expectedCard.knownCoverageSlots) {
      compareStringArrays({
        actual: actualCard.knownCoverage?.coveredSlots ?? [],
        expected: expectedCard.knownCoverageSlots,
        failures,
        label: `Card "${expectedCard.title}" known coverage slots`
      });
    }

    if (expectedCard.readinessLabels) {
      compareSemanticStringArrays({
        actual: actualCard.readinessItems.map((item) => item.label),
        expected: expectedCard.readinessLabels,
        failures,
        label: `Card "${expectedCard.title}" readiness items`
      });
    }

    if (
      expectedCard.possibleMatchReasonIncludes &&
      !actualCard.possibleMatch?.reason.includes(expectedCard.possibleMatchReasonIncludes)
    ) {
      failures.push(
        `Card "${expectedCard.title}" possible match reason does not include "${expectedCard.possibleMatchReasonIncludes}".`
      );
    }

    if (
      expectedCard.decisionNeededIncludes &&
      !actualCard.decisionNeeded?.includes(expectedCard.decisionNeededIncludes)
    ) {
      failures.push(
        `Card "${expectedCard.title}" decision needed does not include "${expectedCard.decisionNeededIncludes}".`
      );
    }

    if (expectedCard.sourceEvidenceLabels) {
      compareStringArrays({
        actual: actualCard.sourceEvidence.map((evidence) => evidence.label),
        expected: expectedCard.sourceEvidenceLabels,
        failures,
        label: `Card "${expectedCard.title}" source evidence labels`
      });
    }

    if (expectedCard.changedFields) {
      compareStringArrays({
        actual: actualCard.changedFields.map((field) => field.field),
        expected: expectedCard.changedFields,
        failures,
        label: `Card "${expectedCard.title}" changed fields`
      });
    }

    if (
      typeof expectedCard.hasDateAmbiguity === "boolean" &&
      Boolean(actualCard.dateAmbiguity) !== expectedCard.hasDateAmbiguity
    ) {
      failures.push(
        `Card "${expectedCard.title}" expected hasDateAmbiguity=${expectedCard.hasDateAmbiguity}, received ${Boolean(actualCard.dateAmbiguity)}.`
      );
    }

    if (
      expectedCard.confidenceBand &&
      confidenceBand(actualCard.confidence) !== expectedCard.confidenceBand
    ) {
      failures.push(
        `Card "${expectedCard.title}" expected confidence ${expectedCard.confidenceBand}, received ${confidenceBand(actualCard.confidence)}.`
      );
    }

    const reviewReasons = deriveExtractionReviewReasons(actualCard);
    const actualNeedsReview = reviewReasons.length > 0;

    if (
      typeof expectedCard.needsReview === "boolean" &&
      actualNeedsReview !== expectedCard.needsReview
    ) {
      failures.push(
        `Card "${expectedCard.title}" expected needsReview=${expectedCard.needsReview}, received ${actualNeedsReview}.`
      );
    }

    for (const reason of expectedCard.reviewReasonIncludes ?? []) {
      if (!reviewReasons.some((actualReason) => actualReason.includes(reason))) {
        failures.push(`Card "${expectedCard.title}" review reasons do not include "${reason}".`);
      }
    }
  }

  parsed.cards.forEach((card, index) => {
    if (!matchedCardIndexes.has(index)) {
      failures.push(`Unexpected card "${card.title}".`);
    }
  });

  return { fixtureId: fixture.id, passed: failures.length === 0, failures };
}

export function evaluateExtractionFixtures(
  fixtures: ExtractionEvalFixture[]
): ExtractionEvalResult[] {
  return fixtures.map((fixture) => evaluateExtractionFixture(fixture));
}

type ExpectedEvalCard = ExtractionEvalFixture["expected"]["cards"][number];
type ActualEvalCard = ExtractedFamilyLogistics["cards"][number];

function findMatchingCardIndex(
  cards: ActualEvalCard[],
  expectedCard: ExpectedEvalCard,
  matchedCardIndexes: Set<number>
) {
  const exactTitleIndex = cards.findIndex(
    (card, index) =>
      normalized(card.title) === normalized(expectedCard.title) &&
      !matchedCardIndexes.has(index)
  );

  if (exactTitleIndex >= 0) {
    return exactTitleIndex;
  }

  let bestIndex = -1;
  let bestScore = 0;

  cards.forEach((card, index) => {
    if (matchedCardIndexes.has(index)) {
      return;
    }

    const score = cardMatchScore(card, expectedCard);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 5 ? bestIndex : -1;
}

function cardMatchScore(card: ActualEvalCard, expectedCard: ExpectedEvalCard) {
  let score = 0;

  if (cardTypesCompatible(card, expectedCard)) score += 2;
  if (titleSimilarity(card.title, expectedCard.title) >= 0.5) score += 3;
  if (expectedCard.startsAt && card.startsAt === expectedCard.startsAt) score += 3;
  if (expectedCard.endsAt && card.endsAt === expectedCard.endsAt) score += 2;
  if (expectedCard.datePrecision && card.datePrecision === expectedCard.datePrecision) score += 2;
  if (expectedCard.location && normalized(card.location).includes(normalized(expectedCard.location))) {
    score += 2;
  }
  if (
    expectedCard.suggestedSlots &&
    sameStringArray(card.coverageRelevance.suggestedSlots, expectedCard.suggestedSlots)
  ) {
    score += 2;
  }
  if (
    expectedCard.readinessLabels &&
    sameStringArray(card.readinessItems.map((item) => item.label), expectedCard.readinessLabels)
  ) {
    score += 2;
  }
  if (
    expectedCard.changedFields &&
    sameStringArray(card.changedFields.map((field) => field.field), expectedCard.changedFields)
  ) {
    score += 1;
  }

  return score;
}

function cardTypesCompatible(card: ActualEvalCard, expectedCard: ExpectedEvalCard) {
  if (card.type === expectedCard.type) {
    return true;
  }

  const changeTypePair =
    (card.type === "event" && expectedCard.type === "change_standalone") ||
    (card.type === "change_standalone" && expectedCard.type === "event");

  return Boolean(changeTypePair && expectedCard.changedFields && expectedCard.changedFields.length > 0);
}

function parseSafely(
  actualOutput: unknown,
  failures: string[]
): ExtractedFamilyLogistics | null {
  try {
    return parseExtractedFamilyLogistics(actualOutput);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Unknown schema parse failure.");
    return null;
  }
}

function compareOptionalValue<T>({
  actual,
  expected,
  failures,
  label
}: {
  actual: T | undefined;
  expected: T | undefined;
  failures: string[];
  label: string;
}) {
  const valuesMatch =
    typeof actual === "string" && typeof expected === "string"
      ? normalized(actual) === normalized(expected)
      : actual === expected;

  if (expected !== undefined && !valuesMatch) {
    failures.push(`${label} expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function compareDateTimeValue({
  actual,
  expected,
  failures,
  label,
  compareDateOnly
}: {
  actual: string | undefined;
  expected: string | undefined;
  failures: string[];
  label: string;
  compareDateOnly?: boolean;
}) {
  const normalizedActual = compareDateOnly ? actual?.slice(0, 10) : actual;
  const normalizedExpected = compareDateOnly ? expected?.slice(0, 10) : expected;

  compareOptionalValue({
    actual: normalizedActual,
    expected: normalizedExpected,
    failures,
    label
  });
}

function compareSemanticTextValue({
  actual,
  expected,
  failures,
  label
}: {
  actual: string | undefined;
  expected: string | undefined;
  failures: string[];
  label: string;
}) {
  if (expected === undefined) {
    return;
  }

  const valuesMatch =
    normalized(actual) === normalized(expected) ||
    (actual !== undefined && titleSimilarity(actual, expected) >= 0.8);

  if (!valuesMatch) {
    failures.push(`${label} expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function confidenceBand(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function titleSimilarity(actual: string, expected: string) {
  const actualTokens = significantTokens(actual);
  const expectedTokens = significantTokens(expected);

  if (actualTokens.size === 0 || expectedTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of expectedTokens) {
    if (actualTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / expectedTokens.size;
}

function significantTokens(value: string) {
  const stopWords = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "the", "to"]);

  return new Set(
    normalized(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0 && !stopWords.has(token))
  );
}

function sameStringArray(actual: string[], expected: string[]) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();

  return (
    actualSorted.length === expectedSorted.length &&
    actualSorted.every((value, index) => value === expectedSorted[index])
  );
}

function compareStringArrays({
  actual,
  expected,
  failures,
  label
}: {
  actual: string[];
  expected: string[];
  failures: string[];
  label: string;
}) {
  if (!sameStringArray(actual, expected)) {
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();

    failures.push(
      `${label} expected [${expectedSorted.join(", ")}], received [${actualSorted.join(", ")}].`
    );
  }
}

function compareSemanticStringArrays({
  actual,
  expected,
  failures,
  label
}: {
  actual: string[];
  expected: string[];
  failures: string[];
  label: string;
}) {
  if (expected.length === 0) {
    compareStringArrays({ actual, expected, failures, label });
    return;
  }

  const unmatchedActual = [...actual];
  const allExpectedMatched = expected.every((expectedValue) => {
    const matchIndex = unmatchedActual.findIndex((actualValue) => {
      const normalizedActual = normalized(actualValue);
      const normalizedExpected = normalized(expectedValue);
      return (
        normalizedActual === normalizedExpected ||
        titleSimilarity(actualValue, expectedValue) >= 0.6
      );
    });

    if (matchIndex >= 0) {
      unmatchedActual.splice(matchIndex, 1);
      return true;
    }

    return false;
  });

  if (!allExpectedMatched || unmatchedActual.length > 0) {
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();

    failures.push(
      `${label} expected [${expectedSorted.join(", ")}], received [${actualSorted.join(", ")}].`
    );
  }
}
