export type HouseholdNotificationType = "daily_unresolved" | "weekly_coverage_review";
export type HouseholdNotificationStatus =
  | "pending"
  | "running"
  | "sent"
  | "failed"
  | "skipped_empty";
export type HouseholdNotificationProvider = "local-stub" | "resend";

export type UnresolvedLogisticsItem = {
  householdId: string;
  cardId: string;
  kind:
    | "uncovered_slot"
    | "pending_response"
    | "changed_event"
    | "due_readiness"
    | "needs_review";
  severity: "today" | "due_soon" | "this_week" | "uncertain";
  title: string;
  startsAt: string | null;
  dueAt: string | null;
  statusLabel: string;
  slotKind?: string;
  childLabels?: string[];
  appHref: string;
};

export type NotificationEmailInput = {
  notificationRunId: string;
  notificationType: HouseholdNotificationType;
  to: string;
  recipientLabel: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type NotificationSendResult = {
  provider: HouseholdNotificationProvider;
  providerMessageId: string | null;
  status: "sent" | "failed" | "stubbed";
};

export type NotificationSender = {
  send(input: NotificationEmailInput): Promise<NotificationSendResult>;
};
