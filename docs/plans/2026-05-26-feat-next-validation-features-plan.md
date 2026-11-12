---
title: "feat: Plan next FamTandem validation features"
type: feat
status: complete
date: 2026-05-26
origin: docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md
---

# feat: Plan next FamTandem validation features

## Overview

Plan the next three validation features from latest `main` as separate, narrow implementation slices:

1. Daily unresolved nudge.
2. Weekly coverage review.
3. Upload OCR/text extraction.

This carries forward the original product shape: FamTandem should open to what needs attention, keep source trust visible, and reduce the default parent's logistics load without becoming a generic calendar or organizer (see brainstorm: `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`).

It also carries forward the external-cohort provider decision: Resend outbound email is available as the first real provider lever, but local/manual behavior remains safe by default; Twilio/SMS, Resend inbound, provider webhooks, Google Calendar, signed downloads, and broad admin correction stay out of scope (see brainstorm: `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`).

## Baseline Context

- `main` already includes the Phase 0-3 validation loop, including AI-first paste intake, extraction runs, source-backed cards, request links, internal-admin validation views, and opt-in Resend coverage-request sends.
- Resend coverage-request sending is gated by `COVERAGE_REQUEST_SENDER=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`; default local behavior uses the local stub.
- Scheduled work runs through `GET /api/cron/jobs`, `claim_due_jobs`, and `processJobBatch`.
- `jobs` retries are DB-driven. A job can be re-run after partial side effects, so every provider side effect needs its own idempotency key and durable send/run ledger.
- `source_inputs` insert currently creates one `extraction_runs` row and one `extract_source` job. Upload sources are inserted before the browser finishes uploading the Storage object, so OCR cannot rely on the current source-input trigger alone.
- Uploaded artifacts are private. Parent, household-admin, and internal-admin users can read source details/artifacts; helpers cannot read raw source text or artifact objects.

## Recommended Sequence

### PR 1: Daily Unresolved Nudge

Build the shared notification foundation and use it for one daily nudge.

Implementation checklist:

- [x] Add notification settings/run persistence with daily and weekly-compatible keys.
- [x] Add shared unresolved-item query/model code for daily now and weekly reuse later.
- [x] Add notification email rendering/sender seam that defaults to local stub.
- [x] Add `send_daily_unresolved_nudge` job processing and cron-time scheduling.
- [x] Add tests for item selection, rendering privacy, sender defaults, migration constraints, and job behavior.
- [x] Update setup/ops/project docs.
- [x] Run verification, open PR, run `ce-review`, and run read-only Cursor `gpt-5.5-high` before merge.

In scope:

- Add shared unresolved-item query/model code.
- Add notification outbox/run persistence for idempotent scheduled sends.
- Add a `send_daily_unresolved_nudge` job processor.
- Add a scheduler/enqueuer that creates at most one daily nudge job per eligible household/recipient/local date.
- Send through a new notification-email sender seam that defaults to local stub and can use existing Resend configuration when explicitly enabled.
- Send only to parent/household-admin recipients with an email address.
- Keep email content short: unresolved count, top 3-5 items, status labels, and `/app` link.

Out of scope:

- Weekly digest.
- OCR/upload extraction.
- SMS/Twilio.
- Resend inbound.
- Provider webhooks/status callbacks.
- Preference center or unsubscribe system beyond explicit cohort enablement.

### PR 2: Weekly Coverage Review

Reuse the notification foundation and item model from PR 1 for a weekly review.

Implementation checklist:

- [x] Add weekly review query/model behavior using the same normalized item shape.
- [x] Add weekly email rendering through the existing notification sender seam.
- [x] Add `send_weekly_coverage_review` job processing and cron-time scheduling.
- [x] Add service-role weekly enqueue RPC with run/job idempotency and active-job repair.
- [x] Add tests for weekly scheduling, digest privacy, migration constraints, local DB idempotency, and job behavior.
- [x] Update setup/ops/project docs.

In scope:

- Add weekly review query/model code using the same normalized item shape.
- Add `send_weekly_coverage_review` job processor.
- Add weekly scheduler/enqueuer keyed by household timezone and week start.
- Send a planning digest for the upcoming week to parent/household-admin recipients.
- Include unresolved or uncertain logistics only, not a full calendar.

Out of scope:

- New provider infrastructure beyond the PR 1 sender seam.
- Provider webhooks/status callbacks.
- Calendar sync.
- Helper-facing digests.
- OCR/upload extraction.

### PR 3: Upload OCR/Text Extraction

Add upload text extraction as a separate artifact-text pipeline, then feed the existing logistics extraction/card creation path.

Implementation checklist:

- [x] Add explicit upload-finalized signal after Storage upload succeeds.
- [x] Add `extract_artifact_text` job processing for private artifact text extraction.
- [x] Add deterministic text/plain extraction and defer PDF/image OCR unless a provider is explicitly enabled later.
- [x] Route extracted text into `source_inputs.normalized_text` and enqueue the existing `extract_source` path.
- [x] Add tests for artifact text extraction, migration constraints, job behavior, and upload extraction expectations.
- [x] Update setup/QA/project docs.

In scope:

- Add an explicit upload-finalized signal after Storage upload succeeds.
- Add an `extract_artifact_text` job kind that reads the private artifact with service role, updates artifact/source text state, then queues or re-runs logistics extraction.
- Add a local stub OCR provider and one opt-in real provider path.
- Support text/plain first as a deterministic bypass and PDF/image OCR behind explicit env.
- Preserve helper denial for raw artifacts and full extracted text.

Out of scope:

- Signed downloads.
- Broad admin correction.
- Provider webhooks.
- Google Calendar.
- Production credentials.
- Multi-file uploads; keep one artifact per source for this slice.

## Shared Unresolved Item Model

Create a server-only module such as `src/lib/notifications/unresolved-items.ts` with a compact normalized type:

```ts
type UnresolvedLogisticsItem = {
  householdId: string;
  cardId: string;
  kind:
    | "uncovered_slot"
    | "pending_response"
    | "changed_event"
    | "due_readiness"
    | "needs_review";
  severity: "today" | "due_soon" | "this_week" | "uncertain";
  title: string;
  startsAt: string | null;
  dueAt: string | null;
  statusLabel: string;
  slotKind?: string;
  childLabels?: string[];
  appHref: string;
};
```

Privacy boundary:

- The model can include card title, date/time, status, slot kind, location when already visible on the board, and compact child labels if already visible to household members.
- The model must not include `source_inputs.normalized_text`, raw source excerpts, `source_artifacts.storage_path`, token hashes, provider ids, artifact checksums, extraction raw output, or full request notes.

Daily unresolved item rules:

- Include uncovered pickup/drop-off/general owner slots for today and tomorrow.
- Include `requested`/pending slots with active pending coverage requests.
- Include declined slots as unresolved again.
- Include changed cards that still need reconfirmation.
- Include open readiness items due today, overdue, or due in the next 48 hours.
- Include `needs_review` only when the card has a logistics-critical state or the source extraction failed/needs review for a recent source. Do not turn every low-confidence card into daily noise.

Weekly review item rules:

- Include the upcoming 7 local days.
- Include uncovered, pending, declined, changed, needs-review, due-soon/overdue readiness, and failed upload/extraction sources that could block card creation.
- Exclude covered/cancelled items unless they have unresolved readiness or change-confirmation state.

Use household timezone from `households.timezone`. Prefer local-date calculations at the query boundary, and keep unit tests around DST/week-boundary cases.

## Notification Scheduling And Idempotency

Add a small durable notification ledger, for example:

- `notification_runs`
  - `id`
  - `household_id`
  - `recipient_member_id`
  - `notification_type` (`daily_unresolved`, `weekly_coverage_review`)
  - `period_start`
  - `period_end`
  - `local_date`
  - `status` (`pending`, `running`, `sent`, `failed`, `skipped_empty`)
  - `provider`
  - `provider_message_id`
  - `attempt_count`
  - `last_error`
  - `metadata jsonb`
  - timestamps

Required uniqueness:

- Daily: unique `(household_id, recipient_member_id, notification_type, local_date)`.
- Weekly: unique `(household_id, recipient_member_id, notification_type, period_start)`.

Job approach:

- Reuse `/api/cron/jobs`.
- Add scheduler job kinds or a cron-time enqueuer path that creates notification runs and `send_*` jobs.
- Keep actual provider sends in job processors, not browser actions.
- Before sending, re-load the notification run and re-query unresolved items. If no items remain, mark `skipped_empty`.
- Use Resend idempotency keys based on `notification_runs.id`, e.g. `notification/<notification_run_id>`.
- If provider send succeeds but job success marking fails, retry should hit the same run/idempotency key and not duplicate provider sends.

Eligibility and enablement:

- Add safe opt-in env/config, for example `HOUSEHOLD_NOTIFICATION_SENDER=local-stub|resend`, default `local-stub`.
- Add a cohort-level enablement flag before real sends, preferably explicit household columns or a small `household_notification_settings` table.
- Default local/CI behavior should create runs and use local stub only; no real Resend sends unless explicitly configured.
- Send to parents/household admins only. Helpers should continue to receive only explicit coverage-request links.

Failure behavior:

- Provider timeout or error marks the run `failed`, records a privacy-safe error category, and lets the job retry according to existing `jobs` backoff.
- Do not mark coverage slots, readiness items, or requests resolved because an email was sent.
- Do not create duplicate runs on retry.
- Do not include provider response bodies or secrets in logs, metadata, analytics, or emails.

