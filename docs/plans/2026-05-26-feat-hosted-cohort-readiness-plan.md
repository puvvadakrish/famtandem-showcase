---
title: "feat: Add hosted cohort readiness"
type: feat
status: complete
date: 2026-05-26
origin: docs/ops/2026-05-25-cohort-readiness-checklist.md
---

# feat: Add Hosted Cohort Readiness

## Overview

Prepare FamTandem for a small hosted validation cohort without adding new family-facing integrations.

This slice should make the hosted environment safer to operate: env setup is explicit, cron/job processing can be verified, provider defaults remain safe, and internal admins can see operational health for jobs, extraction, upload text/OCR, notifications, and coverage-request sends.

## Context

- The first validation loop now exists on `main`: paste/upload intake, extraction runs, source-backed cards, parent correction, no-account coverage links, Resend coverage-request sending, daily unresolved nudges, weekly coverage reviews, upload text/OCR approval, and internal validation snapshot/export.
- The cohort checklist already defines the human operating loop in [docs/ops/2026-05-25-cohort-readiness-checklist.md](../ops/2026-05-25-cohort-readiness-checklist.md).
- The cron/job entrypoint is `GET /api/cron/jobs`, guarded by `CRON_SECRET`, and processes a bounded job batch.
- Real providers are opt-in:
  - `COVERAGE_REQUEST_SENDER=local-stub|resend`
  - `HOUSEHOLD_NOTIFICATION_SENDER=local-stub|resend`
  - `EXTRACTION_PROVIDER=local-stub|gemini`
  - `ARTIFACT_TEXT_PROVIDER=disabled|gemini`
- `.env.example` is behind the current server env schema and does not list every new opt-in/default env.

## Institutional Learnings To Carry Forward

- Provider sends and upload/OCR jobs need explicit timeout/failure boundaries; avoid committing local state and then leaving failures invisible.
- `SECURITY DEFINER` and admin/provider changes need executable local DB tests when auth scope changes.
- Source privacy is the primary hosted risk: helper/public token surfaces must not load raw source text, artifact rows, storage paths, extraction raw output, provider IDs, token hashes, or broad household data.
- OCR/text extraction must remain review-gated before card creation. See [upload OCR approval gated extraction](../solutions/integration-issues/upload-ocr-approval-gated-extraction-20260526.md).
- Local and E2E defaults must not call real Resend, Gemini, OCR, Twilio, Google, or any hosted provider.
- Do not run build and Playwright concurrently against the same `.next` output.

## In Scope

- [x] Refresh `.env.example` so it matches `serverEnvSchema` placeholders and safe defaults.
- [x] Add a hosted cohort runbook with Vercel/Supabase env setup, Vercel Cron setup, provider opt-in flags, rollback-to-safe-default steps, and weekly operator checks.
- [x] Add a read-only internal-admin operations snapshot for hosted health:
  - jobs by status/kind
  - oldest pending job age
  - stale running jobs
  - extraction run statuses and recent failures
  - upload artifact text extraction statuses and recent failures
  - notification run statuses and recent failures
  - coverage-request send statuses and recent failures
- [x] Keep the ops snapshot privacy-safe: no raw source text, artifact paths, raw artifact links, token hashes, provider payloads, emails, phone numbers, or source excerpts.
- [x] Link the ops snapshot from the existing internal-admin validation page.
- [x] Add focused unit tests for ops aggregation and env defaults.
- [x] Add local E2E or server/UI coverage proving non-internal admins cannot access the ops snapshot.
- [x] Update docs/QA/context docs as needed.
- [x] Run `ce-review` and read-only Cursor GPT-5.5 high before merge because this touches admin visibility, jobs, provider monitoring, and source privacy.

## Out Of Scope

- No hosted credentials committed or pasted into docs.
- No production Twilio/SMS.
- No Resend inbound, webhooks, or status callbacks.
- No Google Calendar.
- No signed downloads.
- No broad admin correction surface.
- No new provider defaults.
- No default real Gemini/OCR/Resend calls in local tests or E2E.
- No customer-facing notification preference center.
- No retention/deletion policy implementation beyond runbook notes.

## Implementation Plan

### 1. Env And Runbook

Update `.env.example` to include every current `serverEnvSchema` value, grouped by safe local defaults:

- app/Supabase
- cron/jobs
- PostHog
- coverage request sending
- household notification sending
- extraction/card creation
- upload OCR/artifact text extraction
- future placeholders that remain unused

Add a hosted runbook, likely `docs/ops/2026-05-26-hosted-cohort-readiness-runbook.md`, covering:

- Vercel env var checklist.
- Supabase project setup expectations and migration/reset warning.
- Vercel Cron configuration for `GET /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET`.
- Provider enablement matrix:
  - cohort safest default: coverage request Resend optional, notification emails local-stub/manual unless explicitly enabled, Gemini extraction optional, OCR disabled unless explicitly enabled.
  - rollback: set sender/provider env back to local-stub/disabled and redeploy.
