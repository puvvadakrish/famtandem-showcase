import { NextRequest, NextResponse } from "next/server";
import { safeAuthRedirectPath } from "@/lib/auth/redirect";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const callbackError = requestUrl.searchParams.get("error");
  const next = safeAuthRedirectPath(requestUrl.searchParams.get("next"));

  if (callbackError) {
    return NextResponse.redirect(new URL("/login?error=auth_link_failed", requestUrl.origin));
  }

  if (code) {
    const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
    const supabase = createSupabaseRouteHandlerClient(request, redirectResponse);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_link_failed", requestUrl.origin));
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await captureServerEvent(
        analyticsEvents.userSignedIn,
        { email_domain: user.email?.split("@")[1] ?? "unknown" },
        user.id
      ).catch(() => undefined);
    }

    return redirectResponse;
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
