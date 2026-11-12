import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CoverageSlotKind,
  CoverageSlotState,
  DerivedCoverageState,
  ReadinessStatus
} from "@/lib/types";
import type { UnresolvedLogisticsItem } from "@/lib/notifications/types";

type LoadUnresolvedItemsInput = {
  supabase: SupabaseClient;
  householdId: string;
  timezone: string;
  now?: Date;
  horizonDays: 2 | 7;
  dateKeys?: Set<string>;
};

export type RawUnresolvedCardRow = {
  id: string;
  household_id: string;
  title: string;
  starts_at: string | null;
  computed_coverage_state: DerivedCoverageState;
  review_reason: string | null;
  created_at: string;
  coverage_slots?: Array<{
    id: string;
    kind: CoverageSlotKind;
    state: CoverageSlotState;
  }>;
  readiness_items?: Array<{
    id: string;
    label: string;
    status: ReadinessStatus;
    due_at: string | null;
  }>;
  card_children?: Array<{
    children:
      | { display_name: string | null }
      | Array<{ display_name: string | null }>
      | null;
  }>;
};

export async function loadDailyUnresolvedItems(input: Omit<LoadUnresolvedItemsInput, "horizonDays">) {
  return loadUnresolvedItems({ ...input, horizonDays: 2 });
}

export async function loadWeeklyReviewItems(input: Omit<LoadUnresolvedItemsInput, "horizonDays">) {
  return loadUnresolvedItems({ ...input, horizonDays: 7 });
}

export async function loadWeeklyReviewItemsForPeriod(
  input: Omit<LoadUnresolvedItemsInput, "horizonDays" | "dateKeys"> & {
    periodStart: string;
    periodEnd: string;
  }
) {
  return loadUnresolvedItems({
    ...input,
    horizonDays: 7,
    dateKeys: dateKeyRange(input.periodStart, input.periodEnd)
  });
}

async function loadUnresolvedItems({
  supabase,
  householdId,
  timezone,
  now = new Date(),
  horizonDays,
  dateKeys
}: LoadUnresolvedItemsInput): Promise<UnresolvedLogisticsItem[]> {
  const { data, error } = await supabase
    .from("coverage_cards")
    .select(
      "id, household_id, title, starts_at, computed_coverage_state, review_reason, created_at, coverage_slots(id, kind, state), readiness_items(id, label, status, due_at), card_children(children(display_name))"
    )
    .eq("household_id", householdId)
    .order("starts_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Unable to load unresolved items: ${error.message}`);
  }

  return buildUnresolvedItemsFromRows({
    rows: (data ?? []) as RawUnresolvedCardRow[],
    timezone,
    now,
    horizonDays,
    dateKeys
  });
}

