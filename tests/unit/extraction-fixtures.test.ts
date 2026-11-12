import { describe, expect, it } from "vitest";
import { evaluateExtractionFixture, evaluateExtractionFixtures } from "@/lib/extraction/eval";
import { phase2ExtractionFixtures } from "../fixtures/extraction/phase2-fixtures";

describe("phase 2 extraction fixtures", () => {
  it("keeps the fixture eval suite passing against the v1 extraction contract", () => {
    const results = evaluateExtractionFixtures(phase2ExtractionFixtures);

    expect(results).toHaveLength(24);
    expect(results).toEqual(
      results.map((result) => ({
        ...result,
        passed: true,
        failures: []
      }))
    );
  });

  it("fails when output includes unexpected cards, slots, or readiness items", () => {
    const fixture = {
      ...phase2ExtractionFixtures[0],
      expected: {
        ...phase2ExtractionFixtures[0].expected,
        cards: [
          {
            ...phase2ExtractionFixtures[0].expected.cards[0],
            readinessLabels: []
          }
        ]
      }
    };
    const actualOutput = {
      ...fixture.expectedOutput,
      cards: [
        {
          ...fixture.expectedOutput.cards[0],
          coverageRelevance: {
            ...fixture.expectedOutput.cards[0].coverageRelevance,
            suggestedSlots: ["pickup", "dropoff"]
          },
          readinessItems: [{ label: "Bring cleats" }]
        },
        {
          ...fixture.expectedOutput.cards[0],
          title: "Unexpected snack duty"
        }
      ]
    };

    const result = evaluateExtractionFixture(fixture, actualOutput);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Card "Soccer pickup moved to field 2" suggested slots expected [pickup], received [dropoff, pickup].',
        'Card "Soccer pickup moved to field 2" readiness items expected [], received [Bring cleats].',
        'Unexpected card "Unexpected snack duty".'
      ])
    );
  });

  it("matches cards by logistics facts when live model titles differ", () => {
    const fixture = phase2ExtractionFixtures[0];
    const actualOutput = {
      ...fixture.expectedOutput,
      cards: [
        {
          ...fixture.expectedOutput.cards[0],
          title: "Friday Practice Pickup"
        }
      ]
    };

    expect(evaluateExtractionFixture(fixture, actualOutput)).toMatchObject({
      passed: true,
      failures: []
    });
  });

  it("fails when semantic readiness matching leaves extra actual readiness items", () => {
    const fixture = phase2ExtractionFixtures[3];
    const actualOutput = {
      ...fixture.expectedOutput,
      cards: fixture.expectedOutput.cards.map((card) =>
        card.title === "Complete camp supply checklist"
          ? {
              ...card,
              readinessItems: [
                { label: "Complete the supply checklist" },
                { label: "Bring a signed medical waiver" }
              ]
            }
          : card
      )
    };

    const result = evaluateExtractionFixture(fixture, actualOutput);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Card "Complete camp supply checklist" readiness items expected [Complete supply checklist], received [Bring a signed medical waiver, Complete the supply checklist].'
      ])
    );
  });

  it("does not let a broad partial readiness label satisfy a specific expected item", () => {
    const fixture = phase2ExtractionFixtures[1];
    const actualOutput = {
      ...fixture.expectedOutput,
      cards: [
        {
          ...fixture.expectedOutput.cards[0],
          readinessItems: [{ label: "Pay" }, { label: "Sign permission slip" }]
        }
      ]
    };

    const result = evaluateExtractionFixture(fixture, actualOutput);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'Card "Field trip permission slip and activity fee due" readiness items expected [Pay activity fee, Sign permission slip], received [Pay, Sign permission slip].'
      ])
    );
  });
});
