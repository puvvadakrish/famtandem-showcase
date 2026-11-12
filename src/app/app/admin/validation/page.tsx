import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, CheckCircle2, Download, Inbox, ShieldCheck } from "lucide-react";
import {
  currentUserIsInternalAdmin,
  loadValidationSnapshotAfterAdminGate
} from "@/lib/validation-snapshot-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ValidationSnapshotPage() {
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

  const snapshot = await loadValidationSnapshotAfterAdminGate();

  return (
    <main className="min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div className="mx-auto min-h-dvh w-full max-w-6xl border-x border-line bg-[#fffdf8]">
        <header className="border-b border-line bg-cream px-4 py-4 sm:px-6">
          <Link
            href="/app"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to board
          </Link>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-moss">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                <p className="text-sm font-semibold">Internal admin</p>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-ink">Validation snapshot</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
                Read-only cohort signal for intake, extracted cards, unresolved coverage, and request responses.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-graphite">
                Generated {formatDateTime(snapshot.generatedAt)}
              </p>
              <Link
                href="/app/admin/ops"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
              >
                <Activity className="h-4 w-4" aria-hidden="true" />
                Operations
              </Link>
              <Link
                href="/app/admin/validation/export"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </Link>
            </div>
          </div>
        </header>

        <div className="space-y-5 px-4 py-6 sm:px-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Households" value={snapshot.totals.households} />
            <Metric label="Active households" value={snapshot.totals.activeHouseholds} />
            <Metric label="Inputs this week" value={snapshot.totals.sourceInputsLast7Days} />
            <Metric label="Response rate" value={formatPercent(snapshot.totals.responseRate)} />
          </section>

          <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
                <div className="flex items-center gap-2 text-moss">
                  <Inbox className="h-5 w-5" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-ink">Validation funnel</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Source inputs" value={snapshot.totals.sourceInputs} compact />
                  <Metric label="Coverage cards" value={snapshot.totals.coverageCards} compact />
                  <Metric label="Source-backed cards" value={snapshot.totals.sourceBackedCards} compact />
                  <Metric label="Needs attention" value={snapshot.totals.needsAttentionCards} compact />
                  <Metric label="Uncovered or pending" value={snapshot.totals.uncoveredOrPendingCards} compact />
                  <Metric label="Coverage requests" value={snapshot.totals.coverageRequests} compact />
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
                <div className="flex items-center gap-2 text-moss">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-ink">Coverage outcomes</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Slots needing coverage" value={snapshot.totals.slotsNeedingCoverage} compact />
                  <Metric label="Requested slots" value={snapshot.totals.requestedSlots} compact />
                  <Metric label="Covered slots" value={snapshot.totals.coveredSlots} compact />
                  <Metric label="Responses" value={snapshot.totals.coverageResponses} compact />
                  <Metric label="Accepted responses" value={snapshot.totals.acceptedResponses} compact />
                  <Metric label="Declined responses" value={snapshot.totals.declinedResponses} compact />
                </div>
              </section>

              <section className="min-w-0 rounded-lg border border-line bg-white p-4 shadow-inset">
                <h2 className="text-lg font-semibold text-ink">Household snapshots</h2>
                <div className="mt-4 max-w-full overflow-x-auto">
                  <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-normal text-clay">
                      <tr>
                        <th className="py-2 pr-4 font-semibold">Household</th>
                        <th className="py-2 pr-4 font-semibold">Inputs</th>
                        <th className="py-2 pr-4 font-semibold">Cards</th>
                        <th className="py-2 pr-4 font-semibold">Needs attention</th>
                        <th className="py-2 font-semibold">Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.householdSnapshots.length === 0 ? (
                        <tr>
                          <td className="py-4 text-graphite" colSpan={5}>
                            No household activity has been recorded yet.
                          </td>
                        </tr>
                      ) : (
                        snapshot.householdSnapshots.map((household) => (
                          <tr key={household.id} className="border-b border-line/70 last:border-0">
                            <td className="py-3 pr-4 font-semibold text-ink">{household.name}</td>
                            <td className="py-3 pr-4 text-graphite">{household.sourceInputs}</td>
                            <td className="py-3 pr-4 text-graphite">{household.coverageCards}</td>
                            <td className="py-3 pr-4 text-graphite">{household.needsAttentionCards}</td>
                            <td className="py-3 text-graphite">{household.coverageRequests}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <Breakdown title="Source types" rows={snapshot.sourceTypes} />
              <Breakdown title="Source status" rows={snapshot.sourceStatuses} />
              <Breakdown title="Card states" rows={snapshot.cardStates} />
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  compact = false
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-line bg-white ${compact ? "p-3" : "p-4"} shadow-inset`}>
      <p className="text-xs font-semibold uppercase tracking-normal text-clay">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-center gap-2 text-moss">
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-graphite">No data yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="capitalize text-graphite">{row.label.replaceAll("_", " ")}</dt>
              <dd className="font-semibold text-ink">{row.count}</dd>
            </div>
          ))
        )}
      </dl>
    </section>
  );
}

function formatPercent(value: number | null) {
  if (value === null) return "N/A";
  return `${Math.round(value * 100)}%`;
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
