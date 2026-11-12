import type {
  NotificationEmailInput,
  NotificationSender,
  NotificationSendResult
} from "@/lib/notifications/types";

export class LocalNotificationSender implements NotificationSender {
  async send(input: NotificationEmailInput): Promise<NotificationSendResult> {
    return {
      provider: "local-stub",
      providerMessageId: `local-stub:${input.notificationRunId}:${input.notificationType}`,
      status: "stubbed"
    };
  }
}
