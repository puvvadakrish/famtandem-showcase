import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { buildWeeklyCoverageReviewEmail } from "@/lib/notifications/email";
import {
  intendedNotificationProvider,
  selectNotificationSender
} from "@/lib/notifications/senders/provider";
import { loadWeeklyReviewItemsForPeriod } from "@/lib/notifications/unresolved-items";
import type {
  HouseholdNotificationProvider,
  HouseholdNotificationStatus,
  NotificationSender
} from "@/lib/notifications/types";

type NotificationSettingsRow = {
  household_id: string;
  weekly_send_weekday: number;
  weekly_send_hour_local: number;
  households: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
};

type RecipientMemberRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
  active: boolean;
  user_id: string | null;
};

type NotificationRunRow = {
  id: string;
  household_id: string;
  recipient_member_id: string;
  status: HouseholdNotificationStatus;
  period_start: string | null;
  period_end: string | null;
  metadata: Record<string, unknown>;
  attempt_count: number;
  processing_token: string;
};

type HouseholdRow = {
  name: string;
  timezone: string;
};

type WeeklyEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
  itemCount: number;
  previewCount: number;
  periodStart: string;
  periodEnd: string;
};

export type EnqueueWeeklyCoverageReviewsResult = {
  eligibleHouseholds: number;
  dueHouseholds: number;
  createdRuns: number;
  createdJobs: number;
};

export async function enqueueWeeklyCoverageReviews({
  supabase,
  now = new Date()
}: {
  supabase: SupabaseClient;
  now?: Date;
}): Promise<EnqueueWeeklyCoverageReviewsResult> {
  const { data, error } = await supabase
    .from("household_notification_settings")
    .select("household_id, weekly_send_weekday, weekly_send_hour_local, households(name, timezone)")
    .eq("weekly_coverage_review_enabled", true);

  if (error) {
    throw new Error(`Unable to load weekly notification settings: ${error.message}`);
  }

  const settings = (data ?? []) as NotificationSettingsRow[];
  const result: EnqueueWeeklyCoverageReviewsResult = {
    eligibleHouseholds: settings.length,
    dueHouseholds: 0,
    createdRuns: 0,
    createdJobs: 0
  };

  for (const setting of settings) {
    const household = one(setting.households);
    const timezone = household?.timezone ?? "America/Chicago";
    const local = safeLocalDateHourWeekday(now, timezone, setting.household_id);
    if (!local) continue;
    if (local.weekday !== setting.weekly_send_weekday) continue;
    if (local.hour < setting.weekly_send_hour_local) continue;

    result.dueHouseholds += 1;
    const recipients = await loadWeeklyRecipients(supabase, setting.household_id);
    const periodStart = local.date;
    const periodEnd = addDaysToDateKey(periodStart, 6);
    for (const recipient of recipients) {
      const enqueued = await enqueueWeeklyRun({
        supabase,
        householdId: setting.household_id,
        recipientMemberId: recipient.id,
        periodStart,
        periodEnd
      });
      if (enqueued.createdRun) result.createdRuns += 1;
      if (enqueued.createdJob) result.createdJobs += 1;
    }
  }

  return result;
}

