import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  signCoverageResponseCompletionStatus,
  verifyCoverageResponseCompletionStatus
} from "@/lib/coverage-requests/response-status";

describe("coverage response completion status proof", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalTokenSecret = process.env.COVERAGE_REQUEST_TOKEN_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret-for-response-status";
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.COVERAGE_REQUEST_TOKEN_SECRET;
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }

    if (originalTokenSecret === undefined) {
      delete process.env.COVERAGE_REQUEST_TOKEN_SECRET;
    } else {
      process.env.COVERAGE_REQUEST_TOKEN_SECRET = originalTokenSecret;
    }

    restoreEnv("NEXT_PUBLIC_APP_URL", originalAppUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalSupabaseAnonKey);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
  });

  it("verifies only the signed token, token id, and completion status", () => {
    const proof = signCoverageResponseCompletionStatus({
      status: "accepted",
      token: "public-token",
      tokenId: "request-token-id"
    });

    expect(
      verifyCoverageResponseCompletionStatus({
        proof,
        status: "accepted",
        token: "public-token",
        tokenId: "request-token-id"
      })
    ).toBe(true);

    expect(
      verifyCoverageResponseCompletionStatus({
        proof,
        status: "declined",
        token: "public-token",
        tokenId: "request-token-id"
      })
    ).toBe(false);
    expect(
      verifyCoverageResponseCompletionStatus({
        proof,
        status: "accepted",
        token: "other-token",
        tokenId: "request-token-id"
      })
    ).toBe(false);
    expect(
      verifyCoverageResponseCompletionStatus({
        proof,
        status: "accepted",
        token: "public-token",
        tokenId: "other-request-token-id"
      })
    ).toBe(false);
    expect(
      verifyCoverageResponseCompletionStatus({
        proof: "malformed-proof",
        status: "accepted",
        token: "public-token",
        tokenId: "request-token-id"
      })
    ).toBe(false);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
