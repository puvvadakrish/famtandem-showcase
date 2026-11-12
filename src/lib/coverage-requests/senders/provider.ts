import "server-only";
import { getServerEnv } from "@/lib/env";
import { LocalCoverageRequestSender } from "@/lib/coverage-requests/senders/local-stub";
import { ResendCoverageRequestSender } from "@/lib/coverage-requests/senders/resend";
import type {
  CoverageRequestChannel,
  CoverageRequestSender
} from "@/lib/coverage-requests/senders/types";

export function selectCoverageRequestSender(channel: CoverageRequestChannel): CoverageRequestSender {
  if (channel !== "email") {
    return new LocalCoverageRequestSender();
  }

  const env = getServerEnv();
  if (env.COVERAGE_REQUEST_SENDER === "resend") {
    if (!env.RESEND_API_KEY?.trim()) {
      throw new Error("RESEND_API_KEY is required when COVERAGE_REQUEST_SENDER=resend.");
    }

    return new ResendCoverageRequestSender({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      replyTo: env.RESEND_REPLY_TO_EMAIL
    });
  }

  return new LocalCoverageRequestSender();
}
