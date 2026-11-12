import type { ServerEnv } from "@/lib/env-core";

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  tokenSecret: string;
  redirectUri: string;
};

export function getGoogleCalendarConfig(env: ServerEnv): GoogleCalendarConfig | null {
  if (env.GOOGLE_CALENDAR_EXPORTER !== "google") {
    return null;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const tokenSecret = env.GOOGLE_OAUTH_TOKEN_SECRET?.trim();

  if (!clientId || !clientSecret || !tokenSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    tokenSecret,
    redirectUri: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/google-calendar/callback`
  };
}
