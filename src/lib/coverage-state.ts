import type {
  AttentionFlag,
  BoardSection,
  CoverageCardInput,
  CoverageSlotState,
  DerivedCoverageState
} from "@/lib/types";

const coveredSlotStates = new Set<CoverageSlotState>([
  "accepted",
  "cancelled",
  "covered_external"
]);

export function deriveCoverageState(card: CoverageCardInput): DerivedCoverageState {
  const flags = deriveAttentionFlags(card);

  if (flags.includes("overdue")) return "overdue";
  if (flags.includes("changed")) return "changed";
  if (flags.includes("needs_review")) return "needs_review";
  if (flags.includes("needs_coverage")) return "needs_coverage";
  if (flags.includes("pending")) return "pending";
  if (flags.includes("due_soon")) return "due_soon";

  return "covered";
}

export function deriveAttentionFlags(card: CoverageCardInput): AttentionFlag[] {
  const flags = new Set<AttentionFlag>();
  const now = card.now ?? new Date();

  if (card.reviewReason || (typeof card.confidence === "number" && card.confidence < 0.75)) {
    flags.add("needs_review");
  }

  if (card.hasUnconfirmedChange) {
    flags.add("changed");
  }

  for (const slot of card.slots) {
    if (slot.state === "needs_coverage" || slot.state === "declined") {
      flags.add("needs_coverage");
    }

    if (slot.state === "requested") {
      flags.add("pending");
    }
  }

  for (const item of card.readinessItems) {
    if (item.status !== "open" || !item.dueAt) continue;

    const dueAt = item.dueAt instanceof Date ? item.dueAt : new Date(item.dueAt);
    if (Number.isNaN(dueAt.getTime())) continue;

    if (dueAt.getTime() < now.getTime()) {
      flags.add("overdue");
    } else if (dueAt.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) {
      flags.add("due_soon");
    }
  }

  if (card.slots.length > 0 && card.slots.every((slot) => coveredSlotStates.has(slot.state))) {
    flags.delete("needs_coverage");
    flags.delete("pending");
  }

  return Array.from(flags);
}

export function getBoardSection(card: CoverageCardInput): BoardSection {
  const flags = deriveAttentionFlags(card);

  if (
    flags.includes("needs_coverage") ||
    flags.includes("pending") ||
    flags.includes("changed") ||
    flags.includes("needs_review") ||
    flags.includes("overdue") ||
    flags.includes("due_soon")
  ) {
    return "needs_attention";
  }

  return "this_week";
}

export function coverageStateLabel(state: DerivedCoverageState) {
  const labels: Record<DerivedCoverageState, string> = {
    covered: "Covered",
    needs_coverage: "Needs coverage",
    pending: "Pending",
    changed: "Changed",
    needs_review: "Needs review",
    due_soon: "Due soon",
    overdue: "Overdue"
  };

  return labels[state];
}

export function canTransitionSlot(
  from: CoverageSlotState,
  to: CoverageSlotState,
  hasOwner: boolean
) {
  if (from === to) return false;

  const allowed: Record<CoverageSlotState, CoverageSlotState[]> = {
    needs_coverage: ["requested", "accepted", "cancelled", "covered_external"],
    requested: ["accepted", "declined", "cancelled", "covered_external"],
    accepted: ["needs_coverage", "cancelled"],
    declined: ["requested", "accepted", "cancelled", "covered_external"],
    cancelled: ["needs_coverage"],
    covered_external: ["needs_coverage", "cancelled"]
  };

  if (!allowed[from].includes(to)) {
    return false;
  }

  if (to === "accepted" || to === "covered_external") {
    return hasOwner;
  }

  return true;
}
