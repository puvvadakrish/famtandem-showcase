import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { buildGoogleAuthorizationUrl, createGoogleOAuthState } from "@/lib/google-calendar/oauth";
import { safeGoogleCalendarReturnTo } from "@/lib/google-calendar/return-to";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipRow = {
  id: string;
  household_id: string;
  role: "parent" | "helper" | "household_admin";
  email: string | null;
};

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();
  const config = getGoogleCalendarConfig(env);
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const safeReturnTo = safeGoogleCalendarReturnTo(request.nextUrl.searchParams.get("returnTo"));

  if (!config) {
    return NextResponse.redirect(`${appUrl}/app?calendar=not_configured`);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const { data: membership, error } = await supabase
    .from("household_members")
    .select("id, household_id, role, email")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .single<MembershipRow>();

  if (error || !membership) {
    return NextResponse.redirect(`${appUrl}/household/new`);
  }

  if (membership.role !== "parent" && membership.role !== "household_admin") {
    return NextResponse.redirect(`${appUrl}/app?calendar=not_allowed`);
  }

  const state = createGoogleOAuthState(
    {
      householdId: membership.household_id,
      memberId: membership.id,
      returnTo: safeReturnTo
    },
    config.tokenSecret
  );
  const url = buildGoogleAuthorizationUrl({
    config,
    state,
    loginHint: membership.email
  });

  return NextResponse.redirect(url);
}
