import { describe, expect, it } from "vitest";
import { emptyLinkedCardsMessage } from "@/lib/source-detail-state";

describe("emptyLinkedCardsMessage", () => {
  it("explains each extraction state for source details without linked cards", () => {
    expect(emptyLinkedCardsMessage(null)).toBe("No cards are linked to this source yet.");
    expect(emptyLinkedCardsMessage("pending")).toMatch(/still reading/);
    expect(emptyLinkedCardsMessage("running")).toMatch(/still reading/);
    expect(emptyLinkedCardsMessage("succeeded")).toMatch(/No actionable coverage cards/);
    expect(emptyLinkedCardsMessage("failed")).toMatch(/Extraction failed/);
    expect(emptyLinkedCardsMessage("skipped_no_text")).toMatch(/does not have extractable text/);
  });
});
