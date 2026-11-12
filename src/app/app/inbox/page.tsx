import { notFound, redirect } from "next/navigation";
import { SourceInbox, type SourceInboxRow } from "@/components/source-inbox";
import {
  deriveSourceReviewState,
  type SourceArtifactReviewStatus,
  type SourceReviewExtractionRun
} from "@/lib/source-review-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SourceInputStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type HouseholdMembership = {
  id: string;
  household_id: string;
  role: "parent" | "helper" | "household_admin";
  display_name: string;
  households: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
};

type SourceInputRow = {
  id: string;
  source_type: string;
  raw_subject: string | null;
  status: SourceInputStatus;
  received_at: string;
  created_at: string;
  updated_at: string;
};

type CoverageCardRow = {
  id: string;
  source_input_id: string | null;
};

type ExtractionRunRow = {
  source_input_id: string;
  status: SourceReviewExtractionRun["status"];
  card_count: number;
};

type SourceArtifactRow = {
  source_input_id: string;
  original_file_name: string;
  mime_type: string;
  text_extraction_status: SourceArtifactReviewStatus;
};

export default async function SourceInboxPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("id, household_id, role, display_name, households(name, timezone)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle<HouseholdMembership>();

  if (membershipError) throw new Error(membershipError.message);
  if (!membership) {
    redirect("/household/new");
  }

  if (membership.role !== "parent" && membership.role !== "household_admin") {
    notFound();
  }

  const household = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;
  const householdName = household?.name ?? "Your family";
  const timezone = household?.timezone ?? "America/Chicago";

  const sourcesResult = await supabase
    .from("source_inputs")
    .select("id, source_type, raw_subject, status, received_at, created_at, updated_at")
    .eq("household_id", membership.household_id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (sourcesResult.error) throw new Error(sourcesResult.error.message);

  const sources = (sourcesResult.data ?? []) as SourceInputRow[];
  let cards: CoverageCardRow[] = [];
  let runs: ExtractionRunRow[] = [];
  let artifacts: SourceArtifactRow[] = [];

  if (sources.length > 0) {
    const sourceIds = sources.map((source) => source.id);
    const [cardsResult, runsResult, artifactsResult] = await Promise.all([
      supabase
        .from("coverage_cards")
        .select("id, source_input_id")
        .eq("household_id", membership.household_id)
        .in("source_input_id", sourceIds),
      supabase
        .from("extraction_runs")
        .select("source_input_id, status, card_count")
        .eq("household_id", membership.household_id)
        .in("source_input_id", sourceIds),
      supabase
        .from("source_artifacts")
        .select("source_input_id, original_file_name, mime_type, text_extraction_status")
        .eq("household_id", membership.household_id)
        .in("source_input_id", sourceIds)
    ]);

    if (cardsResult.error) throw new Error(cardsResult.error.message);
    if (runsResult.error) throw new Error(runsResult.error.message);
    if (artifactsResult.error) throw new Error(artifactsResult.error.message);

    cards = (cardsResult.data ?? []) as CoverageCardRow[];
    runs = (runsResult.data ?? []) as ExtractionRunRow[];
    artifacts = (artifactsResult.data ?? []) as SourceArtifactRow[];
  }

  const rows = buildSourceInboxRows({
    artifacts,
    cards,
    runs,
    sources
  });

  return (
    <SourceInbox
      householdName={householdName}
      rows={rows}
      timezone={timezone}
    />
  );
}

function buildSourceInboxRows({
  artifacts,
  cards,
  runs,
  sources
}: {
  artifacts: SourceArtifactRow[];
  cards: CoverageCardRow[];
  runs: ExtractionRunRow[];
  sources: SourceInputRow[];
}): SourceInboxRow[] {
  const cardCounts = countBySource(cards);
  const runsBySource = new Map(runs.map((run) => [run.source_input_id, run]));
  const artifactsBySource = groupArtifactsBySource(artifacts);

  return sources.map((source) => {
    const sourceArtifacts = artifactsBySource.get(source.id) ?? [];
    const linkedCardCount = cardCounts.get(source.id) ?? 0;
    const run = runsBySource.get(source.id) ?? null;
    const reviewState = deriveSourceReviewState({
      artifacts: sourceArtifacts.map((artifact) => ({
        textExtractionStatus: artifact.text_extraction_status
      })),
      extractionRun: run
        ? {
            cardCount: run.card_count,
            status: run.status
          }
        : null,
      linkedCardCount,
      sourceStatus: source.status,
      sourceType: source.source_type
    });

    return {
      id: source.id,
      title: source.raw_subject ?? "Untitled source",
      sourceType: source.source_type,
      sourceStatus: source.status,
      receivedAt: source.received_at ?? source.created_at,
      updatedAt: source.updated_at,
      linkedCardCount,
      artifactCount: sourceArtifacts.length,
      artifactSummary: summarizeArtifacts(sourceArtifacts),
      reviewState
    };
  });
}

function countBySource(cards: CoverageCardRow[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!card.source_input_id) continue;
    counts.set(card.source_input_id, (counts.get(card.source_input_id) ?? 0) + 1);
  }
  return counts;
}

function groupArtifactsBySource(artifacts: SourceArtifactRow[]) {
  const grouped = new Map<string, SourceArtifactRow[]>();
  for (const artifact of artifacts) {
    const group = grouped.get(artifact.source_input_id) ?? [];
    group.push(artifact);
    grouped.set(artifact.source_input_id, group);
  }
  return grouped;
}

function summarizeArtifacts(artifacts: SourceArtifactRow[]) {
  if (artifacts.length === 0) return null;
  const first = artifacts[0];
  if (artifacts.length === 1) {
    return `${first.original_file_name} · ${first.text_extraction_status.replace("_", " ")}`;
  }
  return `${artifacts.length} files · ${first.text_extraction_status.replace("_", " ")} first`;
}
