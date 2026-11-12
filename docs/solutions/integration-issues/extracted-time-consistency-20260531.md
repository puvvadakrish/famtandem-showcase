---
title: Extracted Coverage Time Consistency
date: 2026-05-31
status: resolved
category: integration-issues
tags: [extraction, timezone, coverage-response, hosted-qa]
related_prs: [43]
---

# Extracted Coverage Time Consistency

## Problem

Hosted first-session QA found that a pasted soccer note with `5:30 PM to 6:45 PM` produced inconsistent display times across FamTandem:

- Source detail linked card: `4:30 PM`
- Board card: `4:30 PM`
- No-account response page: `9:30 PM`

That made extracted timed cards unsafe for unsupervised family use because coverage asks depend on the parent trusting the exact pickup/drop-off time.

## Root Cause

There were two separate boundaries:

- Runtime Gemini extraction did not receive household timezone or source received-time context, and the prompt did not explicitly tell the model to preserve source local clock times.
- The no-account coverage response page formatted the stored timestamp without the household timezone, so it could drift from the board/source detail display.

## Fix

PR #43 fixed the path narrowly:

- `runExtractionForSourceInput` now loads `source_inputs.received_at` and `households.timezone`, then passes both into the extractor input.
- `buildRuntimePrompt` now includes the household timezone, source `receivedAt`, and explicit guidance to emit ISO datetimes with the source local clock time and household offset.
- `get_coverage_request_by_token_hash` now returns `household_timezone` for valid pending links while preserving the service-role-only token lookup.
- The response page now formats request times with `formatCoverageRequestDateTime(value, householdTimezone)`.

## Verification

Local:

- `npx --yes supabase db reset`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build:local`
- `npm run test:e2e:local -- tests/e2e/coverage-requests.spec.ts tests/e2e/paste-intake.spec.ts`
- `npm run test:extraction`
- `npm run test:e2e:local`
- `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npx vitest run --config vitest.live.config.ts tests/live/gemini-runtime-live.test.ts`

Hosted:

- Production code deployed from `main` commit `f61f72e`.
- Hosted Supabase migration `20260531150000_coverage_request_timezone.sql` applied.
- Guarded retest with `test-user@example.com`, stamp `202605311411`, passed:
  - Soccer source detail and board preserved `5:30 PM`.
  - No-account mobile response page showed `Tue, Jun 9, 5:30 PM`.
  - Response accept completed successfully.
  - Raw source text did not leak on the response page.

## Prevention

- When changing extraction date/time behavior, pass household timezone and source received context through the runtime path, not only fixture eval prompts.
- When adding no-account or unauthenticated views for cards, include household timezone in the server-side read model and format with that timezone.
- In hosted QA, target unique source/card text instead of child names because the board includes child names in hidden form options across many cards.
- Keep regression coverage on source detail, board, and response-link surfaces for the same timed card.
