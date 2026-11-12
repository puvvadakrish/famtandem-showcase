import { describe, expect, it, vi } from "vitest";

describe("coverage request tokens", () => {
  it("generates url-safe random tokens and stable hmac hashes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");

    const {
      generateCoverageRequestToken,
      hashCoverageRequestToken
    } = await import("@/lib/coverage-requests/token");

    const token = generateCoverageRequestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);

    const hash = hashCoverageRequestToken("known-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCoverageRequestToken("known-token")).toBe(hash);
    expect(hashCoverageRequestToken("other-token")).not.toBe(hash);
  });
});
