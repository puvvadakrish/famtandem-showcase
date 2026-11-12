import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FileUp,
  Inbox,
  Search,
  ShieldCheck
} from "lucide-react";
import type { SourceReviewFilter, SourceReviewState, SourceReviewTone } from "@/lib/source-review-state";
import { cn } from "@/lib/ui";

export type SourceInboxRow = {
  id: string;
  title: string;
  sourceType: string;
  sourceStatus: string;
  receivedAt: string;
  updatedAt: string;
  linkedCardCount: number;
  artifactCount: number;
  artifactSummary: string | null;
  reviewState: SourceReviewState;
};

export function SourceInbox({
  householdName,
  rows,
  timezone
}: {
  householdName: string;
  rows: SourceInboxRow[];
  timezone: string;
}) {
  const sortedRows = [...rows].sort((left, right) => {
    const priorityDelta = right.reviewState.priority - left.reviewState.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
  const counts = countByFilter(rows);

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto min-h-dvh w-full max-w-5xl border-x border-line bg-[#fffdf8]">
        <header className="border-b border-line bg-cream px-4 py-4 sm:px-6">
          <Link
            href="/app"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to board
          </Link>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-moss">{householdName}</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">Source inbox</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
                Track what FamTandem read, what created cards, and what needs review.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-md border border-moss/20 bg-sage px-3 py-2 text-sm font-semibold text-moss">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Parent source view
            </div>
          </div>
        </header>

        <section className="px-4 py-5 sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Source inbox status summary">
            <FilterChip label="Needs review" count={counts.needs_review} tone="amber" />
            <FilterChip label="Reading" count={counts.reading} tone="sky" />
            <FilterChip label="Created cards" count={counts.created_cards} tone="moss" />
            <FilterChip label="No cards" count={counts.no_cards} tone="graphite" />
            <FilterChip label="Failed" count={counts.failed} tone="coral" />
          </div>

          {sortedRows.length > 0 ? (
            <div className="mt-4 space-y-3">
              {sortedRows.map((row) => (
                <SourceInboxCard key={row.id} row={row} timezone={timezone} />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-line bg-white p-5 shadow-inset">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sage text-moss">
                  <Inbox className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-ink">No sources yet</h2>
                  <p className="mt-1 text-sm leading-6 text-graphite">
                    Paste email text or upload a file from the board. Submitted logistics will appear here.
                  </p>
                  <Link
                    href="/app#add-logistics"
                    className="mt-4 inline-flex min-h-10 items-center rounded-md bg-moss px-3 text-sm font-semibold text-white transition hover:bg-[#244d3c]"
                  >
                    Add logistics
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SourceInboxCard({ row, timezone }: { row: SourceInboxRow; timezone: string }) {
  const Icon = row.sourceType === "upload" ? FileUp : FileText;

  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cream text-moss">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-clay">{sourceTypeLabel(row.sourceType)}</p>
              <h2 className="mt-1 break-words text-lg font-semibold text-ink">{row.title}</h2>
            </div>
            <StatusBadge state={row.reviewState} />
          </div>

          <p className="mt-3 text-sm leading-6 text-graphite">{row.reviewState.nextAction}</p>
          <p className="mt-1 text-sm leading-6 text-graphite">{row.reviewState.detail}</p>

          <dl className="mt-4 grid gap-2 text-xs text-graphite sm:grid-cols-3">
            <MetaItem label="Submitted" value={formatDateTime(row.receivedAt, timezone)} />
            <MetaItem label="Cards" value={String(row.linkedCardCount)} />
            <MetaItem label="Upload" value={row.artifactSummary ?? (row.artifactCount > 0 ? `${row.artifactCount} file${row.artifactCount === 1 ? "" : "s"}` : "None")} />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/app/sources/${row.id}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-moss"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Review source
            </Link>
            {row.reviewState.filter === "failed" ? (
              <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 text-sm font-semibold text-coral">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Needs attention
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function FilterChip({
  label,
  count,
  tone
}: {
  label: string;
  count: number;
  tone: SourceReviewTone;
}) {
  return (
    <div className={cn("inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold", chipToneClass(tone))}>
      <span>{label}</span>
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/80 px-1 text-xs">{count}</span>
    </div>
  );
}

function StatusBadge({ state }: { state: SourceReviewState }) {
  return (
    <span className={cn("inline-flex min-h-8 shrink-0 items-center gap-2 rounded-md border px-2 text-xs font-semibold", chipToneClass(state.tone))}>
      {state.filter === "created_cards" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {state.label}
    </span>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-cream px-3 py-2">
      <dt className="font-semibold text-clay">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}

function countByFilter(rows: SourceInboxRow[]): Record<SourceReviewFilter, number> {
  return rows.reduce<Record<SourceReviewFilter, number>>(
    (counts, row) => {
      counts[row.reviewState.filter] += 1;
      return counts;
    },
    {
      needs_review: 0,
      reading: 0,
      created_cards: 0,
      no_cards: 0,
      failed: 0
    }
  );
}

function sourceTypeLabel(sourceType: string) {
  if (sourceType === "paste") return "Pasted text";
  if (sourceType === "upload") return "Uploaded file";
  return sourceType.replace("_", " ");
}

function chipToneClass(tone: SourceReviewTone) {
  if (tone === "moss") return "border-moss/20 bg-sage text-moss";
  if (tone === "sky") return "border-[#9cc8d5]/40 bg-sky text-[#1f5a85]";
  if (tone === "amber") return "border-amber/30 bg-amber/10 text-amber";
  if (tone === "coral") return "border-coral/30 bg-coral/10 text-coral";
  return "border-line bg-cream text-graphite";
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(value));
}
