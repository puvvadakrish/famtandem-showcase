import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { buildDailyUnresolvedEmail } from "@/lib/notifications/email";
import {
  intendedNotificationProvider,
  selectNotificationSender
} from "@/lib/notifications/senders/provider";
import { loadDailyUnresolvedItems } from "@/lib/notifications/unresolved-items";
import type {
  HouseholdNotificationProvider,
  HouseholdNotificationStatus,
  NotificationSender
} from "@/lib/notifications/types";

type NotificationSettingsRow = {
  household_id: string;
  daily_send_hour_local: number;
  households: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
};

type RecipientMemberRow = {
  id: string;
  display_name: string;
  email: string | null;
};

type NotificationRunRow = {
  id: string;
  household_id: string;
  recipient_member_id: string;
  status: HouseholdNotificationStatus;
  local_date: string | null;
  attempt_count: number;
  processing_token: string;
};

type HouseholdRow = {
  name: string;
  timezone: string;
};

export type EnqueueDailyUnresolvedNudgesResult = {
  eligibleHouseholds: number;
  dueHouseholds: number;
  createdRuns: number;
  createdJobs: number;
};

export async function enqueueDailyUnresolvedNudges({
  supabase,
  now = new Date()
}: {
  supabase: SupabaseClient;
  now?: Date;
}): Promise<EnqueueDailyUnresolvedNudgesResult> {
  const { data, error } = await supabase
    .from("household_notification_settings")
    .select("household_id, daily_send_hour_local, households(name, timezone)")
    .eq("daily_unresolved_enabled", true);

  if (error) {
    throw new Error(`Unable to load daily notification settings: ${error.message}`);
  }

  const settings = (data ?? []) as NotificationSettingsRow[];
  const result: EnqueueDailyUnresolvedNudgesResult = {
    eligibleHouseholds: settings.length,
    dueHouseholds: 0,
    createdRuns: 0,
    createdJobs: 0
  };

  for (const setting of settings) {
    const household = one(setting.households);
    const timezone = household?.timezone ?? "America/Chicago";
    const local = safeLocalDateHour(now, timezone, setting.household_id);
    if (!local) continue;
    if (local.hour < setting.daily_send_hour_local) continue;

    result.dueHouseholds += 1;
    const recipients = await loadDailyRecipients(supabase, setting.household_id);
    for (const recipient of recipients) {
      const enqueued = await enqueueDailyRun({
        supabase,
        householdId: setting.household_id,
        recipientMemberId: recipient.id,
        localDate: local.date
      });
      if (enqueued.createdRun) result.createdRuns += 1;
      if (enqueued.createdJob) result.createdJobs += 1;
    }
  }

  return result;
}

export async function sendDailyUnresolvedNudge({
  supabase,
  notificationRunId,
  sender,
  now = new Date()
}: {
  supabase: SupabaseClient;
  notificationRunId: string;
  sender?: NotificationSender;
  now?: Date;
}) {
  const run = await startNotificationRun(supabase, notificationRunId);
  if (!run) return;
  let attemptedProvider: HouseholdNotificationProvider = intendedNotificationProvider();

  try {
    const selectedSender = sender ?? selectNotificationSender();
    if (sender) attemptedProvider = "local-stub";
    const [household, recipient] = await Promise.all([
      loadHousehold(supabase, run.household_id),
      loadRecipient(supabase, run.household_id, run.recipient_member_id)
    ]);

    if (!recipient.email?.trim()) {
      await finishNotificationRun(supabase, run, {
        status: "failed",
        provider: "local-stub",
        providerMessageId: null,
        lastError: "Recipient has no email address.",
        metadata: { item_count: 0 }
      });
      throw new Error("Daily unresolved nudge recipient has no email address.");
    }

    const items = await loadDailyUnresolvedItems({
      supabase,
      householdId: run.household_id,
      timezone: household.timezone,
      now
    });

    if (items.length === 0) {
      await finishNotificationRun(supabase, run, {
        status: "skipped_empty",
        provider: "local-stub",
        providerMessageId: null,
        lastError: null,
        metadata: { item_count: 0 }
      });
      return;
    }

    const env = getServerEnv();
    const email = buildDailyUnresolvedEmail({
      householdName: household.name,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      items,
      timezone: household.timezone
    });
    const sendResult = await selectedSender.send({
      notificationRunId: run.id,
      notificationType: "daily_unresolved",
      to: recipient.email,
      recipientLabel: recipient.display_name,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: `notification/${run.id}`
    });

    if (sendResult.status === "failed") {
      await finishNotificationRun(supabase, run, {
        status: "failed",
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId,
        lastError: "Notification provider send failed.",
        metadata: { item_count: items.length }
      });
      throw new NotificationSendError("Daily unresolved nudge send failed.");
    }

    await finishNotificationRun(supabase, run, {
      status: "sent",
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId,
      lastError: null,
      metadata: {
        item_count: items.length,
        preview_count: Math.min(items.length, 5)
      }
    });
  } catch (error) {
    if (
      !(error instanceof NotificationRunAlreadyRecordedError)
      && !(error instanceof NotificationSendError)
    ) {
      await safelyFailNotificationRun(supabase, run, error, attemptedProvider);
    }
    throw error;
  }
}

