import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  respondToCoverageRequestToken: vi.fn(),
  signCoverageResponseCompletionStatus: vi.fn()
}));

vi.mock("@/lib/coverage-requests/read", () => ({
  respondToCoverageRequestToken: mocks.respondToCoverageRequestToken
}));

vi.mock("@/lib/coverage-requests/response-status", () => ({
  isCoverageResponseCompletionStatus: (status: string | undefined) =>
    status === "accepted" || status === "declined",
  signCoverageResponseCompletionStatus: mocks.signCoverageResponseCompletionStatus
}));

vi.mock("@/lib/posthog/events", () => ({
  analyticsEvents: {
    coverageRequestAccepted: "coverage_request_accepted",
    coverageRequestDeclined: "coverage_request_declined"
  }
}));

vi.mock("@/lib/posthog/server", () => ({
  captureServerEvent: mocks.captureServerEvent
}));

describe("coverage response route", () => {
  beforeEach(() => {
    mocks.captureServerEvent.mockReset();
    mocks.respondToCoverageRequestToken.mockReset();
    mocks.signCoverageResponseCompletionStatus.mockReset();
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.signCoverageResponseCompletionStatus.mockReturnValue("signed-status");
  });

  it("accepts a public coverage response with a null origin and redirects back to the status page", async () => {
    const { POST } = await import("@/app/respond/coverage/[token]/submit/route");
    mocks.respondToCoverageRequestToken.mockResolvedValueOnce({
      cardId: "card-1",
      status: "accepted",
      tokenId: "request-token-1"
    });

    const response = await POST(formRequest("accept_pickup"), {
      params: Promise.resolve({ token: "token_123" })
    });

    expect(mocks.respondToCoverageRequestToken).toHaveBeenCalledWith("token_123", "accept_pickup");
    expect(response.status).toBe(303);
    expect(mocks.signCoverageResponseCompletionStatus).toHaveBeenCalledWith({
      status: "accepted",
      token: "token_123",
      tokenId: "request-token-1"
    });
    expect(response.headers.get("location")).toBe(
      "https://app.famtandem.com/respond/coverage/token_123?status=accepted&statusProof=signed-status"
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_accepted",
      {
        card_id: "card-1",
        request_token_id: "request-token-1",
        response_source: "submit_route",
        response_value: "accept_pickup",
        status: "accepted"
      },
      "request-token-1"
    );
  });

  it("captures a declined public coverage response", async () => {
    const { POST } = await import("@/app/respond/coverage/[token]/submit/route");
    mocks.respondToCoverageRequestToken.mockResolvedValueOnce({
      cardId: "card-1",
      status: "declined",
      tokenId: "request-token-1"
    });

    const response = await POST(formRequest("decline"), {
      params: Promise.resolve({ token: "token_123" })
    });

    expect(response.status).toBe(303);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "coverage_request_declined",
      {
        card_id: "card-1",
        request_token_id: "request-token-1",
        response_source: "submit_route",
        response_value: "decline",
        status: "declined"
      },
      "request-token-1"
    );
  });

  it("redirects invalid response values without touching coverage state", async () => {
    const { POST } = await import("@/app/respond/coverage/[token]/submit/route");

    const response = await POST(formRequest("maybe"), {
      params: Promise.resolve({ token: "token_123" })
    });

    expect(mocks.respondToCoverageRequestToken).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/respond/coverage/token_123?status=unavailable");
  });

  it("redirects malformed form bodies without touching coverage state", async () => {
    const { POST } = await import("@/app/respond/coverage/[token]/submit/route");

    const response = await POST(malformedRequest(), {
      params: Promise.resolve({ token: "token_123" })
    });

    expect(mocks.respondToCoverageRequestToken).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/respond/coverage/token_123?status=unavailable");
  });
});

function formRequest(response: string) {
  return new NextRequest("https://app.famtandem.com/respond/coverage/token_123/submit", {
    body: new URLSearchParams({ response }).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "null"
    },
    method: "POST"
  });
}

function malformedRequest() {
  return new NextRequest("https://app.famtandem.com/respond/coverage/token_123/submit", {
    body: "not form data",
    headers: {
      "content-type": "text/plain",
      origin: "null"
    },
    method: "POST"
  });
}
