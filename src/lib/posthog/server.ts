import "server-only";
import { PostHog } from "posthog-node";
import { getServerEnv } from "@/lib/env";
import type { AnalyticsEventName, AnalyticsProperties } from "@/lib/posthog/events";

let posthogClient: PostHog | null = null;

function getPostHogClient() {
  const env = getServerEnv();

  if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null;
  }

  posthogClient ??= new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0
  });

  return posthogClient;
}

export async function captureServerEvent(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
  distinctId = "server",
  options: { eventId?: string } = {}
) {
  const client = getPostHogClient();

  if (!client) {
    return;
  }

  await client.captureImmediate({
    distinctId,
    event,
    properties,
    ...(options.eventId ? { uuid: options.eventId } : {})
  });
}
