import { describe, expect, it } from "vitest";
import {
  canTransitionSlot,
  deriveAttentionFlags,
  deriveCoverageState,
  getBoardSection
} from "@/lib/coverage-state";

describe("coverage state derivation", () => {
  it("surfaces uncovered slots in Needs Attention", () => {
    const input = {
      confidence: 0.95,
      slots: [{ state: "needs_coverage" as const }],
      readinessItems: []
    };

    expect(deriveAttentionFlags(input)).toContain("needs_coverage");
    expect(deriveCoverageState(input)).toBe("needs_coverage");
    expect(getBoardSection(input)).toBe("needs_attention");
  });

  it("derives covered only when slots are resolved", () => {
    const input = {
      confidence: 0.95,
      slots: [{ state: "accepted" as const }, { state: "covered_external" as const }],
      readinessItems: []
    };

    expect(deriveAttentionFlags(input)).toEqual([]);
    expect(deriveCoverageState(input)).toBe("covered");
    expect(getBoardSection(input)).toBe("this_week");
  });

  it("keeps low-confidence and due-soon readiness items visible", () => {
    const input = {
      confidence: 0.5,
      slots: [{ state: "accepted" as const }],
      readinessItems: [
        {
          status: "open" as const,
          dueAt: new Date("2026-05-20T10:00:00.000Z")
        }
      ],
      now: new Date("2026-05-19T10:00:00.000Z")
    };

    expect(deriveAttentionFlags(input)).toEqual(["needs_review", "due_soon"]);
    expect(deriveCoverageState(input)).toBe("needs_review");
  });
});

describe("coverage slot transitions", () => {
  it("requires an owner for accepted or external-covered states", () => {
    expect(canTransitionSlot("needs_coverage", "accepted", false)).toBe(false);
    expect(canTransitionSlot("needs_coverage", "covered_external", false)).toBe(false);
    expect(canTransitionSlot("needs_coverage", "accepted", true)).toBe(true);
    expect(canTransitionSlot("needs_coverage", "covered_external", true)).toBe(true);
  });

  it("allows request and decline loops without erasing history requirements", () => {
    expect(canTransitionSlot("needs_coverage", "requested", false)).toBe(true);
    expect(canTransitionSlot("requested", "declined", false)).toBe(true);
    expect(canTransitionSlot("declined", "requested", false)).toBe(true);
    expect(canTransitionSlot("requested", "covered_external", true)).toBe(true);
  });

  it("rejects no-op accepted transitions so ownership cannot be overwritten", () => {
    expect(canTransitionSlot("accepted", "accepted", true)).toBe(false);
  });
});