export function buildUnresolvedItemsFromRows({
  rows,
  timezone,
  now = new Date(),
  horizonDays,
  dateKeys
}: {
  rows: RawUnresolvedCardRow[];
  timezone: string;
  now?: Date;
  horizonDays: 2 | 7;
  dateKeys?: Set<string>;
}): UnresolvedLogisticsItem[] {
  const windowDateKeys = dateKeys ?? rollingDateKeys(now, timezone, horizonDays);

  const twoDaysAgoMs = now.getTime() - 2 * 24 * 60 * 60 * 1000;
  const items: UnresolvedLogisticsItem[] = [];

  for (const row of rows) {
    const childLabels = childLabelsFor(row);
    const cardIsInWindow = row.starts_at
      ? windowDateKeys.has(localDateKey(new Date(row.starts_at), timezone))
      : false;

    for (const slot of row.coverage_slots ?? []) {
      if (!isUnresolvedSlotState(slot.state) || !cardIsInWindow) continue;
      items.push({
        householdId: row.household_id,
        cardId: row.id,
        kind: slot.state === "requested" ? "pending_response" : "uncovered_slot",
        severity: horizonDays === 2 ? "today" : "this_week",
        title: row.title,
        startsAt: row.starts_at,
        dueAt: null,
        statusLabel: slotStatusLabel(slot.state, slot.kind),
        slotKind: slot.kind,
        childLabels,
        appHref: "/app"
      });
    }

    for (const readiness of row.readiness_items ?? []) {
      if (readiness.status !== "open" || !readiness.due_at) continue;
      const readinessDueAt = new Date(readiness.due_at);
      const readinessIsOverdue = readinessDueAt.getTime() < now.getTime();
      if (!readinessIsOverdue && !windowDateKeys.has(localDateKey(readinessDueAt, timezone))) continue;
      items.push({
        householdId: row.household_id,
        cardId: row.id,
        kind: "due_readiness",
        severity: horizonDays === 2 ? "due_soon" : "this_week",
        title: `${row.title}: ${readiness.label}`,
        startsAt: row.starts_at,
        dueAt: readiness.due_at,
        statusLabel: "Due soon",
        childLabels,
        appHref: "/app"
      });
    }

    if (row.computed_coverage_state === "changed" && cardIsInWindow) {
      items.push({
        householdId: row.household_id,
        cardId: row.id,
        kind: "changed_event",
        severity: horizonDays === 2 ? "today" : "this_week",
        title: row.title,
        startsAt: row.starts_at,
        dueAt: null,
        statusLabel: "Changed",
        childLabels,
        appHref: "/app"
      });
    }

    if (
      row.computed_coverage_state === "needs_review"
      && (cardIsInWindow || new Date(row.created_at).getTime() >= twoDaysAgoMs)
    ) {
      items.push({
        householdId: row.household_id,
        cardId: row.id,
        kind: "needs_review",
        severity: "uncertain",
        title: row.title,
        startsAt: row.starts_at,
        dueAt: null,
        statusLabel: "Needs review",
        childLabels,
        appHref: "/app"
      });
    }
  }

  return dedupeAndSort(items);
}

function isUnresolvedSlotState(state: CoverageSlotState) {
  return state === "needs_coverage" || state === "requested" || state === "declined";
}

function slotStatusLabel(state: CoverageSlotState, kind: CoverageSlotKind) {
  const slot = slotKindLabel(kind);
  if (state === "requested") return `${slot} request pending`;
  if (state === "declined") return `${slot} declined`;
  return `${slot} needs coverage`;
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

function childLabelsFor(row: RawUnresolvedCardRow) {
  const labels = new Set<string>();
  for (const relation of row.card_children ?? []) {
    const children = Array.isArray(relation.children)
      ? relation.children
      : relation.children
        ? [relation.children]
        : [];
    for (const child of children) {
      if (child?.display_name) labels.add(child.display_name);
    }
  }
  return Array.from(labels);
}

function dedupeAndSort(items: UnresolvedLogisticsItem[]) {
  const seen = new Set<string>();
  const deduped: UnresolvedLogisticsItem[] = [];
  for (const item of items) {
    const key = `${item.cardId}:${item.kind}:${item.slotKind ?? ""}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.sort((a, b) => {
    const aTime = Date.parse(a.dueAt ?? a.startsAt ?? "");
    const bTime = Date.parse(b.dueAt ?? b.startsAt ?? "");
    return safeTime(aTime) - safeTime(bTime) || kindRank(a.kind) - kindRank(b.kind);
  });
}

function kindRank(kind: UnresolvedLogisticsItem["kind"]) {
  const ranks: Record<UnresolvedLogisticsItem["kind"], number> = {
    uncovered_slot: 0,
    pending_response: 1,
    changed_event: 2,
    due_readiness: 3,
    needs_review: 4
  };
  return ranks[kind];
}

function safeTime(value: number) {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function rollingDateKeys(now: Date, timezone: string, horizonDays: 2 | 7) {
  const keys = new Set<string>();
  for (let offset = 0; offset < horizonDays; offset += 1) {
    keys.add(localDateKey(addDays(now, offset), timezone));
  }
  return keys;
}

function dateKeyRange(periodStart: string, periodEnd: string) {
  const keys = new Set<string>();
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    keys.add(cursor.toISOString().slice(0, 10));
  }
  return keys;
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
