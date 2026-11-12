import "server-only";
import type {
  CoverageRequestSendInput,
  CoverageRequestSendResult,
  CoverageRequestSender
} from "@/lib/coverage-requests/senders/types";

type ResendCoverageRequestSenderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ResendSuccess = {
  id?: string;
};

export class ResendCoverageRequestSender implements CoverageRequestSender {
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
  }: ResendCoverageRequestSenderOptions) {
    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = replyTo;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async send(input: CoverageRequestSendInput): Promise<CoverageRequestSendResult> {
    if (input.channel !== "email" || !input.to?.trim()) {
      return {
        provider: "resend",
        providerMessageId: null,
        status: "failed"
      };
    }

    const payload = buildResendPayload(input, this.from, this.replyTo);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
          "User-Agent": "famtandem/coverage-requests"
        },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn(`Resend coverage request send failed with status ${response.status}.`);
        return {
          provider: "resend",
          providerMessageId: null,
          status: "failed"
        };
      }

      const data = (await response.json()) as ResendSuccess;
      return {
        provider: "resend",
        providerMessageId: data.id ?? null,
        status: data.id ? "sent" : "failed"
      };
    } catch {
      return {
        provider: "resend",
        providerMessageId: null,
        status: "failed"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildResendPayload(
  input: CoverageRequestSendInput,
  from: string,
  replyTo?: string | null
) {
  const text = buildResendText(input);
  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject ?? "Coverage request from FamTandem",
    text,
    html: buildResendHtml(text)
  };

  if (replyTo?.trim()) {
    payload.reply_to = replyTo.trim();
  }

  return payload;
}

function buildResendText(input: CoverageRequestSendInput) {
  const messageIncludesResponseUrl = input.message.includes(input.responseUrl);
  const lines = [
    `Hi ${input.recipientLabel || "there"},`,
    "",
    input.message,
    ...(messageIncludesResponseUrl ? [] : ["", `Respond here: ${input.responseUrl}`]),
    "",
    "This email only includes the coverage request details. Replies may not be monitored."
  ];

  return lines.join("\n");
}

function buildResendHtml(text: string) {
  return text
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
