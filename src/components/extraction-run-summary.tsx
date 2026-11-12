import { sourceProcessingErrorMessage } from "@/lib/source-processing-errors";

export type ExtractionRunSummaryData = {
  id: string;
  provider: string;
  model: string;
  schemaVersion: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped_no_text";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  reviewReasons: string[];
  noActionReason: string | null;
  cardCount: number;
  startedAt: string | null;
  finishedAt: string | null;
};

type ExtractionRunSummaryProps = {
  run: ExtractionRunSummaryData | null;
  timezone: string;
};

export function ExtractionRunSummary({ run, timezone }: ExtractionRunSummaryProps) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Extraction run</h2>
        {run ? (
          <span className="inline-flex min-h-8 items-center rounded-md border border-line bg-cream px-2 py-1 text-xs font-semibold text-graphite">
            {statusLabel(run.status)}
          </span>
        ) : null}
      </div>

      {run ? (
        <div className="mt-3 space-y-4">
          <dl className="space-y-3 text-sm">
            <Fact label="Provider" value={run.provider} />
            <Fact label="Model" value={run.model} />
            <Fact label="Schema" value={run.schemaVersion} />
            <Fact label="Attempts" value={`${run.attempts} / ${run.maxAttempts}`} />
            <Fact
              label="Cards created"
              value={`${run.cardCount} card${run.cardCount === 1 ? "" : "s"}`}
            />
            <Fact label="Started" value={formatOptionalDateTime(run.startedAt, timezone)} />
            <Fact label="Finished" value={formatOptionalDateTime(run.finishedAt, timezone)} />
          </dl>

          {run.reviewReasons.length > 0 ? (
            <div className="rounded-md border border-line bg-cream p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-clay">
                Review reasons
              </p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-graphite">
                {run.reviewReasons.map((reason, index) => (
                  <li key={`${reason}-${index}`}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {run.noActionReason ? (
            <Message label="No action reason" value={run.noActionReason} />
          ) : null}

          {run.lastError ? (
            <Message
              label="Latest issue"
              value={sourceProcessingErrorMessage(run.lastError, "extraction") ?? ""}
              tone="error"
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line bg-cream p-3 text-sm text-graphite">
          No extraction run has been recorded for this source yet.
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-normal text-clay">{label}</dt>
      <dd className="mt-1 break-words text-graphite">{value}</dd>
    </div>
  );
}

function Message({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-md border border-red-100 bg-red-50 p-3"
          : "rounded-md border border-line bg-cream p-3"
      }
    >
      <p
        className={
          tone === "error"
            ? "text-xs font-semibold uppercase tracking-normal text-coral"
            : "text-xs font-semibold uppercase tracking-normal text-clay"
        }
      >
        {label}
      </p>
      <p className="mt-2 break-words text-sm leading-6 text-graphite">{value}</p>
    </div>
  );
}

function statusLabel(status: ExtractionRunSummaryData["status"]) {
  return status.replaceAll("_", " ");
}

function formatOptionalDateTime(value: string | null, timezone: string) {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}
