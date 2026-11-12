export type OpsJobRow = {
  kind: string;
  status: string;
  run_after: string;
  locked_at: string | null;
  updated_at: string;
  processed_at: string | null;
  last_error: string | null;
};

export type OpsExtractionRunRow = {
  status: string;
  provider: string | null;
  updated_at: string;
  last_error: string | null;
};

export type OpsArtifactTextRow = {
  mime_type: string;
  text_extraction_status: string;
  updated_at: string;
  text_extraction_error: string | null;
};

export type OpsNotificationRunRow = {
  notification_type: string;
  status: string;
  provider: string | null;
  updated_at: string;
  last_error: string | null;
};

export type OpsCoverageSendEventRow = {
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type OpsSnapshotInput = {
  now?: Date;
  jobs: OpsJobRow[];
  jobSummary?: OpsJobSummary;
  extractionRuns: OpsExtractionRunRow[];
  artifactTextRows: OpsArtifactTextRow[];
  notificationRuns: OpsNotificationRunRow[];
  coverageSendEvents: OpsCoverageSendEventRow[];
};

export type OpsJobSummary = {
  byStatus: CountRow[];
  byKindAndStatus: KindStatusCountRow[];
  oldestPendingMinutes: number | null;
  staleRunningCount: number;
};

export type OpsSnapshot = {
  generatedAt: string;
  jobs: {
    byStatus: CountRow[];
    byKindAndStatus: KindStatusCountRow[];
    oldestPendingMinutes: number | null;
    staleRunningCount: number;
    recentFailures: RecentFailureRow[];
  };
  extractionRuns: {
    byStatus: CountRow[];
    recentFailures: RecentFailureRow[];
  };
  artifactText: {
    byStatus: CountRow[];
    recentFailures: RecentFailureRow[];
  };
  notifications: {
    byTypeAndStatus: TypeStatusCountRow[];
    recentFailures: RecentFailureRow[];
  };
  coverageRequestSends: {
    byProviderAndStatus: ProviderStatusCountRow[];
    recentFailures: RecentFailureRow[];
  };
};

export type CountRow = {
  label: string;
  count: number;
};

export type KindStatusCountRow = {
  kind: string;
  status: string;
  count: number;
};

export type TypeStatusCountRow = {
  notificationType: string;
  status: string;
  count: number;
};

export type ProviderStatusCountRow = {
  provider: string;
  status: string;
  count: number;
};

export type RecentFailureRow = {
  label: string;
  status: string;
  provider?: string | null;
  updatedAt: string;
  errorBucket: string;
};

const staleJobMs = 15 * 60 * 1000;
const failureStatuses = new Set(["failed"]);
const coverageSendProviders = new Set(["local-stub", "resend"]);
const coverageSendStatuses = new Set(["stubbed", "sent", "failed"]);

export function buildOpsSnapshot({
  now = new Date(),
  jobs,
  jobSummary,
  extractionRuns,
  artifactTextRows,
  notificationRuns,
  coverageSendEvents
}: OpsSnapshotInput): OpsSnapshot {
  const nowMs = now.getTime();

  return {
    generatedAt: now.toISOString(),
    jobs: {
      ...(jobSummary ?? buildJobSummaryFromRows(jobs, nowMs)),
      recentFailures: recentFailures(
        jobs.filter((job) => failureStatuses.has(job.status)),
        (job) => ({
          label: job.kind,
          status: job.status,
          updatedAt: job.processed_at ?? job.updated_at,
          errorBucket: errorBucket(job.last_error)
        })
      )
    },
    extractionRuns: {
      byStatus: sortedCounts(extractionRuns.map((run) => run.status)),
      recentFailures: recentFailures(
        extractionRuns.filter((run) => failureStatuses.has(run.status)),
        (run) => ({
          label: "extraction_run",
          status: run.status,
          provider: run.provider,
          updatedAt: run.updated_at,
          errorBucket: errorBucket(run.last_error)
        })
      )
    },
    artifactText: {
      byStatus: sortedCounts(artifactTextRows.map((artifact) => artifact.text_extraction_status)),
      recentFailures: recentFailures(
        artifactTextRows.filter((artifact) => failureStatuses.has(artifact.text_extraction_status)),
        (artifact) => ({
          label: artifact.mime_type,
          status: artifact.text_extraction_status,
          updatedAt: artifact.updated_at,
          errorBucket: errorBucket(artifact.text_extraction_error)
        })
      )
    },
    notifications: {
      byTypeAndStatus: sortedTupleCounts(
        notificationRuns.map((run) => [run.notification_type, run.status] as const),
        ([notificationType, status], count) => ({ notificationType, status, count })
      ),
      recentFailures: recentFailures(
        notificationRuns.filter((run) => failureStatuses.has(run.status)),
        (run) => ({
          label: run.notification_type,
          status: run.status,
          provider: run.provider,
          updatedAt: run.updated_at,
          errorBucket: errorBucket(run.last_error)
        })
      )
    },
    coverageRequestSends: {
      byProviderAndStatus: sortedTupleCounts(
        coverageSendEvents.map((event) => [providerFromEvent(event), statusFromEvent(event)] as const),
        ([provider, status], count) => ({ provider, status, count })
      ),
      recentFailures: recentFailures(
        coverageSendEvents.filter((event) => event.event_type === "coverage_request_send_failed"),
        (event) => ({
          label: "coverage_request",
          status: statusFromEvent(event),
          provider: providerFromEvent(event),
          updatedAt: event.created_at,
          errorBucket: "provider_failure"
        })
      )
    }
  };
}

function buildJobSummaryFromRows(jobs: OpsJobRow[], nowMs: number): OpsJobSummary {
  return {
    byStatus: sortedCounts(jobs.map((job) => job.status)),
    byKindAndStatus: sortedTupleCounts(
      jobs.map((job) => [job.kind, job.status] as const),
      ([kind, status], count) => ({ kind, status, count })
    ),
    oldestPendingMinutes: oldestPendingMinutes(jobs, nowMs),
    staleRunningCount: jobs.filter((job) =>
      job.status === "running"
      && job.locked_at
      && dateMs(job.locked_at) <= nowMs - staleJobMs
    ).length
  };
}

function oldestPendingMinutes(jobs: OpsJobRow[], nowMs: number) {
  const pendingTimes = jobs
    .filter((job) => job.status === "pending")
    .map((job) => dateMs(job.run_after))
    .filter((ms) => ms > 0 && ms <= nowMs);

  if (pendingTimes.length === 0) return null;
  return Math.floor((nowMs - Math.min(...pendingTimes)) / 60000);
}

function recentFailures<T>(
  rows: T[],
  mapper: (row: T) => RecentFailureRow
) {
  return rows
    .map(mapper)
    .sort((a, b) => dateMs(b.updatedAt) - dateMs(a.updatedAt))
    .slice(0, 5);
}

function sortedCounts(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function sortedTupleCounts<T extends readonly string[], R>(
  values: T[],
  mapper: (value: T, count: number) => R
) {
  const counts = new Map<string, { value: T; count: number }>();

  for (const value of values) {
    const key = value.join("\u001f");
    const existing = counts.get(key);
    counts.set(key, { value, count: (existing?.count ?? 0) + 1 });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.value.join(" ").localeCompare(b.value.join(" ")))
    .map(({ value, count }) => mapper(value, count));
}

function providerFromEvent(event: OpsCoverageSendEventRow) {
  const provider = event.metadata?.provider;
  if (typeof provider === "string" && coverageSendProviders.has(provider)) return provider;
  return "unknown";
}

function statusFromEvent(event: OpsCoverageSendEventRow) {
  const status = event.metadata?.status;
  if (typeof status === "string" && coverageSendStatuses.has(status)) return status;
  if (event.event_type === "coverage_request_sent") return "sent";
  if (event.event_type === "coverage_request_send_stubbed") return "stubbed";
  if (event.event_type === "coverage_request_send_failed") return "failed";
  return "unknown";
}

function errorBucket(value: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (!normalized) return "unspecified";
  if (normalized.includes("timeout") || normalized.includes("timed out")) return "timeout";
  if (normalized.includes("provider") || normalized.includes("resend") || normalized.includes("gemini")) {
    return "provider_failure";
  }
  if (normalized.includes("unauthorized") || normalized.includes("permission")) return "auth_failure";
  if (normalized.includes("missing") || normalized.includes("not found") || normalized.includes("could not be read") || normalized.includes("unable to read")) {
    return "missing_reference";
  }
  if (normalized.includes("schema") || normalized.includes("parse") || normalized.includes("json")) {
    return "parse_or_schema";
  }
  return "other";
}

function dateMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