async function loadDailyRecipients(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, email")
    .eq("household_id", householdId)
    .eq("active", true)
    .in("role", ["parent", "household_admin"])
    .not("user_id", "is", null)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Unable to load daily notification recipients: ${error.message}`);
  }

  return (data ?? []) as RecipientMemberRow[];
}

async function enqueueDailyRun({
  supabase,
  householdId,
  recipientMemberId,
  localDate
}: {
  supabase: SupabaseClient;
  householdId: string;
  recipientMemberId: string;
  localDate: string;
}) {
  const { data, error } = await supabase.rpc("enqueue_daily_notification_run", {
    p_household_id: householdId,
    p_recipient_member_id: recipientMemberId,
    p_local_date: localDate
  });

  if (error) {
    throw new Error(`Unable to enqueue daily notification run: ${error.message}`);
  }

  const row = Array.isArray(data)
    ? (data[0] as { created_run: boolean; created_job: boolean } | undefined)
    : null;

  return {
    createdRun: Boolean(row?.created_run),
    createdJob: Boolean(row?.created_job)
  };
}

async function startNotificationRun(supabase: SupabaseClient, notificationRunId: string) {
  const { data, error } = await supabase.rpc("start_notification_run", {
    p_run_id: notificationRunId
  });

  if (error) {
    throw new Error(`Unable to start notification run ${notificationRunId}: ${error.message}`);
  }

  const row = Array.isArray(data) ? (data[0] as NotificationRunRow | undefined) : null;
  return row ?? null;
}

async function loadHousehold(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("households")
    .select("name, timezone")
    .eq("id", householdId)
    .single<HouseholdRow>();

  if (error || !data) {
    throw new Error(`Unable to load notification household ${householdId}: ${error?.message ?? "not found"}`);
  }

  return data;
}

async function loadRecipient(
  supabase: SupabaseClient,
  householdId: string,
  recipientMemberId: string
) {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, email")
    .eq("id", recipientMemberId)
    .eq("household_id", householdId)
    .single<RecipientMemberRow>();

  if (error || !data) {
    throw new Error(`Unable to load notification recipient ${recipientMemberId}: ${error?.message ?? "not found"}`);
  }

  return data;
}

async function finishNotificationRun(
  supabase: SupabaseClient,
  run: NotificationRunRow,
  input: {
    status: "sent" | "failed" | "skipped_empty";
    provider: string;
    providerMessageId: string | null;
    lastError: string | null;
    metadata: Record<string, unknown>;
  }
) {
  const { error } = await supabase.rpc("record_notification_run", {
    p_run_id: run.id,
    p_processing_token: run.processing_token,
    p_status: input.status,
    p_provider: input.provider,
    p_provider_message_id: input.providerMessageId,
    p_last_error: input.lastError,
    p_metadata: input.metadata
  });

  if (error) {
    if (error.code === "40001") {
      throw new NotificationRunAlreadyRecordedError(run.id);
    }
    throw new Error(`Unable to finish notification run ${run.id}: ${error.message}`);
  }
}

async function safelyFailNotificationRun(
  supabase: SupabaseClient,
  run: NotificationRunRow,
  error: unknown,
  attemptedProvider: HouseholdNotificationProvider
) {
  try {
    await finishNotificationRun(supabase, run, {
      status: "failed",
      provider: attemptedProvider,
      providerMessageId: null,
      lastError: error instanceof Error ? error.message : "Unknown notification failure",
      metadata: { item_count: 0 }
    });
  } catch {
    // Preserve the original job failure; stale-worker record failures are expected
    // if a newer attempt has already claimed this run.
  }
}

class NotificationRunAlreadyRecordedError extends Error {
  constructor(runId: string) {
    super(`Notification run ${runId} was already recorded by another attempt.`);
    this.name = "NotificationRunAlreadyRecordedError";
  }
}

class NotificationSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationSendError";
  }
}

function safeLocalDateHour(date: Date, timezone: string, householdId: string) {
  try {
    return localDateHour(date, timezone);
  } catch (error) {
    console.warn(
      `Skipping daily unresolved nudge scheduling for household ${householdId}: invalid timezone ${timezone}.`,
      error
    );
    return null;
  }
}

function localDateHour(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour") ?? "0")
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
