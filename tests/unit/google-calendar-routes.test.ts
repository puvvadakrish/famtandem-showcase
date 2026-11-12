import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    CRON_SECRET: "a-long-local-cron-secret",
    JOB_BATCH_SIZE: 5,
    NEXT_PUBLIC_POSTHOG_HOST: "https://app.posthog.com",
    COVERAGE_REQUEST_SENDER: "local-stub",
    RESEND_FROM_EMAIL: "FamTandem <coverage@updates.famtandem.com>",
    HOUSEHOLD_NOTIFICATION_SENDER: "local-stub",
    GOOGLE_CALENDAR_EXPORTER: "google",
    GOOGLE_OAUTH_CLIENT_ID: "client",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    GOOGLE_OAUTH_TOKEN_SECRET: "calendar-token-secret",
    ARTIFACT_TEXT_PROVIDER: "disabled",
    ARTIFACT_TEXT_MODEL: "gemini-3.5-flash",
    EXTRACTION_PROVIDER: "local-stub",
    GEMINI_MODEL: "gemini-3.5-flash"
  })
}));

const single = vi.fn();
const getUser = vi.fn();
const upsertGoogleCalendarConnection = vi.fn();
const exchangeGoogleOAuthCode = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ single })
            })
          })
        })
      })
    })
  })
}));

vi.mock("@/lib/google-calendar/server", () => ({
  upsertGoogleCalendarConnection
}));

vi.mock("@/lib/google-calendar/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-calendar/oauth")>();
  return {
    ...actual,
    exchangeGoogleOAuthCode
  };
});

describe("Google Calendar OAuth callback route", () => {
  it("keeps OAuth return targets inside the app board", async () => {
    const { safeGoogleCalendarReturnTo } = await import("@/lib/google-calendar/return-to");

    expect(safeGoogleCalendarReturnTo("/app")).toBe("/app");
    expect(safeGoogleCalendarReturnTo("/app?calendar=connected#card-1")).toBe("/app?calendar=connected#card-1");
    expect(safeGoogleCalendarReturnTo("/app/sources/source-1")).toBe("/app/sources/source-1");
    expect(safeGoogleCalendarReturnTo("/app.attacker.com")).toBe("/app");
    expect(safeGoogleCalendarReturnTo("/settings")).toBe("/app");
    expect(safeGoogleCalendarReturnTo("//attacker.com")).toBe("/app");
  });

  it("preserves the verified card anchor when redirecting after connect", async () => {
    const { createGoogleOAuthState } = await import("@/lib/google-calendar/oauth");
    const { GET } = await import("@/app/api/google-calendar/callback/route");
    const state = createGoogleOAuthState({
      householdId: "household-1",
      memberId: "member-1",
      returnTo: "/app#card-1",
      issuedAt: Date.now()
    }, "calendar-token-secret");

    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    single.mockResolvedValueOnce({
      data: {
        id: "member-1",
        household_id: "household-1",
        role: "household_admin"
      },
      error: null
    });
    exchangeGoogleOAuthCode.mockResolvedValueOnce({
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      idToken: null,
      scope: "https://www.googleapis.com/auth/calendar.events"
    });
    upsertGoogleCalendarConnection.mockResolvedValueOnce(undefined);

    const response = await GET(new NextRequest(`http://localhost:3000/api/google-calendar/callback?code=code-1&state=${encodeURIComponent(state)}`));

    expect(response.headers.get("location")).toBe("http://localhost:3000/app?calendar=connected#card-1");
  });
});
