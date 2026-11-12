---
module: Validation Notifications And Upload Intake
date: 2026-05-26
problem_type: integration_issue
component: jobs_storage_provider_boundaries
symptoms:
  - "Gemini review found upload UI could show a failed state after successful artifact finalization if navigation failed"
  - "Upload cleanup needed to avoid deleting finalized metadata or leaving private Storage objects orphaned"
  - "Daily and weekly notification jobs could let bad household timezones or provider failures produce misleading run state"
  - "Concurrent notification enqueue repair needed row locking to prevent duplicate active jobs"
root_cause: incomplete_failure_boundary
resolution_type: code_fix
severity: high
tags:
  - upload-finalization
  - notifications
  - resend
  - storage
  - jobs
  - cursor-review
  - gemini-review
  - pr-21
---

# Upload And Notification Review Follow-Ups

## Problem

The daily nudge, weekly review, and upload text-extraction foundation shipped the right narrow product slices, but the follow-up review pass found several edge cases around irreversible side effects.

The risky pattern was the same in a few places: local state was created or finalized before a later operation could fail. That meant cleanup, retry, or error reporting needed to distinguish "nothing committed yet" from "the durable action already happened."

## Environment

- Module: validation notifications and upload intake
- Affected components:
  - `src/components/upload-source-form.tsx`
  - `src/lib/notifications/daily-unresolved.ts`
  - `src/lib/notifications/weekly-coverage-review.ts`
  - `src/lib/notifications/senders/resend.ts`
  - `supabase/migrations/20260526100000_phase3_daily_unresolved_notifications.sql`
  - `supabase/migrations/20260526120000_phase3_weekly_coverage_review_notifications.sql`
  - `supabase/migrations/20260526140000_phase3_upload_text_extraction.sql`
  - `supabase/migrations/20260526150000_phase3_source_artifact_object_delete_policy.sql`
- PR: #21, `fix(validation): address Gemini review follow-ups`
- Merge commit: `a0994ed`
- Date solved: 2026-05-26

## Symptoms

- If `finalize_upload_source_artifact` succeeded but `router.push` or `router.refresh` threw, the upload form could fall into the generic error path. That made a successful upload look failed and could prompt duplicate attempts.
- If upload failed before finalization, metadata cleanup could run even when Storage cleanup failed. That risks orphaning a private object without its expected metadata row.
- Browser cleanup had no narrow delete policy for unfinalized source artifacts, so the client could not safely remove a failed pre-finalization object.
- `finalize_upload_source_artifact` had a wider `search_path` than needed.
- A single invalid household timezone could break an entire daily or weekly scheduler tick.
- Daily unresolved email formatting did not consistently use the household timezone.
- Provider-specific failed-send details could be overwritten by a generic job failure path.
- Resend fetch exceptions needed privacy-safe logging.
- Concurrent service-role enqueue calls could both repair/create active notification jobs for the same run without row locking.

## Root Cause

The implementation had the correct high-level boundaries, but several failure paths did not model side effects explicitly enough:

- Upload finalization is the boundary where the artifact becomes durable. After that point, client cleanup must not delete the source input or object just because navigation failed.
- Before finalization, Storage object cleanup should happen before deleting metadata. If Storage cleanup fails, keeping metadata is safer because it preserves an auditable reference to the object.
- Notification runs are the durable idempotency unit for scheduled sends. Provider send failure should be recorded once with the actual attempted provider, not replaced by a generic `local-stub` or catch-all error.
- Scheduler loops need per-household isolation because one bad timezone value should not block every other household.
- Active-job repair is a concurrency-sensitive database operation and needs row locks around the existing run/job check.

## Working Solution

### Upload Finalization

`upload-source-form.tsx` now tracks whether finalization succeeded. After `finalize_upload_source_artifact` succeeds, navigation is isolated in its own `try/catch`; a navigation failure logs a sanitized message and leaves the form in the success state.

Before finalization, the catch path removes the Storage object first. It deletes source metadata only if Storage removal succeeds. If Storage removal fails, the user sees the cleanup error and metadata remains available for follow-up.

A new Storage delete policy permits authenticated household admins to delete only matching, unfinalized upload artifacts:

- object path must match `source_artifacts.storage_path`
- source input must be an upload
- `source_artifacts.finalized_at is null`
- caller must be a household admin for the artifact household

The upload finalization RPC now uses `search_path = public`.

### Notification Jobs

Daily and weekly schedulers now wrap local-date calculations in safe helpers. Invalid timezones produce a privacy-safe warning and skip only that household for that scheduler tick.

Daily email rendering receives the household timezone so item times are formatted in the household's local time.

Daily and weekly send processors use a `NotificationSendError` path for already-recorded provider failures. That keeps provider-specific run state from being overwritten by generic job failure handling.

Resend notification fetch exceptions log only sanitized `{ name, message }` data.

Daily and weekly enqueue RPCs now lock the target run row while checking for and repairing active jobs. This prevents duplicate active notification jobs under concurrent service-role calls.

## Verification

Focused verification covered upload cleanup, notification scheduling, provider failure recording, sender logging, migration constraints, and local DB behavior:

```bash
npx vitest run tests/unit/upload-source-form.test.tsx tests/unit/notification-scheduler.test.ts tests/unit/notification-unresolved-items.test.ts tests/unit/notification-sender.test.ts tests/unit/daily-unresolved.test.ts tests/unit/weekly-coverage-review.test.ts tests/unit/phase3-upload-text-extraction-migration.test.ts tests/unit/phase3-daily-notifications-migration.test.ts tests/unit/phase3-weekly-notifications-migration.test.ts
npx vitest run tests/unit/upload-source-form.test.tsx tests/unit/phase2-upload-source-metadata-migration.test.ts tests/unit/phase3-upload-text-extraction-migration.test.ts
npx --yes supabase db reset
npm run lint
npm run typecheck
npm test
npm run test:extraction
node scripts/with-local-supabase-env.mjs npx vitest run --config vitest.live.config.ts tests/live/notification-runs-live.test.ts
npm run build:local
npm run test:e2e:local
git diff --check
```

After Gemini Code Assist flagged the navigation-after-finalization issue, a focused follow-up passed:

```bash
npx vitest run tests/unit/upload-source-form.test.tsx
npm run lint
npm run typecheck
git diff --check
```

CE review passed. Cursor `gpt-5.5-high` review passed with no blocking findings after the delete-policy and cleanup-order fixes. Gemini's remaining comment was tied to an older commit and was addressed before merge.

## Prevention

- Treat provider sends, Storage uploads, upload finalization, and job enqueue repair as side-effect boundaries. Model "committed" state explicitly.
- After durable finalization succeeds, do not run cleanup because a later UI/navigation step failed.
- For pre-finalization upload failures, remove private Storage objects before deleting metadata. If object removal fails, keep metadata for auditability.
- New browser-side Storage cleanup needs a narrow policy keyed to existing metadata and unfinalized state.
- Scheduler loops should isolate bad household configuration from other households.
- Provider failure handling should record the real attempted provider once and avoid overwriting it in a generic catch path.
- Concurrency-sensitive enqueue repair should lock the existing run row before checking or inserting active jobs.
- Keep real providers off by default in local tests and E2E; use mocked provider behavior or local stubs unless a live smoke is explicitly requested.

## Related Docs

- Related plan: [Gemini review follow-ups](../../plans/2026-05-26-fix-gemini-review-followups-plan.md)
- Related feature plan: [Next validation features](../../plans/2026-05-26-feat-next-validation-features-plan.md)
- Related provider review: [Resend coverage request provider review](./resend-coverage-request-provider-review-20260526.md)