export async function sendWeeklyCoverageReview({
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

    if (!isEligibleRecipient(recipient)) {
      await finishNotificationRun(supabase, run, {
        status: "failed",
        provider: attemptedProvider,
        providerMessageId: null,
        lastError: "Recipient is not eligible for weekly coverage reviews.",
        metadata: { item_count: 0 }
      });
      throw new Error("Weekly coverage review recipient is not eligible.");
    }

    if (!recipient.email?.trim()) {
      await finishNotificationRun(supabase, run, {
        status: "failed",
        provider: attemptedProvider,
        providerMessageId: null,
        lastError: "Recipient has no email address.",
        metadata: { item_count: 0 }
      });
      throw new Error("Weekly coverage review recipient has no email address.");
    }

    const periodStart = run.period_start ?? localDateHourWeekday(now, household.timezone).date;
    const periodEnd = run.period_end ?? addDaysToDateKey(periodStart, 6);
    const env = getServerEnv();
    const snapshot = weeklySnapshotFromMetadata(run.metadata)
      ?? await createAndStoreWeeklySnapshot({
        supabase,
        run,
        householdName: household.name,
        householdTimezone: household.timezone,
        appUrl: env.NEXT_PUBLIC_APP_URL,
        periodStart,
        periodEnd,
        now
      });

    if (snapshot.itemCount === 0) return;

    const sendResult = await selectedSender.send({
      notificationRunId: run.id,
      notificationType: "weekly_coverage_review",
      to: recipient.email,
      recipientLabel: recipient.display_name,
      subject: snapshot.subject,
      text: snapshot.text,
      html: snapshot.html,
      idempotencyKey: `notification/${run.id}`
    });

    if (sendResult.status === "failed") {
      await finishNotificationRun(supabase, run, {
        status: "failed",
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId,
        lastError: "Notification provider send failed.",
        metadata: snapshotMetadata(snapshot)
      });
      throw new NotificationSendError("Weekly coverage review send failed.");
    }

    await finishNotificationRun(supabase, run, {
      status: "sent",
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId,
      lastError: null,
      metadata: snapshotMetadata(snapshot)
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

async function createAndStoreWeeklySnapshot({
  supabase,
  run,
  householdName,
  householdTimezone,
  appUrl,
  periodStart,
  periodEnd,
  now
}: {
  supabase: SupabaseClient;
  run: NotificationRunRow;
  householdName: string;
  householdTimezone: string;
  appUrl: string;
  periodStart: string;
  periodEnd: string;
  now: Date;
}) {
  const items = await loadWeeklyReviewItemsForPeriod({
    supabase,
    householdId: run.household_id,
    timezone: householdTimezone,
    now,
    periodStart,
    periodEnd
  });

  if (items.length === 0) {
    await finishNotificationRun(supabase, run, {
      status: "skipped_empty",
      provider: "local-stub",
      providerMessageId: null,
      lastError: null,
      metadata: { item_count: 0 }
    });
    return {
      subject: "",
      text: "",
      html: "",
      itemCount: 0,
      previewCount: 0,
      periodStart,
      periodEnd
    };
  }

  const email = buildWeeklyCoverageReviewEmail({
    householdName,
    appUrl,
    periodStart,
    periodEnd,
    timezone: householdTimezone,
    items
  });
  const snapshot: WeeklyEmailSnapshot = {
    ...email,
    itemCount: items.length,
    previewCount: Math.min(items.length, 8),
    periodStart,
    periodEnd
  };
  await snapshotWeeklyNotificationRun(supabase, run, snapshot);
  return snapshot;
}

function weeklySnapshotFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.weekly_snapshot;
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<WeeklyEmailSnapshot>;
  if (
    typeof snapshot.subject !== "string"
    || typeof snapshot.text !== "string"
    || typeof snapshot.html !== "string"
    || typeof snapshot.itemCount !== "number"
    || typeof snapshot.previewCount !== "number"
    || typeof snapshot.periodStart !== "string"
    || typeof snapshot.periodEnd !== "string"
  ) {
    return null;
  }
  return snapshot as WeeklyEmailSnapshot;
}

function snapshotMetadata(snapshot: WeeklyEmailSnapshot) {
  return {
    item_count: snapshot.itemCount,
    preview_count: snapshot.previewCount,
    weekly_snapshot: snapshot
  };
}

async function snapshotWeeklyNotificationRun(
  supabase: SupabaseClient,
  run: NotificationRunRow,
  snapshot: WeeklyEmailSnapshot
) {
  const { error } = await supabase.rpc("snapshot_weekly_notification_run", {
    p_run_id: run.id,
    p_processing_token: run.processing_token,
    p_metadata: snapshotMetadata(snapshot)
  });

  if (error) {
    if (error.code === "40001") {
      throw new NotificationRunAlreadyRecordedError(run.id);
    }
    throw new Error(`Unable to snapshot weekly notification run ${run.id}: ${error.message}`);
  }
}

async function loadWeeklyRecipients(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, email, role, active, user_id")
    .eq("household_id", householdId)
    .eq("active", true)
    .in("role", ["parent", "household_admin"])
    .not("user_id", "is", null)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Unable to load weekly notification recipients: ${error.message}`);
  }

  return (data ?? []) as RecipientMemberRow[];
}

async function enqueueWeeklyRun({
  supabase,
  householdId,
  recipientMemberId,
  periodStart,
  periodEnd
}: {
  supabase: SupabaseClient;
  householdId: string;
  recipientMemberId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const { data, error } = await supabase.rpc("enqueue_weekly_notification_run", {
    p_household_id: householdId,
    p_recipient_member_id: recipientMemberId,
    p_period_start: periodStart,
    p_period_end: periodEnd
  });

  if (error) {
    throw new Error(`Unable to enqueue weekly notification run: ${error.message}`);
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
    .select("id, display_name, email, role, active, user_id")
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

function isEligibleRecipient(recipient: RecipientMemberRow) {
  return Boolean(
    recipient.active
      && recipient.user_id
      && recipient.email?.trim()
      && (recipient.role === "parent" || recipient.role === "household_admin")
  );
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

function safeLocalDateHourWeekday(date: Date, timezone: string, householdId: string) {
  try {
    return localDateHourWeekday(date, timezone);
  } catch (error) {
    console.warn(
      `Skipping weekly coverage review scheduling for household ${householdId}: invalid timezone ${timezone}.`,
      error
    );
    return null;
  }
}

function localDateHourWeekday(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour") ?? "0"),
    weekday: weekdayIndex(part("weekday"))
  };
}

function weekdayIndex(value: string | undefined) {
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return value ? weekdays[value] ?? 0 : 0;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
