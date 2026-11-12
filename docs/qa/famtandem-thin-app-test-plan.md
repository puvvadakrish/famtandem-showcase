# FamTandem Thin App QA Plan

For product-level hosted user evaluation, mobile/desktop click-through checks, and go/no-go reporting before real family use, also run `docs/qa/famtandem-user-evaluation-regression-suite.md`.

## Phase 0 Routes

- `/`: public app entry.
- `/login`: Supabase magic-link shell.
- `/app`: authenticated household coverage board; unauthenticated users redirect to `/login`.
- `/api/cron/jobs`: protected Vercel Cron route.

## Phase 1 Routes

- `/app`: real household board with `Needs Attention`, `This Week`, household setup, manual card create/edit, readiness, and coverage slot controls.
- `/household/new`: creates the first household admin and consent record before the manual board loop.

## Phase 2 Paste Intake Routes

- `/app`: household admins can use `Add logistics` to create a paste-backed `source_inputs` row and a source-linked coverage card.
- `/app/sources/[sourceInputId]`: parents and household admins can review pasted source metadata, full normalized pasted text, upload artifact metadata, and linked cards.

## Phase 2 Extraction Schema Fixtures

- No new route. The fixture evaluator is a local TypeScript/Vitest contract for future Gemini extraction output.

## Phase 2 Upload Metadata Foundation

- `/app`: household admins can upload one PDF/JPEG/PNG/WebP/plain-text source file directly to private Supabase Storage from `Add logistics`.
- Upload metadata is created through a narrow authenticated database RPC before direct-to-Supabase browser upload.
- `/app/sources/[sourceInputId]` can display upload source metadata and stored artifact metadata when an upload source exists.

## Phase 0 Checks

- Public app shell links to sign-in at mobile and desktop widths.
- Unit coverage verifies Needs Attention appears before This Week in the board shell.
- Unit coverage verifies sample cards show compact source summaries.
- Cron route returns `401` without `CRON_SECRET`.
- Cron route claims a bounded batch when called with `Authorization: Bearer $CRON_SECRET`.
- No critical accessibility violations on the sample board.

## Phase 1 Checks

- Household admins can add parent/helper members.
- Household admins can add children; children attach to cards but cannot own coverage.
- Manual cards create a real `coverage_cards` row plus initial `coverage_slots`, optional `card_children`, and optional `readiness_items`.
- `Needs Attention` is derived from attention flags and slot/readiness state, not card type.
- `This Week` shows cards whose coverage slots are resolved and have no active attention flags.
- "I'll cover it" moves a slot to `accepted` with the signed-in household member as owner.
- "Mark already covered" cannot save without a household member/helper or free-form external owner.
- Free-form external owners create an `external_contacts` row and preserve `external_owner_text`.
- Slot state transitions cover `needs_coverage`, `requested`, `accepted`, `declined`, `cancelled`, and `covered_external`.
- RLS policies cover children, external contacts, source inputs, cards, slots, readiness items, card children, requests/responses, and card events.
- Local Supabase smoke validation blocks cross-household slot owners, child-card links, and external-contact ownership when called through authenticated RLS.
- Local Supabase smoke validation blocks non-admin accepted-slot rewrites and self-cover attempts that try to change slot kind/card/external owner fields.

## Phase 2 Paste Intake Checks

- `Add logistics` requires pasted text and a card title.
- Paste intake creates `source_inputs.source_type = paste`, stores normalized pasted text, starts the source `pending`, and marks the source `processed` after linked board rows are created.
- Paste intake runs through the authenticated `create_paste_source_card` RPC so source, card, slot, optional child, optional readiness item, and card event are created atomically.
- The generated card stores `source_input_id`, compact `source_summary`, `full_source_ref`, confidence, review note, and the existing slot/readiness/child relationships.
- The card source details show the compact source summary first and the full pasted source text behind expansion for parents and household admins.
- Database validation rejects a card whose `source_input_id` belongs to another household.
- If card creation fails, the RPC rolls back all paste intake rows.
- Analytics for paste intake only includes internal ids and coarse source-size buckets; raw source text and child/contact details are not sent.
- This slice intentionally does not test upload/PDF/image intake, Resend inbound email, Gemini extraction, Twilio, Google Calendar, or admin correction.
- Authenticated Playwright coverage signs in through local Mailpit magic links, creates a household, submits paste intake, verifies source expansion, and checks the linked Supabase row graph.
- Source detail coverage verifies `View source`, the processed source metadata, full pasted text, linked card summary, and helper denial for full pasted source detail.

