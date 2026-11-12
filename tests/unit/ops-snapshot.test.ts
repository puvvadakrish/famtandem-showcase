import { describe, expect, it } from "vitest";
import { buildOpsSnapshot } from "@/lib/ops-snapshot";

describe("buildOpsSnapshot", () => {
  it("summarizes hosted job and provider health without raw failure details", () => {
    const now = new Date("2026-05-26T18:00:00.000Z");
    const snapshot = buildOpsSnapshot({
      now,
      jobs: [
        {
          kind: "extract_source",
          status: "pending",
          run_after: "2026-05-26T17:35:00.000Z",
          locked_at: null,
          updated_at: "2026-05-26T17:35:00.000Z",
          processed_at: null,
          last_error: null
        },
        {
          kind: "send_daily_unresolved_nudge",
          status: "running",
          run_after: "2026-05-26T17:20:00.000Z",
          locked_at: "2026-05-26T17:40:00.000Z",
          updated_at: "2026-05-26T17:40:00.000Z",
          processed_at: null,
          last_error: null
        },
        {
          kind: "extract_artifact_text",
          status: "failed",
          run_after: "2026-05-26T17:00:00.000Z",
          locked_at: null,
          updated_at: "2026-05-26T17:10:00.000Z",
          processed_at: "2026-05-26T17:10:00.000Z",
          last_error: "Gemini timeout while processing household/source/private-file.pdf"
        }
      ],
      extractionRuns: [
        {
          status: "failed",
          provider: "gemini",
          updated_at: "2026-05-26T17:15:00.000Z",
          last_error: "schema parse failed for raw source text"
        }
      ],
      artifactTextRows: [
        {
          mime_type: "application/pdf",
          text_extraction_status: "failed",
          updated_at: "2026-05-26T17:20:00.000Z",
          text_extraction_error: "Uploaded artifact object could not be read: private/path.pdf"
        }
      ],
      notificationRuns: [
        {
          notification_type: "daily_unresolved",
          status: "failed",
          provider: "resend",
          updated_at: "2026-05-26T17:25:00.000Z",
          last_error: "Notification provider send failed."
        }
      ],
      coverageSendEvents: [
        {
          event_type: "coverage_request_send_failed",
          metadata: { provider: "resend", status: "failed", requestTokenId: "token-secret" },
          created_at: "2026-05-26T17:30:00.000Z"
        },
        {
          event_type: "coverage_request_sent",
          metadata: { provider: "resend", status: "sent", requestTokenId: "token-secret" },
          created_at: "2026-05-26T17:31:00.000Z"
        },
        {
          event_type: "coverage_request_sent",
          metadata: {
            provider: "private-family@example.com",
            status: "sent-from-token-secret",
            requestTokenId: "token-secret"
          },
          created_at: "2026-05-26T17:32:00.000Z"
        }
      ]
    });

    expect(snapshot.jobs.oldestPendingMinutes).toBe(25);
    expect(snapshot.jobs.staleRunningCount).toBe(1);
    expect(snapshot.jobs.byStatus).toContainEqual({ label: "failed", count: 1 });
    expect(snapshot.jobs.byKindAndStatus).toContainEqual({
      kind: "extract_artifact_text",
      status: "failed",
      count: 1
    });
    expect(snapshot.jobs.recentFailures[0]).toMatchObject({
      label: "extract_artifact_text",
      errorBucket: "timeout"
    });
    expect(snapshot.extractionRuns.recentFailures[0].errorBucket).toBe("parse_or_schema");
    expect(snapshot.artifactText.recentFailures[0].errorBucket).toBe("missing_reference");
    expect(snapshot.notifications.recentFailures[0]).toMatchObject({
      label: "daily_unresolved",
      provider: "resend",
      errorBucket: "provider_failure"
    });
    expect(snapshot.coverageRequestSends.byProviderAndStatus).toContainEqual({
      provider: "resend",
      status: "failed",
      count: 1
    });
    expect(snapshot.coverageRequestSends.byProviderAndStatus).toContainEqual({
      provider: "unknown",
      status: "sent",
      count: 1
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("private-file.pdf");
    expect(serialized).not.toContain("raw source text");
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("private-family@example.com");
  });

  it("uses exact job summary when recent failure rows are only a limited sample", () => {
    const snapshot = buildOpsSnapshot({
      now: new Date("2026-05-26T18:00:00.000Z"),
      jobSummary: {
        byStatus: [{ label: "pending", count: 250 }],
        byKindAndStatus: [{ kind: "extract_source", status: "pending", count: 250 }],
        oldestPendingMinutes: 180,
        staleRunningCount: 7
      },
      jobs: [
        {
          kind: "extract_source",
          status: "failed",
          run_after: "2026-05-26T17:00:00.000Z",
          locked_at: null,
          updated_at: "2026-05-26T17:10:00.000Z",
          processed_at: "2026-05-26T17:10:00.000Z",
          last_error: "provider timeout"
        }
      ],
      extractionRuns: [],
      artifactTextRows: [],
      notificationRuns: [],
      coverageSendEvents: []
    });

    expect(snapshot.jobs.byStatus).toEqual([{ label: "pending", count: 250 }]);
    expect(snapshot.jobs.oldestPendingMinutes).toBe(180);
    expect(snapshot.jobs.staleRunningCount).toBe(7);
    expect(snapshot.jobs.recentFailures).toHaveLength(1);
  });
});
