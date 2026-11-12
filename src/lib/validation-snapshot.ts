import type { CoverageSlotState, DerivedCoverageState, SourceInputStatus } from "@/lib/types";

export type ValidationHouseholdRow = {
  id: string;
  name: string;
  created_at: string;
};

export type ValidationSourceRow = {
  household_id: string;
  source_type: string;
  status: SourceInputStatus;
  created_at: string;
};

export type ValidationCardRow = {
  household_id: string;
  computed_coverage_state: DerivedCoverageState;
  confidence: number | null;
  review_reason: string | null;
  source_input_id: string | null;
  created_at: string;
};

export type ValidationSlotRow = {
  state: CoverageSlotState;
  household_id: string | null;
};

export type ValidationCoverageRequestRow = {
  household_id: string | null;
  created_at: string;
};

export type ValidationResponseRow = {
  response: "accept_dropoff" | "accept_pickup" | "accept_both" | "decline" | "comment";
  household_id: string | null;
  responded_at: string;
};

export type ValidationSnapshotInput = {
  now?: Date;
  households: ValidationHouseholdRow[];
  sources: ValidationSourceRow[];
  cards: ValidationCardRow[];
  slots: ValidationSlotRow[];
  coverageRequests: ValidationCoverageRequestRow[];
  responses: ValidationResponseRow[];
};

export type ValidationHouseholdSnapshot = {
  id: string;
  name: string;
  sourceInputs: number;
  coverageCards: number;
  needsAttentionCards: number;
  coverageRequests: number;
};

export type ValidationSnapshot = {
  generatedAt: string;
  totals: {
    households: number;
    activeHouseholds: number;
    sourceInputs: number;
    sourceInputsLast7Days: number;
    coverageCards: number;
    sourceBackedCards: number;
    needsAttentionCards: number;
    uncoveredOrPendingCards: number;
    slotsNeedingCoverage: number;
    requestedSlots: number;
    coveredSlots: number;
    coverageRequests: number;
    coverageResponses: number;
    acceptedResponses: number;
    declinedResponses: number;
    responseRate: number | null;
  };
  sourceTypes: Array<{ label: string; count: number }>;
  sourceStatuses: Array<{ label: string; count: number }>;
  cardStates: Array<{ label: string; count: number }>;
  householdSnapshots: ValidationHouseholdSnapshot[];
};

const coverageResolvedStates = new Set<CoverageSlotState>([
  "accepted",
  "covered_external",
  "cancelled"
]);

const needsAttentionStates = new Set<DerivedCoverageState>([
  "changed",
  "due_soon",
  "needs_coverage",
  "needs_review",
  "overdue",
  "pending"
]);

const uncoveredOrPendingStates = new Set<DerivedCoverageState>([
  "needs_coverage",
  "pending"
]);

export function buildValidationSnapshot({
  now = new Date(),
  households,
  sources,
  cards,
  slots,
  coverageRequests,
  responses
}: ValidationSnapshotInput): ValidationSnapshot {
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const acceptedResponses = responses.filter((response) =>
    response.response.startsWith("accept_")
  ).length;
  const declinedResponses = responses.filter((response) => response.response === "decline").length;
  const responseRate =
    coverageRequests.length > 0 ? responses.length / coverageRequests.length : null;

  return {
    generatedAt: now.toISOString(),
    totals: {
      households: households.length,
      activeHouseholds: activeHouseholdCount(households, sources, cards, coverageRequests),
      sourceInputs: sources.length,
      sourceInputsLast7Days: sources.filter((source) => dateMs(source.created_at) >= sevenDaysAgo).length,
      coverageCards: cards.length,
      sourceBackedCards: cards.filter((card) => Boolean(card.source_input_id)).length,
      needsAttentionCards: cards.filter((card) =>
        needsAttentionStates.has(card.computed_coverage_state)
      ).length,
      uncoveredOrPendingCards: cards.filter((card) =>
        uncoveredOrPendingStates.has(card.computed_coverage_state)
      ).length,
      slotsNeedingCoverage: slots.filter((slot) => slot.state === "needs_coverage" || slot.state === "declined").length,
      requestedSlots: slots.filter((slot) => slot.state === "requested").length,
      coveredSlots: slots.filter((slot) => coverageResolvedStates.has(slot.state)).length,
      coverageRequests: coverageRequests.length,
      coverageResponses: responses.length,
      acceptedResponses,
      declinedResponses,
      responseRate
    },
    sourceTypes: sortedCounts(sources.map((source) => source.source_type)),
    sourceStatuses: sortedCounts(sources.map((source) => source.status)),
    cardStates: sortedCounts(cards.map((card) => card.computed_coverage_state)),
    householdSnapshots: householdSnapshots(households, sources, cards, coverageRequests)
  };
}

