import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import {
  buildGoogleCalendarEventPayload,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent
} from "@/lib/google-calendar/events";
import { refreshGoogleAccessToken } from "@/lib/google-calendar/oauth";
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken
} from "@/lib/google-calendar/tokens";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type GoogleCalendarBoardState = {
  isConfigured: boolean;
  connection: {
    accountEmail: string | null;
    connectedAt: string;
  } | null;
  exportsByCardId: Record<string, {
    status: "pending" | "succeeded" | "failed";
    htmlLink: string | null;
    lastExportedAt: string | null;
  }>;
};

type ConnectionRow = {
  id: string;
  household_id: string;
  member_id: string;
  google_account_email: string | null;
  encrypted_refresh_token: string | null;
  scopes: string[] | null;
  connected_at: string;
};

type ExportRowForSend = {
  id: string;
  provider_event_id: string;
  provider_html_link: string | null;
  operation: "create" | "update";
};

type CardExportRow = {
  card_id: string;
  status: "pending" | "succeeded" | "failed";
  provider_html_link: string | null;
  last_exported_at: string | null;
};

type ExportableCardRow = {
  id: string;
  household_id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  source_summary: string | null;
  card_children: {
    children: { display_name: string } | { display_name: string }[] | null;
  }[];
  coverage_slots: {
    kind: string;
    state: string;
    external_owner_text: string | null;
    household_members: { display_name: string } | { display_name: string }[] | null;
    external_contacts: { display_name: string } | { display_name: string }[] | null;
  }[];
};

export function googleCalendarIsConfigured() {
  return Boolean(getGoogleCalendarConfig(getServerEnv()));
}

export async function loadGoogleCalendarBoardState({
  householdId,
  memberId,
  canUseCalendar
}: {
  householdId: string;
  memberId: string;
  canUseCalendar: boolean;
}): Promise<GoogleCalendarBoardState> {
  const isConfigured = googleCalendarIsConfigured();
  if (!canUseCalendar || !isConfigured) {
    return { isConfigured, connection: null, exportsByCardId: {} };
  }

  const supabase = createSupabaseServiceClient();
  const connection = await loadActiveConnection(supabase, householdId, memberId);
  if (!connection) {
    return { isConfigured, connection: null, exportsByCardId: {} };
  }

  const { data, error } = await supabase
    .from("coverage_card_calendar_exports")
    .select("card_id, status, provider_html_link, last_exported_at")
    .eq("household_id", householdId)
    .eq("connection_id", connection.id);

  if (error) throw new Error(error.message);

  return {
    isConfigured,
    connection: {
      accountEmail: connection.google_account_email,
      connectedAt: connection.connected_at
    },
    exportsByCardId: Object.fromEntries(
      ((data ?? []) as CardExportRow[]).map((row) => [
        row.card_id,
        {
          status: row.status,
          htmlLink: row.provider_html_link,
          lastExportedAt: row.last_exported_at
        }
      ])
    )
  };
}

