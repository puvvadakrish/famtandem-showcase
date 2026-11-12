import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { BoardShell } from "@/components/board-shell";
import { sampleCards } from "@/lib/sample-data";

vi.mock("@/app/app/actions", () => ({
  addChild: vi.fn(),
  addHouseholdMember: vi.fn(),
  coverSlotAsCurrentMember: vi.fn(),
  createCoverageRequest: vi.fn(),
  createManualCard: vi.fn(),
  createPasteSourceInput: vi.fn(),
  disconnectGoogleCalendar: vi.fn(),
  exportCoverageCardToGoogleCalendar: vi.fn(),
  markSlotAlreadyCovered: vi.fn(),
  sendHouseholdMemberInvite: vi.fn(),
  setSlotState: vi.fn(),
  addReadinessItemToCard: vi.fn(),
  updateCoverageCard: vi.fn(),
  updateReadinessItem: vi.fn(),
  updateSlotKind: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    from: vi.fn(),
    rpc: vi.fn(),
    storage: {
      from: vi.fn()
    }
  })
}));

describe("BoardShell", () => {
  it("keeps the desktop right rail in the page scroll instead of a nested scroll window", () => {
    const { container } = render(
      <BoardShell
        canEditCards={true}
        cards={[]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    const grid = container.querySelector("main > div");
    const rightRail = container.querySelector("aside");

    expect(grid).toHaveClass("overflow-x-hidden");
    expect(grid).not.toHaveClass("overflow-hidden");
    expect(rightRail).not.toHaveClass("lg:sticky");
    expect(rightRail).not.toHaveClass("lg:h-dvh");
    expect(rightRail).not.toHaveClass("lg:overflow-y-auto");
  });

  it("renders beta onboarding for a new household without offering a fake forwarding inbox", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
        onboarding={{ sourceCount: 0 }}
      />
    );

    expect(screen.getByRole("heading", { name: "Start with this week's real logistics" })).toBeInTheDocument();
    expect(screen.getByText("Add a child profile")).toBeInTheDocument();
    expect(screen.getByText("Add another parent or helper")).toBeInTheDocument();
    expect(screen.getByText("Paste real logistics")).toBeInTheDocument();
    expect(screen.getByText(/Add kids and another adult or helper, paste a real logistics note/)).toBeInTheDocument();
    expect(screen.getByText(/Review against the source before treating an AI-created card as final/)).toBeInTheDocument();
    expect(screen.getByText("Best first inputs")).toBeInTheDocument();
    expect(screen.getByText("Email forwarding")).toBeInTheDocument();
    expect(screen.getByText("Coming later. For beta, paste the email text here.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add adult or helper" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Children saved" })).toBeInTheDocument();
    expect(screen.getByText("No children saved yet. Add one child below, save, then repeat for each child.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Save a child profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save child" })).toBeInTheDocument();
    expect(screen.getByLabelText("Age, grade, or group")).toBeInTheDocument();
    expect(screen.getByText("Optional. Examples: 2 years old, preschool, 3rd grade, U10.")).toBeInTheDocument();
    expect(screen.getAllByText("Not complete")).toHaveLength(5);
    expect(screen.queryByText("inbox@famtandem.app")).not.toBeInTheDocument();
  });

  it("puts household setup before manual cards and makes saved children explicit", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[]}
        childProfiles={[
          { id: "child-1", displayName: "Avery", grade: "3rd grade" },
          { id: "child-2", displayName: "Riley", grade: null }
        ]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    const setupHeading = screen.getByRole("heading", { name: "Household setup" });
    const manualCardHeading = screen.getByRole("heading", { name: "Manual card" });
    expect(setupHeading.compareDocumentPosition(manualCardHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    const setupSection = setupHeading.closest("section");
    expect(setupSection).not.toBeNull();
    expect(within(setupSection!).getByRole("heading", { name: "Children saved" })).toBeInTheDocument();
    expect(
      within(setupSection!).getByText((_, node) => node?.textContent === "Avery · 3rd grade")
    ).toBeInTheDocument();
    expect(within(setupSection!).getByText("Riley")).toBeInTheDocument();
    expect(within(setupSection!).getAllByText("Saved")).toHaveLength(2);
    expect(within(setupSection!).queryByText("No children saved yet. Add one child below, save, then repeat for each child.")).not.toBeInTheDocument();
    expect(within(setupSection!).getByRole("heading", { name: "Save a child profile" })).toBeInTheDocument();
    expect(within(setupSection!).getByRole("button", { name: "Save child" })).toBeInTheDocument();

    const manualCardSection = manualCardHeading.closest("section");
    expect(manualCardSection).not.toBeNull();
    expect(within(manualCardSection!).getByText("Repeat")).toBeInTheDocument();
    expect(within(manualCardSection!).getByLabelText("Frequency")).toHaveValue("none");
    expect(within(manualCardSection!).getByLabelText("Create")).toHaveValue("4");
    expect(within(manualCardSection!).getByRole("option", { name: "Weekly" })).toBeInTheDocument();
  });

  it("keeps public preview setup collapsed away from the first card path", () => {
    render(
      <BoardShell
        canEditCards={false}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Soccer pickup moved",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 5:30 PM",
            startsAt: "2026-05-22T22:30:00.000Z",
            location: "North field",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Coach email",
            sourceInputId: null,
            sourceText: "Pickup moved to the north field.",
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: "Created from pasted logistics text.",
            attentionFlags: ["needs_coverage"],
            slots: [
              {
                id: "slot-1",
                kind: "pickup",
                state: "needs_coverage",
                stateLabel: "Needs coverage",
                ownerLabel: "Needs an owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        currentMemberId="member-1"
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
        onboarding={{ sourceCount: 0 }}
        publicPreview={true}
      />
    );

    expect(screen.getByRole("heading", { name: "Today needs attention" })).toBeInTheDocument();
    expect(screen.getByText("Soccer pickup moved")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Start with this week's real logistics" })).not.toBeInTheDocument();
    expect(screen.getByText("First week setup")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mobile app navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Inbox 2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I'll cover pickup" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to cover pickup" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign in to ask" })).toHaveAttribute("href", "/login");
  });

  it("renders Needs Attention before This Week", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={sampleCards.map((card) => ({
          ...card,
          cardType: "event",
          startsAt: null,
          location: null,
          sourceInputId: null,
          sourceText: null,
          confidence: 0.9,
          reviewReason: null,
          attentionFlags: [],
          slots: [],
          readinessItems: [],
          childId: null,
          childIds: []
        }))}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    const needsAttention = screen.getByRole("heading", { name: "Needs Attention" });
    const thisWeek = screen.getByRole("heading", { name: "This Week" });

    expect(needsAttention.compareDocumentPosition(thisWeek)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByText("Soccer pickup moved to north field")).toBeInTheDocument();
    expect(screen.getByText("Source: Coach email, confidence high")).toBeInTheDocument();
  });

  it("renders paste intake and full pasted source text on source-backed cards", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Field trip pickup",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 3:00 PM",
            startsAt: "2026-05-22T20:00:00.000Z",
            location: "School front office",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Field trip returns at 3 PM",
            sourceInputId: "source-1",
            sourceText: "Field trip returns at 3 PM. Pickup is at the school front office.",
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: "Created from pasted logistics text.",
            attentionFlags: ["needs_coverage"],
            slots: [],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        householdName="Rivera family"
        currentMemberId="member-1"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    const pasteSection = screen.getByRole("heading", { name: "Add logistics" }).closest("section");
    expect(pasteSection).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Upload file or screenshot" })).toBeInTheDocument();
    expect(screen.getByLabelText("File")).toBeInTheDocument();
    expect(within(pasteSection!).getByLabelText("Pasted text")).toBeInTheDocument();
    expect(within(pasteSection!).queryAllByLabelText("Coverage slot")).toHaveLength(0);
    expect(within(pasteSection!).queryAllByLabelText("Readiness item")).toHaveLength(0);
    expect(within(pasteSection!).getByRole("button", { name: "Read source" })).toBeInTheDocument();
    expect(screen.getByText("Field trip returns at 3 PM. Pickup is at the school front office.")).toBeInTheDocument();
  });

  it("does not render full source text when the server omits it for non-admin members", () => {
    render(
      <BoardShell
        canEditCards={false}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Field trip pickup",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 3:00 PM",
            startsAt: "2026-05-22T20:00:00.000Z",
            location: "School front office",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Field trip returns at 3 PM",
            sourceInputId: "source-1",
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: "Created from pasted logistics text.",
            attentionFlags: ["needs_coverage"],
            slots: [],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Helper", role: "helper" }]}
      />
    );

    expect(screen.getByText("Source: Field trip returns at 3 PM")).toBeInTheDocument();
    expect(screen.queryByText("Field trip returns at 3 PM. Pickup is at the school front office.")).not.toBeInTheDocument();
  });

  it("renders an admin guided coverage request composer on eligible card slots", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Soccer pickup",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 5:30 PM",
            startsAt: "2026-05-22T22:30:00.000Z",
            location: "North field",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Coach email",
            sourceInputId: null,
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: null,
            attentionFlags: ["needs_coverage"],
            slots: [
              {
                id: "slot-1",
                kind: "pickup",
                state: "needs_coverage",
                stateLabel: "Needs coverage",
                ownerLabel: "Needs an owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        currentMemberId="member-1"
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[
          { id: "member-1", displayName: "Krish", role: "household_admin" },
          { id: "member-2", displayName: "Maya Parent", role: "parent" }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Ask for coverage" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Coverage card: Soccer pickup" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Household coverage request for Soccer pickup" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "External coverage request for Soccer pickup" })).toBeInTheDocument();
    expect(screen.getByText("Pick the responsibility and send one clear response link. Keep source details attached to the card, not the message.")).toBeInTheDocument();
    expect(screen.getAllByText("Responsibility")).toHaveLength(2);
    expect(screen.getAllByText("Pickup").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Ask someone in the household")).toHaveValue("member-2");
    expect(screen.getAllByLabelText("Coverage request delivery")).toHaveLength(2);
    expect(screen.getByLabelText("Ask someone else")).toBeRequired();
    expect(screen.getByLabelText("External recipient email")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Message shown to recipient")).toHaveLength(2);
    expect(screen.getByText(/Keep it short. Do not paste raw source text or private family details here/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Send or create link" })).toHaveLength(2);
  });

  it("does not render the guided request composer for helpers", () => {
    render(
      <BoardShell
        canEditCards={false}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Soccer pickup",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 5:30 PM",
            startsAt: "2026-05-22T22:30:00.000Z",
            location: "North field",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Coach email",
            sourceInputId: null,
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: null,
            attentionFlags: ["needs_coverage"],
            slots: [
              {
                id: "slot-1",
                kind: "pickup",
                state: "needs_coverage",
                stateLabel: "Needs coverage",
                ownerLabel: "Needs an owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Helper", role: "helper" }]}
      />
    );

    expect(screen.queryByLabelText("Ask someone in the household")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ask someone else")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Coverage request delivery")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send or create link" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep it short. Do not paste raw source text or private family details here/)).not.toBeInTheDocument();
  });

  it("renders Google Calendar as a secondary timed-card action after connection", () => {
    render(
      <BoardShell
        calendarExportStatus="created"
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Soccer pickup",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 5:30 PM",
            startsAt: "2026-05-22T22:30:00.000Z",
            location: "North field",
            owner: "Pickup: Needs an owner",
            sourceSummary: "Coach email",
            sourceInputId: null,
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: null,
            attentionFlags: ["needs_coverage"],
            slots: [
              {
                id: "slot-1",
                kind: "pickup",
                state: "needs_coverage",
                stateLabel: "Needs coverage",
                ownerLabel: "Needs an owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        googleCalendar={{
          isConfigured: true,
          connection: {
            accountEmail: "parent@example.com",
            connectedAt: "2026-05-30T12:00:00.000Z"
          },
          exportsByCardId: {
            "card-1": {
              status: "succeeded",
              htmlLink: "https://calendar.google.com/event?eid=event-1",
              lastExportedAt: "2026-05-30T12:05:00.000Z"
            }
          }
        }}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    expect(screen.getByRole("link", { name: "Ask for coverage" })).toHaveAttribute("href", "#ask-card-1");
    expect(screen.getByRole("button", { name: "Update Google Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in Google Calendar" })).toHaveAttribute("href", "https://calendar.google.com/event?eid=event-1");
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByText("Already on your calendar")).toBeInTheDocument();
    expect(screen.getByText("Card added to Google Calendar.")).toBeInTheDocument();
  });

  it("shows calendar connect only for configured timed cards and hides it from helpers", () => {
    const timedCard = {
      id: "card-1",
      cardType: "event" as const,
      title: "Soccer pickup",
      child: "Maya",
      childId: null,
      childIds: [],
      time: "Fri, May 22, 5:30 PM",
      startsAt: "2026-05-22T22:30:00.000Z",
      location: "North field",
      owner: "Pickup: Needs an owner",
      sourceSummary: "Coach email",
      sourceInputId: null,
      sourceText: null,
      coverageState: "needs_coverage" as const,
      coverageLabel: "Needs coverage",
      section: "needs_attention" as const,
      confidence: 0.8,
      reviewReason: null,
      attentionFlags: ["needs_coverage" as const],
      slots: [],
      readinessItems: []
    };
    const untimedCard = {
      ...timedCard,
      id: "card-2",
      title: "Pay registration",
      startsAt: null,
      time: "Time not set"
    };
    const allDayCard = {
      ...timedCard,
      id: "card-3",
      title: "Spirit day",
      allDay: true
    };

    const { rerender } = render(
      <BoardShell
        canEditCards={true}
        cards={[timedCard, untimedCard, allDayCard]}
        childProfiles={[]}
        googleCalendar={{ isConfigured: true, connection: null, exportsByCardId: {} }}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute(
      "href",
      "/api/google-calendar/start?returnTo=%2Fapp%23card-1"
    );
    expect(screen.getAllByText("Pay registration")).toHaveLength(1);

    rerender(
      <BoardShell
        canEditCards={false}
        cards={[timedCard]}
        childProfiles={[]}
        googleCalendar={{ isConfigured: true, connection: null, exportsByCardId: {} }}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Helper", role: "helper" }]}
      />
    );

    expect(screen.queryByRole("link", { name: "Connect Google Calendar" })).not.toBeInTheDocument();
  });

  it("lets admins choose a slot when a card has multiple uncovered responsibilities", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Tournament day",
            child: "Maya",
            childId: null,
            childIds: [],
            time: "Fri, May 22, 8:30 AM",
            startsAt: "2026-05-22T13:30:00.000Z",
            location: "North field",
            owner: "Drop-off: Needs an owner · Pickup: Declined",
            sourceSummary: "Coach email",
            sourceInputId: null,
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.8,
            reviewReason: null,
            attentionFlags: ["needs_coverage"],
            slots: [
              {
                id: "slot-1",
                kind: "dropoff",
                state: "needs_coverage",
                stateLabel: "Needs coverage",
                ownerLabel: "Needs an owner",
                ownerMemberId: null,
                externalOwnerText: null
              },
              {
                id: "slot-2",
                kind: "pickup",
                state: "declined",
                stateLabel: "Declined",
                ownerLabel: "Declined",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ],
            readinessItems: []
          }
        ]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
      />
    );

    expect(screen.getAllByLabelText("Responsibility")).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "Drop-off - Needs coverage" })).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "Pickup - Declined" })).toHaveLength(2);
  });

  it("shows household member join status and join-by-email guidance", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[
          {
            id: "member-1",
            displayName: "Krish",
            role: "household_admin",
            email: "krish@example.com",
            hasUser: true
          },
          {
            id: "member-2",
            displayName: "Maya Parent",
            role: "parent",
            email: "maya-parent@example.com",
            hasUser: false
          }
        ]}
      />
    );

    expect(screen.getByText("krish@example.com")).toBeInTheDocument();
    expect(screen.getByText("maya-parent@example.com")).toBeInTheDocument();
    expect(screen.getByText("Joined")).toBeInTheDocument();
    expect(screen.getByText("Invite pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open sign-in" })).toHaveAttribute(
      "href",
      "/login?email=maya-parent%40example.com"
    );
    expect(screen.getByText(/If delivery fails, the person can still open the/)).toBeInTheDocument();
    expect(
      screen.getByText("Save their email and FamTandem sends a sign-in link that joins them to this household.")
    ).toBeInTheDocument();
  });

  it("shows child save acknowledgement and collapses the add-child form after save", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[]}
        childProfiles={[{ id: "child-1", displayName: "Avery", grade: "3rd grade" }]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={true}
        members={[{ id: "member-1", displayName: "Krish", role: "household_admin" }]}
        saveFlash={{ setup: "child_added", savedName: "Avery" }}
      />
    );

    expect(screen.getByText("Avery saved")).toBeInTheDocument();
    expect(screen.getByText("The child list is updated. Add another child when you are ready.")).toBeInTheDocument();
    expect(screen.getByText("Add another child")).toBeInTheDocument();
  });

  it("does not show member emails or invite state to non-admin members", () => {
    render(
      <BoardShell
        canEditCards={false}
        cards={[]}
        childProfiles={[]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[
          {
            id: "member-1",
            displayName: "Helper",
            role: "helper",
            email: "helper@example.com",
            hasUser: true
          },
          {
            id: "member-2",
            displayName: "Maya Parent",
            role: "parent",
            email: "maya-parent@example.com",
            hasUser: false
          }
        ]}
      />
    );

    const setupSection = screen.getByRole("heading", { name: "Household setup" }).closest("section");
    expect(setupSection).not.toBeNull();
    expect(within(setupSection!).getByText("Helper")).toBeInTheDocument();
    expect(within(setupSection!).getByText("Maya Parent")).toBeInTheDocument();
    expect(screen.queryByText("helper@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("maya-parent@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Joined")).not.toBeInTheDocument();
    expect(screen.queryByText("Invite pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open sign-in" })).not.toBeInTheDocument();
  });

  it("lets parent members correct source-backed card details without showing admin-only intake", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Science fair dropoff",
            child: "Maya",
            childId: "child-1",
            childIds: ["child-1"],
            time: "Fri, May 22, 8:00 AM",
            startsAt: "2026-05-22T13:00:00.000Z",
            location: "Gym",
            owner: "Drop-off: Needs an owner",
            sourceSummary: "School email",
            sourceInputId: "source-1",
            sourceText: "Science fair projects should be dropped at the gym by 8.",
            coverageState: "due_soon",
            coverageLabel: "Due soon",
            section: "needs_attention",
            confidence: 0.72,
            reviewReason: "Check project dropoff timing.",
            attentionFlags: ["due_soon"],
            slots: [],
            readinessItems: [
              {
                id: "ready-1",
                label: "Bring display board",
                status: "open",
                dueAt: "2026-05-22T13:00:00.000Z",
                ownerLabel: "No owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ]
          }
        ]}
        childProfiles={[{ id: "child-1", displayName: "Maya", grade: "3" }]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[
          { id: "member-1", displayName: "Krish", role: "parent" },
          { id: "member-2", displayName: "Maya Parent", role: "household_admin" }
        ]}
      />
    );

    expect(screen.getByText("Correct details")).toBeInTheDocument();
    expect(screen.getByText("Corrections update the card, not the attached source.")).toBeInTheDocument();
    expect(screen.getByLabelText("Readiness due date")).toBeInTheDocument();
    expect(screen.getByText("Add readiness item")).toBeInTheDocument();
    expect(screen.getByLabelText("New readiness item")).toBeInTheDocument();
    expect(screen.getByText("Science fair projects should be dropped at the gym by 8.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add logistics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manual card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Household setup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send or create link" })).not.toBeInTheDocument();
  });

  it("shows an inline saved confirmation on the edited card", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Science fair dropoff",
            child: "Maya",
            childId: "child-1",
            childIds: ["child-1"],
            time: "Fri, May 22, 8:00 AM",
            startsAt: "2026-05-22T13:00:00.000Z",
            location: "Gym",
            owner: "Drop-off: Needs an owner",
            sourceSummary: "School email",
            sourceInputId: "source-1",
            sourceText: "Science fair projects should be dropped at the gym by 8.",
            coverageState: "due_soon",
            coverageLabel: "Due soon",
            section: "needs_attention",
            confidence: 0.72,
            reviewReason: "Check project dropoff timing.",
            attentionFlags: ["due_soon"],
            slots: [],
            readinessItems: []
          }
        ]}
        childProfiles={[{ id: "child-1", displayName: "Maya", grade: "3" }]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[
          { id: "member-1", displayName: "Krish", role: "parent" },
          { id: "member-2", displayName: "Maya Parent", role: "household_admin" }
        ]}
        saveFlash={{ cardSaved: "updated", cardId: "card-1" }}
      />
    );

    expect(screen.getByText("Changes saved")).toBeInTheDocument();
    expect(screen.getByText("The board now shows the latest details.")).toBeInTheDocument();
  });

  it("does not show manual-card correction controls to parent members", () => {
    render(
      <BoardShell
        canEditCards={true}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Manual reminder",
            child: "Maya",
            childId: "child-1",
            childIds: ["child-1"],
            time: "Fri, May 22, 8:00 AM",
            startsAt: "2026-05-22T13:00:00.000Z",
            location: "Gym",
            owner: "Drop-off: Needs an owner",
            sourceSummary: "Manual",
            sourceInputId: null,
            sourceText: null,
            coverageState: "due_soon",
            coverageLabel: "Due soon",
            section: "needs_attention",
            confidence: 0.72,
            reviewReason: null,
            attentionFlags: ["due_soon"],
            slots: [],
            readinessItems: [
              {
                id: "ready-1",
                label: "Bring display board",
                status: "open",
                dueAt: "2026-05-22T13:00:00.000Z",
                ownerLabel: "No owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ]
          }
        ]}
        childProfiles={[{ id: "child-1", displayName: "Maya", grade: "3" }]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Krish", role: "parent" }]}
      />
    );

    expect(screen.queryByText("Correct details")).not.toBeInTheDocument();
    expect(screen.queryByText("Add readiness item")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Readiness item")).toBeDisabled();
    expect(screen.getByLabelText("Readiness due date")).toBeDisabled();
  });

  it("hides correction controls from helpers", () => {
    render(
      <BoardShell
        canEditCards={false}
        cards={[
          {
            id: "card-1",
            cardType: "event",
            title: "Science fair dropoff",
            child: "Maya",
            childId: "child-1",
            childIds: ["child-1"],
            time: "Fri, May 22, 8:00 AM",
            startsAt: "2026-05-22T13:00:00.000Z",
            location: "Gym",
            owner: "Drop-off: Needs an owner",
            sourceSummary: "School email",
            sourceInputId: "source-1",
            sourceText: null,
            coverageState: "needs_coverage",
            coverageLabel: "Needs coverage",
            section: "needs_attention",
            confidence: 0.72,
            reviewReason: "Check project dropoff timing.",
            attentionFlags: ["needs_coverage"],
            slots: [],
            readinessItems: [
              {
                id: "ready-1",
                label: "Bring display board",
                status: "open",
                dueAt: "2026-05-22T13:00:00.000Z",
                ownerLabel: "No owner",
                ownerMemberId: null,
                externalOwnerText: null
              }
            ]
          }
        ]}
        childProfiles={[{ id: "child-1", displayName: "Maya", grade: "3" }]}
        householdName="Rivera family"
        timezone="America/Chicago"
        isHouseholdAdmin={false}
        members={[{ id: "member-1", displayName: "Helper", role: "helper" }]}
      />
    );

    expect(screen.queryByText("Correct details")).not.toBeInTheDocument();
    expect(screen.queryByText("Add readiness item")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Readiness item")).toBeDisabled();
    expect(screen.getByLabelText("Readiness due date")).toBeDisabled();
  });
});
