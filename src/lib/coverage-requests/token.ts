import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export function generateCoverageRequestToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCoverageRequestToken(token: string) {
  const env = getServerEnv();
  const secret = env.COVERAGE_REQUEST_TOKEN_SECRET ?? env.CRON_SECRET;

  return createHmac("sha256", secret).update(token).digest("hex");
}
