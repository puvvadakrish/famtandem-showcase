import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueDailyUnresolvedNudges } from "@/lib/notifications/daily-unresolved";
import { enqueueWeeklyCoverageReviews } from "@/lib/notifications/weekly-coverage-review";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueDailyUnresolvedNudges", () => {
  it("creates one daily run and job per eligible parent/admin recipient", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-1", job_id: "job-1", created_run: true, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    daily_send_hour_local: 6,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    not: () => ({
                      not: vi.fn().mockResolvedValue({
                        data: [
                          { id: "member-1", display_name: "Maya", email: "maya@example.com" }
                        ],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueDailyUnresolvedNudges({
      supabase: supabase as never,
      now: new Date("2026-05-26T13:00:00.000Z")
    });

    expect(result).toEqual({
      eligibleHouseholds: 1,
      dueHouseholds: 1,
      createdRuns: 1,
      createdJobs: 1
    });
    expect(supabase.rpc).toHaveBeenCalledWith("enqueue_daily_notification_run", {
      p_household_id: "household-1",
      p_recipient_member_id: "member-1",
      p_local_date: "2026-05-26"
    });
  });

  it("repairs duplicate pending daily runs by allowing the RPC to create a missing job", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-1", job_id: "job-1", created_run: false, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    daily_send_hour_local: 6,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    not: () => ({
                      not: vi.fn().mockResolvedValue({
                        data: [
                          { id: "member-1", display_name: "Maya", email: "maya@example.com" }
                        ],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueDailyUnresolvedNudges({
      supabase: supabase as never,
      now: new Date("2026-05-26T13:00:00.000Z")
    });

    expect(result.createdRuns).toBe(0);
    expect(result.createdJobs).toBe(1);
  });

  it("does not create new jobs for terminal failed runs", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-1", job_id: null, created_run: false, created_job: false }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    daily_send_hour_local: 6,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    not: () => ({
                      not: vi.fn().mockResolvedValue({
                        data: [
                          { id: "member-1", display_name: "Maya", email: "maya@example.com" }
                        ],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueDailyUnresolvedNudges({
      supabase: supabase as never,
      now: new Date("2026-05-26T13:00:00.000Z")
    });

    expect(result.createdRuns).toBe(0);
    expect(result.createdJobs).toBe(0);
  });

  it("skips households with invalid timezones without aborting the daily enqueue pass", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-valid", job_id: "job-valid", created_run: true, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-bad",
                    daily_send_hour_local: 6,
                    households: { name: "Bad TZ", timezone: "Mars/Olympus" }
                  },
                  {
                    household_id: "household-valid",
                    daily_send_hour_local: 6,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    not: () => ({
                      not: vi.fn().mockResolvedValue({
                        data: [
                          { id: "member-1", display_name: "Maya", email: "maya@example.com" }
                        ],
                        error: null
                      })
                    })
                  })
                })
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueDailyUnresolvedNudges({
      supabase: supabase as never,
      now: new Date("2026-05-26T13:00:00.000Z")
    });

    expect(result).toEqual({
      eligibleHouseholds: 2,
      dueHouseholds: 1,
      createdRuns: 1,
      createdJobs: 1
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("enqueue_daily_notification_run", {
      p_household_id: "household-valid",
      p_recipient_member_id: "member-1",
      p_local_date: "2026-05-26"
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping daily unresolved nudge scheduling for household household-bad"),
      expect.any(RangeError)
    );
  });
});

describe("enqueueWeeklyCoverageReviews", () => {
  it("creates one weekly run and job per eligible parent/admin recipient on the configured local weekday", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-1", job_id: "job-1", created_run: true, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    weekly_send_weekday: 0,
                    weekly_send_hour_local: 8,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return recipientQuery([
            { id: "member-1", display_name: "Maya", email: "maya@example.com" }
          ]);
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueWeeklyCoverageReviews({
      supabase: supabase as never,
      now: new Date("2026-05-31T14:00:00.000Z")
    });

    expect(result).toEqual({
      eligibleHouseholds: 1,
      dueHouseholds: 1,
      createdRuns: 1,
      createdJobs: 1
    });
    expect(supabase.rpc).toHaveBeenCalledWith("enqueue_weekly_notification_run", {
      p_household_id: "household-1",
      p_recipient_member_id: "member-1",
      p_period_start: "2026-05-31",
      p_period_end: "2026-06-06"
    });
  });

  it("does not enqueue weekly reviews before the configured local weekday or hour", async () => {
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    weekly_send_weekday: 0,
                    weekly_send_hour_local: 8,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueWeeklyCoverageReviews({
      supabase: supabase as never,
      now: new Date("2026-05-31T12:30:00.000Z")
    });

    expect(result).toEqual({
      eligibleHouseholds: 1,
      dueHouseholds: 0,
      createdRuns: 0,
      createdJobs: 0
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("repairs duplicate pending weekly runs by allowing the RPC to create a missing job", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-1", job_id: "job-1", created_run: false, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-1",
                    weekly_send_weekday: 0,
                    weekly_send_hour_local: 8,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return recipientQuery([
            { id: "member-1", display_name: "Maya", email: "maya@example.com" }
          ]);
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueWeeklyCoverageReviews({
      supabase: supabase as never,
      now: new Date("2026-05-31T14:00:00.000Z")
    });

    expect(result.createdRuns).toBe(0);
    expect(result.createdJobs).toBe(1);
  });

  it("skips households with invalid timezones without aborting the weekly enqueue pass", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ run_id: "run-valid", job_id: "job-valid", created_run: true, created_job: true }],
        error: null
      }),
      from: vi.fn((table: string) => {
        if (table === "household_notification_settings") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    household_id: "household-bad",
                    weekly_send_weekday: 0,
                    weekly_send_hour_local: 8,
                    households: { name: "Bad TZ", timezone: "Mars/Olympus" }
                  },
                  {
                    household_id: "household-valid",
                    weekly_send_weekday: 0,
                    weekly_send_hour_local: 8,
                    households: { name: "Rivera Family", timezone: "America/Chicago" }
                  }
                ],
                error: null
              })
            })
          };
        }

        if (table === "household_members") {
          return recipientQuery([
            { id: "member-1", display_name: "Maya", email: "maya@example.com" }
          ]);
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await enqueueWeeklyCoverageReviews({
      supabase: supabase as never,
      now: new Date("2026-05-31T14:00:00.000Z")
    });

    expect(result).toEqual({
      eligibleHouseholds: 2,
      dueHouseholds: 1,
      createdRuns: 1,
      createdJobs: 1
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("enqueue_weekly_notification_run", {
      p_household_id: "household-valid",
      p_recipient_member_id: "member-1",
      p_period_start: "2026-05-31",
      p_period_end: "2026-06-06"
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping weekly coverage review scheduling for household household-bad"),
      expect.any(RangeError)
    );
  });
});

function recipientQuery(recipients: Array<{ id: string; display_name: string; email: string }>) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          in: () => ({
            not: () => ({
              not: vi.fn().mockResolvedValue({
                data: recipients,
                error: null
              })
            })
          })
        })
      })
    })
  };
}
