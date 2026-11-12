---
module: Upload OCR Approval
date: 2026-05-26
problem_type: integration_issue
component: artifact_text_extraction_jobs
symptoms:
  - "Approval could queue logistics extraction before upload text was actually awaiting review"
  - "OCR/provider failures could leave artifacts pending without source/run failure state"
  - "Non-JSON Gemini HTTP errors could be masked by JSON parse exceptions"
root_cause: missing_phase_boundary
resolution_type: code_fix
severity: high
tags:
  - upload-ocr
  - gemini
  - extraction-runs
  - approval-rpc
  - source-privacy
  - provider-errors
  - pr-23
---

# Upload OCR Approval Gated Extraction

## Problem

PR #23 added the upload OCR/text approval foundation: uploaded text is extracted into reviewable source text, then a parent or household admin approves that text before logistics extraction can create source-backed coverage cards.

The review pass found three fragile integration edges:

- `approve_upload_extracted_text` could be called before artifact text extraction had actually produced reviewable text.
- OCR/provider failures could fail the job without reliably updating artifact, source, and extraction-run state first.
- The Gemini OCR adapter parsed JSON before checking `response.ok`, so non-JSON provider errors could show up as misleading JSON parse failures.

## Root Cause

The upload pipeline has two distinct phases:

1. Artifact text/OCR extraction: private uploaded file to reviewable plain text.
2. Logistics extraction: approved plain text to source-backed coverage cards.

The bug was allowing phase one state to blur into phase two. If artifact text extraction was treated as enough to enqueue `extract_source`, cards could be created from unreviewed or caller-supplied text. If provider failure skipped artifact/source/run recording, uploads could remain stuck in an ambiguous pending state.

## Working Solution

`record_artifact_text_extraction` now treats successful artifact text extraction as review-needed, not card-ready.

In [20260526170000_phase3_upload_ocr_approval.sql](/supabase/migrations/20260526170000_phase3_upload_ocr_approval.sql), `p_status = 'succeeded'` stores `source_inputs.normalized_text`, sets the source and artifact to review state, and leaves the existing extraction run as `skipped_no_text` with the reason `upload artifact text is awaiting parent review before card creation`. It does not enqueue `extract_source`.

`approve_upload_extracted_text` is the only gate from extracted upload text into card creation. It requires an authenticated same-household parent, household admin, or internal admin; matching source/artifact/household IDs; non-empty approved text; artifact status `needs_review`; source status `needs_review`; and a zero-card extraction run waiting on the exact review reason. Duplicate approval remains idempotent and does not create duplicate active `extract_source` jobs.

`extractTextForSourceArtifact` in [runner.ts](/src/lib/artifact-text/runner.ts) records terminal artifact state before returning or rethrowing:

- unsupported type or disabled OCR provider: `not_applicable`
- storage read failure: `failed`, then throws
- provider exception: `failed`, then rethrows
- blank OCR/text output: `not_applicable`
- successful text: `succeeded`, which the RPC stores as review-needed

`createGeminiArtifactTextExtractor` in [gemini.ts](/src/lib/artifact-text/gemini.ts) now checks `response.ok` before parsing the success payload. On non-OK responses, it attempts to read Gemini error JSON but falls back to a status-based error when the body is not JSON.

## Verification

The fixed slice was verified with:

```bash
npx --yes supabase db reset
npm run lint
npm run typecheck
npx vitest run tests/unit/artifact-text-runner.test.ts tests/unit/artifact-text-provider.test.ts tests/unit/gemini-artifact-text.test.ts tests/unit/phase3-upload-ocr-approval-migration.test.ts tests/unit/jobs-runner.test.ts tests/unit/env.test.ts
node scripts/with-local-supabase-env.mjs npx vitest run --config vitest.live.config.ts tests/live/upload-text-extraction-live.test.ts
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

The final local E2E pass succeeded with 28 tests. Earlier E2E attempts hit known local Next `.next` cache/startup races, then passed after rerun.

Review gates:

- CE review found the premature approval and provider-failure blockers.
- Gemini Code Assist flagged provider failure recording and non-JSON Gemini error parsing.
- Cursor GPT-5.5 high returned no blocking findings after fixes.
- PR #23 merged as `800d591 feat(upload): add OCR extracted text approval`.

## Prevention

Keep these invariants for future OCR, extraction, provider, and source-privacy slices:

- Artifact OCR/text extraction must never create coverage cards directly.
- `record_artifact_text_extraction(..., "succeeded", text)` must mean "reviewable text exists", not "logistics extraction may run".
- `approve_upload_extracted_text` must remain the only approval gate from uploaded extracted text into `extract_source`.
- Approval must cross-check source, artifact, household, caller role, source status, artifact status, and extraction-run state.
- Duplicate approval and retry behavior must not create duplicate active jobs or duplicate cards.
- Local/default behavior must not call Gemini, OCR, Resend, Twilio, Google, or any real provider.
- Provider errors must be recorded before rethrowing and must avoid raw source text, artifact bytes, API keys, Storage paths, or provider internals.
- Helpers must not read source inputs, normalized text, source artifacts, Storage objects, OCR output, extraction runs, provider details, or artifact paths.
- Unsupported or disabled PDF/image OCR should be `not_applicable`, not a provider call.
- Text/plain extraction should remain deterministic/local but still flow through the same review/approval gate.

Tests worth keeping close to this boundary:

- `tests/unit/artifact-text-provider.test.ts`
- `tests/unit/artifact-text-runner.test.ts`
- `tests/unit/gemini-artifact-text.test.ts`
- `tests/unit/phase3-upload-ocr-approval-migration.test.ts`
- `tests/live/upload-text-extraction-live.test.ts`
- `tests/unit/env.test.ts`
- `tests/unit/jobs-runner.test.ts`

Future provider slices should add focused tests for cron execution with OCR disabled, provider failure state, forged helper approval attempts, approval analytics privacy, and concurrent duplicate approvals.

## Related Docs

- Direct plan: [Upload OCR approval](../../plans/2026-05-26-feat-upload-ocr-approval-plan.md)
- Parent plan: [Next validation features](../../plans/2026-05-26-feat-next-validation-features-plan.md)
- Related upload/job failure-boundary note: [Upload and notification review follow-ups](./upload-notification-review-followups-20260526.md)
- Related Gemini extraction contract note: [Gemini fixture eval prompt contract](./gemini-fixture-eval-prompt-contract.md)
- Related provider-boundary note: [Resend coverage request provider review](./resend-coverage-request-provider-review-20260526.md)
