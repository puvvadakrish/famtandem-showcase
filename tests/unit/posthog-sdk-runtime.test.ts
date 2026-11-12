import { describe, expect, it } from "vitest";
import { PostHog } from "posthog-node";

describe("posthog-node runtime shape", () => {
  it("supports immediate capture on the installed server SDK", () => {
    const client = new PostHog("ph_test_key", { host: "https://us.i.posthog.com" });

    expect(typeof client.captureImmediate).toBe("function");
    expect(typeof client.capture).toBe("function");
    expect(typeof client.flush).toBe("function");

    client.shutdown();
  });
});
