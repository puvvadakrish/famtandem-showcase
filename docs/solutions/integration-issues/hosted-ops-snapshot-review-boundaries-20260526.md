---
module: Hosted Cohort Readiness
date: 2026-05-26
problem_type: integration_issue
component: internal_ops_snapshot
symptoms:
  - "Ops snapshot could hide old pending or stale running jobs when computed from the most recent 200 rows"
  - "GitHub Gemini Code Assist left actionable review feedback after PR creation"
  - "Cursor CLI review could hang silently unless run through the project wrapper or given a hard timeout"
root_cause: sampled_operational_totals
resolution_type: code_fix
severity: high
tags:
  - hosted-readiness
  - ops-snapshot
  - jobs
  - gemini-review
  - cursor-review
  - pr-24
---

# Hosted Ops Snapshot Review Boundaries

## Problem

PR #24 added `/app/admin/ops`, a read-only internal-admin operations snapshot for the first hosted validation cohort. The page intentionally avoids raw source text, artifact paths, token hashes, emails, phone numbers, provider payloads, and provider secrets.

The first implementation loaded the most recent 200 `jobs` rows and computed headline job health from that sample. A CE ops review caught the issue: an old pending job or stale running job could be outside the newest 200 rows and disappear from exactly the dashboard meant to catch it.

Gemini Code Assist also left a small but real UI review finding after PR creation: recent failure rows could produce duplicate React keys when label, timestamp, and bucket matched.

## Root Cause

Recent failure samples and operational totals answer different questions:

- Recent failure rows are examples for triage and can be capped.
- Headline operational health must represent the whole table or the operator may miss old stuck work.

Using one capped data load for both made the UI cheaper to write but less trustworthy. For cohort operations, false calm is worse than a slightly more verbose service-role query path.

## Working Solution

`src/lib/ops-snapshot-data.ts` now separates exact job summary queries from limited recent failure rows:

- exact counts by job status
- exact counts by known job kind/status
- oldest due pending job from the minimum `run_after`
- stale running count from `locked_at <= now - 15 minutes`
- limited failed job rows only for recent failure examples

`src/lib/ops-snapshot.ts` accepts an optional exact `jobSummary`; when present, it uses that for headline job health and uses the provided failed rows only for recent failures.

Coverage-request send provider/status display is allowlisted to avoid echoing arbitrary `card_events.metadata` values into the UI. Unknown providers collapse to `unknown`; unknown statuses fall back to event type.

`src/app/app/admin/ops/page.tsx` includes the failure-row index in React keys to avoid duplicate key collisions for identical failure rows.

## Verification

Post-fix verification included:

```bash
npx vitest run tests/unit/ops-snapshot.test.ts tests/unit/env.test.ts
npm run typecheck
npm run lint
node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/admin-validation.spec.ts
git diff --check
```

The original broader PR verification also covered:

```bash
npx --yes supabase db reset
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
```

Review gates:

- CE privacy review returned no blocking findings.
- CE ops review found the sampled job-health blocker and returned clean after the exact-query fix.
- Cursor GPT-5.5 high returned no blocking findings after the fix.
- Gemini Code Assist flagged duplicate React keys; the key was fixed before merge.
- PR #24 merged as `8e4b17f feat(ops): add hosted cohort readiness snapshot`.

## Prevention

- Do not compute operational headline totals from capped recent-row samples.
- Use exact counts, minimum timestamps, or small targeted aggregate queries for health indicators.
- Use capped recent-row queries only for example lists such as recent failures.
- Keep ops UI output coarse: counts, statuses, known providers, timestamps, and error buckets only.
- Treat GitHub Gemini Code Assist comments as part of the PR review gate. Fix actionable findings or explain why a stale/out-of-scope comment is non-blocking.
- For Cursor review, prefer the project delegation wrapper with a hard timeout. If a raw `cursor agent --print` session stays silent, verify no process is left running and retry with the wrapper or document the tool failure.

## Related Docs

- Hosted runbook: [Hosted cohort readiness runbook](../../ops/2026-05-26-hosted-cohort-readiness-runbook.md)
- Plan: [Hosted cohort readiness plan](../../plans/2026-05-26-feat-hosted-cohort-readiness-plan.md)
- Related provider-review note: [Resend coverage request provider review](./resend-coverage-request-provider-review-20260526.md)
- Related review follow-up note: [Upload and notification review follow-ups](./upload-notification-review-followups-20260526.md)