- Weekly cohort operator checklist:
  - validation snapshot/export
  - ops snapshot
  - failed/stale jobs
  - failed extractions
  - failed upload text/OCR
  - failed/sent notification runs
  - coverage request send failures
  - provider quota/cost dashboards outside the app
- Privacy reminders and consent boundary: avoid medical/legal/financial/custody records.

### 2. Internal Ops Snapshot Data

Add a server-only aggregation module, likely `src/lib/ops-snapshot.ts` and `src/lib/ops-snapshot-data.ts`.

The snapshot should use service-role reads only after `currentUserIsInternalAdmin` passes.

Suggested fields:

```ts
type OpsSnapshot = {
  generatedAt: string;
  jobs: {
    byStatus: Array<{ label: string; count: number }>;
    byKindAndStatus: Array<{ kind: string; status: string; count: number }>;
    oldestPendingMinutes: number | null;
    staleRunningCount: number;
    recentFailures: Array<{ kind: string; failedAt: string | null; errorBucket: string }>;
  };
  extractionRuns: {
    byStatus: Array<{ label: string; count: number }>;
    recentFailures: Array<{ status: string; sourceType: string | null; provider: string | null; updatedAt: string }>;
  };
  artifactText: {
    byStatus: Array<{ label: string; count: number }>;
    recentFailures: Array<{ mimeType: string; status: string; updatedAt: string }>;
  };
  notifications: {
    byTypeAndStatus: Array<{ notificationType: string; status: string; count: number }>;
    recentFailures: Array<{ notificationType: string; status: string; updatedAt: string }>;
  };
  coverageRequestSends: {
    byProviderAndStatus: Array<{ provider: string; status: string; count: number }>;
    recentFailures: Array<{ provider: string; status: string; updatedAt: string }>;
  };
};
```

Keep failure detail coarse. Use status, kind, provider, timestamps, and generic error buckets. Do not include raw `payload`, `last_error`, provider response bodies, token hashes, artifact paths, source text, emails, or phone numbers in the UI.

### 3. Internal Ops UI

Add `/app/admin/ops`:

- Authenticated users only.
- Active internal admins only; non-admins get `notFound()`.
- Same quiet admin styling as `/app/admin/validation`.
- Show concise cards/tables:
  - job health
  - extraction health
  - upload artifact text/OCR health
  - notification run health
  - coverage request send health
- Link back to board and validation snapshot.

Add a link from `/app/admin/validation` to `/app/admin/ops`.

CSV export is not required in this slice. If added later, keep formula injection hardening and no-sensitive-fields guarantees.

### 4. Tests

Unit:

- Ops snapshot aggregation:
  - counts by status/kind/provider/type
  - oldest pending age
  - stale running count
  - recent failure rows exclude sensitive fields
- Env defaults:
  - `.env.example` or env tests reflect new OCR/notification/token envs as placeholders/defaults.

E2E/local:

- Internal admin can access `/app/admin/ops`.
- Non-internal admin gets 404.
- Page does not render known seeded sensitive values such as raw job payload, token hash, artifact path, provider response, or source text.

Optional local DB test:

- If a new RPC is added, prove anon/helper/non-admin denial and internal-admin access. Prefer service-role aggregation after app-layer internal-admin gate to avoid new `SECURITY DEFINER` surface.

Verification:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npx --yes supabase db reset
npm run build:local
npm run test:e2e:local
git diff --check
```

## Acceptance Criteria

- [x] Hosted runbook clearly lists required env vars, Vercel Cron setup, provider enablement/rollback, and cohort operator checks.
- [x] `.env.example` matches the current server env schema without secrets.
- [x] Internal admins can view operational health for jobs, extraction runs, upload text/OCR, notification runs, and coverage-request sends.
- [x] Non-internal admins cannot access the ops snapshot.
- [x] Ops UI and tests avoid raw source text, artifact paths, token hashes, provider payloads, emails, phone numbers, and secrets.
- [x] Local defaults and tests still make no real provider calls.
- [x] No out-of-scope integrations are added.

## Review Requirements

Run `ce-review` before merge.

Also run read-only Cursor GPT-5.5 high before merge because this touches internal-admin visibility, jobs, provider monitoring, and source/privacy boundaries.

## Sources

- [docs/ops/2026-05-25-cohort-readiness-checklist.md](../ops/2026-05-25-cohort-readiness-checklist.md)
- [docs/solutions/integration-issues/upload-notification-review-followups-20260526.md](../solutions/integration-issues/upload-notification-review-followups-20260526.md)
- [docs/solutions/integration-issues/resend-coverage-request-provider-review-20260526.md](../solutions/integration-issues/resend-coverage-request-provider-review-20260526.md)
- [docs/solutions/integration-issues/upload-ocr-approval-gated-extraction-20260526.md](../solutions/integration-issues/upload-ocr-approval-gated-extraction-20260526.md)
- `src/app/api/cron/jobs/route.ts`
- `src/lib/jobs/runner.ts`
- `src/lib/env-core.ts`
- `.env.example`
- `src/app/app/admin/validation/page.tsx`
- `src/lib/validation-snapshot-data.ts`
