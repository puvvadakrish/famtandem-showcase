"use server";

import { redirect } from "next/navigation";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    throw new Error("Email is required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/app`
    }
  });

  if (error) {
    const errorCode = error.message.toLowerCase().includes("rate limit")
      ? "rate_limited"
      : "signin_failed";
    redirect(`/login?error=${errorCode}&email=${encodeURIComponent(email)}`);
  }

  await captureServerEvent(
    analyticsEvents.loginMagicLinkSent,
    { email_domain: email.split("@")[1] ?? "unknown" },
    "login_magic_link"
  ).catch(() => undefined);

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}
