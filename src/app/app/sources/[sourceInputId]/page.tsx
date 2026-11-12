import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, FileUp, ShieldCheck, UsersRound } from "lucide-react";
import {
  ExtractionRunSummary,
  type ExtractionRunSummaryData
} from "@/components/extraction-run-summary";
import { approveUploadExtractedText, retryFailedExtractionRun } from "@/app/app/actions";
import { emptyLinkedCardsMessage } from "@/lib/source-detail-state";
import { sourceProcessingErrorMessage } from "@/lib/source-processing-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CardType, CoverageSlotKind, CoverageSlotState, SourceInputStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sourceInputId: string }>;
};

type HouseholdMembership = {
  id: string;
  household_id: string;
  role: "parent" | "helper" | "household_admin";
  display_name: string;
  households: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
};

type SourceInput = {
  id: string;
  submitted_by: string | null;
  source_type: string;
  raw_subject: string | null;
  normalized_text: string | null;
  status: SourceInputStatus;
  provider_event_id: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};

type LinkedCard = {
  id: string;
  card_type: CardType;
  title: string;
  starts_at: string | null;
  location: string | null;
  confidence: number | null;
  computed_coverage_state: string;
  review_reason: string | null;
  source_summary: string | null;
  coverage_slots: { kind: CoverageSlotKind; state: CoverageSlotState }[];
  readiness_items: { label: string; status: string }[];
};

type SourceArtifact = {
  id: string;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  text_extraction_status: string;
  text_extraction_error: string | null;
  created_at: string;
};

type ExtractionRunRow = {
  id: string;
  provider: string;
  model: string;
  schema_version: string;
  status: ExtractionRunSummaryData["status"];
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  review_reasons: unknown;
  no_action_reason: string | null;
  card_count: number;
  started_at: string | null;
  finished_at: string | null;
};

