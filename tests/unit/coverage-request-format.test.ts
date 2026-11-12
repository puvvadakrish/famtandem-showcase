import { describe, expect, it } from "vitest";
import { formatCoverageRequestDateTime } from "@/lib/coverage-requests/format";

describe("formatCoverageRequestDateTime", () => {
  it("formats coverage request timestamps in the household timezone", () => {
    expect(
      formatCoverageRequestDateTime("2026-06-09T22:30:00.000Z", "America/Chicago")
    ).toBe("Tue, Jun 9, 5:30 PM");
  });

  it("falls back to the original value when the timestamp is invalid", () => {
    expect(formatCoverageRequestDateTime("not-a-date", "America/Chicago")).toBe("not-a-date");
  });
});