export function validationSnapshotToCsv(snapshot: ValidationSnapshot) {
  const rows: string[][] = [
    ["section", "metric", "value"],
    ["totals", "generated_at", snapshot.generatedAt],
    ["totals", "households", String(snapshot.totals.households)],
    ["totals", "active_households", String(snapshot.totals.activeHouseholds)],
    ["totals", "source_inputs", String(snapshot.totals.sourceInputs)],
    ["totals", "source_inputs_last_7_days", String(snapshot.totals.sourceInputsLast7Days)],
    ["totals", "coverage_cards", String(snapshot.totals.coverageCards)],
    ["totals", "source_backed_cards", String(snapshot.totals.sourceBackedCards)],
    ["totals", "needs_attention_cards", String(snapshot.totals.needsAttentionCards)],
    ["totals", "uncovered_or_pending_cards", String(snapshot.totals.uncoveredOrPendingCards)],
    ["totals", "slots_needing_coverage", String(snapshot.totals.slotsNeedingCoverage)],
    ["totals", "requested_slots", String(snapshot.totals.requestedSlots)],
    ["totals", "covered_slots", String(snapshot.totals.coveredSlots)],
    ["totals", "coverage_requests", String(snapshot.totals.coverageRequests)],
    ["totals", "coverage_responses", String(snapshot.totals.coverageResponses)],
    ["totals", "accepted_responses", String(snapshot.totals.acceptedResponses)],
    ["totals", "declined_responses", String(snapshot.totals.declinedResponses)],
    [
      "totals",
      "response_rate",
      snapshot.totals.responseRate === null ? "" : String(snapshot.totals.responseRate)
    ],
    [],
    ["section", "label", "count"],
    ...snapshot.sourceTypes.map((row) => ["source_types", row.label, String(row.count)]),
    ...snapshot.sourceStatuses.map((row) => ["source_statuses", row.label, String(row.count)]),
    ...snapshot.cardStates.map((row) => ["card_states", row.label, String(row.count)]),
    [],
    [
      "household_id",
      "household",
      "source_inputs",
      "coverage_cards",
      "needs_attention_cards",
      "coverage_requests"
    ],
    ...snapshot.householdSnapshots.map((household) => [
      household.id,
      household.name,
      String(household.sourceInputs),
      String(household.coverageCards),
      String(household.needsAttentionCards),
      String(household.coverageRequests)
    ])
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function activeHouseholdCount(
  households: ValidationHouseholdRow[],
  sources: ValidationSourceRow[],
  cards: ValidationCardRow[],
  coverageRequests: ValidationCoverageRequestRow[]
) {
  const activeHouseholdIds = new Set([
    ...sources.map((source) => source.household_id),
    ...cards.map((card) => card.household_id),
    ...coverageRequests
      .map((request) => request.household_id)
      .filter((householdId): householdId is string => Boolean(householdId))
  ]);

  return households.filter((household) => activeHouseholdIds.has(household.id)).length;
}

function householdSnapshots(
  households: ValidationHouseholdRow[],
  sources: ValidationSourceRow[],
  cards: ValidationCardRow[],
  coverageRequests: ValidationCoverageRequestRow[]
): ValidationHouseholdSnapshot[] {
  return households
    .map((household) => {
      const householdCards = cards.filter((card) => card.household_id === household.id);

      return {
        id: household.id,
        name: household.name,
        sourceInputs: sources.filter((source) => source.household_id === household.id).length,
        coverageCards: householdCards.length,
        needsAttentionCards: householdCards.filter((card) =>
          needsAttentionStates.has(card.computed_coverage_state)
        ).length,
        coverageRequests: coverageRequests.filter((request) => request.household_id === household.id).length
      };
    })
    .filter(
      (household) =>
        household.sourceInputs > 0 ||
        household.coverageCards > 0 ||
        household.coverageRequests > 0
    )
    .sort((a, b) => b.needsAttentionCards - a.needsAttentionCards || b.sourceInputs - a.sourceInputs);
}

function sortedCounts(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function dateMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function csvCell(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;

  if (!/[",\n\r]/.test(safeValue)) return safeValue;
  return `"${safeValue.replaceAll("\"", "\"\"")}"`;
}
