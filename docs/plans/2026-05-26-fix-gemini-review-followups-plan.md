---
title: "fix: Address Gemini review follow-ups"
type: fix
status: complete
date: 2026-05-26
---

# fix: Address Gemini review follow-ups

## Overview

Address the actionable Gemini Code Assist feedback left on the merged validation PRs without widening product scope. This is a hardening follow-up for upload finalization and scheduled notification behavior.

The goal is not to add new notification or OCR features. Keep local/manual defaults safe, keep provider calls opt-in, and preserve helper privacy boundaries.

## Scope

In scope:

- [x] Prevent upload cleanup after `finalize_upload_source_artifact` succeeds.
- [x] Narrow the upload finalization RPC `search_path` to `public`.
- [x] Format daily notification item times in the household timezone.
- [x] Keep daily and weekly schedulers from failing the whole loop on a bad household timezone.
- [x] Avoid overwriting provider-specific failed send details with generic failure records.
- [x] Add small defensive handling for null child join rows.
- [x] Log Resend fetch exceptions without logging secrets or provider response bodies.
- [x] Add targeted unit/migration tests.
- [x] Run focused and full verification.
- [x] Open PR, run CE review, and run Cursor/Gemini review gate before merge.

Out of scope:

- No new notification product behavior.
- No SMS/Twilio.
- No Resend inbound, webhooks, or status callbacks.
- No real OCR/provider calls.
- No production credentials.
- No helper-facing digest changes.

## Implementation Notes

### Upload Follow-Ups

- In `src/components/upload-source-form.tsx`, track `isFinalized`.
- Set it immediately after `finalize_upload_source_artifact` succeeds.
- In `catch`, delete `source_inputs` and Storage objects only while `!isFinalized`.
- In `supabase/migrations/20260526140000_phase3_upload_text_extraction.sql`, change `set search_path = public, storage` to `set search_path = public` for `finalize_upload_source_artifact`.

Tests:

- Add/extend a unit/component test for upload cleanup behavior if practical.
- Add a migration text assertion for the narrowed search path.

### Notification Follow-Ups

- Pass `household.timezone` to `buildDailyUnresolvedEmail`.
- Update daily email tests to assert household-local time formatting.
- Wrap daily and weekly timezone calculations in a helper that catches invalid timezones, logs a privacy-safe warning, and skips that household for that scheduler tick.
- Add `NotificationSendError` or equivalent to daily and weekly senders so already-recorded provider send failures are not overwritten by `safelyFailNotificationRun`.
- Keep `NotificationRunAlreadyRecordedError` behavior intact.
- Add optional chaining in child label extraction.
- Log `ResendNotificationSender` fetch exceptions with a generic message and no secrets.

Tests:

- Scheduler tests for invalid timezone skip behavior.
- Email rendering tests for daily local timezone.
- Job/sender tests for provider failed-send metadata not being overwritten.
- Resend sender test for exception logging.
- Small unresolved-item test or existing fixture update for null child rows if feasible.

## Verification

Run at minimum:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run test:extraction`
- [x] `node scripts/with-local-supabase-env.mjs npx vitest run --config vitest.live.config.ts tests/live/notification-runs-live.test.ts`
- [x] `npm run build:local`
- [x] `npm run test:e2e:local`
- [x] `git diff --check`

Run DB reset if the migration edit needs compile validation:

- [x] `npx --yes supabase db reset`

Additional finding from parallel notification review:

- [x] Serialize daily/weekly enqueue RPC active-job repair with row locks so concurrent service-role calls do not create duplicate active notification jobs.

## Review Gates

- Use CE review before merge.
- Use Cursor/GPT-5.5 high or Gemini Code Assist review before merge, focused on provider sending, jobs, source privacy, and upload cleanup.
