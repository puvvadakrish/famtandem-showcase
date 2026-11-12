import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtractionRunSummary } from "@/components/extraction-run-summary";

describe("ExtractionRunSummary", () => {
  it("renders provider, status, attempts, cards, review reasons, and sanitized errors", () => {
    render(
      <ExtractionRunSummary
        timezone="America/Chicago"
        run={{
          id: "run-1",
          provider: "gemini",
          model: "gemini-3.5-flash",
          schemaVersion: "family-logistics-v1",
          status: "failed",
          attempts: 2,
          maxAttempts: 3,
          lastError: "Gemini request timed out after 60000ms for household/source/private.pdf",
          reviewReasons: ["Low extraction confidence.", "Source may change an existing plan."],
          noActionReason: null,
          cardCount: 1,
          startedAt: "2026-05-24T14:00:00-05:00",
          finishedAt: null
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Extraction run" })).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
    expect(screen.getByText("gemini-3.5-flash")).toBeInTheDocument();
    expect(screen.getByText("family-logistics-v1")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.getByText("Low extraction confidence.")).toBeInTheDocument();
    expect(screen.getByText("Latest issue")).toBeInTheDocument();
    expect(
      screen.getByText("This source took too long to read. Try again, or review it manually.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gemini request timed out/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private\.pdf/)).not.toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });

  it("renders an empty state when no extraction run is present", () => {
    render(<ExtractionRunSummary timezone="America/Chicago" run={null} />);

    expect(screen.getByRole("heading", { name: "Extraction run" })).toBeInTheDocument();
    expect(screen.getByText("No extraction run has been recorded for this source yet.")).toBeInTheDocument();
  });
});
