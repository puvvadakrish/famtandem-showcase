import "server-only";
import { getServerEnv } from "@/lib/env";
import {
  generateCoverageRequestToken,
  hashCoverageRequestToken
} from "@/lib/coverage-requests/token";
import { selectCoverageRequestSender } from "@/lib/coverage-requests/senders/provider";
import type { CoverageRequestChannel } from "@/lib/coverage-requests/senders/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateCoverageRequestInput = {
  supabase: SupabaseClient;
  cardId: string;
  slotIds: string[];
  channel: CoverageRequestChannel;
  requestedMemberId?: string | null;
  requestedExternalContactId?: string | null;
  externalDisplayName?: string | null;
  externalEmail?: string | null;
  externalPhone?: string | null;
  note?: string | null;
  recipientLabel: string;
  recipientDestination?: string | null;
};

type CreateCoverageRequestRow = {
  request_token_id: string;
  request_ids: string[];
  expires_at: string;
};

export async function createCoverageRequestWithStubSend({
  supabase,
  cardId,
  slotIds,
  channel,
  requestedMemberId,
  requestedExternalContactId,
  externalDisplayName,
  externalEmail,
  externalPhone,
  note,
  recipientLabel,
  recipientDestination
}: CreateCoverageRequestInput) {
  const sender = selectCoverageRequestSender(channel);
  const token = generateCoverageRequestToken();
  const tokenHash = hashCoverageRequestToken(token);

  const { data, error } = await supabase
    .rpc("create_coverage_request", {
      p_card_id: cardId,
      p_slot_ids: slotIds,
      p_token_hash: tokenHash,
      p_channel: channel,
      p_requested_member_id: requestedMemberId ?? null,
      p_requested_external_contact_id: requestedExternalContactId ?? null,
      p_external_display_name: externalDisplayName ?? null,
      p_external_email: externalEmail ?? null,
      p_external_phone: externalPhone ?? null,
      p_note: note ?? null
    })
    .single<CreateCoverageRequestRow>();

  if (error) {
    throw new Error(error.message);
  }

  const env = getServerEnv();
  const responseUrl = `${env.NEXT_PUBLIC_APP_URL}/respond/coverage/${token}`;
  const sendResult = await sender.send({
    requestTokenId: data.request_token_id,
    requestIds: data.request_ids,
    channel,
    to: recipientDestination ?? null,
    recipientLabel,
    message: buildCoverageRequestMessage(responseUrl, note),
    responseUrl,
    idempotencyKey: `coverage-request/${data.request_token_id}/${channel}`,
    subject: "Coverage request from FamTandem"
  });

  const { error: markError } = await supabase.rpc("mark_coverage_request_sent", {
    p_request_token_id: data.request_token_id,
    p_provider: sendResult.provider,
    p_provider_message_id: sendResult.providerMessageId,
    p_status: sendResult.status
  });

  if (markError) {
    throw new Error(markError.message);
  }

  return {
    requestTokenId: data.request_token_id,
    requestIds: data.request_ids,
    expiresAt: data.expires_at,
    responseUrl,
    sendResult
  };
}

function buildCoverageRequestMessage(responseUrl: string, note?: string | null) {
  const trimmedNote = note?.trim();
  if (trimmedNote) {
    return `${trimmedNote}\n\nRespond here: ${responseUrl}`;
  }

  return `Can you cover this? Respond here: ${responseUrl}`;
}
