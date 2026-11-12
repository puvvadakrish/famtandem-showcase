import { describe, expect, it } from "vitest";
import { buildValidationSnapshot, validationSnapshotToCsv } from "@/lib/validation-snapshot";

describe("buildValidationSnapshot", () => {
  it("summarizes validation funnel and household activity from existing rows", () => {
    const snapshot = buildValidationSnapshot({
      now: new Date("2026-05-25T12:00:00-05:00"),
      households: [
        { id: "household-1", name: "Rivera family", created_at: "2026-05-18T12:00:00-05:00" },
        { id: "household-2", name: "Chen family", created_at: "2026-05-19T12:00:00-05:00" }
      ],
      sources: [
        {
          household_id: "household-1",
          source_type: "paste",
          status: "processed",
          created_at: "2026-05-24T12:00:00-05:00"
        },
        {
          household_id: "household-1",
          source_type: "upload",
          status: "pending",
          created_at: "2026-05-10T12:00:00-05:00"
        }
      ],
      cards: [
        {
          household_id: "household-1",
          computed_coverage_state: "needs_coverage",
          confidence: 0.82,
          review_reason: null,
          source_input_id: "source-1",
          created_at: "2026-05-24T12:00:00-05:00"
        },
        {
          household_id: "household-1",
          computed_coverage_state: "covered",
          confidence: 0.9,
          review_reason: null,
          source_input_id: null,
          created_at: "2026-05-24T13:00:00-05:00"
        },
        {
          household_id: "household-2",
          computed_coverage_state: "pending",
          confidence: 0.76,
          review_reason: null,
          source_input_id: "source-2",
          created_at: "2026-05-24T14:00:00-05:00"
        }
      ],
      slots: [
        { household_id: "household-1", state: "needs_coverage" },
        { household_id: "household-1", state: "accepted" },
        { household_id: "household-2", state: "requested" }
      ],
      coverageRequests: [
        {
          household_id: "household-2",
          created_at: "2026-05-24T15:00:00-05:00"
        },
        {
          household_id: "household-1",
          created_at: "2026-05-24T16:00:00-05:00"
        }
      ],
      responses: [
        {
          household_id: "household-2",
          response: "accept_pickup",
          responded_at: "2026-05-24T15:10:00-05:00"
        },
        {
          household_id: "household-1",
          response: "decline",
          responded_at: "2026-05-24T16:10:00-05:00"
        }
      ]
    });

    expect(snapshot.totals).toMatchObject({
      households: 2,
      activeHouseholds: 2,
      sourceInputs: 2,
      sourceInputsLast7Days: 1,
      coverageCards: 3,
      sourceBackedCards: 2,
      needsAttentionCards: 2,
      uncoveredOrPendingCards: 2,
      slotsNeedingCoverage: 1,
      requestedSlots: 1,
      coveredSlots: 1,
      coverageRequests: 2,
      coverageResponses: 2,
      acceptedResponses: 1,
      declinedResponses: 1,
      responseRate: 1
    });
    expect(snapshot.sourceTypes).toEqual([
      { label: "paste", count: 1 },
      { label: "upload", count: 1 }
    ]);
    expect(snapshot.cardStates).toEqual([
      { label: "covered", count: 1 },
      { label: "needs_coverage", count: 1 },
      { label: "pending", count: 1 }
    ]);
    expect(snapshot.householdSnapshots).toEqual([
      {
        id: "household-1",
        name: "Rivera family",
        sourceInputs: 2,
        coverageCards: 2,
        needsAttentionCards: 1,
        coverageRequests: 1
      },
      {
        id: "household-2",
        name: "Chen family",
        sourceInputs: 0,
        coverageCards: 1,
        needsAttentionCards: 1,
        coverageRequests: 1
      }
    ]);
  });

  it("uses N/A-friendly response rate when no requests have been sent", () => {
    const snapshot = buildValidationSnapshot({
      now: new Date("2026-05-25T12:00:00-05:00"),
      households: [],
      sources: [],
      cards: [],
      slots: [],
      coverageRequests: [],
      responses: []
    });

    expect(snapshot.totals.responseRate).toBeNull();
    expect(snapshot.householdSnapshots).toEqual([]);
  });

  it("exports snapshot metrics and household rows as CSV without raw source text", () => {
    const snapshot = buildValidationSnapshot({
      now: new Date("2026-05-25T12:00:00-05:00"),
      households: [
        { id: "household-1", name: "Rivera, Smith family", created_at: "2026-05-18T12:00:00-05:00" },
        {
          id: "household-2",
          name: '=HYPERLINK("https://example.com")',
          created_at: "2026-05-18T12:00:00-05:00"
        }
      ],
      sources: [
        {
          household_id: "household-1",
          source_type: "paste",
          status: "processed",
          created_at: "2026-05-24T12:00:00-05:00"
        }
      ],
      cards: [
        {
          household_id: "household-1",
          computed_coverage_state: "needs_coverage",
          confidence: 0.82,
          review_reason: null,
          source_input_id: "source-1",
          created_at: "2026-05-24T12:00:00-05:00"
        }
      ],
      slots: [{ household_id: "household-1", state: "needs_coverage" }],
      coverageRequests: [
        { household_id: "household-1", created_at: "2026-05-24T16:00:00-05:00" },
        { household_id: "household-2", created_at: "2026-05-24T17:00:00-05:00" }
      ],
      responses: [{ household_id: "household-1", response: "accept_pickup", responded_at: "2026-05-24T16:10:00-05:00" }]
    });

    const csv = validationSnapshotToCsv(snapshot);

    expect(csv).toContain("section,metric,value");
    expect(csv).toContain("totals,coverage_requests,2");
    expect(csv).toContain("source_types,paste,1");
    expect(csv).toContain('household-1,"Rivera, Smith family",1,1,1,1');
    expect(csv).toContain('household-2,"\'=HYPERLINK(""https://example.com"")",0,0,0,1');
    expect(csv).not.toContain("Pickup is Friday");
  });
});
