import { describe, expect, it } from "vitest";
import {
  buildDailyUnresolvedEmail,
  buildWeeklyCoverageReviewEmail
} from "@/lib/notifications/email";
import {
  buildUnresolvedItemsFromRows,
  type RawUnresolvedCardRow
} from "@/lib/notifications/unresolved-items";

const now = new Date("2026-05-26T13:00:00.000Z");

describe("buildUnresolvedItemsFromRows", () => {
  it("selects daily unresolved slots, changed cards, and due readiness without source text", () => {
    const rows: RawUnresolvedCardRow[] = [
      {
        id: "card-1",
        household_id: "household-1",
        title: "Soccer practice",
        starts_at: "2026-05-26T22:30:00.000Z",
        computed_coverage_state: "needs_coverage",
        review_reason: null,
        created_at: "2026-05-25T12:00:00.000Z",
        coverage_slots: [{ id: "slot-1", kind: "pickup", state: "needs_coverage" }],
        readiness_items: [{ id: "ready-1", label: "Bring cleats", status: "open", due_at: "2026-05-27T14:00:00.000Z" }],
        card_children: [{ children: { display_name: "Avery" } }]
      },
      {
        id: "card-2",
        household_id: "household-1",
        title: "Old appointment",
        starts_at: "2026-05-20T15:00:00.000Z",
        computed_coverage_state: "needs_coverage",
        review_reason: null,
        created_at: "2026-05-20T12:00:00.000Z",
        coverage_slots: [{ id: "slot-2", kind: "dropoff", state: "needs_coverage" }],
        readiness_items: [],
        card_children: []
      },
      {
        id: "card-3",
        household_id: "household-1",
        title: "Camp pickup moved",
        starts_at: "2026-05-27T20:00:00.000Z",
        computed_coverage_state: "changed",
        review_reason: "Time changed",
        created_at: "2026-05-26T12:00:00.000Z",
        coverage_slots: [],
        readiness_items: [],
        card_children: []
      }
    ];

    const items = buildUnresolvedItemsFromRows({
      rows,
      timezone: "America/Chicago",
      now,
      horizonDays: 2
    });

    expect(items.map((item) => item.kind)).toEqual([
      "uncovered_slot",
      "due_readiness",
      "changed_event"
    ]);
    expect(items.map((item) => item.statusLabel)).toContain("Pickup needs coverage");
    expect(JSON.stringify(items)).not.toContain("source_inputs");
    expect(JSON.stringify(items)).not.toContain("storage_path");
  });

  it("supports weekly review horizons without including covered cards", () => {
    const rows: RawUnresolvedCardRow[] = [
      {
        id: "card-weekly",
        household_id: "household-1",
        title: "Friday class",
        starts_at: "2026-05-29T15:00:00.000Z",
        computed_coverage_state: "pending",
        review_reason: null,
        created_at: "2026-05-25T12:00:00.000Z",
        coverage_slots: [{ id: "slot-1", kind: "general_owner", state: "requested" }],
        readiness_items: [],
        card_children: []
      },
      {
        id: "covered",
        household_id: "household-1",
        title: "Covered recital",
        starts_at: "2026-05-29T18:00:00.000Z",
        computed_coverage_state: "covered",
        review_reason: null,
        created_at: "2026-05-25T12:00:00.000Z",
        coverage_slots: [{ id: "slot-2", kind: "general_owner", state: "accepted" }],
        readiness_items: [],
        card_children: []
      }
    ];

    const items = buildUnresolvedItemsFromRows({
      rows,
      timezone: "America/Chicago",
      now,
      horizonDays: 7
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cardId: "card-weekly",
      kind: "pending_response",
      severity: "this_week"
    });
  });

  it("includes overdue readiness in weekly reviews without turning covered slots into digest items", () => {
    const rows: RawUnresolvedCardRow[] = [
      {
        id: "card-overdue",
        household_id: "household-1",
        title: "Camp registration",
        starts_at: "2026-05-30T15:00:00.000Z",
        computed_coverage_state: "covered",
        review_reason: null,
        created_at: "2026-05-20T12:00:00.000Z",
        coverage_slots: [{ id: "slot-covered", kind: "general_owner", state: "accepted" }],
        readiness_items: [{ id: "ready-1", label: "Submit waiver", status: "open", due_at: "2026-05-25T14:00:00.000Z" }],
        card_children: []
      }
    ];

    const items = buildUnresolvedItemsFromRows({
      rows,
      timezone: "America/Chicago",
      now,
      horizonDays: 7
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "due_readiness",
      title: "Camp registration: Submit waiver"
    });
  });

  it("ignores null child join rows without throwing", () => {
    const items = buildUnresolvedItemsFromRows({
      rows: [
        {
          id: "card-null-child",
          household_id: "household-1",
          title: "Pickup plan",
          starts_at: "2026-05-26T22:30:00.000Z",
          computed_coverage_state: "needs_coverage",
          review_reason: null,
          created_at: "2026-05-25T12:00:00.000Z",
          coverage_slots: [{ id: "slot-1", kind: "pickup", state: "needs_coverage" }],
          readiness_items: [],
          card_children: [
            { children: null },
            { children: { display_name: null } },
            { children: [{ display_name: null }, { display_name: "Avery" }] }
          ]
        }
      ],
      timezone: "America/Chicago",
      now,
      horizonDays: 2
    });

    expect(items).toHaveLength(1);
    expect(items[0].childLabels).toEqual(["Avery"]);
  });
});

