import type { ExtractionEvalFixture } from "@/lib/extraction/eval";
import {
  extractionSchemaVersion,
  type ExtractedCoverageCard,
  type ExtractedFamilyLogistics
} from "@/lib/extraction/schema";

type FixtureCardInput = Omit<ExtractedCoverageCard, "childNames" | "datePrecision"> &
  Partial<Pick<ExtractedCoverageCard, "childNames" | "datePrecision">>;

const card = (input: FixtureCardInput): ExtractedCoverageCard => ({
  childNames: [],
  datePrecision: "date_time",
  ...input
});

const output = (
  sourceSummary: string,
  cards: ExtractedCoverageCard[],
  noActionReason?: string
): ExtractedFamilyLogistics => ({
  schemaVersion: extractionSchemaVersion,
  sourceSummary,
  noActionReason,
  cards
});

const evidence = (label: string, line: number) => ({
  label,
  excerptRef: `source:line-${line}`
});

export const phase2ExtractionFixtures: ExtractionEvalFixture[] = [
  {
    id: "soccer-pickup-change",
    description: "A pasted coach update should become a changed pickup card.",
    sourceType: "paste",
    sourceText:
      "Synthetic coach update for Maya: Friday, May 22, 2026 practice ends at 5:30 PM. Pickup has moved to field 2 because of maintenance.",
    expectedOutput: output("Coach says soccer pickup moved to field 2 at 5:30 PM.", [
      card({
        type: "event",
        title: "Soccer pickup moved to field 2",
        childNames: ["Maya"],
        startsAt: "2026-05-22T17:30:00-05:00",
        location: "Field 2",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "The source says pickup moved and needs someone to collect Maya."
        },
        readinessItems: [],
        changedFields: [{ field: "location", newValue: "Field 2" }],
        coercionNotes: [],
        confidence: 0.88,
        reviewReasons: [],
        sourceEvidence: [evidence("Pickup moved", 2)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Soccer pickup moved to field 2",
          type: "event",
          childNames: ["Maya"],
          startsAt: "2026-05-22T17:30:00-05:00",
          location: "Field 2",
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          changedFields: ["location"],
          confidenceBand: "high",
          needsReview: true,
          reviewReasonIncludes: ["change"]
        }
      ]
    }
  },
  {
    id: "field-trip-readiness",
    description: "A form/payment school note should become an action-heavy readiness card.",
    sourceType: "paste",
    sourceText:
      "Synthetic class note: Field trip packets went home today. Please return the signed permission slip and activity fee by Sunday, May 24.",
    expectedOutput: output("Field trip needs a signed permission slip and activity fee by Friday.", [
      card({
        type: "deadline",
        title: "Field trip permission slip and activity fee due",
        startsAt: "2026-05-24T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["bring_prep"],
          reason: "A parent needs to handle the signed form and fee before the trip."
        },
        readinessItems: [
          { label: "Sign permission slip", dueAt: "2026-05-24T23:59:00-05:00" },
          { label: "Pay activity fee", dueAt: "2026-05-24T23:59:00-05:00" }
        ],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.72,
        reviewReasons: [],
        sourceEvidence: [evidence("Permission slip and fee", 4)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Field trip permission slip and activity fee due",
          type: "deadline",
          allDay: true,
          datePrecision: "date_only",
          suggestedSlots: ["bring_prep"],
          readinessLabels: ["Pay activity fee", "Sign permission slip"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  },
  {
    id: "school-picture-day",
    description: "A wear/bring reminder should create readiness without transportation.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic reminder: Picture day is Monday. Students should wear uniforms and bring the order envelope.",
    expectedOutput: output("Picture day reminder includes wear and bring details.", [
      card({
        type: "event",
        title: "Picture day",
        startsAt: "2026-05-25T09:00:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          needsTransportation: false,
          suggestedSlots: ["bring_prep"],
          reason: "No coverage handoff is required, but prep details matter."
        },
        readinessItems: [
          { label: "Wear uniform" },
          { label: "Bring order envelope" }
        ],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.9,
        reviewReasons: [],
        sourceEvidence: [evidence("Wear and bring details", 2)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Picture day",
          type: "event",
          allDay: true,
          datePrecision: "date_only",
          needsTransportation: false,
          suggestedSlots: ["bring_prep"],
          readinessLabels: ["Bring order envelope", "Wear uniform"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  },
  {
    id: "camp-registration-multi-card",
    description: "A camp confirmation should produce event coverage plus a readiness deadline.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic camp confirmation: Camp runs June 1 and June 2 from 9 AM to 3 PM at the community center. Complete the supply checklist by Sunday, May 31 before the first day.",
    expectedOutput: output("Camp confirmation includes two days and a supply checklist.", [
      card({
        type: "event",
        title: "Camp day 1",
        startsAt: "2026-06-01T09:00:00-05:00",
        endsAt: "2026-06-01T15:00:00-05:00",
        location: "Community center",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "The source has a start and end time away from home."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Camp day 1 time", 1)]
      }),
      card({
        type: "event",
        title: "Camp day 2",
        startsAt: "2026-06-02T09:00:00-05:00",
        endsAt: "2026-06-02T15:00:00-05:00",
        location: "Community center",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "The source has a start and end time away from home."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Camp day 2 time", 1)]
      }),
      card({
        type: "deadline",
        title: "Complete camp supply checklist",
        startsAt: "2026-05-31T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["bring_prep"],
          reason: "The supply checklist is prep tied to camp."
        },
        readinessItems: [{ label: "Complete supply checklist" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.78,
        reviewReasons: [],
        sourceEvidence: [evidence("Supply checklist", 2)]
      })
    ]),
    expected: {
      cardCount: 3,
      cards: [
        {
          title: "Camp day 1",
          type: "event",
          startsAt: "2026-06-01T09:00:00-05:00",
          endsAt: "2026-06-01T15:00:00-05:00",
          location: "Community center",
          suggestedSlots: ["dropoff", "pickup"],
          confidenceBand: "high",
          needsReview: false
        },
        {
          title: "Camp day 2",
          type: "event",
          startsAt: "2026-06-02T09:00:00-05:00",
          endsAt: "2026-06-02T15:00:00-05:00",
          location: "Community center",
          suggestedSlots: ["dropoff", "pickup"],
          confidenceBand: "high",
          needsReview: false
        },
        {
          title: "Complete camp supply checklist",
          type: "deadline",
          allDay: true,
          datePrecision: "date_only",
          suggestedSlots: ["bring_prep"],
          readinessLabels: ["Complete supply checklist"]
        }
      ]
    }
  },
  {
    id: "pediatrician-appointment",
    description: "A medical appointment should stay action-heavy and parent-reviewed.",
    sourceType: "paste",
    sourceText:
      "Synthetic appointment note: Pediatric visit is Tuesday at 3:40 PM. Arrive 10 minutes early and bring insurance card plus current medication list.",
    expectedOutput: output("Pediatric appointment includes arrival and medical prep details.", [
      card({
        type: "event",
        title: "Pediatric appointment",
        startsAt: "2026-05-26T15:40:00-05:00",
        location: "Clinic check-in desk",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["stay_attend", "general_owner"],
          reason: "A parent or caregiver needs to take Asha and stay for the visit."
        },
        readinessItems: [
          { label: "Arrive 10 minutes early" },
          { label: "Bring insurance card" },
          { label: "Bring medication list" }
        ],
        changedFields: [],
        coercionNotes: ["Converted arrival instruction into readiness items."],
        confidence: 0.82,
        reviewReasons: [],
        sourceEvidence: [evidence("Appointment prep", 3)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Pediatric appointment",
          type: "event",
          readinessLabels: [
            "Arrive 10 minutes early",
            "Bring insurance card",
            "Bring medication list"
          ],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy", "coercion"]
        }
      ]
    }
  },
  {
    id: "aftercare-early-close",
    description: "An early close update should create a changed pickup need.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic program update: Aftercare closes at 4 PM this Thursday instead of the usual time. Please arrange pickup.",
    expectedOutput: output("Aftercare closes early and needs pickup coverage.", [
      card({
        type: "event",
        title: "Aftercare early close pickup",
        startsAt: "2026-05-28T16:00:00-05:00",
        location: "Aftercare entrance",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "The source changes normal pickup timing."
        },
        possibleMatch: {
          existingCardHint: "Regular aftercare pickup",
          reason: "The update references the usual aftercare schedule."
        },
        readinessItems: [],
        changedFields: [{ field: "startsAt", previousValue: "usual pickup time", newValue: "4:00 PM" }],
        coercionNotes: [],
        confidence: 0.84,
        reviewReasons: [],
        sourceEvidence: [evidence("Early close", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Aftercare early close pickup",
          type: "event",
          suggestedSlots: ["pickup"],
          changedFields: ["startsAt"],
          possibleMatchReasonIncludes: "aftercare",
          needsReview: true,
          reviewReasonIncludes: ["change"]
        }
      ]
    }
  },
  {
    id: "birthday-rsvp-decision",
    description: "A calendar invite with RSVP should create an event and a decision.",
    sourceType: "calendar_invite",
    sourceText:
      "Synthetic calendar invite: Birthday party Saturday 2-4 PM at indoor play space. RSVP by Wednesday and bring socks.",
    expectedOutput: output("Party invite includes event details, RSVP decision, and socks reminder.", [
      card({
        type: "event",
        title: "Birthday party",
        startsAt: "2026-05-30T14:00:00-05:00",
        endsAt: "2026-05-30T16:00:00-05:00",
        location: "Indoor play space",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["bring_prep", "dropoff", "pickup"],
          reason: "A child needs transportation to and from the party."
        },
        readinessItems: [{ label: "Bring socks" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.9,
        reviewReasons: [],
        sourceEvidence: [evidence("Party time and location", 1)]
      }),
      card({
        type: "decision",
        title: "RSVP for birthday party",
        startsAt: "2026-05-27T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["general_owner"],
          reason: "Someone needs to decide and reply."
        },
        readinessItems: [],
        changedFields: [],
        decisionNeeded: "Decide whether Maya can attend and send RSVP.",
        coercionNotes: [],
        confidence: 0.88,
        reviewReasons: [],
        sourceEvidence: [evidence("RSVP deadline", 2)]
      })
    ]),
    expected: {
      cardCount: 2,
      cards: [
        {
          title: "Birthday party",
          type: "event",
          suggestedSlots: ["bring_prep", "dropoff", "pickup"],
          readinessLabels: ["Bring socks"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        },
        {
          title: "RSVP for birthday party",
          type: "decision",
          decisionNeededIncludes: "RSVP"
        }
      ]
    }
  },
  {
    id: "sports-schedule-bulk",
    description: "A bulk uploaded schedule should extract multiple event cards.",
    sourceType: "upload",
    sourceText:
      "Synthetic schedule table: Game Friday 6 PM field 1. Game Saturday 10 AM field 3. Game Sunday 1 PM field 2.",
    expectedOutput: output("Uploaded schedule contains three games at different fields.", [
      card({
        type: "event",
        title: "Friday game",
        startsAt: "2026-05-29T18:00:00-05:00",
        location: "Field 1",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "A game away from home needs transportation coverage."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.87,
        reviewReasons: [],
        sourceEvidence: [evidence("Friday game row", 1)]
      }),
      card({
        type: "event",
        title: "Saturday game",
        startsAt: "2026-05-30T10:00:00-05:00",
        location: "Field 3",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "A game away from home needs transportation coverage."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.87,
        reviewReasons: [],
        sourceEvidence: [evidence("Saturday game row", 2)]
      }),
      card({
        type: "event",
        title: "Sunday game",
        startsAt: "2026-05-31T13:00:00-05:00",
        location: "Field 2",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "A game away from home needs transportation coverage."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.87,
        reviewReasons: [],
        sourceEvidence: [evidence("Sunday game row", 3)]
      })
    ]),
    expected: {
      cardCount: 3,
      cards: [
        { title: "Friday game", type: "event", location: "Field 1", suggestedSlots: ["dropoff", "pickup"], confidenceBand: "high", needsReview: false },
        { title: "Saturday game", type: "event", location: "Field 3", suggestedSlots: ["dropoff", "pickup"], confidenceBand: "high", needsReview: false },
        { title: "Sunday game", type: "event", location: "Field 2", suggestedSlots: ["dropoff", "pickup"], confidenceBand: "high", needsReview: false }
      ]
    }
  },
  {
    id: "practice-cancelled",
    description: "A cancellation should become a standalone change needing review.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic team note: Today's practice is cancelled because the facility is closed.",
    expectedOutput: output("Practice cancellation should be matched or reviewed as a change.", [
      card({
        type: "event",
        title: "Practice cancelled",
        coverageRelevance: {
          suggestedSlots: [],
          reason: "The source cancels a known logistics commitment."
        },
        possibleMatch: {
          existingCardHint: "Practice",
          reason: "The source says today's practice is cancelled."
        },
        readinessItems: [],
        changedFields: [{ field: "status", previousValue: "scheduled", newValue: "cancelled" }],
        coercionNotes: [],
        confidence: 0.91,
        reviewReasons: [],
        sourceEvidence: [evidence("Cancellation", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Practice cancelled",
          type: "event",
          suggestedSlots: [],
          changedFields: ["status"],
          needsReview: true,
          reviewReasonIncludes: ["change"]
        }
      ]
    }
  },
  {
    id: "ambiguous-friday-reminder",
    description: "A relative-day reminder should preserve ambiguity for review.",
    sourceType: "paste",
    sourceText:
      "Synthetic reminder: Pickup is this Friday at 5:30 on field 2, but the header date and body date do not agree; it may mean May 29 or June 5.",
    expectedOutput: output("Pickup reminder has conflicting date references.", [
      card({
        type: "event",
        title: "Confirm Friday pickup date",
        startsAt: "2026-05-29T17:30:00-05:00",
        datePrecision: "ambiguous",
        location: "Field 2",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "Pickup is mentioned but the date is ambiguous."
        },
        dateAmbiguity: {
          reason: "The source has conflicting date references.",
          possibleDates: ["2026-05-29T17:30:00-05:00", "2026-06-05T17:30:00-05:00"]
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: ["Resolved relative weekday against source receipt date."],
        confidence: 0.74,
        reviewReasons: [],
        sourceEvidence: [evidence("Conflicting dates", 2)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Confirm Friday pickup date",
          type: "event",
          datePrecision: "ambiguous",
          suggestedSlots: ["pickup"],
          hasDateAmbiguity: true,
          confidenceBand: "low",
          needsReview: true,
          reviewReasonIncludes: ["Low extraction confidence", "Multiple possible dates", "precision"]
        }
      ]
    }
  },
  {
    id: "carpool-covered-by-other-parent",
    description: "A source that names external coverage should preserve the known owner hint.",
    sourceType: "paste",
    sourceText:
      "Synthetic parent text: Wednesday, May 27 practice pickup at 6 PM from field 2 is already covered because a carpool parent is driving home.",
    expectedOutput: output("Practice pickup appears covered by a carpool parent.", [
      card({
        type: "event",
        title: "Practice pickup covered by carpool",
        startsAt: "2026-05-27T18:00:00-05:00",
        location: "Field 2",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "The source mentions pickup and a known external driver."
        },
        knownCoverage: {
          ownerLabel: "Carpool parent",
          ownerType: "external_contact",
          coveredSlots: ["pickup"],
          reason: "The source says another parent is driving home."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.8,
        reviewReasons: [],
        sourceEvidence: [evidence("Carpool coverage", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Practice pickup covered by carpool",
          type: "event",
          knownCoverageOwner: "Carpool parent",
          knownCoverageSlots: ["pickup"],
          confidenceBand: "medium"
        }
      ]
    }
  },
  {
    id: "school-bus-default-coverage",
    description: "A bus return should avoid inventing a parent pickup slot.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic trip note: Thursday, May 28 field trip return is at 3 PM by school bus at the regular dismissal area.",
    expectedOutput: output("Return transportation is handled by the school bus.", [
      card({
        type: "event",
        title: "Field trip return by bus",
        startsAt: "2026-05-28T15:00:00-05:00",
        location: "Regular dismissal area",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: [],
          reason: "Transportation exists, but the source says the bus handles the return."
        },
        knownCoverage: {
          ownerLabel: "School bus",
          ownerType: "school_bus",
          coveredSlots: ["pickup"],
          reason: "The source says students return by bus."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Bus return", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Field trip return by bus",
          type: "event",
          suggestedSlots: [],
          knownCoverageOwner: "School bus",
          knownCoverageSlots: ["pickup"],
          needsReview: false
        }
      ]
    }
  },
  {
    id: "low-signal-newsletter",
    description: "A newsletter should extract the one actionable logistics item.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic newsletter: Thanks for a great week. Reminder that library books are due Thursday. Photos are posted in the family portal.",
    expectedOutput: output("Newsletter has one actionable library-book reminder.", [
      card({
        type: "deadline",
        title: "Return library books",
        startsAt: "2026-05-28T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["bring_prep"],
          reason: "Returning books is a prep item tied to a deadline."
        },
        readinessItems: [{ label: "Pack library books" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.79,
        reviewReasons: [],
        sourceEvidence: [evidence("Library books due", 2)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Return library books",
          type: "deadline",
          allDay: true,
          datePrecision: "date_only",
          suggestedSlots: ["bring_prep"],
          readinessLabels: ["Pack library books"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  },
  {
    id: "no-action-informational-update",
    description: "A purely informational source should be allowed to produce no cards.",
    sourceType: "paste",
    sourceText:
      "Synthetic update: Thanks for attending the event. Photos are now available in the family portal.",
    expectedOutput: output(
      "Informational update with no logistics action.",
      [],
      "No time-bound coverage, readiness, decision, or change item was found."
    ),
    expected: {
      cardCount: 0,
      noActionReasonIncludes: "No time-bound coverage",
      cards: []
    }
  },
  {
    id: "same-event-time-and-location-change",
    description: "A same-event update should preserve match and changed field details.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic update: The Friday, May 29 game is now at 6:15 PM on field B, not 5:30 PM on field A.",
    expectedOutput: output("Game time and field changed from the earlier plan.", [
      card({
        type: "event",
        title: "Game time and field changed",
        startsAt: "2026-05-29T18:15:00-05:00",
        location: "Field B",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "Game logistics changed and coverage may need reconfirmation."
        },
        possibleMatch: {
          existingCardHint: "Game at 5:30 PM on field A",
          reason: "The source says the game is now at a different time and field."
        },
        readinessItems: [],
        changedFields: [
          { field: "startsAt", previousValue: "5:30 PM", newValue: "6:15 PM" },
          { field: "location", previousValue: "Field A", newValue: "Field B" }
        ],
        coercionNotes: [],
        confidence: 0.89,
        reviewReasons: [],
        sourceEvidence: [evidence("Time and field changed", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Game time and field changed",
          type: "event",
          startsAt: "2026-05-29T18:15:00-05:00",
          location: "Field B",
          suggestedSlots: ["dropoff", "pickup"],
          changedFields: ["location", "startsAt"],
          confidenceBand: "high",
          needsReview: true,
          reviewReasonIncludes: ["change"]
        }
      ]
    }
  },
  {
    id: "multi-child-same-source-logistics",
    description: "One family email can produce separate child-specific logistics cards.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic weekly family email: Leo has soccer practice Tuesday, June 2 from 4:30 PM to 5:45 PM at North Field and needs pickup. Nora has dance rehearsal Wednesday, June 3 from 6 PM to 7 PM at Studio B and needs drop-off.",
    expectedOutput: output("Weekly email includes separate logistics for Leo and Nora.", [
      card({
        type: "event",
        title: "Leo soccer practice pickup",
        childNames: ["Leo"],
        startsAt: "2026-06-02T16:30:00-05:00",
        endsAt: "2026-06-02T17:45:00-05:00",
        location: "North Field",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "Leo needs pickup after soccer practice."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.88,
        reviewReasons: [],
        sourceEvidence: [evidence("Leo soccer pickup", 1)]
      }),
      card({
        type: "event",
        title: "Nora dance rehearsal drop-off",
        childNames: ["Nora"],
        startsAt: "2026-06-03T18:00:00-05:00",
        endsAt: "2026-06-03T19:00:00-05:00",
        location: "Studio B",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff"],
          reason: "Nora needs drop-off for dance rehearsal."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.88,
        reviewReasons: [],
        sourceEvidence: [evidence("Nora dance drop-off", 1)]
      })
    ]),
    expected: {
      cardCount: 2,
      cards: [
        {
          title: "Leo soccer practice pickup",
          type: "event",
          childNames: ["Leo"],
          startsAt: "2026-06-02T16:30:00-05:00",
          endsAt: "2026-06-02T17:45:00-05:00",
          location: "North Field",
          suggestedSlots: ["pickup"],
          confidenceBand: "high",
          needsReview: false
        },
        {
          title: "Nora dance rehearsal drop-off",
          type: "event",
          childNames: ["Nora"],
          startsAt: "2026-06-03T18:00:00-05:00",
          endsAt: "2026-06-03T19:00:00-05:00",
          location: "Studio B",
          suggestedSlots: ["dropoff"],
          confidenceBand: "high",
          needsReview: false
        }
      ]
    }
  },
  {
    id: "grandma-dropoff-pickup-uncovered",
    description: "Partial known coverage should keep the external owner while leaving pickup visible.",
    sourceType: "paste",
    sourceText:
      "Synthetic parent note: Friday, June 5 robotics club is 3:30 PM to 5 PM at the school lab. Grandma can do drop-off, but pickup still needs someone.",
    expectedOutput: output("Robotics has Grandma covering drop-off while pickup remains open.", [
      card({
        type: "event",
        title: "Robotics club pickup still needs coverage",
        startsAt: "2026-06-05T15:30:00-05:00",
        endsAt: "2026-06-05T17:00:00-05:00",
        location: "School lab",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "Drop-off is covered by Grandma, but pickup still needs someone."
        },
        knownCoverage: {
          ownerLabel: "Grandma",
          ownerType: "external_contact",
          coveredSlots: ["dropoff"],
          reason: "The source says Grandma can do drop-off."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.83,
        reviewReasons: [],
        sourceEvidence: [evidence("Grandma drop-off and open pickup", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Robotics club pickup still needs coverage",
          type: "event",
          startsAt: "2026-06-05T15:30:00-05:00",
          endsAt: "2026-06-05T17:00:00-05:00",
          location: "School lab",
          suggestedSlots: ["pickup"],
          knownCoverageOwner: "Grandma",
          knownCoverageSlots: ["dropoff"]
        }
      ]
    }
  },
  {
    id: "carpool-time-change-needs-reconfirmation",
    description: "A time change should not silently preserve previously arranged carpool coverage.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic coach update: Thursday, June 4 practice pickup moved from 5:30 PM to 6:10 PM at Field 4. If you arranged carpool, please reconfirm the driver.",
    expectedOutput: output("Practice pickup time changed and carpool coverage needs reconfirmation.", [
      card({
        type: "event",
        title: "Practice pickup time changed",
        startsAt: "2026-06-04T18:10:00-05:00",
        location: "Field 4",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "The pickup time changed, so pickup coverage should be reconfirmed."
        },
        possibleMatch: {
          existingCardHint: "Practice pickup at 5:30 PM",
          reason: "The source says pickup moved from 5:30 PM to 6:10 PM."
        },
        readinessItems: [],
        changedFields: [{ field: "startsAt", previousValue: "5:30 PM", newValue: "6:10 PM" }],
        decisionNeeded: "Confirm whether the carpool driver can still handle pickup.",
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: ["Carpool coverage needs reconfirmation."],
        sourceEvidence: [evidence("Pickup time changed", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Practice pickup time changed",
          type: "event",
          startsAt: "2026-06-04T18:10:00-05:00",
          location: "Field 4",
          suggestedSlots: ["pickup"],
          changedFields: ["startsAt"],
          possibleMatchReasonIncludes: "5:30 PM",
          needsReview: true,
          reviewReasonIncludes: ["change"]
        }
      ]
    }
  },
  {
    id: "swim-meet-waiver-payment-deadline",
    description: "A dated event plus earlier form/payment deadline should create separate cards.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic swim team email: Swim meet is Saturday, June 6 from 8 AM to noon at East Pool. Submit the signed waiver and pay the $18 meet fee by Monday, June 1.",
    expectedOutput: output("Swim meet has event coverage plus a waiver and fee deadline.", [
      card({
        type: "event",
        title: "Swim meet",
        startsAt: "2026-06-06T08:00:00-05:00",
        endsAt: "2026-06-06T12:00:00-05:00",
        location: "East Pool",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "A parent may need to transport the child to and from the swim meet."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.88,
        reviewReasons: [],
        sourceEvidence: [evidence("Swim meet time and place", 1)]
      }),
      card({
        type: "deadline",
        title: "Submit swim meet waiver and fee",
        startsAt: "2026-06-01T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["bring_prep"],
          reason: "The waiver and fee are required before the swim meet."
        },
        readinessItems: [
          { label: "Submit signed waiver", dueAt: "2026-06-01T23:59:00-05:00" },
          { label: "Pay $18 meet fee", dueAt: "2026-06-01T23:59:00-05:00" }
        ],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.82,
        reviewReasons: [],
        sourceEvidence: [evidence("Waiver and fee deadline", 1)]
      })
    ]),
    expected: {
      cardCount: 2,
      cards: [
        {
          title: "Swim meet",
          type: "event",
          startsAt: "2026-06-06T08:00:00-05:00",
          endsAt: "2026-06-06T12:00:00-05:00",
          location: "East Pool",
          suggestedSlots: ["dropoff", "pickup"],
          confidenceBand: "high",
          needsReview: false
        },
        {
          title: "Submit swim meet waiver and fee",
          type: "deadline",
          startsAt: "2026-06-01T23:59:00-05:00",
          allDay: true,
          datePrecision: "date_only",
          suggestedSlots: ["bring_prep"],
          readinessLabels: ["Pay $18 meet fee", "Submit signed waiver"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  },
  {
    id: "ambiguous-pickup-owner-thread",
    description: "A parent thread with unclear owner should become reviewable rather than covered.",
    sourceType: "paste",
    sourceText:
      "Synthetic parent thread: Can someone get Sam from chess club on Tuesday, June 2 at 5 PM? I might be stuck at work and I do not know whether Alex saw this.",
    expectedOutput: output("Chess club pickup needs an owner decision.", [
      card({
        type: "event",
        title: "Confirm chess club pickup owner",
        childNames: ["Sam"],
        startsAt: "2026-06-02T17:00:00-05:00",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["pickup"],
          reason: "The source asks who can get Sam from chess club."
        },
        readinessItems: [],
        changedFields: [],
        decisionNeeded: "Confirm who is picking up Sam from chess club.",
        coercionNotes: [],
        confidence: 0.7,
        reviewReasons: ["Pickup owner is ambiguous."],
        sourceEvidence: [evidence("Unclear pickup owner", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Confirm chess club pickup owner",
          type: "event",
          childNames: ["Sam"],
          startsAt: "2026-06-02T17:00:00-05:00",
          suggestedSlots: ["pickup"],
          needsReview: true
        }
      ]
    }
  },
  {
    id: "missing-location-transportation",
    description: "Transportation with no location should trigger Needs Review.",
    sourceType: "paste",
    sourceText:
      "Synthetic text message: Basketball skills clinic is Monday, June 1 from 4 PM to 5 PM. Please handle drop-off and pickup. The location was not included in this message.",
    expectedOutput: output("Basketball clinic needs transportation but lacks a location.", [
      card({
        type: "event",
        title: "Basketball skills clinic",
        startsAt: "2026-06-01T16:00:00-05:00",
        endsAt: "2026-06-01T17:00:00-05:00",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup"],
          reason: "The source asks for drop-off and pickup but does not include a location."
        },
        readinessItems: [],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.78,
        reviewReasons: [],
        sourceEvidence: [evidence("Clinic without location", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Basketball skills clinic",
          type: "event",
          startsAt: "2026-06-01T16:00:00-05:00",
          endsAt: "2026-06-01T17:00:00-05:00",
          suggestedSlots: ["dropoff", "pickup"],
          needsReview: true,
          reviewReasonIncludes: ["location is missing"]
        }
      ]
    }
  },
  {
    id: "no-action-portal-announcement",
    description: "A portal announcement with no time-bound logistics should produce no cards.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic portal announcement: The spring photo gallery is available now, the principal's note has been posted, and classroom highlights are in the family portal. No response is needed.",
    expectedOutput: output(
      "Portal announcement has no time-bound logistics action.",
      [],
      "No time-bound coverage, readiness, decision, deadline, or change item was found."
    ),
    expected: {
      cardCount: 0,
      noActionReasonIncludes: "No time-bound coverage",
      cards: []
    }
  },
  {
    id: "school-nurse-medication-form",
    description: "A school nurse form request should create action-heavy parent review.",
    sourceType: "forwarded_email",
    sourceText:
      "Synthetic nurse note: Field day is already on the family calendar. This note only adds nurse prep: please send the medication authorization form and the labeled inhaler to the nurse by Wednesday, June 3.",
    expectedOutput: output("Field day needs medication authorization prep.", [
      card({
        type: "deadline",
        title: "Send medication authorization for field day",
        startsAt: "2026-06-03T23:59:00-05:00",
        allDay: true,
        datePrecision: "date_only",
        coverageRelevance: {
          suggestedSlots: ["bring_prep"],
          reason: "Medication authorization and the labeled inhaler must be sent before field day."
        },
        readinessItems: [
          { label: "Send medication authorization form", dueAt: "2026-06-03T23:59:00-05:00" },
          { label: "Send labeled inhaler to nurse", dueAt: "2026-06-03T23:59:00-05:00" }
        ],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.8,
        reviewReasons: [],
        sourceEvidence: [evidence("Medication authorization deadline", 1)]
      })
    ]),
    expected: {
      cardCount: 1,
      cards: [
        {
          title: "Send medication authorization for field day",
          type: "deadline",
          startsAt: "2026-06-03T23:59:00-05:00",
          allDay: true,
          datePrecision: "date_only",
          suggestedSlots: ["bring_prep"],
          readinessLabels: [
            "Labeled inhaler",
            "Medication authorization form"
          ],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  },
  {
    id: "recurring-rehearsal-short-series",
    description: "A short explicit recurring series should expand without creating an unbounded recurrence.",
    sourceType: "upload",
    sourceText:
      "Synthetic rehearsal flyer: Tech rehearsals are Tuesday, June 2 from 5 PM to 7 PM, Thursday, June 4 from 5 PM to 7 PM, and Saturday, June 6 from 10 AM to noon at the auditorium. Bring the costume bag each day.",
    expectedOutput: output("Rehearsal flyer contains three explicit rehearsal dates.", [
      card({
        type: "event",
        title: "Tuesday tech rehearsal",
        startsAt: "2026-06-02T17:00:00-05:00",
        endsAt: "2026-06-02T19:00:00-05:00",
        location: "Auditorium",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup", "bring_prep"],
          reason: "The rehearsal has a time, location, and costume-bag prep."
        },
        readinessItems: [{ label: "Bring costume bag" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Tuesday rehearsal", 1)]
      }),
      card({
        type: "event",
        title: "Thursday tech rehearsal",
        startsAt: "2026-06-04T17:00:00-05:00",
        endsAt: "2026-06-04T19:00:00-05:00",
        location: "Auditorium",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup", "bring_prep"],
          reason: "The rehearsal has a time, location, and costume-bag prep."
        },
        readinessItems: [{ label: "Bring costume bag" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Thursday rehearsal", 1)]
      }),
      card({
        type: "event",
        title: "Saturday tech rehearsal",
        startsAt: "2026-06-06T10:00:00-05:00",
        endsAt: "2026-06-06T12:00:00-05:00",
        location: "Auditorium",
        coverageRelevance: {
          needsTransportation: true,
          suggestedSlots: ["dropoff", "pickup", "bring_prep"],
          reason: "The rehearsal has a time, location, and costume-bag prep."
        },
        readinessItems: [{ label: "Bring costume bag" }],
        changedFields: [],
        coercionNotes: [],
        confidence: 0.86,
        reviewReasons: [],
        sourceEvidence: [evidence("Saturday rehearsal", 1)]
      })
    ]),
    expected: {
      cardCount: 3,
      cards: [
        {
          title: "Tuesday tech rehearsal",
          type: "event",
          startsAt: "2026-06-02T17:00:00-05:00",
          endsAt: "2026-06-02T19:00:00-05:00",
          location: "Auditorium",
          suggestedSlots: ["bring_prep", "dropoff", "pickup"],
          readinessLabels: ["Bring costume bag"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        },
        {
          title: "Thursday tech rehearsal",
          type: "event",
          startsAt: "2026-06-04T17:00:00-05:00",
          endsAt: "2026-06-04T19:00:00-05:00",
          location: "Auditorium",
          suggestedSlots: ["bring_prep", "dropoff", "pickup"],
          readinessLabels: ["Bring costume bag"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        },
        {
          title: "Saturday tech rehearsal",
          type: "event",
          startsAt: "2026-06-06T10:00:00-05:00",
          endsAt: "2026-06-06T12:00:00-05:00",
          location: "Auditorium",
          suggestedSlots: ["bring_prep", "dropoff", "pickup"],
          readinessLabels: ["Bring costume bag"],
          needsReview: true,
          reviewReasonIncludes: ["Action-heavy"]
        }
      ]
    }
  }
];
