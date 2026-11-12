import { createHmac, timingSafeEqual } from "node:crypto";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/config";

export const googleCalendarScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events"
];

export type GoogleOAuthState = {
  householdId: string;
  memberId: string;
  issuedAt: number;
  returnTo: string;
};

export type GoogleTokenResponse = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  idToken: string | null;
  scope: string | null;
};

type FetchLike = typeof fetch;

export function createGoogleOAuthState(
  input: Omit<GoogleOAuthState, "issuedAt"> & { issuedAt?: number },
  secret: string
) {
  const payload: GoogleOAuthState = {
    ...input,
    issuedAt: input.issuedAt ?? Date.now()
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyGoogleOAuthState(
  state: string,
  secret: string,
  options: { now?: number; maxAgeMs?: number } = {}
) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Google Calendar connection state is invalid.");
  }

  const expected = sign(encodedPayload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Google Calendar connection state is invalid.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as GoogleOAuthState;
  const maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000;
  if ((options.now ?? Date.now()) - payload.issuedAt > maxAgeMs) {
    throw new Error("Google Calendar connection state expired.");
  }

  return payload;
}

export function buildGoogleAuthorizationUrl({
  config,
  state,
  loginHint
}: {
  config: GoogleCalendarConfig;
  state: string;
  loginHint?: string | null;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleCalendarScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url;
}

export async function exchangeGoogleOAuthCode({
  code,
  config,
  fetchImpl = fetch
}: {
  code: string;
  config: GoogleCalendarConfig;
  fetchImpl?: FetchLike;
}): Promise<GoogleTokenResponse> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  });

  return parseTokenResponse(response, "Google Calendar connection failed.");
}

export async function refreshGoogleAccessToken({
  refreshToken,
  config,
  fetchImpl = fetch
}: {
  refreshToken: string;
  config: GoogleCalendarConfig;
  fetchImpl?: FetchLike;
}): Promise<GoogleTokenResponse> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token"
    })
  });

  return parseTokenResponse(response, "Google Calendar token refresh failed.");
}

export function googleAccountFromIdToken(idToken: string | null) {
  if (!idToken) return { email: null, subject: null };
  const [, payload] = idToken.split(".");
  if (!payload) return { email: null, subject: null };

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      sub?: string;
    };
    return {
      email: typeof parsed.email === "string" ? parsed.email : null,
      subject: typeof parsed.sub === "string" ? parsed.sub : null
    };
  } catch {
    return { email: null, subject: null };
  }
}

async function parseTokenResponse(response: Response, fallbackMessage: string): Promise<GoogleTokenResponse> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`${fallbackMessage} (${response.status})`);
  }

  const accessToken = typeof body?.access_token === "string" ? body.access_token : null;
  const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : 3600;
  if (!accessToken) {
    throw new Error(fallbackMessage);
  }

  return {
    accessToken,
    expiresIn,
    refreshToken: typeof body?.refresh_token === "string" ? body.refresh_token : null,
    idToken: typeof body?.id_token === "string" ? body.id_token : null,
    scope: typeof body?.scope === "string" ? body.scope : null
  };
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