## Email Content And Privacy

Daily subject examples:

- `FamTandem: 3 things still need coverage today`
- `FamTandem: pickup and forms still need a plan`

Weekly subject examples:

- `FamTandem: next week's uncovered logistics`
- `FamTandem weekly coverage review`

Daily body should include:

- Household greeting.
- One-sentence summary.
- Top unresolved items grouped by `Needs coverage`, `Waiting on response`, `Changed`, and `Due soon`.
- Button/link to `/app`.
- Footer: "This email summarizes coverage status only. Open FamTandem for source details."

Weekly body should include:

- Week date range.
- Counts by bucket.
- Top unresolved items by day.
- Failed/needs-review source count if relevant.
- Link to `/app`.

Do not include:

- Raw source text.
- Full uploaded artifact links, storage paths, or signed URLs.
- Token hashes or response-token URLs unless this is an explicit one-off coverage request.
- Provider ids, extraction raw output, analytics identifiers, phone numbers, or broad household/member lists.
- Private notes beyond short, parent-authored request context already allowed in one-off coverage requests.

## OCR Provider Decision

Options:

1. **Gemini file/image OCR path**
   - Pros: same provider family as logistics extraction; likely fastest product validation path for PDFs/screenshots.
   - Cons: larger privacy/provider surface; file upload/base64 handling and timeouts need care.

2. **GCP Document AI / Vision OCR**
   - Pros: purpose-built OCR/document extraction.
   - Cons: more setup, credentials, APIs, and cost controls before cohort learning.

3. **Local deterministic stub + text/plain first**
   - Pros: safest first implementation; proves pipeline and privacy without provider calls.
   - Cons: does not validate real screenshot/PDF OCR quality.

Recommendation:

- Start PR 3 with a deterministic local OCR provider and text/plain upload extraction, plus an opt-in Gemini OCR adapter behind explicit env.
- Do not call real OCR in default tests or local E2E.
- Add a separate optional live OCR smoke only after the local text pipeline is proven and credentials are available in local env.

## Upload OCR Flow

Narrowest safe first slice:

1. Browser creates upload metadata as today.
2. Browser uploads the object to Supabase Storage.
3. After upload succeeds, browser calls a new authenticated RPC/action such as `finalize_upload_source_artifact(source_input_id, source_artifact_id)`.
4. The RPC verifies household-admin ownership, artifact/source match, and expected storage path, then marks `source_artifacts.text_extraction_status = pending` and enqueues `extract_artifact_text`.
5. `extract_artifact_text` service worker:
   - Loads artifact metadata by id.
   - Verifies `source_type = upload`, one artifact, matching household/source/path, and object exists.
   - For `text/plain`, reads text directly.
   - For PDF/image, uses selected OCR provider only when explicitly enabled.
   - Updates `source_inputs.normalized_text` with extracted text.
   - Updates `source_inputs.status` and `source_artifacts.text_extraction_status`.
   - Queues or resets the logistics extraction run.
6. Existing `extract_source` then uses `source_inputs.normalized_text`, validates `family-logistics-v1`, and calls `create_extracted_cards`.

Extraction-run lifecycle decision:

- Preferred: prevent upload logistics extraction from becoming terminal before OCR by changing the source-input trigger or `runExtractionForSourceInput` behavior for upload/no-text.
- For upload/no-text before finalized OCR, keep the extraction run `pending` or mark source/artifact as awaiting text without consuming the one allowed terminal run.
- If an upload already has `skipped_no_text`, add a service-role RPC to reset that run to `pending` only after OCR text is persisted and `card_count = 0`.
- Do not create a second extraction run for the same source unless the unique index and source detail assumptions are deliberately redesigned.

OCR failure behavior:

- Storage object missing: mark artifact/source failed with a recoverable error and leave no cards.
- Blank OCR text: mark `needs_review` or `skipped_no_text`, no cards.
- Provider timeout/rate-limit: mark failed; job retry follows existing backoff.
- Password-protected/corrupt PDFs: mark failed with safe message visible to parent/admin.
- Oversized extracted text: truncate or reject with explicit max text length before logistics extraction; record safe review reason.

## Tests

PR 1 daily nudge:

- Unit tests for unresolved item selection and ordering.
- Unit tests for email rendering privacy boundaries.
- Unit tests for notification sender selection defaulting to local stub.
- Local DB tests for notification-run uniqueness and retry/idempotency.
- Job runner tests for `send_daily_unresolved_nudge`, including `skipped_empty`.
- E2E optional: internal/local-stub preview only, no real Resend.

PR 2 weekly review:

