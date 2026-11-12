import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export type CoverageResponseCompletionStatus = "accepted" | "declined";

export function isCoverageResponseCompletionStatus(
  status: string | undefined
): status is CoverageResponseCompletionStatus {
  return status === "accepted" || status === "declined";
}

export function signCoverageResponseCompletionStatus({
  status,
  token,
  tokenId
}: {
  status: CoverageResponseCompletionStatus;
  token: string;
  tokenId: string;
}) {
  return createHmac("sha256", coverageResponseStatusSecret())
    .update(`${token}\0${tokenId}\0${status}`)
    .digest("base64url");
}

export function verifyCoverageResponseCompletionStatus({
  proof,
  status,
  token,
  tokenId
}: {
  proof: string | undefined;
  status: string | undefined;
  token: string;
  tokenId: string | null;
}) {
  if (!proof || !tokenId || !isCoverageResponseCompletionStatus(status)) {
    return false;
  }

  const expected = signCoverageResponseCompletionStatus({ status, token, tokenId });
  const actualBuffer = Buffer.from(proof);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function coverageResponseStatusSecret() {
  const env = getServerEnv();
  return env.COVERAGE_REQUEST_TOKEN_SECRET ?? env.CRON_SECRET;
}
