import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalNotificationSender } from "@/lib/notifications/senders/local-stub";
import {
  buildResendNotificationPayload,
  ResendNotificationSender
} from "@/lib/notifications/senders/resend";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("notification senders", () => {
  it("returns deterministic local stub results by default", async () => {
    const sender = new LocalNotificationSender();
    const result = await sender.send(notificationInput());

    expect(result).toEqual({
      provider: "local-stub",
      providerMessageId: "local-stub:run-1:daily_unresolved",
      status: "stubbed"
    });
  });

  it("selects the local sender unless household notifications explicitly use Resend", async () => {
    stubRequiredEnv();

    const { selectNotificationSender } = await import("@/lib/notifications/senders/provider");

    expect(selectNotificationSender().constructor.name).toBe("LocalNotificationSender");
  });

  it("selects Resend only with explicit sender env and API key", async () => {
    stubRequiredEnv();
    vi.stubEnv("HOUSEHOLD_NOTIFICATION_SENDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { selectNotificationSender } = await import("@/lib/notifications/senders/provider");

    expect(selectNotificationSender().constructor.name).toBe("ResendNotificationSender");
  });

  it("rejects Resend notification selection without an API key", async () => {
    stubRequiredEnv();
    vi.stubEnv("HOUSEHOLD_NOTIFICATION_SENDER", "resend");

    const { selectNotificationSender } = await import("@/lib/notifications/senders/provider");

    expect(() => selectNotificationSender()).toThrow("RESEND_API_KEY is required");
  });

  it("sends Resend notifications with idempotency and bounded content", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email_456" }, { status: 200 }));
    const sender = new ResendNotificationSender({
      apiKey: "re_test_key",
      from: "FamTandem <coverage@famtandem.com>",
      replyTo: "support@famtandem.com",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await sender.send(notificationInput());

    expect(result).toEqual({
      provider: "resend",
      providerMessageId: "email_456",
      status: "sent"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "Idempotency-Key": "notification/run-1",
          "User-Agent": "famtandem/household-notifications"
        })
      })
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body).toEqual({
      from: "FamTandem <coverage@famtandem.com>",
      to: ["parent@example.com"],
      reply_to: "support@famtandem.com",
      subject: "FamTandem daily check",
      text: "Pickup needs coverage.\n\nOpen FamTandem: https://app.test/app",
      html: "<p>Pickup needs coverage.</p>"
    });
    expect(JSON.stringify(body)).not.toContain("source_inputs");
    expect(JSON.stringify(body)).not.toContain("source_artifacts");
    expect(JSON.stringify(body)).not.toContain("storage_path");
    expect(JSON.stringify(body)).not.toContain("token_hash");
  });

  it("maps Resend notification errors to failed", async () => {
    const fetchMock = vi.fn(async () => Response.json({ message: "rate limited" }, { status: 429 }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sender = new ResendNotificationSender({
      apiKey: "re_test_key",
      from: "FamTandem <coverage@famtandem.com>",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await expect(sender.send(notificationInput())).resolves.toEqual({
      provider: "resend",
      providerMessageId: null,
      status: "failed"
    });
    expect(warnSpy).toHaveBeenCalledWith("Resend household notification send failed with status 429.");
  });

  it("logs sanitized Resend exceptions and returns failed", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sender = new ResendNotificationSender({
      apiKey: "re_test_key",
      from: "FamTandem <coverage@famtandem.com>",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await expect(sender.send(notificationInput())).resolves.toEqual({
      provider: "resend",
      providerMessageId: null,
      status: "failed"
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Resend household notification send failed with an exception.",
      { name: "TypeError", message: "network unavailable" }
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("re_test_key");
  });

  it("builds a payload without reply_to when omitted", () => {
    const payload = buildResendNotificationPayload(
      notificationInput(),
      "FamTandem <coverage@famtandem.com>"
    );

    expect(payload).not.toHaveProperty("reply_to");
    expect(JSON.stringify(payload)).not.toContain("source_inputs");
    expect(JSON.stringify(payload)).not.toContain("token_hash");
  });
});

function notificationInput() {
  return {
    notificationRunId: "run-1",
    notificationType: "daily_unresolved" as const,
    to: "parent@example.com",
    recipientLabel: "Maya",
    subject: "FamTandem daily check",
    text: "Pickup needs coverage.\n\nOpen FamTandem: https://app.test/app",
    html: "<p>Pickup needs coverage.</p>",
    idempotencyKey: "notification/run-1"
  };
}

function stubRequiredEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
}
