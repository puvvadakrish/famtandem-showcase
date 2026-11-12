#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const command = process.argv.slice(2);

if (command.length === 0) {
  console.error("Usage: node scripts/with-local-supabase-env.mjs <command> [args...]");
  process.exit(1);
}

const status = spawnSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8"
});

if (status.status !== 0) {
  process.stderr.write(status.stderr);
  console.error("Could not read local Supabase env. Is `npx supabase start` running?");
  process.exit(status.status ?? 1);
}

const supabaseEnv = parseSupabaseEnv(status.stdout);
const allowLiveProviders = process.env.ALLOW_LIVE_PROVIDERS === "1";
const env = {
  ...process.env,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseEnv.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseEnv.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseEnv.SERVICE_ROLE_KEY,
  CRON_SECRET: process.env.CRON_SECRET ?? "local-development-cron-secret",
  EXTRACTION_PROVIDER: allowLiveProviders ? process.env.EXTRACTION_PROVIDER ?? "local-stub" : "local-stub",
  COVERAGE_REQUEST_SENDER: allowLiveProviders ? process.env.COVERAGE_REQUEST_SENDER ?? "local-stub" : "local-stub",
  ARTIFACT_TEXT_PROVIDER: allowLiveProviders ? process.env.ARTIFACT_TEXT_PROVIDER ?? "disabled" : "disabled",
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
};

const result = spawnSync(command[0], command.slice(1), {
  env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);

function parseSupabaseEnv(output) {
  const parsed = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) parsed[match[1]] = match[2];
  }

  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (!parsed[key]) {
      throw new Error(`Supabase status output did not include ${key}.`);
    }
  }

  return parsed;
}
