import { redirect } from "next/navigation";
import { BoardShell } from "@/components/board-shell";
import { PostHogUserIdentifier } from "@/components/posthog-user-identifier";
import {
  coverageStateLabel,
  deriveAttentionFlags,
  deriveCoverageState,
  getBoardSection
} from "@/lib/coverage-state";
import { decodeManualCoverageRequestLinkFlash } from "@/lib/coverage-requests/manual-link-flash";
import { loadGoogleCalendarBoardState } from "@/lib/google-calendar/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  BoardCard,
  CardType,
  ChildSummary,
  CoverageSlotKind,
  CoverageSlotState,
  HouseholdMemberSummary,
  ReadinessStatus
} from "@/lib/types";

export const dynamic = "force-dynamic";

type HouseholdMembership = {
  id: string;
  household_id: string;
  role: "parent" | "helper" | "household_admin";
  display_name: string;
  households: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
};

type ClaimHouseholdMemberResult = {
  claimed: boolean;
  member_id: string | null;
  household_id: string | null;
  reason: string;
};

type RawMember = {
  id: string;
  display_name: string;
  role: "parent" | "helper" | "household_admin";
  email?: string | null;
  user_id?: string | null;
};

export default async function AppBoardPage({
  searchParams
}: {
  searchParams: Promise<{
    calendar?: string;
    calendarExport?: string;
    cardCount?: string;
    cardId?: string;
    cardSaved?: string;
    coverageRequestFlash?: string;
    memberId?: string;
    savedName?: string;
    setup?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const coverageRequestLinkFlash = decodeManualCoverageRequestLinkFlash(
    params.coverageRequestFlash
  );
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await loadMembership(user.id);

  if (!membership) {
    const { data: claimResult, error: claimError } = await supabase
      .rpc("claim_household_member_by_email")
      .maybeSingle<ClaimHouseholdMemberResult>();

    if (claimError) throw new Error(claimError.message);

    if (claimResult?.claimed) {
      redirect("/app");
    }
  }

  if (!membership) {
    redirect("/household/new");
  }

  const household = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;
  const householdId = membership.household_id;
  const coverageRequestLink =
    coverageRequestLinkFlash?.householdId === householdId &&
    coverageRequestLinkFlash.memberId === membership.id &&
    membership.role === "household_admin"
      ? coverageRequestLinkFlash.responseUrl
      : null;
  const membersQuery = membership.role === "household_admin"
    ? supabase
        .from("household_members")
        .select("id, display_name, role, email, user_id")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true })
    : supabase
        .from("household_members")
        .select("id, display_name, role")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true });

  const canEditCards = membership.role === "household_admin" || membership.role === "parent";
  const [membersResult, childrenResult, cardsResult, sourceCountResult, googleCalendarState] = await Promise.all([
    membersQuery,
    supabase
      .from("children")
      .select("id, display_name, grade")
      .eq("household_id", householdId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("coverage_cards")
      .select(
        "id, source_input_id, card_type, title, starts_at, ends_at, all_day, location, attention_flags, computed_coverage_state, confidence, source_summary, review_reason, source_inputs(raw_subject, normalized_text), coverage_slots(id, kind, state, owner_member_id, external_owner_text, household_members(display_name), external_contacts(display_name)), readiness_items(id, label, status, due_at, owner_member_id, external_owner_text, household_members(display_name), external_contacts(display_name)), card_children(child_id, children(display_name, grade)), card_changes(confirmation_status)"
      )
      .eq("household_id", householdId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("source_inputs")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId),
    loadGoogleCalendarBoardState({
      householdId,
      memberId: membership.id,
      canUseCalendar: canEditCards
    })
  ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (childrenResult.error) throw new Error(childrenResult.error.message);
  if (cardsResult.error) throw new Error(cardsResult.error.message);
  if (sourceCountResult.error) throw new Error(sourceCountResult.error.message);

  const rawMembers = (membersResult.data ?? []) as RawMember[];
  const members: HouseholdMemberSummary[] = rawMembers.map((member) => ({
    id: member.id,
    displayName: member.display_name,
    role: member.role,
    email: member.email ?? null,
    hasUser: typeof member.user_id === "string"
  }));

  const childProfiles: ChildSummary[] = (childrenResult.data ?? []).map((child) => ({
    id: child.id,
    displayName: child.display_name,
    grade: child.grade
  }));

  return (
    <>
      <PostHogUserIdentifier userId={user.id} />
      <BoardShell
        calendarExportStatus={calendarExportStatus(params.calendarExport)}
        canEditCards={canEditCards}
        cards={mapCards(
          cardsResult.data ?? [],
          household?.timezone ?? "America/Chicago",
          membership.role === "household_admin" || membership.role === "parent"
        )}
        childProfiles={childProfiles}
        currentMemberId={membership.id}
        googleCalendar={googleCalendarState}
        googleCalendarStatus={calendarStatus(params.calendar)}
        householdName={household?.name ?? "Your family"}
        isHouseholdAdmin={membership.role === "household_admin"}
        manualCoverageRequestLink={coverageRequestLink}
        members={members}
        onboarding={{ sourceCount: sourceCountResult.count ?? 0 }}
        saveFlash={saveFlash({
          cardCount: params.cardCount,
          cardId: params.cardId,
          cardSaved: params.cardSaved,
          memberId: params.memberId,
          savedName: params.savedName,
          setup: params.setup
        })}
        timezone={household?.timezone ?? "America/Chicago"}
      />
    </>
  );
}

async function loadMembership(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: membership, error } = await supabase
    .from("household_members")
    .select("id, household_id, role, display_name, households(name, timezone)")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle<HouseholdMembership>();

  if (error) throw new Error(error.message);
  return membership;
}

type RawRelatedName = { display_name: string } | { display_name: string }[] | null;

type RawCard = {
  id: string;
  source_input_id: string | null;
  card_type: CardType;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  attention_flags: string[] | null;
  computed_coverage_state: string;
  confidence: number | null;
  source_summary: string | null;
  review_reason: string | null;
  source_inputs:
    | { raw_subject: string | null; normalized_text: string | null }
    | { raw_subject: string | null; normalized_text: string | null }[]
    | null;
  coverage_slots: {
    id: string;
    kind: CoverageSlotKind;
    state: CoverageSlotState;
    owner_member_id: string | null;
    external_owner_text: string | null;
    household_members: RawRelatedName;
    external_contacts: RawRelatedName;
  }[];
  readiness_items: {
    id: string;
    label: string;
    status: ReadinessStatus;
    due_at: string | null;
    owner_member_id: string | null;
    external_owner_text: string | null;
    household_members: RawRelatedName;
    external_contacts: RawRelatedName;
  }[];
  card_children: {
    child_id: string;
    children: { display_name: string; grade: string | null } | { display_name: string; grade: string | null }[] | null;
  }[];
  card_changes: { confirmation_status: string }[];
};

function mapCards(rawCards: RawCard[], timezone: string, canReadFullSource: boolean): BoardCard[] {
  return rawCards
    .map((card) => {
      const input = {
        confidence: card.confidence,
        reviewReason: card.review_reason,
        hasUnconfirmedChange:
          card.card_type === "change_standalone" ||
          card.card_changes.some((change) => change.confirmation_status === "pending"),
        slots: card.coverage_slots.map((slot) => ({ state: slot.state })),
        readinessItems: card.readiness_items.map((item) => ({
          status: item.status,
          dueAt: item.due_at
        }))
      };
      const coverageState = deriveCoverageState(input);
      const attentionFlags = deriveAttentionFlags(input);
      const childNames = card.card_children
        .map((link) => one(link.children)?.display_name)
        .filter((name): name is string => Boolean(name));
      const childLink = card.card_children[0];
      const child = childNames.length > 0 ? childNames.join(", ") : "Family";

      return {
        id: card.id,
        cardType: card.card_type,
        title: card.title,
        child,
        childId: childLink?.child_id ?? null,
        childIds: card.card_children.map((link) => link.child_id),
        time: formatCardTime(card.starts_at, timezone),
        startsAt: card.starts_at,
        endsAt: card.ends_at,
        allDay: card.all_day,
        location: card.location,
        owner: ownerSummary(card.coverage_slots),
        sourceSummary: card.source_summary ?? "Manual entry",
        sourceInputId: card.source_input_id,
        sourceText: canReadFullSource ? one(card.source_inputs)?.normalized_text ?? null : null,
        coverageState,
        coverageLabel: coverageStateLabel(coverageState),
        section: getBoardSection(input),
        confidence: card.confidence,
        reviewReason: card.review_reason,
        attentionFlags,
        slots: card.coverage_slots.map((slot) => ({
          id: slot.id,
          kind: slot.kind,
          state: slot.state,
          stateLabel: slotStateLabel(slot.state),
          ownerLabel: ownerLabel(slot),
          ownerMemberId: slot.owner_member_id,
          externalOwnerText: slot.external_owner_text
        })),
        readinessItems: card.readiness_items.map((item) => ({
          id: item.id,
          label: item.label,
          status: item.status,
          dueAt: item.due_at,
          ownerLabel: ownerLabel(item),
          ownerMemberId: item.owner_member_id,
          externalOwnerText: item.external_owner_text
        }))
      };
    })
    .sort((a, b) => {
      if (a.section !== b.section) return a.section === "needs_attention" ? -1 : 1;
      return (a.startsAt ?? "").localeCompare(b.startsAt ?? "");
    });
}

function calendarStatus(value: string | undefined) {
  return [
    "connected",
    "disconnected",
    "not_configured",
    "not_allowed",
    "cancelled",
    "missing_refresh",
    "failed"
  ].includes(value ?? "")
    ? value
    : null;
}

function calendarExportStatus(value: string | undefined) {
  return ["created", "updated", "failed"].includes(value ?? "") ? value : null;
}

function saveFlash(params: {
  cardCount?: string;
  cardId?: string;
  cardSaved?: string;
  memberId?: string;
  savedName?: string;
  setup?: string;
}) {
  const setupAllowed = [
    "child_added",
    "member_added",
    "member_invited",
    "member_added_invite_failed",
    "invite_sent",
    "invite_failed",
    "member_already_joined"
  ];
  const cardAllowed = ["updated", "manual_card_created", "recurring_card_created"];

  return {
    setup: setupAllowed.includes(params.setup ?? "") ? params.setup ?? null : null,
    cardSaved: cardAllowed.includes(params.cardSaved ?? "") ? params.cardSaved ?? null : null,
    cardId: params.cardId ?? null,
    savedName: params.savedName ?? null,
    memberId: params.memberId ?? null,
    cardCount: Number(params.cardCount ?? 0) || null
  };
}

function formatCardTime(value: string | null, timezone: string) {
  if (!value) return "Time not set";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

function ownerSummary(slots: RawCard["coverage_slots"]) {
  if (slots.length === 0) return "No coverage slot";

  return slots.map((slot) => `${slotKindLabel(slot.kind)}: ${ownerLabel(slot)}`).join(" · ");
}

function ownerLabel(record: {
  state?: CoverageSlotState;
  external_owner_text: string | null;
  household_members: RawRelatedName;
  external_contacts: RawRelatedName;
}) {
  const memberName = one(record.household_members)?.display_name;
  const contactName = one(record.external_contacts)?.display_name;

  if (memberName) return memberName;
  if (contactName) return contactName;
  if (record.external_owner_text) return record.external_owner_text;
  if (record.state === "requested") return "Request pending";
  if (record.state === "declined") return "Declined";
  if (record.state === "cancelled") return "Cancelled";

  return "Needs an owner";
}

function one<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
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

function slotStateLabel(state: CoverageSlotState) {
  const labels: Record<CoverageSlotState, string> = {
    needs_coverage: "Needs coverage",
    requested: "Requested",
    accepted: "Accepted",
    declined: "Declined",
    cancelled: "Cancelled",
    covered_external: "Covered outside FamTandem"
  };

  return labels[state];
}