- Unit tests for weekly item selection by household timezone/week boundary.
- Unit tests for digest grouping and privacy.
- Local DB tests for weekly uniqueness and no duplicate runs.
- Job runner tests for success/failure/skipped-empty.
- E2E only if a user-visible preview page is added.

PR 3 upload OCR:

- Unit tests for OCR provider selection and local stub/text/plain extraction.
- Unit tests for artifact status transitions and upload race handling.
- Local DB tests for finalize RPC auth: anon denied, helper denied, parent denied if not household admin, cross-household denied, owning household admin allowed.
- Local DB tests that helpers still cannot read `source_artifacts`, Storage objects, source detail page, or full extracted upload text.
- Job runner tests for `extract_artifact_text`, storage missing, blank text, provider failure, and successful enqueue/reset of logistics extraction.
- Existing upload tests must be updated intentionally where they currently assert upload extraction is skipped.
- No default test should call real Resend, Gemini, Twilio, GCP OCR, or any OCR provider.

Common verification:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

Add focused live/provider commands only as opt-in docs, never as default CI/local verification.

## Documentation Updates

For PR 1:

- `docs/setup/local-development.md`: notification env defaults, local stub behavior, cron behavior.
- `docs/ops/2026-05-25-cohort-readiness-checklist.md`: daily nudge enablement and monitoring.
- `AGENTS.md` and `CLAUDE.md`: current build status and out-of-scope boundaries.

For PR 2:

- Same setup/ops docs with weekly cadence, send window, and safe defaults.
- Add operator notes for checking notification failures and skipped-empty runs.

For PR 3:

- `docs/setup/local-development.md`: OCR env defaults, no-real-provider default, optional live smoke instructions.
- `docs/qa/famtandem-thin-app-test-plan.md`: upload OCR privacy and card creation coverage.
- `AGENTS.md` and `CLAUDE.md`: upload OCR status and remaining exclusions.
- Add a solution doc if implementation uncovers extraction-run lifecycle or provider-specific gotchas.

## Review Requirements

Each PR must run `ce-review` after local verification.

Also run read-only Cursor `gpt-5.5-high` review before merge for:

- PR 1 because it touches provider sending, jobs, privacy, and idempotency.
- PR 2 because it reuses provider sending/jobs and expands household-summary content.
- PR 3 because it touches storage, source privacy, OCR, extraction runs, and card creation.

Review prompts should explicitly ask for:

- Duplicate sends under cron retry.
- Provider timeout/failure behavior.
- Helper/source privacy leaks.
- RLS and `SECURITY DEFINER` gaps.
- Extraction/card duplication on retry.
- Default-local behavior that accidentally calls real providers.

## Acceptance Criteria

- [x] The three features are implemented in separate PRs with no bundled OCR/email/provider scope creep.
- [x] Daily nudges use a durable idempotency ledger and send only parent/admin summaries by default.
- [x] Weekly reviews reuse the shared item model and notification sender without becoming a calendar digest.
- [x] Upload OCR waits until object upload is finalized before reading Storage.
- [x] OCR text flows into `source_inputs.normalized_text`, then the existing `extraction_runs`/`create_extracted_cards` path creates source-backed cards.
- [x] Helpers cannot read raw artifacts, full extracted text, source detail, storage paths, or provider/extraction internals.
- [x] Resend remains opt-in; local/manual behavior remains safe by default.
- [x] No default local test or E2E calls real providers.
- [x] Docs explain env setup, safe defaults, cohort enablement, and operational failure checks.

## Out Of Scope Across All Three PRs

- Twilio/SMS implementation.
- Resend inbound email.
- Provider webhooks/status callbacks.
- Google Calendar.
- Signed downloads.
- Broad admin correction surface.
- Production credentials committed to code/docs/chat.
- Full notification preference center.
- Multi-file upload extraction.
- Hosted production OCR/Gemini credentials unless a later deployment plan explicitly handles them.

## Sources And Research

- `AGENTS.md`
- `CLAUDE.md`
- `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`
- `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`
- `docs/solutions/documentation-gaps/famtandem-phase-0-3-validation-loop-summary.md`
- `docs/solutions/integration-issues/resend-coverage-request-provider-review-20260526.md`
- `docs/plans/2026-05-25-feat-resend-outbound-coverage-requests-plan.md`
- `src/app/api/cron/jobs/route.ts`
- `src/lib/jobs/runner.ts`
- `src/lib/coverage-requests/senders/provider.ts`
- `src/lib/coverage-requests/senders/resend.ts`
- `src/lib/extraction/runner.ts`
- `supabase/migrations/20260523010000_phase2_upload_source_metadata.sql`
- `supabase/migrations/20260524103000_phase2_extraction_run_persistence.sql`
- `supabase/migrations/20260524120000_phase2_extraction_review_fixes.sql`
