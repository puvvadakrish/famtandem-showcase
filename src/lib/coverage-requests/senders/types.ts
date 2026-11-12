export type CoverageRequestChannel = "sms" | "email" | "manual_link";

export type CoverageRequestSendInput = {
  requestTokenId: string;
  requestIds: string[];
  channel: CoverageRequestChannel;
  to: string | null;
  recipientLabel: string;
  message: string;
  responseUrl: string;
  idempotencyKey: string;
  subject?: string;
};

export type CoverageRequestSendResult = {
  provider: "local-stub" | "resend";
  providerMessageId: string | null;
  status: "stubbed" | "sent" | "failed";
};

export interface CoverageRequestSender {
  send(input: CoverageRequestSendInput): Promise<CoverageRequestSendResult>;
}
