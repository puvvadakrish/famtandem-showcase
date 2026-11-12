import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type ManualCoverageRequestLinkFlash = {
  householdId: string;
  memberId: string;
  requestTokenId: string;
  responseUrl: string;
};

export function encodeManualCoverageRequestLinkFlash(payload: ManualCoverageRequestLinkFlash) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decodeManualCoverageRequestLinkFlash(value: string | undefined) {
  if (!value) return null;
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<ManualCoverageRequestLinkFlash>;

    if (
      !parsed.householdId ||
      !parsed.memberId ||
      !parsed.requestTokenId ||
      !parsed.responseUrl
    ) {
      return null;
    }

    return parsed as ManualCoverageRequestLinkFlash;
  } catch {
    return null;
  }
}

function encryptionKey() {
  const secret = process.env.COVERAGE_REQUEST_TOKEN_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("COVERAGE_REQUEST_TOKEN_SECRET or CRON_SECRET is required.");
  }

  return createHash("sha256").update(secret).digest();
}
