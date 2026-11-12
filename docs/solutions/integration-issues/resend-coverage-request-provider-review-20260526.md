---
module: Coverage Requests
date: 2026-05-26
problem_type: integration_issue
component: service_object
symptoms:
  - "PR #17 added real Resend coverage-request sends and needed final provider/privacy review before merge"
  - "Cursor wrapper attempts timed out without useful output until the Cursor agent was called directly with a longer timeout"
  - "Cursor found stalled Resend sends could hang after request rows were created"
root_cause: incomplete_setup
resolution_type: code_fix
severity: high
tags:
  - resend
  - coverage-requests
  - cursor-review
  - provider-timeout
  - pr-17
---

# Resend Coverage Request Provider Review

## Problem

PR #17 shipped the first real outbound provider slice for FamTandem coverage requests: Resend email sends for helpers/spouses when an email is available, while keeping the manual copy-link flow safe by default.

Because this slice touched provider calls, recipient contact data, no-account response links, database send marking, and failure behavior, it needed a stronger review pass before merge. The current thread covered the full handoff from Resend-first planning through implementation, local credential setup, CE/Claude/Cursor review, blocking-finding fixes, verification, merge, and documentation.

## Environment

- Module: Coverage Requests
- Affected components:
  - `src/lib/coverage-requests/senders/resend.ts`
  - `src/lib/coverage-requests/senders/provider.ts`
  - `src/app/app/actions.ts`
  - `supabase/migrations/20260525173000_phase3_resend_coverage_request_sends.sql`
- PR: #17, `feat(coverage): add Resend request emails`
- Merge commit: `5bf8971`
- Date solved: 2026-05-26

## Thread Scope

This thread covered:

- Planning a narrow Resend outbound email slice from the external-cohort lever decision.
- Keeping local/manual link behavior safe by default.
- Configuring local Resend sending through ignored env only, using `coverage@updates.famtandem.com` because `updates.famtandem.com` was the verified sending domain.
- Implementing direct `fetch`-based Resend sending behind the existing coverage request sender seam.
- Preserving the scope boundary: no Resend inbound, no Twilio implementation, no provider webhooks/status callbacks, no Google Calendar, no OCR, no signed downloads, no broad admin correction, and no committed production credentials.
- Running CE review, Claude/Opus review where available, and direct Cursor `gpt-5.5-high` review.
- Fixing blocking review findings before merge.
- Squash-merging PR #17 into `main`.

## Symptoms

- Early Cursor CLI wrapper attempts hung or timed out with no review output.
- A direct Cursor agent invocation with `gpt-5.5-high` and a 600 second timeout completed after several minutes and produced actionable findings.
- Cursor found a blocking provider failure mode: a stalled Resend `fetch` could leave the server action waiting after coverage request token/request rows were already created.
- Cursor also flagged that the widened `mark_coverage_request_sent` RPC authorization was only covered by migration string checks, not an executable database test.

## What Didn't Work

**Short Cursor wrapper attempts:** Earlier bounded wrapper calls timed out before Cursor produced useful output.

- **Why it failed:** This PR needed enough time for Cursor to inspect the diff and project context. Killing it too early made the review look broken rather than slow.

**Migration string checks alone:** The unit test confirmed migration text allowed `resend`, `sent`, and `failed`.

- **Why it was incomplete:** It did not execute the RPC under real local database auth contexts, so it could not prove anon/helper/cross-household callers were denied.

## Solution

### Cursor Review

Run Cursor directly rather than through the flaky wrapper and give it the full review window:

```bash
timeout 600s cursor agent \
  --print \
  --trust \
  --workspace "$PWD" \
  --model gpt-5.5-high \
  --output-format text \
  --mode plan \
  "$(cat /tmp/cursor-pr17-direct-review.md)"
```

The completed review found no P0 privacy/token/RLS bypass issue, but it did block merge on the provider timeout risk.

### Provider Timeout Fix

`ResendCoverageRequestSender` now creates an `AbortController`, passes its `signal` to `fetch`, defaults to a 10 second timeout, clears the timer in `finally`, and maps timeout/abort errors to:

```ts
{
  provider: "resend",
  providerMessageId: null,
  status: "failed"
}
```

That keeps the existing fallback path usable instead of trapping the request behind a hung provider call.

### Executable Database Auth Test

Added `tests/live/coverage-request-send-marking-live.test.ts` to seed two households and prove:

- anon callers cannot mark a send result
- same-household helpers cannot mark a send result
- cross-household admins cannot mark a send result
- the owning household admin can mark a Resend send as `sent`
- the owning household admin can mark a Resend send as `failed`
- `attempt_count` increments across provider marking attempts

### Follow-Up Todos

Non-blocking product/UX findings were captured as todos instead of widening the provider slice:

- `todos/008-complete-p3-coverage-request-email-form-ux.md`
- `todos/009-pending-p3-coverage-request-email-subjects.md`
- `todos/010-pending-p3-coverage-request-note-privacy.md`

## Why This Works

The important failure boundary is that database rows are created before the outbound provider call returns. If the provider call fails quickly, the app can mark the send failed and keep the manual link fallback available. If the provider call stalls indefinitely, the action may be killed by the platform before it records failure or shows fallback.

The timeout converts stalled provider behavior into an ordinary failed send result. This matches the slice's product requirement: real email when configured, but manual copy-link behavior remains safe.

The live DB test closes the gap between "the migration looks right" and "the access boundary works under Supabase auth claims." That matters because `mark_coverage_request_sent` is a `SECURITY DEFINER` RPC and must remain household-admin scoped.

## Verification

Final verification after Cursor fixes:

```bash
npx vitest run tests/unit/coverage-request-sender.test.ts tests/unit/env.test.ts
node scripts/with-local-supabase-env.mjs npx vitest run --config vitest.live.config.ts tests/live/coverage-request-send-marking-live.test.ts
npm run lint
npm run typecheck
npm test
npm run build:local
npm run test:e2e:local
git diff --check
```

Results:

- `npm test` passed with 127 tests.
- Local E2E passed with 28 tests.
- The live DB RPC auth test passed.
- A real app-path Resend smoke through the board passed and stored the provider result.
- PR #17 was squash-merged to `main` as `5bf8971`.

## Prevention

- Provider senders should have explicit timeouts before they are used in server actions that already created local state.
- Keep local/manual fallback behavior as the default for new outbound providers.
- For `SECURITY DEFINER` RPC changes, add executable local DB tests when auth scope changes, not only migration-text tests.
- Give delegated review tools enough time for provider/security-sensitive diffs. For Cursor, use direct `cursor agent --print` with a 600 second timeout when the wrapper hangs.
- Do not commit provider credentials. Keep Resend keys in local or hosted env only.

## Related Issues

- See also: [Gemini Fixture Eval Prompt Contract Repair](./gemini-fixture-eval-prompt-contract.md)
- Related plan: [Resend outbound coverage requests](../../plans/2026-05-25-feat-resend-outbound-coverage-requests-plan.md)
