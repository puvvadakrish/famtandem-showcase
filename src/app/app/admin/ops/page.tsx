import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Bell,
  FileSearch,
  HeartPulse,
  Inbox,
  Send,
  ShieldCheck
} from "lucide-react";
import { loadOpsSnapshotAfterAdminGate } from "@/lib/ops-snapshot-data";
import type {
  CountRow,
  RecentFailureRow
} from "@/lib/ops-snapshot";
import {
  currentUserIsInternalAdmin,
  loadValidationSnapshotAfterAdminGate
} from "@/lib/validation-snapshot-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsSnapshotPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isInternalAdmin = await currentUserIsInternalAdmin(supabase, user.id);

  if (!isInternalAdmin) {
    notFound();
  }

  const [snapshot, validationSnapshot] = await Promise.all([
    loadOpsSnapshotAfterAdminGate(),
    loadValidationSnapshotAfterAdminGate()
  ]);

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto min-h-dvh w-full max-w-6xl border-x border-line bg-[#fffdf8]">
        <header className="border-b border-line bg-cream px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to board
            </Link>
            <Link
              href="/app/admin/validation"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              Validation snapshot
            </Link>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-moss">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                <p className="text-sm font-semibold">Internal admin</p>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-ink">Operations snapshot</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
                Read-only hosted health for jobs, extraction, upload text/OCR, notifications, and request sends.
              </p>
            </div>
            <p className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-graphite">
              Generated {formatDateTime(snapshot.generatedAt)}
            </p>
          </div>
        </header>

        <div className="space-y-5 px-4 py-6 sm:px-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Households" value={validationSnapshot.totals.households} />
            <Metric label="Oldest pending job" value={formatMinutes(snapshot.jobs.oldestPendingMinutes)} />
            <Metric label="Stale running jobs" value={snapshot.jobs.staleRunningCount} />
            <Metric label="Failed jobs" value={countLabel(snapshot.jobs.byStatus, "failed")} />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <OpsPanel
              icon={<HeartPulse className="h-5 w-5" aria-hidden="true" />}
              title="Job Health"
              counts={snapshot.jobs.byStatus}
              tupleTitle="By kind"
              tupleRows={snapshot.jobs.byKindAndStatus.map((row) => ({
                label: `${row.kind} / ${row.status}`,
                count: row.count
              }))}
              failures={snapshot.jobs.recentFailures}
            />
            <OpsPanel
              icon={<FileSearch className="h-5 w-5" aria-hidden="true" />}
              title="Extraction Runs"
              counts={snapshot.extractionRuns.byStatus}
              failures={snapshot.extractionRuns.recentFailures}
            />
            <OpsPanel
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title="Upload Text/OCR"
              counts={snapshot.artifactText.byStatus}
              failures={snapshot.artifactText.recentFailures}
            />
            <OpsPanel
              icon={<Bell className="h-5 w-5" aria-hidden="true" />}
              title="Notification Runs"
              tupleTitle="By type"
              tupleRows={snapshot.notifications.byTypeAndStatus.map((row) => ({
                label: `${row.notificationType} / ${row.status}`,
                count: row.count
              }))}
              failures={snapshot.notifications.recentFailures}
            />
            <OpsPanel
              icon={<Send className="h-5 w-5" aria-hidden="true" />}
              title="Coverage Request Sends"
              tupleTitle="By provider"
              tupleRows={snapshot.coverageRequestSends.byProviderAndStatus.map((row) => ({
                label: `${row.provider} / ${row.status}`,
                count: row.count
              }))}
              failures={snapshot.coverageRequestSends.recentFailures}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <p className="text-xs font-semibold uppercase tracking-normal text-clay">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function OpsPanel({
  icon,
  title,
  counts = [],
  tupleTitle,
  tupleRows = [],
  failures
}: {
  icon: ReactNode;
  title: string;
  counts?: CountRow[];
  tupleTitle?: string;
  tupleRows?: Array<{ label: string; count: number }>;
  failures: RecentFailureRow[];
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-center gap-2 text-moss">
        {icon}
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      {counts.length > 0 ? <CountList rows={counts} /> : null}
      {tupleRows.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{tupleTitle}</h3>
          <CountList rows={tupleRows} compact />
        </div>
      ) : null}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink">Recent failures</h3>
        {failures.length === 0 ? (
          <p className="mt-2 text-sm text-graphite">No recent failures.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {failures.map((failure, index) => (
              <div
                key={`${failure.label}-${failure.updatedAt}-${failure.errorBucket}-${index}`}
                className="rounded-md border border-line bg-cream px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{formatLabel(failure.label)}</p>
                  <p className="text-xs font-semibold uppercase tracking-normal text-clay">
                    {formatLabel(failure.errorBucket)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-graphite">
                  {formatLabel(failure.status)}
                  {failure.provider ? ` / ${formatLabel(failure.provider)}` : ""} /{" "}
                  {formatDateTime(failure.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CountList({
  rows,
  compact = false
}: {
  rows: CountRow[] | Array<{ label: string; count: number }>;
  compact?: boolean;
}) {
  return (
    <dl className={`${compact ? "mt-2" : "mt-3"} space-y-2 text-sm`}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <dt className="text-graphite">{formatLabel(row.label)}</dt>
          <dd className="font-semibold text-ink">{row.count}</dd>
        </div>
      ))}
    </dl>
  );
}

function countLabel(rows: CountRow[], label: string) {
  return rows.find((row) => row.label === label)?.count ?? 0;
}

function formatMinutes(value: number | null) {
  if (value === null) return "None";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));
}