## Phase 2 Upload Metadata Checks

- `source_artifacts` records upload metadata for the private `source-artifacts` bucket.
- Upload metadata enforces a 10 MB size limit and only allows PDF, JPEG, PNG, WebP, and plain text MIME types.
- Artifact rows must reference a source input in the same household.
- Artifact storage paths must be scoped under `household_id/source_input_id/`.
- Direct Storage object inserts must exactly match a precreated `source_artifacts.storage_path`; arbitrary household-prefixed object paths are rejected.
- `Add logistics` validates upload file type and 10 MB size before metadata creation.
- Direct upload writes bytes to the returned private `source-artifacts` storage path and then opens `/app/sources/[sourceInputId]`.
- Household admins can create upload source metadata; helpers cannot read full artifact metadata through the source detail boundary.
- Helpers cannot download raw private `source-artifacts` objects even if they know an exact storage path; raw artifact reads use the same parent/household-admin/internal-admin boundary as full source detail.
- Upload sources start as `needs_review`; after browser upload finalization, artifact text extraction starts as `pending`.
- Plain-text uploads can be extracted by `extract_artifact_text` into reviewable `source_inputs.normalized_text`; parent/admin approval is required before the existing extraction run/card creation path is queued.
- PDF/image OCR remains disabled by default. When `ARTIFACT_TEXT_PROVIDER=gemini` and `GEMINI_API_KEY` are explicitly set, OCR extracts text into the same review/approval path instead of creating cards directly.
- This slice intentionally does not upload bytes through Next.js, call real OCR/Gemini by default, or add signed download routes.

## Phase 2 Extraction Run Persistence Checks

- Every `source_inputs` insert creates exactly one `extraction_runs` row plus one `jobs.kind = 'extract_source'` row, via an `AFTER INSERT` trigger; replay does not duplicate either.
- `extraction_runs.household_id` must match the linked source input's household, enforced by a trigger.
- Parents, household admins, and internal admins can read `extraction_runs`; helpers and other roles cannot.
- `start_extraction_run` and `record_extraction_run` are `service_role`-only and reject non-terminal status writes through `record_extraction_run`.
- The protected `/api/cron/jobs` route dispatches `extract_source` payloads to `runExtractionForSourceInput`, which validates the local stub output through `family-logistics-v1` before calling `record_extraction_run`.
- Paste sources resolve to `succeeded` with zero cards and `noActionReason = 'stub-extractor: pasted source not yet processed by a model'`.
- Upload sources without finalized/extracted text remain pending/needs review; finalized uploads with extracted text remain `needs_review` until a parent/admin approves the text.
- Approval sets the upload source back to `pending`, resets the existing extraction run, and queues exactly one active `extract_source` job.
- An `extract_source` job whose payload is missing `extraction_run_id` is marked failed by the runner without invoking the extractor.
- Failed runs preserve `last_error`, leave `finished_at` null, and are eligible for retry through the existing job runner backoff.
- This slice intentionally does not run real OCR on uploaded PDFs/images by default, add signed downloads, or wire Twilio/Resend/Google Calendar.

## Phase 2 Run-Driven Card Creation Checks

- `create_extracted_cards(p_extraction_run_id, p_cards jsonb)` is `service_role`-only and rejects non-array payloads.
- For each card in the array, the RPC inserts one `coverage_cards` row, one `coverage_slots` row per suggested slot (defaulting to `general_owner` when empty), one `readiness_items` row per item, and one `extracted_source_card_created` `card_events` row with a confidence bucket in metadata.
- Attention flags include `needs_coverage` always, `needs_review` when review reasons are present or confidence < 0.75, and `changed` when the card type is `change_standalone` or `changedFields` is non-empty. `computed_coverage_state` is derived from those flags.
- Cards are linked to their source via `full_source_ref = 'source_inputs:<id>'`.
- `create_extracted_cards` is idempotent: when the run's `card_count > 0`, the RPC returns existing card ids without inserting.
- The extraction runner only calls `create_extracted_cards` when the validated output contains at least one card and passes the resulting count into `record_extraction_run.p_card_count`.

