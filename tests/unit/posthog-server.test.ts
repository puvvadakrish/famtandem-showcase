import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureImmediate: vi.fn(),
  env: {
    NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    NEXT_PUBLIC_POSTHOG_KEY: "ph_test_key"
  }
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => mocks.env
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    captureImmediate: mocks.captureImmediate
  }))
}));

describe("server PostHog analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.captureImmediate.mockReset();
    mocks.captureImmediate.mockResolvedValue(undefined);
    mocks.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test_key";
    mocks.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  });

  it("captures server events immediately with an optional stable event id", async () => {
    const { captureServerEvent } = await import("@/lib/posthog/server");

    await captureServerEvent(
      "coverage_request_accepted",
      { request_token_id: "token-1" },
      "token-1",
      { eventId: "event-1" }
    );

    expect(mocks.captureImmediate).toHaveBeenCalledWith({
      distinctId: "token-1",
      event: "coverage_request_accepted",
      properties: { request_token_id: "token-1" },
      uuid: "event-1"
    });
  });

  it("does not pass an undefined event id to PostHog", async () => {
    const { captureServerEvent } = await import("@/lib/posthog/server");

    await captureServerEvent(
      "coverage_request_accepted",
      { request_token_id: "token-1" },
      "token-1"
    );

    expect(mocks.captureImmediate).toHaveBeenCalledWith({
      distinctId: "token-1",
      event: "coverage_request_accepted",
      properties: { request_token_id: "token-1" }
    });
  });

  it("skips capture when PostHog is not configured", async () => {
    mocks.env.NEXT_PUBLIC_POSTHOG_KEY = "";
    const { captureServerEvent } = await import("@/lib/posthog/server");

    await captureServerEvent("coverage_request_accepted");

    expect(mocks.captureImmediate).not.toHaveBeenCalled();
  });

});
