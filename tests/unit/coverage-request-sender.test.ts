import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalCoverageRequestSender } from "@/lib/coverage-requests/senders/local-stub";
import {
  buildResendPayload,
  ResendCoverageRequestSender
} from "@/lib/coverage-requests/senders/resend";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("LocalCoverageRequestSender", () => {
  it("returns a deterministic local stub result without external providers", async () => {
    const sender = new LocalCoverageRequestSender();
    const result = await sender.send({
      requestTokenId: "token-1",
      requestIds: ["request-1"],
      channel: "manual_link",
      to: null,
      recipientLabel: "Grandma",
      message: "Can you cover this?",
      responseUrl: "http://localhost:3000/respond/coverage/test",
      idempotencyKey: "coverage-request/token-1/manual_link"
    });

    expect(result).toEqual({
      provider: "local-stub",
      providerMessageId: "local-stub:token-1:manual_link",
      status: "stubbed"
    });
  });

  it("defaults provider selection to local stub", async () => {
    stubRequiredEnv();

    const { selectCoverageRequestSender } = await import(
      "@/lib/coverage-requests/senders/provider"
    );

    expect(selectCoverageRequestSender("email").constructor.name).toBe("LocalCoverageRequestSender");
  });

  it("selects Resend only when explicitly configured with an API key", async () => {
    stubRequiredEnv();
    vi.stubEnv("COVERAGE_REQUEST_SENDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { selectCoverageRequestSender } = await import(
      "@/lib/coverage-requests/senders/provider"
    );

    expect(selectCoverageRequestSender("email").constructor.name).toBe("ResendCoverageRequestSender");
  });

  it("keeps manual links on the local sender even when Resend is configured", async () => {
    stubRequiredEnv();
    vi.stubEnv("COVERAGE_REQUEST_SENDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { selectCoverageRequestSender } = await import(
      "@/lib/coverage-requests/senders/provider"
    );

    expect(selectCoverageRequestSender("manual_link").constructor.name).toBe(
      "LocalCoverageRequestSender"
    );
  });

  it("rejects Resend selection without an API key before sending", async () => {
    stubRequiredEnv();
    vi.stubEnv("COVERAGE_REQUEST_SENDER", "resend");

    const { selectCoverageRequestSender } = await import(
      "@/lib/coverage-requests/senders/provider"
    );

    expect(() => selectCoverageRequestSender("email")).toThrow("RESEND_API_KEY is required");
  });

  it("sends Resend email with auth, user agent, idempotency, and safe content", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "email_123" }, { status: 200 })
    );
    const sender = new ResendCoverageRequestSender({
      apiKey: "re_test_key",
      from: "FamTandem <coverage@famtandem.com>",
      replyTo: "support@famtandem.com",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await sender.send({
      requestTokenId: "token-1",
      requestIds: ["request-1"],
      channel: "email",
      to: "helper@example.com",
      recipientLabel: "Grandma <script>alert(1)</script>",
      message: "Can you cover soccer pickup?\n\nRespond here: https://app.test/respond/coverage/plain-token",
      responseUrl: "https://app.test/respond/coverage/plain-token",
      idempotencyKey: "coverage-request/token-1/email",
      subject: "Coverage request: Soccer pickup"
    });

    expect(result).toEqual({
      provider: "resend",
      providerMessageId: "email_123",
      status: "sent"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "Content-Type": "application/json",
          "Idempotency-Key": "coverage-request/token-1/email",
          "User-Agent": "famtandem/coverage-requests"
        })
      })
    );

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body).toMatchObject({
      from: "FamTandem <coverage@famtandem.com>",
      to: ["helper@example.com"],
      reply_to: "support@famtandem.com",
      subject: "Coverage request: Soccer pickup"
    });
    expect(body.text).toContain("Can you cover soccer pickup?");
    expect(body.text).toContain("https://app.test/respond/coverage/plain-token");
    expect(body.text.match(/https:\/\/app\.test\/respond\/coverage\/plain-token/g)).toHaveLength(1);
    expect(body.text).not.toContain("source_inputs");
    expect(body.html).toContain("Can you cover soccer pickup?");
    expect(body.html).toContain("Grandma &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body.html).not.toContain("<script>");
  });

  it("maps Resend API errors to failed without exposing provider details", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ message: "invalid api key" }, { status: 403 })
    );
    const sender = new ResendCoverageRequestSender({
      apiKey: "re_secret",
      from: "FamTandem <coverage@famtandem.com>",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await sender.send({
        requestTokenId: "token-1",
        requestIds: ["request-1"],
        channel: "email",
        to: "helper@example.com",
        recipientLabel: "Helper",
        message: "Can you cover this?",
        responseUrl: "https://app.test/respond/coverage/plain-token",
        idempotencyKey: "coverage-request/token-1/email"
      });

    expect(result).toEqual({
      provider: "resend",
      providerMessageId: null,
      status: "failed"
    });
    expect(warnSpy).toHaveBeenCalledWith("Resend coverage request send failed with status 403.");
  });

  it("times out stalled Resend sends so manual fallback can continue", async () => {
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const sender = new ResendCoverageRequestSender({
      apiKey: "re_secret",
      from: "FamTandem <coverage@updates.famtandem.com>",
      fetchImpl: fetchMock as unknown as typeof fetch,
      timeoutMs: 5
    });

    const result = await sender.send({
      requestTokenId: "token-1",
      requestIds: ["request-1"],
      channel: "email",
      to: "helper@example.com",
      recipientLabel: "Helper",
      message: "Can you cover this?",
      responseUrl: "https://app.test/respond/coverage/plain-token",
      idempotencyKey: "coverage-request/token-1/email"
    });

    expect(result).toEqual({
      provider: "resend",
      providerMessageId: null,
      status: "failed"
    });
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("omits reply_to when none is configured", () => {
    const payload = buildResendPayload(
      {
        requestTokenId: "token-1",
        requestIds: ["request-1"],
        channel: "email",
        to: "helper@example.com",
        recipientLabel: "Helper",
        message: "Can you cover this?",
        responseUrl: "https://app.test/respond/coverage/plain-token",
        idempotencyKey: "coverage-request/token-1/email"
      },
      "FamTandem <coverage@famtandem.com>"
    );

    expect(payload).not.toHaveProperty("reply_to");
  });
});

function stubRequiredEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
}
