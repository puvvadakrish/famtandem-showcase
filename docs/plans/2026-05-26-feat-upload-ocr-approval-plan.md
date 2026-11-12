---
title: "feat: Add upload OCR approval"
type: feat
status: complete
date: 2026-05-26
origin: docs/plans/2026-05-26-feat-next-validation-features-plan.md
---

# feat: Add upload OCR approval

## Overview

Add the narrow upload OCR slice after parent card editing: uploaded PDFs/images/screenshots can produce extracted source text, but that text must be reviewed before it feeds logistics extraction and creates source-backed cards.

This keeps upload artifacts private, avoids helper exposure, keeps real OCR opt-in, and avoids creating cards from unreviewed OCR output.

## Baseline Context

- Upload metadata and private Storage already exist.
- `finalize_upload_source_artifact` queues `extract_artifact_text` after the browser upload succeeds.
- Current `extract_artifact_text` handles `text/plain` and marks PDFs/images `not_applicable`.
- Current `record_artifact_text_extraction(..., "succeeded", text)` immediately writes `source_inputs.normalized_text` and queues `extract_source`.
- Source detail is already parent/household-admin only and can host extracted text review.

## In Scope

- [x] Add an artifact OCR provider seam that defaults to disabled/local behavior.
- [x] Add an opt-in Gemini OCR adapter using inline PDF/image data with explicit env gating.
- [x] Keep PDF/image OCR disabled by default when `ARTIFACT_TEXT_PROVIDER` is not enabled.
- [x] Store OCR/text extraction output as reviewable source text without immediately queueing logistics extraction.
- [x] Add parent/household-admin approval RPC/action that edits approved text and queues the existing `extract_source` path.
- [x] Add source detail UI for reviewing extracted upload text and approving card creation.
- [x] Preserve text/plain deterministic extraction, but route it through the same review/approval step.
- [x] Preserve helper denial for source detail, source text, artifact rows, artifact Storage objects, storage paths, and provider internals.
- [x] Add unit, migration, live DB, and focused UI tests.
- [x] Update setup/QA/context docs.
- [x] Open PR, run `ce-review`, and run read-only Cursor GPT-5.5 high before merge.

## Out Of Scope

- No signed downloads.
- No broad admin correction surface.
- No multi-file upload OCR.
- No provider webhooks/status callbacks.
- No Twilio/SMS, Resend inbound, or Google Calendar.
- No production credentials committed.
- No default local test or E2E calling Gemini/OCR providers.
- No direct card creation from unreviewed OCR output.

## Implementation Plan

### 1. Provider Seam

Add `src/lib/artifact-text/provider.ts` and `src/lib/artifact-text/gemini.ts`.

Environment:

- `ARTIFACT_TEXT_PROVIDER=disabled|gemini`, default `disabled`.
- `GEMINI_API_KEY` remains process-env only.
- `ARTIFACT_TEXT_MODEL`, default `gemini-3.5-flash`.

Behavior:

- `text/plain` remains deterministic and local.
- PDF/image artifacts call Gemini only when provider is `gemini` and a key is present.
- Disabled or missing-key PDF/image artifacts keep the current `not_applicable` behavior.
- Gemini OCR sends inline `inline_data`/`inlineData` PDF/image bytes to `generateContent`, following Google AI docs for image understanding and document processing.
- Prompt asks for extracted source text only, not logistics cards.

### 2. Reviewable Text State

Add a migration that changes the successful artifact text path:

- `record_artifact_text_extraction(..., "succeeded", text)` stores text in `source_inputs.normalized_text`.
- Keep `source_inputs.status = 'needs_review'`.
- Keep or set `source_artifacts.text_extraction_status = 'needs_review'`.
- Do not queue `extract_source` from this service-role recording RPC.
- Keep failed/blank/not-applicable behavior terminal and privacy-safe.

Add `approve_upload_extracted_text(p_source_input_id uuid, p_source_artifact_id uuid, p_approved_text text)`:

- `SECURITY DEFINER`, authenticated only.
- Allows same-household `parent`, `household_admin`, or internal admin.
- Requires `source_inputs.source_type = 'upload'`.
- Requires same-household artifact/source match.
- Requires non-empty approved text.
- Updates `source_inputs.normalized_text`, `source_inputs.status = 'pending'`.
- Marks artifact extraction `succeeded`.
- Resets existing `extraction_runs` row with `card_count = 0` to `pending`.
- Queues exactly one active `extract_source` job for that run.
- Idempotently avoids duplicate jobs.

### 3. Source Detail Review UI

Reuse `/app/sources/[sourceInputId]`:

- For upload sources with extracted text and no linked cards, show `Extracted text`.
- Render an editable textarea seeded from `source_inputs.normalized_text`.
- Add primary action `Approve and create cards`.
- Keep the existing read-only text display for paste sources and already-linked sources.
- Do not show raw artifact download links or signed URLs.

### 4. Tests

Unit:

- `text/plain` records reviewable text and does not imply direct card creation.
- PDF/image disabled path makes no provider call.
- Gemini OCR adapter uses inline PDF/image data, safe prompt, timeout, and no copied provider internals in errors.
- Provider selection defaults to disabled.
- Source detail renders approval form only for upload sources with reviewable text and no linked cards.

Migration/live DB:

- Successful record writes `normalized_text`, leaves source `needs_review`, and does not queue `extract_source`.
- Approval by parent/admin queues one `extract_source`.
- Helper/cross-household approval denied.
- Duplicate approval does not create duplicate active jobs.
- Helpers still cannot read source inputs, artifacts, or Storage objects.

Verification:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npx --yes supabase db reset
node scripts/with-local-supabase-env.mjs npx vitest run --config vitest.live.config.ts tests/live/upload-text-extraction-live.test.ts
npm run build:local
npm run test:e2e:local
git diff --check
```

## Acceptance Criteria

- [x] PDF/image OCR is opt-in and default local behavior makes no provider calls.
- [x] Extracted upload text is visible only to parent/household-admin/internal-admin users.
- [x] Extracted text does not create cards until parent/admin approval.
- [x] Approval queues the existing extraction run/card creation path.
- [x] Existing text/plain upload extraction still works through review/approval.
- [x] Helper privacy remains enforced.
- [x] Local verification passes without real provider calls.

## Review Requirements

Run `ce-review` before merge.

Also run read-only Cursor GPT-5.5 high before merge because this touches OCR, provider calls, jobs, source privacy, Storage, extraction runs, and card creation.

## Sources

- `docs/plans/2026-05-26-feat-next-validation-features-plan.md`
- `src/lib/artifact-text/runner.ts`
- `src/lib/jobs/runner.ts`
- `src/app/app/sources/[sourceInputId]/page.tsx`
- `supabase/migrations/20260526140000_phase3_upload_text_extraction.sql`
- `tests/unit/artifact-text-runner.test.ts`
- `tests/live/upload-text-extraction-live.test.ts`
- Google AI Gemini image understanding docs: https://ai.google.dev/gemini-api/docs/image-understanding
- Google AI Gemini document processing docs: https://ai.google.dev/gemini-api/docs/document-processing
