import "server-only";
import { getServerEnv } from "@/lib/env";
import { LocalNotificationSender } from "@/lib/notifications/senders/local-stub";
import { ResendNotificationSender } from "@/lib/notifications/senders/resend";
import type { HouseholdNotificationProvider, NotificationSender } from "@/lib/notifications/types";

export function selectNotificationSender(): NotificationSender {
  const env = getServerEnv();
  if (env.HOUSEHOLD_NOTIFICATION_SENDER === "resend") {
    if (!env.RESEND_API_KEY?.trim()) {
      throw new Error("RESEND_API_KEY is required when HOUSEHOLD_NOTIFICATION_SENDER=resend.");
    }

    return new ResendNotificationSender({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      replyTo: env.RESEND_REPLY_TO_EMAIL
    });
  }

  return new LocalNotificationSender();
}

export function intendedNotificationProvider(): HouseholdNotificationProvider {
  const env = getServerEnv();
  return env.HOUSEHOLD_NOTIFICATION_SENDER === "resend" ? "resend" : "local-stub";
}
