import { z } from "zod";

const resendSenderSchema = z.string().refine(
  (value) => {
    const trimmed = value.trim();
    return /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(trimmed)
      || /^.+ <[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(trimmed);
  },
  "RESEND_FROM_EMAIL must be an email address or 'Name <email@example.com>'."
);

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  JOB_BATCH_SIZE: z.coerce.number().int().positive().max(50).default(5),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
  NEXT_PUBLIC_POSTHOG_UI_HOST: z.string().url().default("https://us.posthog.com"),
  COVERAGE_REQUEST_TOKEN_SECRET: z.string().min(16).optional(),
  COVERAGE_REQUEST_SENDER: z.enum(["local-stub", "resend"]).default("local-stub"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: resendSenderSchema.default("FamTandem <coverage@updates.famtandem.com>"),
  RESEND_REPLY_TO_EMAIL: z.string().optional(),
  HOUSEHOLD_NOTIFICATION_SENDER: z.enum(["local-stub", "resend"]).default("local-stub"),
  GOOGLE_CALENDAR_EXPORTER: z.enum(["disabled", "google"]).default("disabled"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_TOKEN_SECRET: z.string().min(16).optional(),
  ARTIFACT_TEXT_PROVIDER: z.enum(["disabled", "gemini"]).default("disabled"),
  ARTIFACT_TEXT_MODEL: z.string().default("gemini-3.5-flash"),
  EXTRACTION_PROVIDER: z.enum(["local-stub", "gemini"]).default("local-stub"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash")
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  return serverEnvSchema.parse(env);
}
