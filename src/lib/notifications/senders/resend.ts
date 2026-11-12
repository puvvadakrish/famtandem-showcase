import "server-only";
import type {
  NotificationEmailInput,
  NotificationSender,
  NotificationSendResult
} from "@/lib/notifications/types";

type ResendNotificationSenderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ResendSuccess = {
  id?: string;
};

export class ResendNotificationSender implements NotificationSender {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor({
    apiKey,
    from,
    replyTo,
    fetchImpl = fetch,
    timeoutMs = 10_000
  }: ResendNotificationSenderOptions) {
    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = replyTo;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async send(input: NotificationEmailInput): Promise<NotificationSendResult> {
    if (!input.to.trim()) {
      return { provider: "resend", providerMessageId: null, status: "failed" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
          "User-Agent": "famtandem/household-notifications"
        },
        signal: controller.signal,
        body: JSON.stringify(buildResendNotificationPayload(input, this.from, this.replyTo))
      });

      if (!response.ok) {
        console.warn(`Resend household notification send failed with status ${response.status}.`);
        return { provider: "resend", providerMessageId: null, status: "failed" };
      }

      const data = (await response.json()) as ResendSuccess;
      return {
        provider: "resend",
        providerMessageId: data.id ?? null,
        status: data.id ? "sent" : "failed"
      };
    } catch (error) {
      console.error(
        "Resend household notification send failed with an exception.",
        error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" }
      );
      return { provider: "resend", providerMessageId: null, status: "failed" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildResendNotificationPayload(
  input: NotificationEmailInput,
  from: string,
  replyTo?: string | null
) {
  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html
  };

  if (replyTo?.trim()) {
    payload.reply_to = replyTo.trim();
  }

  return payload;
}
