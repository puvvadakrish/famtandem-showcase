import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server env", () => {
  it("requires a strong cron secret", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "too-short");

    const { parseServerEnv } = await import("@/lib/env-core");

    expect(() => parseServerEnv(process.env)).toThrow();
  });

  it("parses the job batch size", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
    vi.stubEnv("JOB_BATCH_SIZE", "7");

    const { parseServerEnv } = await import("@/lib/env-core");

    expect(parseServerEnv(process.env).JOB_BATCH_SIZE).toBe(7);
  });

  it("validates Resend sender format when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");
    vi.stubEnv("RESEND_FROM_EMAIL", "not an email");

    const { parseServerEnv } = await import("@/lib/env-core");

    expect(() => parseServerEnv(process.env)).toThrow("RESEND_FROM_EMAIL");
  });

  it("defaults household notifications to local stub", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");

    const { parseServerEnv } = await import("@/lib/env-core");

    expect(parseServerEnv(process.env).HOUSEHOLD_NOTIFICATION_SENDER).toBe("local-stub");
  });

  it("defaults artifact OCR to disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");

    const { parseServerEnv } = await import("@/lib/env-core");
    const env = parseServerEnv(process.env);

    expect(env.ARTIFACT_TEXT_PROVIDER).toBe("disabled");
    expect(env.ARTIFACT_TEXT_MODEL).toBe("gemini-3.5-flash");
  });

  it("defaults Google Calendar export to disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CRON_SECRET", "a-long-local-cron-secret");

    const { parseServerEnv } = await import("@/lib/env-core");
    const env = parseServerEnv(process.env);

    expect(env.GOOGLE_CALENDAR_EXPORTER).toBe("disabled");
  });

  it("documents current safe provider defaults in the example env file", () => {
    const example = readFileSync(".env.example", "utf8");

    expect(example).toContain("COVERAGE_REQUEST_TOKEN_SECRET=");
    expect(example).toContain("COVERAGE_REQUEST_SENDER=local-stub");
    expect(example).toContain("HOUSEHOLD_NOTIFICATION_SENDER=local-stub");
    expect(example).toContain("GOOGLE_CALENDAR_EXPORTER=disabled");
    expect(example).toContain("EXTRACTION_PROVIDER=local-stub");
    expect(example).toContain("ARTIFACT_TEXT_PROVIDER=disabled");
    expect(example).toContain("ARTIFACT_TEXT_MODEL=gemini-3.5-flash");
  });
});
