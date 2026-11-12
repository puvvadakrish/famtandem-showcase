import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDailyUnresolvedNudge } from "@/lib/notifications/daily-unresolved";
import type { NotificationSender } from "@/lib/notifications/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendDailyUnresolvedNudge", () => {
  it("records provider send failures once without overwriting provider details", async () => {
    stubRequiredEnv();
    const sender: NotificationSender = {
      send: vi.fn(async () => ({
        provider: "resend" as const,
        providerMessageId: null,
        status: "failed" as const
      }))
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "run-1",
            household_id: "household-1",
            recipient_member_id: "member-1",
            status: "running",
            local_date: "2026-05-26",
            attempt_count: 1,
            processing_token: "00000000-0000-4000-8000-000000000001"
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "households") {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { name: "Rivera Family", timezone: "America/Chicago" },
                  error: null
                })
              })
            })
          };
        }

        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "member-1", display_name: "Maya", email: "maya@example.com" },
                    error: null
                  })
                })
              })
            })
          };
        }

        if (table === "coverage_cards") {
          return {
            select: () => ({
              eq: () => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "card-1",
                      household_id: "household-1",
                      title: "Soccer pickup",
                      starts_at: "2026-05-26T22:30:00.000Z",
                      computed_coverage_state: "needs_coverage",
                      review_reason: null,
                      created_at: "2026-05-26T12:00:00.000Z",
                      coverage_slots: [{ id: "slot-1", kind: "pickup", state: "needs_coverage" }],
                      readiness_items: [],
                      card_children: []
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    };

    await expect(
      sendDailyUnresolvedNudge({
        supabase: supabase as never,
        notificationRunId: "run-1",
        sender,
        now: new Date("2026-05-26T13:00:00.000Z")
      })
    ).rejects.toThrow("Daily unresolved nudge send failed.");

    const recordCalls = rpc.mock.calls.filter((call) => call[0] === "record_notification_run");
    expect(recordCalls).toHaveLength(1);
    expect(recordCalls[0]?.[1]).toMatchObject({
      p_status: "failed",
      p_provider: "resend",
      p_provider_message_id: null,
      p_last_error: "Notification provider send failed."
    });
  });
});

function stubRequiredEnv() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
}
