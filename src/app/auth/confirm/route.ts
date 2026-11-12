import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { safeAuthRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

const allowedEmailOtpTypes = new Set<EmailOtpType>([
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "email"
]);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeAuthRedirectPath(requestUrl.searchParams.get("next"));

  if (!tokenHash || !type || !allowedEmailOtpTypes.has(type)) {
    return NextResponse.redirect(new URL("/login?error=auth_link_invalid", requestUrl.origin));
  }

  const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
  const supabase = createSupabaseRouteHandlerClient(request, redirectResponse);
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_link_failed", requestUrl.origin));
  }

  return redirectResponse;
}
