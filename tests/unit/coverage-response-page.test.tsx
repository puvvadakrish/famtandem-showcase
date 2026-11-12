import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getCoverageRequestView: vi.fn(),
  verifyCoverageResponseCompletionStatus: vi.fn()
}));

vi.mock("@/lib/coverage-requests/read", () => ({
  getCoverageRequestView: mocks.getCoverageRequestView
}));

vi.mock("@/lib/coverage-requests/response-status", () => ({
  verifyCoverageResponseCompletionStatus: mocks.verifyCoverageResponseCompletionStatus
}));

vi.mock("@/lib/posthog/events", () => ({
  analyticsEvents: {
    coverageRequestAccepted: "coverage_request_accepted",
    coverageRequestDeclined: "coverage_request_declined",
    coverageRequestLinkOpened: "coverage_request_link_opened"
  }
}));

vi.mock("@/lib/posthog/server", () => ({
  captureServerEvent: mocks.captureServerEvent
}));

describe("coverage response page analytics", () => {
  beforeEach(() => {
    mocks.captureServerEvent.mockReset();
    mocks.getCoverageRequestView.mockReset();
    mocks.verifyCoverageResponseCompletionStatus.mockReset();
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.verifyCoverageResponseCompletionStatus.mockReturnValue(false);
  });

  it("captures accepted completion from a signed confirmation page", async () => {
    const { default: CoverageResponsePage } = await import("@/app/respond/coverage/[token]/page");
    mocks.getCoverageRequestView.mockResolvedValueOnce(coverageRequestView({ tokenStatus: "used" }));
    mocks.verifyCoverageResponseCompletionStatus.mockReturnValueOnce(true);

    await CoverageResponsePage({
      params: Promise.resolve({ token: "token_123" }),
      searchParams: Promise.resolve({ status: "accepted", statusProof: "signed-status" })
    });

    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_link_opened",
      {
        card_id: "card-1",
        request_token_id: "request-token-1",
        token_status: "used"
      },
      "request-token-1"
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_accepted",
      {
        card_id: "card-1",
        request_token_id: "request-token-1",
        response_source: "confirmation_page",
        status: "accepted"
      },
      "request-token-1"
    );
  });

  it("does not capture completion analytics when the status proof is not valid", async () => {
    const { default: CoverageResponsePage } = await import("@/app/respond/coverage/[token]/page");
    mocks.getCoverageRequestView.mockResolvedValueOnce(coverageRequestView({ tokenStatus: "used" }));
    mocks.verifyCoverageResponseCompletionStatus.mockReturnValueOnce(false);

    await CoverageResponsePage({
      params: Promise.resolve({ token: "token_123" }),
      searchParams: Promise.resolve({ status: "accepted", statusProof: "bad-proof" })
    });

    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_link_opened",
      {
        card_id: "card-1",
        request_token_id: "request-token-1",
        token_status: "used"
      },
      "request-token-1"
    );
  });

  it("captures signed completion analytics for used tokens even when details stay hidden", async () => {
    const { default: CoverageResponsePage } = await import("@/app/respond/coverage/[token]/page");
    mocks.getCoverageRequestView.mockResolvedValueOnce(
      coverageRequestView({ cardId: null, tokenStatus: "used" })
    );
    mocks.verifyCoverageResponseCompletionStatus.mockReturnValueOnce(true);

    await CoverageResponsePage({
      params: Promise.resolve({ token: "token_123" }),
      searchParams: Promise.resolve({ status: "accepted", statusProof: "signed-status" })
    });

    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_accepted",
      {
        request_token_id: "request-token-1",
        response_source: "confirmation_page",
        status: "accepted"
      },
      "request-token-1"
    );
  });
});

function coverageRequestView({
  cardId = "card-1",
  tokenStatus
}: {
  cardId?: string | null;
  tokenStatus: string;
}) {
  return {
    tokenId: "request-token-1",
    tokenStatus,
    expiresAt: null,
    cardId,
    cardTitle: "Pickup",
    startsAt: null,
    householdTimezone: "America/Chicago",
    location: null,
    requesterLabel: "Krish",
    recipientLabel: "Grandma",
    note: null,
    requests: [
      {
        requestId: "request-1",
        slotId: "slot-1",
        slotKind: "pickup",
        slotState: "uncovered",
        requestStatus: "accepted"
      }
    ]
  };
}
