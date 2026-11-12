import { NextRequest, NextResponse } from "next/server";
import { respondToCoverageRequestToken } from "@/lib/coverage-requests/read";
import {
  isCoverageResponseCompletionStatus,
  signCoverageResponseCompletionStatus
} from "@/lib/coverage-requests/response-status";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";

type RouteContext = {
  params: Promise<{ token: string }>;
};

const responseValues = [
  "accept_dropoff",
  "accept_pickup",
  "accept_both",
  "decline"
] as const;

type CoverageResponse = (typeof responseValues)[number];

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  let response: CoverageResponse | null = null;

  try {
    const formData = await request.formData();
    response = coverageResponseValue(formData);
  } catch {
    return NextResponse.redirect(statusUrl(request, token, "unavailable"), 303);
  }

  if (!token || !response) {
    return NextResponse.redirect(statusUrl(request, token, "unavailable"), 303);
  }

  const result = await respondToCoverageRequestToken(token, response);

  if (result.cardId && result.tokenId && ["accepted", "declined"].includes(result.status)) {
    await captureServerEvent(
      result.status === "declined"
        ? analyticsEvents.coverageRequestDeclined
        : analyticsEvents.coverageRequestAccepted,
      {
        card_id: result.cardId,
        request_token_id: result.tokenId,
        response_source: "submit_route",
        response_value: response,
        status: result.status
      },
      result.tokenId
    ).catch((error) => {
      console.warn("Coverage response analytics capture failed", {
        event:
          result.status === "declined"
            ? analyticsEvents.coverageRequestDeclined
            : analyticsEvents.coverageRequestAccepted,
        reason: error instanceof Error ? error.message : "unknown"
      });
    });
  }

  const statusProof =
    result.tokenId && isCoverageResponseCompletionStatus(result.status)
      ? signCoverageResponseCompletionStatus({ status: result.status, token, tokenId: result.tokenId })
      : undefined;

  return NextResponse.redirect(statusUrl(request, token, result.status, statusProof), 303);
}

function coverageResponseValue(formData: FormData): CoverageResponse | null {
  const value = String(formData.get("response") ?? "").trim();
  return responseValues.includes(value as CoverageResponse) ? (value as CoverageResponse) : null;
}

function statusUrl(request: NextRequest, token: string, status: string, statusProof?: string) {
  const safeToken = token ? encodeURIComponent(token) : "";
  const url = new URL(`/respond/coverage/${safeToken}?status=${encodeURIComponent(status)}`, request.url);

  if (statusProof) {
    url.searchParams.set("statusProof", statusProof);
  }

  return url;
}
