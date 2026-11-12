import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import {
  exchangeGoogleOAuthCode,
  googleAccountFromIdToken,
  verifyGoogleOAuthState
} from "@/lib/google-calendar/oauth";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { upsertGoogleCalendarConnection } from "@/lib/google-calendar/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipRow = {
  id: string;
  household_id: string;
  role: "parent" | "helper" | "household_admin";
};

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const config = getGoogleCalendarConfig(env);
  if (!config) {
    return NextResponse.redirect(`${appUrl}/app?calendar=not_configured`);
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateValue = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/app?calendar=cancelled`);
  }
  if (!code || !stateValue) {
    return NextResponse.redirect(`${appUrl}/app?calendar=failed`);
  }

  try {
    const state = verifyGoogleOAuthState(stateValue, config.tokenSecret);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    const { data: membership, error } = await supabase
      .from("household_members")
      .select("id, household_id, role")
      .eq("id", state.memberId)
      .eq("household_id", state.householdId)
      .eq("user_id", user.id)
      .eq("active", true)
      .single<MembershipRow>();

    if (error || !membership || (membership.role !== "parent" && membership.role !== "household_admin")) {
      return NextResponse.redirect(`${appUrl}/app?calendar=not_allowed`);
    }

    const tokenResponse = await exchangeGoogleOAuthCode({ code, config });
    if (!tokenResponse.refreshToken) {
      return NextResponse.redirect(`${appUrl}/app?calendar=missing_refresh`);
    }

    const googleAccount = googleAccountFromIdToken(tokenResponse.idToken);
    await upsertGoogleCalendarConnection({
      householdId: membership.household_id,
      memberId: membership.id,
      refreshToken: tokenResponse.refreshToken,
      googleAccountEmail: googleAccount.email,
      googleAccountSubject: googleAccount.subject,
      scopes: tokenResponse.scope?.split(/\s+/).filter(Boolean) ?? []
    });

    await captureServerEvent(
      analyticsEvents.googleCalendarConnected,
      { household_id: membership.household_id },
      membership.id
    ).catch(() => undefined);

    return NextResponse.redirect(`${appUrl}${returnToWithCalendarStatus(state.returnTo, "connected")}`);
  } catch {
    return NextResponse.redirect(`${appUrl}/app?calendar=failed`);
  }
}

function returnToWithCalendarStatus(returnTo: string, status: string) {
  const [pathAndQuery, hash = ""] = returnTo.split("#", 2);
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}calendar=${status}${hash ? `#${hash}` : ""}`;
}
