import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceInbox, type SourceInboxRow } from "@/components/source-inbox";

describe("SourceInbox", () => {
  it("renders source review rows without raw source text or artifact internals", () => {
    const rows: SourceInboxRow[] = [
      {
        artifactCount: 1,
        artifactSummary: "schedule.pdf · needs review",
        id: "source-1",
        linkedCardCount: 0,
        receivedAt: "2026-05-29T12:00:00.000Z",
        reviewState: {
          detail: "Upload text is waiting for parent review.",
          filter: "needs_review",
          label: "Ready to approve text",
          nextAction: "Review extracted text before cards are created.",
          priority: 100,
          tone: "amber"
        },
        sourceStatus: "needs_review",
        sourceType: "upload",
        title: "Camp schedule upload",
        updatedAt: "2026-05-29T12:05:00.000Z"
      }
    ];

    render(
      <SourceInbox
        householdName="Rivera family"
        rows={rows}
        timezone="America/Chicago"
      />
    );

    expect(screen.getByRole("heading", { name: "Source inbox" })).toBeInTheDocument();
    expect(screen.getByText("Rivera family")).toBeInTheDocument();
    expect(screen.getByText("Camp schedule upload")).toBeInTheDocument();
    expect(screen.getByText("Ready to approve text")).toBeInTheDocument();
    expect(screen.getByText("Review extracted text before cards are created.")).toBeInTheDocument();
    expect(screen.getByText("schedule.pdf · needs review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review source" })).toHaveAttribute(
      "href",
      "/app/sources/source-1"
    );

    expect(screen.queryByText(/source-artifacts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/storage_path/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SHA-256/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pickup is at 5:30/)).not.toBeInTheDocument();
  });

  it("orders attention-needed sources before already-created sources", () => {
    const rows: SourceInboxRow[] = [
      row("source-created", "Created source", "Cards created", "created_cards", 30),
      row("source-failed", "Failed source", "Extraction failed", "failed", 95)
    ];

    render(
      <SourceInbox
        householdName="Rivera family"
        rows={rows}
        timezone="America/Chicago"
      />
    );

    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("Failed source")).toBeInTheDocument();
    expect(within(articles[1]).getByText("Created source")).toBeInTheDocument();
  });

  it("renders an empty state that sends parents back to add logistics", () => {
    render(
      <SourceInbox
        householdName="Rivera family"
        rows={[]}
        timezone="America/Chicago"
      />
    );

    expect(screen.getByRole("heading", { name: "No sources yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add logistics" })).toHaveAttribute(
      "href",
      "/app#add-logistics"
    );
  });
});

function row(
  id: string,
  title: string,
  label: string,
  filter: SourceInboxRow["reviewState"]["filter"],
  priority: number
): SourceInboxRow {
  return {
    artifactCount: 0,
    artifactSummary: null,
    id,
    linkedCardCount: filter === "created_cards" ? 1 : 0,
    receivedAt: "2026-05-29T12:00:00.000Z",
    reviewState: {
      detail: `${label} detail`,
      filter,
      label,
      nextAction: `${label} next action`,
      priority,
      tone: filter === "failed" ? "coral" : "moss"
    },
    sourceStatus: filter === "created_cards" ? "processed" : "failed",
    sourceType: "paste",
    title,
    updatedAt: "2026-05-29T12:00:00.000Z"
  };
}
