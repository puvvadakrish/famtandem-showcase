import "server-only";
import type {
  CoverageRequestSendInput,
  CoverageRequestSendResult,
  CoverageRequestSender
} from "@/lib/coverage-requests/senders/types";

export class LocalCoverageRequestSender implements CoverageRequestSender {
  async send(input: CoverageRequestSendInput): Promise<CoverageRequestSendResult> {
    return {
      provider: "local-stub",
      providerMessageId: `local-stub:${input.requestTokenId}:${input.channel}`,
      status: "stubbed"
    };
  }
}
