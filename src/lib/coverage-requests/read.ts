import "server-only";
import { hashCoverageRequestToken } from "@/lib/coverage-requests/token";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type CoverageRequestView = {
  tokenId: string | null;
  tokenStatus: string;
  expiresAt: string | null;
  cardId: string | null;
  cardTitle: string | null;
  startsAt: string | null;
  householdTimezone: string | null;
  location: string | null;
  requesterLabel: string | null;
  recipientLabel: string | null;
  note: string | null;
  requests: {
    requestId: string;
    slotId: string;
    slotKind: string;
    slotState: string;
    requestStatus: string;
  }[];
};

type CoverageRequestViewRow = {
  token_id: string | null;
  token_status: string;
  expires_at: string | null;
  card_id: string | null;
  card_title: string | null;
  starts_at: string | null;
  household_timezone: string | null;
  location: string | null;
  requester_label: string | null;
  recipient_label: string | null;
  note: string | null;
  requests: CoverageRequestView["requests"] | null;
};

type CoverageRequestResponseRow = {
  token_id: string | null;
  response_status: string;
  card_id: string | null;
};

export async function getCoverageRequestView(token: string): Promise<CoverageRequestView> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("get_coverage_request_by_token_hash", {
      p_token_hash: hashCoverageRequestToken(token)
    })
    .single<CoverageRequestViewRow>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    tokenId: data.token_id,
    tokenStatus: data.token_status,
    expiresAt: data.expires_at,
    cardId: data.card_id,
    cardTitle: data.card_title,
    startsAt: data.starts_at,
    householdTimezone: data.household_timezone,
    location: data.location,
    requesterLabel: data.requester_label,
    recipientLabel: data.recipient_label,
    note: data.note,
    requests: data.requests ?? []
  };
}

export async function respondToCoverageRequestToken(
  token: string,
  response: "accept_dropoff" | "accept_pickup" | "accept_both" | "decline"
) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("respond_to_coverage_request", {
      p_token_hash: hashCoverageRequestToken(token),
      p_response: response
    })
    .single<CoverageRequestResponseRow>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    tokenId: data.token_id,
    status: data.response_status,
    cardId: data.card_id
  };
}