export async function upsertGoogleCalendarConnection({
  householdId,
  memberId,
  refreshToken,
  googleAccountEmail,
  googleAccountSubject,
  scopes
}: {
  householdId: string;
  memberId: string;
  refreshToken: string;
  googleAccountEmail: string | null;
  googleAccountSubject: string | null;
  scopes: string[];
}) {
  const env = getServerEnv();
  const config = getGoogleCalendarConfig(env);
  if (!config) throw new Error("Google Calendar export is not configured.");

  const supabase = createSupabaseServiceClient();
  const encryptedRefreshToken = encryptGoogleRefreshToken(refreshToken, config.tokenSecret);
  const existing = await loadConnectionForMember(supabase, householdId, memberId);

  if (existing) {
    const { error } = await supabase
      .from("google_calendar_connections")
      .update({
        encrypted_refresh_token: encryptedRefreshToken,
        google_account_email: googleAccountEmail,
        google_account_subject: googleAccountSubject,
        scopes,
        status: "active",
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error_bucket: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("google_calendar_connections").insert({
      household_id: householdId,
      member_id: memberId,
      google_account_email: googleAccountEmail,
      google_account_subject: googleAccountSubject,
      encrypted_refresh_token: encryptedRefreshToken,
      scopes,
      status: "active"
    });

    if (error) throw new Error(error.message);
  }

}

export async function disconnectGoogleCalendarConnection({
  householdId,
  memberId
}: {
  householdId: string;
  memberId: string;
}) {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("google_calendar_connections")
    .update({
      status: "disconnected",
      encrypted_refresh_token: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("household_id", householdId)
    .eq("member_id", memberId)
    .eq("provider", "google");

  if (error) throw new Error(error.message);
}

export async function exportCoverageCardToGoogleCalendar({
  householdId,
  memberId,
  cardId,
  timezone
}: {
  householdId: string;
  memberId: string;
  cardId: string;
  timezone: string;
}) {
  const env = getServerEnv();
  const config = getGoogleCalendarConfig(env);
  if (!config) throw new Error("Google Calendar export is not configured.");

  const supabase = createSupabaseServiceClient();
  const connection = await loadActiveConnection(supabase, householdId, memberId);
  if (!connection) {
    throw new Error("Connect Google Calendar before exporting a card.");
  }

  const card = await loadExportableCard(supabase, householdId, cardId);
  if (!card.starts_at || card.all_day) {
    throw new Error("Only cards with a date and time can be added to Google Calendar.");
  }

  const exportRow = await createOrMarkPendingExport(supabase, {
    householdId,
    cardId,
    connectionId: connection.id,
    snapshot: safeSnapshot(card)
  });

  try {
    if (!connection.encrypted_refresh_token) {
      throw new Error("Connect Google Calendar before exporting a card.");
    }
    const refreshToken = decryptGoogleRefreshToken(connection.encrypted_refresh_token, config.tokenSecret);
    const tokenResponse = await refreshGoogleAccessToken({ refreshToken, config });
    const payload = buildGoogleCalendarEventPayload({
      appUrl: env.NEXT_PUBLIC_APP_URL,
      cardId,
      title: card.title,
      startsAt: card.starts_at,
      endsAt: card.ends_at,
      allDay: card.all_day,
      timezone,
      location: card.location,
      child: childSummary(card),
      owner: coverageOwnerSummary(card),
      sourceSummary: card.source_summary
    });
    const result =
      exportRow.operation === "update"
        ? await updateGoogleCalendarEvent({
          accessToken: tokenResponse.accessToken,
          eventId: exportRow.provider_event_id,
          payload
        }).catch((error: Error) => {
          if (error.name === "GoogleCalendarEventNotFoundError") {
            return createGoogleCalendarEvent({
              accessToken: tokenResponse.accessToken,
              eventId: exportRow.provider_event_id,
              payload
            });
          }
          throw error;
        })
        : await createGoogleCalendarEvent({
            accessToken: tokenResponse.accessToken,
            eventId: exportRow.provider_event_id,
            payload
          }).catch((error: Error) => {
            if (error.name === "GoogleCalendarEventConflictError") {
              return updateGoogleCalendarEvent({
                accessToken: tokenResponse.accessToken,
                eventId: exportRow.provider_event_id,
                payload
              });
            }
            throw error;
          });

    await recordExportResult(supabase, {
      exportId: exportRow.id,
      providerEventId: result.eventId,
      providerHtmlLink: result.htmlLink,
      status: "succeeded",
      lastErrorBucket: null
    });

    return {
      status: exportRow.operation === "create" ? "created" : "updated",
      htmlLink: result.htmlLink
    };
  } catch (error) {
    await recordExportResult(supabase, {
      exportId: exportRow.id,
      providerEventId: exportRow.provider_event_id,
      providerHtmlLink: exportRow.provider_html_link,
      status: "failed",
      lastErrorBucket: "google_provider_failure"
    });
    throw error;
  }
}

async function loadConnectionForMember(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string
) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("id, household_id, member_id, google_account_email, encrypted_refresh_token, scopes, connected_at")
    .eq("household_id", householdId)
    .eq("member_id", memberId)
    .eq("provider", "google")
    .maybeSingle<ConnectionRow>();

  if (error) throw new Error(error.message);
  return data;
}

async function loadActiveConnection(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string
) {
  const connection = await loadConnectionForMember(supabase, householdId, memberId);
  if (!connection) return null;

  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("id, household_id, member_id, google_account_email, encrypted_refresh_token, scopes, connected_at")
    .eq("id", connection.id)
    .eq("status", "active")
    .maybeSingle<ConnectionRow>();

  if (error) throw new Error(error.message);
  return data;
}

async function loadExportableCard(
  supabase: SupabaseClient,
  householdId: string,
  cardId: string
) {
  const { data, error } = await supabase
    .from("coverage_cards")
    .select(
      "id, household_id, title, starts_at, ends_at, all_day, location, source_summary, card_children(children(display_name)), coverage_slots(kind, state, external_owner_text, household_members(display_name), external_contacts(display_name))"
    )
    .eq("id", cardId)
    .eq("household_id", householdId)
    .maybeSingle<ExportableCardRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Coverage card must belong to this household.");
  return data;
}

async function createOrMarkPendingExport(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    cardId: string;
    connectionId: string;
    snapshot: Record<string, unknown>;
  }
) {
  const exportId = randomUUID();
  const deterministicProviderEventId = googleProviderEventId(exportId);
  const { data: existing, error: existingError } = await supabase
    .from("coverage_card_calendar_exports")
    .select("id, provider_event_id, provider_html_link, attempt_count, status, updated_at")
    .eq("connection_id", input.connectionId)
    .eq("card_id", input.cardId)
    .maybeSingle<{
      id: string;
      provider_event_id: string | null;
      provider_html_link: string | null;
      attempt_count: number;
      status: "pending" | "running" | "succeeded" | "failed";
      updated_at: string;
    }>();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const runningStartedAt = new Date(existing.updated_at).getTime();
    const isFreshRunningExport = existing.status === "running" && Date.now() - runningStartedAt < 5 * 60 * 1000;
    if (isFreshRunningExport) {
      throw new Error("Google Calendar export is already running for this card.");
    }
    const providerEventId = existing.provider_event_id ?? googleProviderEventId(existing.id);
    const { data, error } = await supabase
      .from("coverage_card_calendar_exports")
      .update({
        status: "running",
        provider_event_id: providerEventId,
        attempt_count: existing.attempt_count + 1,
        last_error_bucket: null,
        last_exported_snapshot: input.snapshot,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .select("id, provider_event_id, provider_html_link")
      .single<{ id: string; provider_event_id: string | null; provider_html_link: string | null }>();

    if (error) throw new Error(error.message);
    return toExportRowForSend(data, existing.provider_event_id || existing.provider_html_link ? "update" : "create");
  }

  const { data, error } = await supabase
    .from("coverage_card_calendar_exports")
    .insert({
      id: exportId,
      household_id: input.householdId,
      card_id: input.cardId,
      connection_id: input.connectionId,
      provider: "google",
      provider_event_id: deterministicProviderEventId,
      status: "running",
      attempt_count: 1,
      last_exported_snapshot: input.snapshot
    })
    .select("id, provider_event_id, provider_html_link")
    .single<{ id: string; provider_event_id: string | null; provider_html_link: string | null }>();

  if (error) throw new Error(error.message);
  return toExportRowForSend(data, "create");
}

function toExportRowForSend(
  row: { id: string; provider_event_id: string | null; provider_html_link: string | null },
  operation: "create" | "update"
): ExportRowForSend {
  if (!row.provider_event_id) {
    throw new Error("Google Calendar export event id was not created.");
  }
  return {
    id: row.id,
    provider_event_id: row.provider_event_id,
    provider_html_link: row.provider_html_link,
    operation
  };
}

async function recordExportResult(
  supabase: SupabaseClient,
  input: {
    exportId: string;
    providerEventId: string | null;
    providerHtmlLink: string | null;
    status: "succeeded" | "failed";
    lastErrorBucket: string | null;
  }
) {
  const updateValues = {
    provider_event_id: input.providerEventId,
    provider_html_link: input.providerHtmlLink,
    status: input.status,
    last_error_bucket: input.lastErrorBucket,
    updated_at: new Date().toISOString(),
    ...(input.status === "succeeded" ? { last_exported_at: new Date().toISOString() } : {})
  };
  const { error } = await supabase
    .from("coverage_card_calendar_exports")
    .update(updateValues)
    .eq("id", input.exportId);

  if (error) throw new Error(error.message);
}

function childSummary(card: ExportableCardRow) {
  const names = card.card_children
    .map((entry) => one(entry.children)?.display_name)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : null;
}

function coverageOwnerSummary(card: ExportableCardRow) {
  if (card.coverage_slots.length === 0) return "No coverage slot";
  return card.coverage_slots
    .map((slot) => {
      const owner =
        one(slot.household_members)?.display_name ??
        one(slot.external_contacts)?.display_name ??
        slot.external_owner_text ??
        (slot.state === "accepted" || slot.state === "covered_external" ? "Covered" : "Needs an owner");
      return `${slotKindLabel(slot.kind)}: ${owner}`;
    })
    .join(" · ");
}

function slotKindLabel(kind: string) {
  const labels: Record<string, string> = {
    dropoff: "Drop-off",
    pickup: "Pickup",
    stay_attend: "Stay/attend",
    bring_prep: "Bring/prep",
    general_owner: "Owner"
  };
  return labels[kind] ?? kind.replaceAll("_", " ");
}

function safeSnapshot(card: ExportableCardRow) {
  return {
    title: card.title,
    startsAt: card.starts_at,
    endsAt: card.ends_at,
    allDay: card.all_day,
    locationPresent: Boolean(card.location),
    sourceSummaryPresent: Boolean(card.source_summary),
    slotCount: card.coverage_slots.length
  };
}

function googleProviderEventId(exportId: string) {
  return `famtandem${createHash("sha256").update(exportId).digest("hex").slice(0, 32)}`;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