describe("buildDailyUnresolvedEmail", () => {
  it("renders compact private email content", () => {
    const email = buildDailyUnresolvedEmail({
      householdName: "Rivera Family",
      appUrl: "https://app.famtandem.com",
      timezone: "America/Chicago",
      items: [
        {
          householdId: "household-1",
          cardId: "card-1",
          kind: "uncovered_slot",
          severity: "today",
          title: "Soccer pickup <script>",
          startsAt: "2026-05-26T22:30:00.000Z",
          dueAt: null,
          statusLabel: "Pickup needs coverage",
          slotKind: "pickup",
          childLabels: ["Avery"],
          appHref: "/app"
        }
      ]
    });

    expect(email.subject).toBe("FamTandem: 1 thing still needs coverage today");
    expect(email.text).toContain("Pickup needs coverage: Soccer pickup <script>");
    expect(email.text).toContain("at May 26, 5:30 PM");
    expect(email.text).toContain("https://app.famtandem.com/app");
    expect(email.text).not.toContain("source_inputs");
    expect(email.text).not.toContain("token_hash");
    expect(email.html).toContain("Soccer pickup &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});

describe("buildWeeklyCoverageReviewEmail", () => {
  it("renders a compact weekly planning digest without source or provider internals", () => {
    const email = buildWeeklyCoverageReviewEmail({
      householdName: "Rivera Family",
      appUrl: "https://app.famtandem.com",
      periodStart: "2026-05-31",
      periodEnd: "2026-06-06",
      timezone: "America/Chicago",
      items: [
        {
          householdId: "household-1",
          cardId: "card-1",
          kind: "uncovered_slot",
          severity: "this_week",
          title: "Soccer pickup <script>",
          startsAt: "2026-06-01T22:30:00.000Z",
          dueAt: null,
          statusLabel: "Pickup needs coverage",
          slotKind: "pickup",
          childLabels: ["Avery"],
          appHref: "/app"
        },
        {
          householdId: "household-1",
          cardId: "card-2",
          kind: "due_readiness",
          severity: "this_week",
          title: "Camp: Waiver",
          startsAt: "2026-06-02T14:00:00.000Z",
          dueAt: "2026-06-01T14:00:00.000Z",
          statusLabel: "Due soon",
          childLabels: [],
          appHref: "/app"
        }
      ]
    });

    expect(email.subject).toBe("FamTandem: 2 uncertain items for the week ahead");
    expect(email.text).toContain("May 31 - Jun 6");
    expect(email.text).toContain("Needs coverage: 1. Waiting on response: 0. Changed: 0. Due soon: 1. Needs review: 0.");
    expect(email.text).toContain("https://app.famtandem.com/app");
    expect(email.text).not.toContain("source_inputs");
    expect(email.text).not.toContain("storage_path");
    expect(email.text).not.toContain("provider_message_id");
    expect(email.html).toContain("Soccer pickup &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
