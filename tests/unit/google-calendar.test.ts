import { describe, expect, it, vi } from "vitest";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { buildGoogleCalendarEventPayload, createGoogleCalendarEvent, updateGoogleCalendarEvent } from "@/lib/google-calendar/events";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  exchangeGoogleOAuthCode,
  googleAccountFromIdToken,
  verifyGoogleOAuthState
} from "@/lib/google-calendar/oauth";
import { decryptGoogleRefreshToken, encryptGoogleRefreshToken } from "@/lib/google-calendar/tokens";
import type { ServerEnv } from "@/lib/env-core";

const baseEnv: ServerEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: "a-long-local-cron-secret",
  JOB_BATCH_SIZE: 5,
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_POSTHOG_UI_HOST: "https://us.posthog.com",
  COVERAGE_REQUEST_SENDER: "local-stub",
  RESEND_FROM_EMAIL: "FamTandem <coverage@updates.famtandem.com>",
  HOUSEHOLD_NOTIFICATION_SENDER: "local-stub",
  GOOGLE_CALENDAR_EXPORTER: "disabled",
  ARTIFACT_TEXT_PROVIDER: "disabled",
  ARTIFACT_TEXT_MODEL: "gemini-3.5-flash",
  EXTRACTION_PROVIDER: "local-stub",
  GEMINI_MODEL: "gemini-3.5-flash"
};

describe("Google Calendar export helpers", () => {
  it("keeps Google Calendar disabled unless all OAuth env is explicit", () => {
    expect(getGoogleCalendarConfig(baseEnv)).toBeNull();
    expect(getGoogleCalendarConfig({ ...baseEnv, GOOGLE_CALENDAR_EXPORTER: "google" })).toBeNull();
    expect(
      getGoogleCalendarConfig({
        ...baseEnv,
        GOOGLE_CALENDAR_EXPORTER: "google",
        GOOGLE_OAUTH_CLIENT_ID: "client",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_OAUTH_TOKEN_SECRET: "calendar-token-secret"
      })
    ).toMatchObject({
      clientId: "client",
      redirectUri: "http://localhost:3000/api/google-calendar/callback"
    });
  });

  it("round-trips refresh tokens without storing plaintext", () => {
    const encrypted = encryptGoogleRefreshToken("refresh-token", "calendar-token-secret");

    expect(encrypted).not.toContain("refresh-token");
    expect(decryptGoogleRefreshToken(encrypted, "calendar-token-secret")).toBe("refresh-token");
  });

  it("signs OAuth state and rejects tampering", () => {
    const state = createGoogleOAuthState({
      householdId: "household-1",
      memberId: "member-1",
      returnTo: "/app",
      issuedAt: 10
    }, "calendar-token-secret");

    expect(verifyGoogleOAuthState(state, "calendar-token-secret", { now: 20 })).toMatchObject({
      householdId: "household-1",
      memberId: "member-1"
    });
    expect(() => verifyGoogleOAuthState(`${state}x`, "calendar-token-secret", { now: 20 })).toThrow();
    expect(() => verifyGoogleOAuthState(state, "calendar-token-secret", { now: 20 * 60 * 1000 })).toThrow("expired");
  });

  it("builds the Google authorization URL with least-purpose calendar event scope", () => {
    const config = getGoogleCalendarConfig({
      ...baseEnv,
      GOOGLE_CALENDAR_EXPORTER: "google",
      GOOGLE_OAUTH_CLIENT_ID: "client",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_OAUTH_TOKEN_SECRET: "calendar-token-secret"
    });

    const url = buildGoogleAuthorizationUrl({
      config: config!,
      state: "state-1",
      loginHint: "parent@example.com"
    });

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(url.searchParams.get("login_hint")).toBe("parent@example.com");
  });

  it("exchanges OAuth codes without logging token payloads", async () => {
    const config = getGoogleCalendarConfig({
      ...baseEnv,
      GOOGLE_CALENDAR_EXPORTER: "google",
      GOOGLE_OAUTH_CLIENT_ID: "client",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      GOOGLE_OAUTH_TOKEN_SECRET: "calendar-token-secret"
    });
    const fetchMock = vi.fn(async () => Response.json({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/calendar.events"
    }));

    const result = await exchangeGoogleOAuthCode({
      code: "code-1",
      config: config!,
      fetchImpl: fetchMock as typeof fetch
    });

    expect(result.refreshToken).toBe("refresh-token");
    expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({
      method: "POST"
    }));
  });

  it("extracts only account identity from an id token when present", () => {
    const payload = Buffer.from(JSON.stringify({ email: "parent@example.com", sub: "sub-1" })).toString("base64url");

    expect(googleAccountFromIdToken(`header.${payload}.sig`)).toEqual({
      email: "parent@example.com",
      subject: "sub-1"
    });
    expect(googleAccountFromIdToken(null)).toEqual({ email: null, subject: null });
  });

  it("builds a privacy-safe event payload from card summary fields", () => {
    const payload = buildGoogleCalendarEventPayload({
      appUrl: "https://app.famtandem.com",
      cardId: "card-1",
      title: "Soccer pickup",
      startsAt: "2026-05-22T22:30:00.000Z",
      timezone: "America/Chicago",
      location: "North field",
      child: "Maya",
      owner: "Pickup: Needs an owner",
      sourceSummary: "Coach email"
    });

    expect(payload.summary).toBe("Soccer pickup");
    expect(payload.description).toContain("Coverage: Pickup: Needs an owner");
    expect(payload.description).toContain("Source summary: Coach email");
    expect(payload.description).not.toContain("raw");
    expect(payload.end).toMatchObject({ dateTime: "2026-05-22T23:30:00.000Z" });
  });

  it("formats all-day event dates in the household timezone", () => {
    const payload = buildGoogleCalendarEventPayload({
      appUrl: "https://app.famtandem.com",
      cardId: "card-1",
      title: "Saturday tournament",
      startsAt: "2026-05-23T02:30:00.000Z",
      allDay: true,
      timezone: "America/Los_Angeles",
      owner: "Pickup: Krish"
    });

    expect(payload.start).toEqual({ date: "2026-05-22" });
    expect(payload.end).toEqual({ date: "2026-05-23" });
  });

  it("creates and updates calendar events through REST without notifying attendees", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      id: "event-1",
      htmlLink: "https://calendar.google.com/event?eid=event-1"
    }));
    const payload = buildGoogleCalendarEventPayload({
      appUrl: "https://app.famtandem.com",
      cardId: "card-1",
      title: "Soccer pickup",
      startsAt: "2026-05-22T22:30:00.000Z",
      timezone: "America/Chicago",
      owner: "Pickup: Krish"
    });

    await expect(createGoogleCalendarEvent({
      accessToken: "access-token",
      payload,
      fetchImpl: fetchMock as typeof fetch
    })).resolves.toMatchObject({ eventId: "event-1" });
    await updateGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: "event-1",
      payload,
      fetchImpl: fetchMock as typeof fetch
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toContain("sendUpdates=none");
    expect(calls[1][0]).toContain("/events/event-1?sendUpdates=none");
  });
});