## Phase 2 Provider Selection Checks

- `selectExtractor(env)` returns the local stub unless both `EXTRACTION_PROVIDER = 'gemini'` and `GEMINI_API_KEY` are present (whitespace-only keys are treated as missing).
- The Gemini runtime extractor skips upload sources without normalized text and can process upload sources only after artifact text is available.
- `GEMINI_MODEL` overrides the default `gemini-3.5-flash` when set.
- `ARTIFACT_TEXT_PROVIDER` defaults to `disabled`; `ARTIFACT_TEXT_MODEL` defaults to `gemini-3.5-flash` for opt-in OCR experiments.
- Gemini credentials must come from local process environment only. No key may be committed to docs, env files, or test fixtures.
- The `/api/cron/jobs` route reports `provider` on the `cron_jobs_processed` PostHog event so ops visibility tracks which extractor was active without exposing source content.

## Phase 2 Extraction Schema Checks

- Extraction output must parse through the versioned `family-logistics-v1` Zod schema before any future app-state creation.
- Eval fixtures compare expected card count, no-action reasons, card type, timing/location fields, suggested coverage slots, known coverage hints, readiness items, decision/change expectations, source evidence labels, confidence bands, and Needs Review expectations.
- Needs Review derivation covers low confidence, missing date/time, missing transportation location, detected change candidates, and action-heavy form/payment/bring/medical-style items.
- Fixtures remain synthetic/anonymized and are not persisted to Supabase, seed data, storage, or analytics.
- This slice intentionally does not call Gemini, enqueue extraction jobs, add `extraction_runs`, upload files through the app, or create coverage cards from uploaded files.

## Phase 4 Google Calendar Coverage Export Checks

- Google Calendar is disabled by default unless explicit Google OAuth env vars are configured.
- Local unit and E2E checks mock provider behavior and must not call real Google APIs by default.
- Parent and household admin users can connect Google Calendar; helpers do not see connect/export/disconnect controls and cannot use the routes.
- OAuth connect must be completed in the same browser session that is logged into FamTandem, because the callback validates the signed state against the active FamTandem user.
- Only timed coverage cards can be exported. Untimed cards keep the board usable and show calm local-safe copy.
- The card-level Calendar CTA stays secondary to `Ask for coverage` on mobile and desktop.
- First export creates one Google event and stores a local mapping for that card and connection.
- Re-export updates the mapped Google event instead of creating a duplicate.
- Disconnect leaves existing Calendar events inert and removes the active local connection for future exports.
- Calendar event title, time, location, and description must not include raw source text, artifact paths, token hashes, private provider payloads, emails, or helper-hidden source details.
- Hosted smoke should cover connect, create export, update export, `View in Google Calendar`, Vercel error logs, and a mobile coverage request/response loop that preserves the exported Calendar state.
- Browser UX checks should include no horizontal overflow, visible bottom navigation on mobile, readable card CTAs, no framework overlays, and no console errors or warnings during the flow.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build
npm run test:e2e
```

When using local Supabase from Docker, prefer `npm run build:local` and `npm run test:e2e:local` so the commands receive the generated local Supabase credentials from `npx supabase status -o env`.

Live Gemini extraction evals require a local key and must not write Supabase rows, storage objects, jobs, analytics events, or app-state records:

```bash
GEMINI_API_KEY=... npm run test:extraction:live
```

## Later-Phase Coverage To Add

- Provider webhook signature tests for Resend and Twilio.
- Source artifact access tests for parent/admin versus helper token pages.
- Expanded live Supabase household isolation tests for source artifacts, request/response token paths, and later provider-created rows.
- Token response tests for missing, malformed, expired, reused, already-accepted/declined, and rate-limited links.
- Compare future Gemini outputs against the 15-fixture synthetic/anonymized suite and continue expanding toward corrected real-world patterns only after privacy review.
- Continued mobile and accessibility checks for no-account response links as new coverage flows are added.
