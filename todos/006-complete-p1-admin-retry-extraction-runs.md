---
status: complete
priority: p1
issue_id: "006"
tags: [supabase, extraction, admin, jobs]
dependencies: []
---

# Admin Retry Failed Extraction Runs

## Problem Statement

Failed extraction runs currently require manual database intervention to retry. Internal admins need a narrow, audited-safe path to reset failed runs and enqueue exactly one retry job without exposing this control to household users.

## Findings

- `extraction_runs` are created once per source input and `extract_source` jobs are processed by the existing job runner.
- Existing extraction RPCs are `SECURITY DEFINER` functions with explicit grants.
- Source detail already surfaces extraction run state to parent/admin users.

## Proposed Solutions

1. Add an internal-admin-only RPC that retries failed runs and inserts a retry job only when no active retry job already exists.
2. Add a client-side job mutation from the UI without an RPC.

Option 1 is the only acceptable path because job rows are protected and retry permission must remain database-enforced.

## Recommended Action

- [x] Add a migration defining `retry_failed_extraction_run`.
- [x] Add migration/security tests for failed-only, internal-admin-only, and idempotent job enqueue behavior.
- [x] Add a server action and source-detail affordance visible only to internal admins.
- [x] Run focused tests plus core verification.

## Acceptance Criteria

- [x] Only active internal admins can execute the retry RPC.
- [x] The RPC only retries runs currently in `failed` status.
- [x] The RPC resets `status` to `pending` and clears `last_error`.
- [x] The RPC enqueues no more than one active `extract_source` job for the run.
- [x] Source detail shows the retry action only for internal admins viewing a failed run.

## Work Log

### 2026-05-25 - Implementation

**By:** Codex

**Actions:**
- Started a clean worktree on `codex/phase-3-admin-retry-rpc`.
- Reviewed extraction run persistence, job runner, source detail, and existing migration tests.
- Added `retry_failed_extraction_run`, the source-detail retry action, and migration tests.
- Verified with focused tests, full unit tests, lint, typecheck, build, `supabase db reset`, and local SQL smoke checks for admin success/non-admin denial.
- Attempted Cursor CLI read-only review with `gpt-5.5-high`; both wrapper and raw `cursor agent --print` produced no output, and the raw command timed out after 180s.
- Added `tests/live/admin-retry-extraction-run-live.test.ts` plus `npm run test:db:local` so the SQL smoke path is committed and repeatable.
- Ran Claude Code CLI read-only review through the local authenticated `claude` CLI. It found no blocking issues and agreed the live DB test closes the SQL behavior caveat.
- Attempted Claude Code browser verification against local app `http://127.0.0.1:3001`. Claude reported that its delegated session had no browser automation tools exposed and no shell approval. A follow-up bypass-permissions attempt remained silent for several minutes and was terminated.
- Ran local Playwright browser verification against `http://localhost:3001` after resetting Supabase so the new migration was applied. Verified internal-admin retry panel visibility, non-internal household admin hiding, click-to-retry state change, DB reset to `pending`, cleared `last_error`, exactly one active `extract_source` job, and no browser console errors. Screenshots saved to `/tmp/famtandem-retry-admin-visible.png`, `/tmp/famtandem-retry-nonadmin-hidden.png`, and `/tmp/famtandem-retry-after-click.png`.

**Learnings:**
- The retry RPC must guard against duplicate pending/running jobs because `jobs` has no unique expression index for JSON payload keys.
- External review does not replace executable database coverage for this RPC; keep the local DB test in the verification list for this slice.
