export function isAuthorizedCronRequest(headers: Headers, cronSecret: string) {
  const authHeader = headers.get("authorization");
  const cronHeader = headers.get("x-cron-secret");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");

  return bearerToken === cronSecret || cronHeader === cronSecret;
}