export default async function SourceInputDetailPage({ params }: PageProps) {
  const { sourceInputId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("id, household_id, role, display_name, households(name, timezone)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle<HouseholdMembership>();

  if (!membership) {
    redirect("/household/new");
  }

  if (membership.role !== "parent" && membership.role !== "household_admin") {
    notFound();
  }

  const { data: source, error: sourceError } = await supabase
    .from("source_inputs")
    .select("id, submitted_by, source_type, raw_subject, normalized_text, status, provider_event_id, received_at, created_at, updated_at")
    .eq("id", sourceInputId)
    .eq("household_id", membership.household_id)
    .maybeSingle<SourceInput>();

  if (sourceError) throw new Error(sourceError.message);
  if (!source) notFound();

  const [submitterResult, cardsResult, artifactsResult, extractionRunResult] = await Promise.all([
    source.submitted_by
      ? supabase
          .from("household_members")
          .select("display_name")
          .eq("id", source.submitted_by)
          .eq("household_id", membership.household_id)
          .maybeSingle<{ display_name: string }>()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("coverage_cards")
      .select(
        "id, card_type, title, starts_at, location, confidence, computed_coverage_state, review_reason, source_summary, coverage_slots(kind, state), readiness_items(label, status)"
      )
      .eq("household_id", membership.household_id)
      .eq("source_input_id", source.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("source_artifacts")
      .select("id, original_file_name, mime_type, file_size_bytes, text_extraction_status, text_extraction_error, created_at")
      .eq("household_id", membership.household_id)
      .eq("source_input_id", source.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("extraction_runs")
      .select("id, provider, model, schema_version, status, attempts, max_attempts, last_error, review_reasons, no_action_reason, card_count, started_at, finished_at")
      .eq("household_id", membership.household_id)
      .eq("source_input_id", source.id)
      .maybeSingle<ExtractionRunRow>()
  ]);

  if (submitterResult.error) throw new Error(submitterResult.error.message);
  if (cardsResult.error) throw new Error(cardsResult.error.message);
  if (artifactsResult.error) throw new Error(artifactsResult.error.message);
  if (extractionRunResult.error) throw new Error(extractionRunResult.error.message);

  const household = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;
  const timezone = household?.timezone ?? "America/Chicago";
  const linkedCards = (cardsResult.data ?? []) as LinkedCard[];
  const artifacts = (artifactsResult.data ?? []) as SourceArtifact[];
  const extractionRun = mapExtractionRun(extractionRunResult.data);
  const isInternalAdmin = await currentUserIsInternalAdmin(supabase, user.id);
  const primaryCard = linkedCards[0];
  const confidence = primaryCard?.confidence;
  const reviewableArtifact = source.source_type === "upload"
    ? artifacts.find((artifact) => artifact.text_extraction_status === "needs_review")
    : undefined;
  const canApproveExtractedText = Boolean(
    reviewableArtifact
    && source.normalized_text
    && linkedCards.length === 0
  );

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto min-h-dvh w-full max-w-6xl border-x border-line bg-[#fffdf8]">
        <header className="border-b border-line bg-cream px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href="/app"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to board
              </Link>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h1 className="min-w-0 break-words text-2xl font-semibold text-ink">
                  {source.raw_subject ?? "Source detail"}
                </h1>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  {household?.name ?? "Your family"}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
                The original details stay attached so the family can trust what changed, what is uncovered, and who owns it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Source-backed</Badge>
              <Badge>{source.source_type.replace("_", " ")}</Badge>
              <Badge>{source.status.replace("_", " ")}</Badge>
              <Badge>
                {linkedCards.length} linked card{linkedCards.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
        </header>

        <div className="grid gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="space-y-4 self-start">
          <div className="rounded-lg border border-line bg-white p-4 shadow-inset">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-sky text-[#1f5a85]">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">From {source.raw_subject ?? "pasted source"}</p>
                  <p className="text-xs text-graphite">{formatDateTime(source.received_at, timezone)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-sage px-2 py-1 text-xs font-semibold text-moss">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Source-backed
                </span>
                {typeof confidence === "number" ? (
                  <span className="rounded-md bg-cream px-2 py-1 text-xs font-semibold text-graphite">
                    Confidence {Math.round(confidence * 100)}%
                  </span>
                ) : null}
              </div>
            </div>

            {primaryCard ? (
              <div className="mt-4 rounded-lg border border-line bg-cream p-4">
                <p className="text-xs font-semibold text-clay">{primaryCard.card_type.replace("_", " ")}</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">{primaryCard.title}</h2>
                <p className="mt-2 text-sm leading-6 text-graphite">
                  {formatCardTime(primaryCard.starts_at, timezone)}
                  {primaryCard.location ? ` · ${primaryCard.location}` : ""}
                </p>
                <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-graphite">
                  <p className="font-semibold text-ink">Coverage</p>
                  {primaryCard.coverage_slots.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {primaryCard.coverage_slots.map((slot, index) => (
                        <li key={`${slot.kind}-${index}`}>
                          {slotKindLabel(slot.kind)}: {slot.state.replace("_", " ")}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1">No coverage slots are attached.</p>
                  )}
                </div>
                {primaryCard.review_reason ? (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-coral">
                    {primaryCard.review_reason}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

        {artifacts.length > 0 ? (
          <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
            <div className="flex items-center gap-2 text-moss">
              <FileUp className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Uploaded files</h2>
            </div>
            <div className="mt-4 space-y-3">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-md border border-line bg-cream p-3 text-sm">
                  <p className="break-words font-semibold text-ink">{artifact.original_file_name}</p>
                  <p className="mt-1 text-graphite">
                    {artifact.mime_type} · {formatBytes(artifact.file_size_bytes)} · {artifact.text_extraction_status.replace("_", " ")}
                  </p>
                  {artifact.text_extraction_error ? (
                    <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-coral">
                      {sourceProcessingErrorMessage(artifact.text_extraction_error, "artifact_text")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
          <div className="flex items-center gap-2 text-moss">
            <FileText className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">
              {source.source_type === "upload" ? "Extracted text" : "Original text"}
            </h2>
          </div>
          {canApproveExtractedText && reviewableArtifact ? (
            <form action={approveUploadExtractedText} className="mt-4 space-y-3">
              <input type="hidden" name="sourceInputId" value={source.id} />
              <input type="hidden" name="sourceArtifactId" value={reviewableArtifact.id} />
              <textarea
                aria-label="Extracted text"
                name="approvedText"
                defaultValue={source.normalized_text ?? ""}
                className="min-h-80 w-full resize-y rounded-md border border-line bg-cream p-4 text-sm leading-6 text-graphite outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
                required
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-moss"
              >
                Approve and create cards
              </button>
            </form>
          ) : (
            <pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-cream p-4 text-sm leading-6 text-graphite">
              {source.normalized_text ?? "No normalized text is stored for this source yet."}
            </pre>
          )}
        </section>
        </section>

        <aside className="space-y-4">
          <ExtractionRunSummary run={extractionRun} timezone={timezone} />

          {isInternalAdmin && extractionRun?.status === "failed" ? (
            <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
              <h2 className="text-lg font-semibold text-ink">Internal admin</h2>
              <p className="mt-2 text-sm leading-6 text-graphite">
                Retry this failed extraction run and queue one new extraction job.
              </p>
              <form action={retryFailedExtractionRun} className="mt-3">
                <input type="hidden" name="sourceInputId" value={source.id} />
                <input type="hidden" name="extractionRunId" value={extractionRun.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-moss"
                >
                  Retry extraction
                </button>
              </form>
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
            <div className="flex items-center gap-2 text-moss">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Review facts</h2>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <Fact label="Submitted by" value={submitterResult.data?.display_name ?? "Unknown"} />
              <Fact label="Source type" value={source.source_type.replace("_", " ")} />
              <Fact label="Received" value={formatDateTime(source.received_at, timezone)} />
              <Fact label="Updated" value={formatDateTime(source.updated_at, timezone)} />
              <Fact label="Provider event" value={source.provider_event_id ?? "None"} />
              <Fact label="Artifacts" value={String(artifacts.length)} />
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
            <div className="flex items-center gap-2 text-moss">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Linked cards</h2>
            </div>
            <div className="mt-3 space-y-3">
              {linkedCards.length === 0 ? (
                <p className="rounded-md border border-dashed border-line bg-cream p-3 text-sm text-graphite">
                  {emptyLinkedCardsMessage(extractionRun?.status ?? null)}
                </p>
              ) : (
                linkedCards.map((card) => (
                  <div key={card.id} className="rounded-md border border-line bg-cream p-3">
                    <p className="text-sm font-semibold text-ink">{card.title}</p>
                    <p className="mt-1 text-sm text-graphite">
                      {card.card_type.replace("_", " ")} · {card.computed_coverage_state.replace("_", " ")}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      {formatCardTime(card.starts_at, timezone)}
                      {card.location ? ` · ${card.location}` : ""}
                    </p>
                    {typeof card.confidence === "number" ? (
                      <p className="mt-1 text-sm text-graphite">
                        Confidence {Math.round(card.confidence * 100)}%
                      </p>
                    ) : null}
                    {card.review_reason ? (
                      <p className="mt-2 text-sm leading-6 text-graphite">{card.review_reason}</p>
                    ) : null}
                    <ul className="mt-2 space-y-1 text-sm text-graphite">
                      {card.coverage_slots.map((slot, index) => (
                        <li key={`${slot.kind}-${index}`}>
                          {slotKindLabel(slot.kind)}: {slot.state.replace("_", " ")}
                        </li>
                      ))}
                      {card.readiness_items.map((item, index) => (
                        <li key={`${item.label}-${index}`}>
                          {item.label}: {item.status.replace("_", " ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
        </div>
      </div>
    </main>
  );
}

function mapExtractionRun(row: ExtractionRunRow | null): ExtractionRunSummaryData | null {
  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    schemaVersion: row.schema_version,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    reviewReasons: normalizeReviewReasons(row.review_reasons),
    noActionReason: row.no_action_reason,
    cardCount: row.card_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

async function currentUserIsInternalAdmin(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("internal_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

function normalizeReviewReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-graphite">
      {children}
    </span>
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

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

function formatCardTime(value: string | null, timezone: string) {
  if (!value) return "Time not set";
  return formatDateTime(value, timezone);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function slotKindLabel(kind: CoverageSlotKind) {
  const labels: Record<CoverageSlotKind, string> = {
    dropoff: "Drop-off",
    pickup: "Pickup",
    stay_attend: "Stay/attend",
    bring_prep: "Bring/prep",
    general_owner: "Owner"
  };

  return labels[kind];
}
