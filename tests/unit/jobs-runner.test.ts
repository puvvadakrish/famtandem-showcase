import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/jobs/cron-auth";
import { processJobBatch } from "@/lib/jobs/runner";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("isAuthorizedCronRequest", () => {
  it("rejects missing cron secrets", () => {
    expect(isAuthorizedCronRequest(new Headers(), "a-long-local-cron-secret")).toBe(false);
  });

  it("accepts bearer or cron secret headers", () => {
    expect(
      isAuthorizedCronRequest(
        new Headers({ authorization: "Bearer a-long-local-cron-secret" }),
        "a-long-local-cron-secret"
      )
    ).toBe(true);
    expect(
      isAuthorizedCronRequest(
        new Headers({ "x-cron-secret": "a-long-local-cron-secret" }),
        "a-long-local-cron-secret"
      )
    ).toBe(true);
  });
});

describe("processJobBatch", () => {
  it("claims and completes noop jobs", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null })
    }));
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ id: "job-1", kind: "noop", payload: {} }],
        error: null
      }),
      from: vi.fn(() => ({ update }))
    };

    const result = await processJobBatch({
      supabase: supabase as never,
      batchSize: 5
    });

    expect(supabase.rpc).toHaveBeenCalledWith("claim_due_jobs", { batch_size: 5 });
    expect(supabase.from).toHaveBeenCalledWith("jobs");
    expect(result).toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      jobIds: ["job-1"]
    });
  });

  it("dispatches extract_source jobs to the extraction runner", async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const single = vi.fn(async () => ({
      data: { source_type: "paste", normalized_text: "Pickup at 3pm." },
      error: null
    }));
    const fromTable = vi.fn(() => ({ update, select: () => ({ eq: () => ({ single }) }) }));

    const rpc = vi
      .fn()
      // claim_due_jobs returns one extract_source job
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-extract",
            kind: "extract_source",
            payload: {
              extraction_run_id: "run-1",
              source_input_id: "src-1",
              household_id: "hh-1",
              source_type: "paste"
            }
          }
        ],
        error: null
      })
      // start_extraction_run
      .mockResolvedValueOnce({
        data: [
          {
            id: "run-1",
            household_id: "hh-1",
            source_input_id: "src-1",
            attempts: 1,
            max_attempts: 3
          }
        ],
        error: null
      })
      // record_extraction_run
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: null, error: null });

    const supabase = { rpc, from: fromTable };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(rpc.mock.calls.map((call) => call[0])).toContain("start_extraction_run");
    expect(rpc.mock.calls.map((call) => call[0])).toContain("record_extraction_run");
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("marks extract_source jobs failed when the payload lacks an extraction run id", async () => {
    const supabase = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: "job-bad", kind: "extract_source", payload: {} }],
          error: null
        })
        .mockResolvedValueOnce({ data: null, error: null }),
      from: vi.fn(() => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }))
    };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(supabase.rpc).toHaveBeenLastCalledWith("mark_job_failed", {
      job_id: "job-bad",
      error_message: expect.stringContaining("extraction_run_id")
    });
    expect(result.failed).toBe(1);
  });

  it("dispatches extract_artifact_text jobs to the artifact text runner", async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const download = vi.fn().mockResolvedValue({
      data: { text: async () => "Pickup at 3pm." },
      error: null
    });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-artifact",
            kind: "extract_artifact_text",
            payload: { source_artifact_id: "artifact-1" }
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "source_artifacts") {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "artifact-1",
                    source_input_id: "source-1",
                    household_id: "household-1",
                    storage_bucket: "source-artifacts",
                    storage_path: "household-1/source-1/file.txt",
                    original_file_name: "file.txt",
                    mime_type: "text/plain",
                    text_extraction_status: "pending"
                  },
                  error: null
                })
              })
            })
          };
        }

        if (table === "jobs") return { update };
        throw new Error(`Unexpected table ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({ download }))
      }
    };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(result.succeeded).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      "record_artifact_text_extraction",
      expect.objectContaining({
        p_source_artifact_id: "artifact-1",
        p_status: "succeeded",
        p_normalized_text: "Pickup at 3pm."
      })
    );
  });

  it("dispatches daily unresolved nudge jobs to the notification runner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
    stubRequiredEnv();

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-daily",
            kind: "send_daily_unresolved_nudge",
            payload: { notification_run_id: "run-1" }
          }
        ],
        error: null
      })
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
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: null, error: null });
    const jobUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

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
                    data: {
                      id: "member-1",
                      display_name: "Maya",
                      email: "maya@example.com",
                      role: "household_admin",
                      active: true,
                      user_id: "user-1"
                    },
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

        if (table === "jobs") {
          return { update: jobUpdate };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(rpc).toHaveBeenCalledWith("start_notification_run", { p_run_id: "run-1" });
    expect(rpc).toHaveBeenCalledWith(
      "record_notification_run",
      expect.objectContaining({
        p_run_id: "run-1",
        p_processing_token: "00000000-0000-4000-8000-000000000001",
        p_status: "sent",
        p_provider: "local-stub",
        p_provider_message_id: "local-stub:run-1:daily_unresolved"
      })
    );
  });

  it("dispatches weekly coverage review jobs to the notification runner", async () => {
    stubRequiredEnv();

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-weekly",
            kind: "send_weekly_coverage_review",
            payload: { notification_run_id: "run-1" }
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "run-1",
            household_id: "household-1",
            recipient_member_id: "member-1",
            status: "running",
            local_date: null,
            period_start: "2026-05-31",
            period_end: "2026-06-06",
            metadata: {},
            attempt_count: 1,
            processing_token: "00000000-0000-4000-8000-000000000001"
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: null, error: null });
    const jobUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

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
                    data: {
                      id: "member-1",
                      display_name: "Maya",
                      email: "maya@example.com",
                      role: "household_admin",
                      active: true,
                      user_id: "user-1"
                    },
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
                      starts_at: "2026-06-01T22:30:00.000Z",
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

        if (table === "jobs") {
          return { update: jobUpdate };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(rpc).toHaveBeenCalledWith("start_notification_run", { p_run_id: "run-1" });
    expect(rpc).toHaveBeenCalledWith(
      "record_notification_run",
      expect.objectContaining({
        p_run_id: "run-1",
        p_processing_token: "00000000-0000-4000-8000-000000000001",
        p_status: "sent",
        p_provider: "local-stub",
        p_provider_message_id: "local-stub:run-1:weekly_coverage_review"
      })
    );
  });

  it("marks weekly coverage review jobs failed for ineligible recipients before sending", async () => {
    stubRequiredEnv();

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-weekly",
            kind: "send_weekly_coverage_review",
            payload: { notification_run_id: "run-1" }
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "run-1",
            household_id: "household-1",
            recipient_member_id: "member-1",
            status: "running",
            period_start: "2026-05-31",
            period_end: "2026-06-06",
            metadata: {},
            attempt_count: 1,
            processing_token: "00000000-0000-4000-8000-000000000001"
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const jobUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

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
                    data: {
                      id: "member-1",
                      display_name: "Helper",
                      email: "helper@example.com",
                      role: "helper",
                      active: true,
                      user_id: "user-1"
                    },
                    error: null
                  })
                })
              })
            })
          };
        }

        if (table === "jobs") {
          return { update: jobUpdate };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await processJobBatch({ supabase: supabase as never, batchSize: 5 });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      "record_notification_run",
      expect.objectContaining({
        p_run_id: "run-1",
        p_status: "failed",
        p_provider: "local-stub",
        p_last_error: "Recipient is not eligible for weekly coverage reviews."
      })
    );
  });

  it("marks unknown job kinds as failed", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null })
    }));
    const supabase = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: "job-unknown", kind: "mystery_kind", payload: {} }],
          error: null
        })
        .mockResolvedValueOnce({ data: null, error: null }),
      from: vi.fn(() => ({ update }))
    };

    const result = await processJobBatch({
      supabase: supabase as never,
      batchSize: 5
    });

    expect(supabase.rpc).toHaveBeenLastCalledWith("mark_job_failed", {
      job_id: "job-unknown",
      error_message: "No processor registered for job kind: mystery_kind"
    });
    expect(result.failed).toBe(1);
  });
});

function stubRequiredEnv() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
}
