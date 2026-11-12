"use server";

import { redirect } from "next/navigation";
import { cohortConsentVersion } from "@/lib/consent";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTimezone } from "@/lib/timezone";

export async function createHousehold(formData: FormData) {
  const householdName = String(formData.get("householdName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const timezone = normalizeTimezone(formData.get("timezone"));
  const consentAccepted = formData.get("consentAccepted") === "on";

  if (!householdName || !displayName || !consentAccepted) {
    throw new Error("Household name, display name, and cohort consent are required.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error: householdError } = await supabase.rpc("create_household_bootstrap", {
    household_name: householdName,
    household_slug: slugify(householdName),
    household_timezone: timezone,
    consent_version: cohortConsentVersion,
    member_display_name: displayName
  });

  if (householdError) {
    throw new Error(householdError.message);
  }

  await captureServerEvent(
    analyticsEvents.householdCreated,
    { timezone },
    user.id
  ).catch(() => undefined);

  redirect("/app");
}

function slugify(value: string) {
  return `${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
}
