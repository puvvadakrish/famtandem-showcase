"use client";

import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getClientEnv } from "@/lib/env-client";

let posthogInitialized = false;

export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/respond/coverage/")) {
      if (posthogInitialized) {
        posthog.opt_out_capturing();
      }
      return;
    }

    const env = getClientEnv();

    if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
      return;
    }

    if (!posthogInitialized) {
      posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host: env.NEXT_PUBLIC_POSTHOG_UI_HOST,
        autocapture: false,
        capture_pageview: false,
        capture_exceptions: true,
        person_profiles: "identified_only",
        debug: process.env.NODE_ENV === "development"
      });
      posthogInitialized = true;
    }

    posthog.opt_in_capturing();
  }, [pathname]);

  return <Provider client={posthog}>{children}</Provider>;
}
