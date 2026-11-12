import {
  buildValidationSnapshot,
  type ValidationCardRow,
  type ValidationCoverageRequestRow,
  type ValidationHouseholdRow,
  type ValidationResponseRow,
  type ValidationSlotRow,
  type ValidationSourceRow
} from "@/lib/validation-snapshot";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient
} from "@/lib/supabase/server";
import type { CoverageSlotState } from "@/lib/types";

type RelatedHousehold = { household_id: string } | { household_id: string }[] | null;
type RelatedRequestToken = { household_id: string } | { household_id: string }[] | null;
type RelatedCoverageRequest =
  | { coverage_request_tokens: RelatedRequestToken }
  | { coverage_request_tokens: RelatedRequestToken }[]
  | null;

type RawSlotRow = {
  state: CoverageSlotState;
  coverage_cards: RelatedHousehold;
};

type RawResponseRow = {
  response: ValidationResponseRow["response"];
  responded_at: string;
  coverage_requests: RelatedCoverageRequest;
};

type RawCoverageRequestRow = {
  created_at: string;
  coverage_request_tokens: RelatedRequestToken;
};

export async function currentUserIsInternalAdmin(
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

export async function loadValidationSnapshotAfterAdminGate() {
  const adminSupabase = createSupabaseServiceClient();
  const [
    householdsResult,
    sourcesResult,
    cardsResult,
    slotsResult,
    coverageRequestsResult,
    responsesResult
  ] = await Promise.all([
    adminSupabase
      .from("households")
      .select("id, name, created_at")
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("source_inputs")
      .select("household_id, source_type, status, created_at")
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("coverage_cards")
      .select("household_id, computed_coverage_state, confidence, review_reason, source_input_id, created_at")
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("coverage_slots")
      .select("state, coverage_cards(household_id)")
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("coverage_requests")
      .select("created_at, coverage_request_tokens(household_id)")
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("coverage_responses")
      .select("response, responded_at, coverage_requests(coverage_request_tokens(household_id))")
      .order("responded_at", { ascending: false })
  ]);

  if (householdsResult.error) throw new Error(householdsResult.error.message);
  if (sourcesResult.error) throw new Error(sourcesResult.error.message);
  if (cardsResult.error) throw new Error(cardsResult.error.message);
  if (slotsResult.error) throw new Error(slotsResult.error.message);
  if (coverageRequestsResult.error) throw new Error(coverageRequestsResult.error.message);
  if (responsesResult.error) throw new Error(responsesResult.error.message);

  return buildValidationSnapshot({
    households: (householdsResult.data ?? []) as ValidationHouseholdRow[],
    sources: (sourcesResult.data ?? []) as ValidationSourceRow[],
    cards: (cardsResult.data ?? []) as ValidationCardRow[],
    slots: ((slotsResult.data ?? []) as RawSlotRow[]).map(mapSlot),
    coverageRequests: ((coverageRequestsResult.data ?? []) as RawCoverageRequestRow[]).map(mapCoverageRequest),
    responses: ((responsesResult.data ?? []) as RawResponseRow[]).map(mapResponse)
  });
}

function mapSlot(row: RawSlotRow): ValidationSlotRow {
  return {
    state: row.state,
    household_id: one(row.coverage_cards)?.household_id ?? null
  };
}

function mapCoverageRequest(row: RawCoverageRequestRow): ValidationCoverageRequestRow {
  return {
    created_at: row.created_at,
    household_id: one(row.coverage_request_tokens)?.household_id ?? null
  };
}

function mapResponse(row: RawResponseRow): ValidationResponseRow {
  const request = one(row.coverage_requests);
  const token = one(request?.coverage_request_tokens ?? null);

  return {
    response: row.response,
    responded_at: row.responded_at,
    household_id: token?.household_id ?? null
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
