# FamTandem Architecture Notes

## Phase 0 Stack

- Next.js App Router with TypeScript for the mobile-first web app.
- Supabase Auth, Postgres, Row Level Security, and private Storage.
- Vercel for app hosting and protected Cron route handlers.
- PostHog for validation analytics with privacy-safe properties.
- Vitest for unit/integration tests and Playwright for mobile/accessibility smoke coverage.

## Supabase Boundary

Supabase is the v1 acceleration choice. Keep product code behind small helper modules:

- `src/lib/supabase/*` for client creation.
- Database functions for job claiming and retry state.
- Server modules for privileged service-role access.

If RLS complexity, storage privacy, queueing, or operational needs outgrow Supabase, the exit path is to keep Postgres-compatible schema boundaries and replace the helper modules before replacing product code.

## Job Runner Baseline

The `jobs` table supports:

- `pending`, `running`, `succeeded`, and `failed` states.
- Bounded batch claiming with `for update skip locked`.
- Stale running job recovery after 15 minutes.
- Bounded retries through `max_attempts`.
- Admin-visible `job_events`.

Current processors include source extraction, upload text/OCR extraction, daily unresolved nudges, and weekly coverage reviews. Provider callbacks and calendar imports remain out of scope; the job runner should continue adding narrow processors without changing the Cron protection contract.

## Phase 1 Manual Board Loop

The manual board loop is the first real household data surface:

- `children` attach to cards through `card_children`; children cannot own coverage or receive v1 notifications.
- `coverage_cards` keep stable `card_type` separate from `attention_flags`.
- `coverage_slots` own coverage state and enforce an owner for `accepted` and `covered_external`.
- `readiness_items` stay card-anchored for forms, payments, supplies, and prep items.
- `external_contacts` preserve free-form offline owners such as Grandma, carpool, aftercare, or school bus.
- `card_events` records manual card, slot, and readiness changes for auditability.

Shared attention and coverage calculation lives in `src/lib/coverage-state.ts` and is used by server actions and board rendering. The current app now has source intake, gated Gemini extraction, lightweight response links, opt-in Resend coverage-request email, upload text/OCR approval, and one-way Google Calendar export. Calendar import/two-way sync, inbound email, SMS sends, provider callbacks, signed downloads, and broad admin correction remain out of scope.

## Phase 2 Handoff

Historical handoff: the next implementation slice after Phase 1 was paste/manual source intake before provider-backed ingestion:

- Create `source_inputs` from pasted logistics text.
- Keep source text and compact source summaries available to the board for trust.
- Reuse the existing manual board/card flow where possible.
- Defer upload/PDF/image storage flows, Resend inbound email, Gemini extraction, Twilio coverage links, Google Calendar, and broad admin correction until later slices.

## Phase 2 Paste Source Intake

The first Phase 2 slice adds local paste intake without provider credentials:

- Household admins can paste copied logistics text from `/app`.
- Paste intake creates a `source_inputs` row with `source_type = 'paste'`, the submitted member, a source title, and `normalized_text`; it starts `pending` and flips to `processed` only after the linked board rows are created.
- The same authenticated `create_paste_source_card` RPC creates a source-linked `coverage_cards` row, first coverage slot, optional child link, optional readiness item, and card audit event in one Postgres transaction.
- The RPC derives initial attention flags and coverage state from the submitted card fields instead of trusting browser-provided state.
- Cards created from paste source keep `source_input_id`, `full_source_ref = source_inputs:{id}`, a compact `source_summary`, and the full pasted `normalized_text` behind parent/household-admin source details.
- The database trigger for `coverage_cards` enforces that `source_input_id` belongs to the same household as the card.
- If downstream card creation fails, the RPC rolls back the source/card/slot/readiness/event writes together so no partial paste intake rows remain.
- PostHog events for this slice use internal ids and coarse text-size buckets only; pasted text, child names, addresses, emails, phone numbers, and source excerpts are never sent to analytics.

Later Phase 2/3 work added direct browser-to-storage upload UX, Gemini extraction runs, upload text/OCR approval, source-backed card correction, and one-way Google Calendar export. Resend inbound email, SMS sends, provider callbacks, signed downloads, broad admin correction, and Calendar import/two-way sync remain deferred.

## Phase 2 Extraction Schema And Fixtures

The next narrow Phase 2 slice adds extraction contract scaffolding without live Gemini calls:

- `src/lib/extraction/schema.ts` defines the versioned `family-logistics-v1` Zod contract for source summaries, no-action sources, cards, date precision, suggested coverage slots, known coverage hints, readiness items, change candidates, confidence, review reasons, and source evidence references.
- `src/lib/extraction/eval.ts` provides a local fixture evaluator that compares parsed extraction-shaped output against expected cards, timing/location fields, slots, known coverage, readiness items, changes, decision fields, evidence labels, confidence bands, and review expectations.
- 15 synthetic/anonymized fixtures live under `tests/fixtures/extraction`; they are not stored in Supabase, migrations, seed data, PostHog, or source artifact storage.
- Review derivation currently flags low confidence, missing event/deadline time, missing transportation location, change candidates, and action-heavy form/payment/bring/medical-style items.
- This slice deliberately does not add `extraction_runs`, Gemini calls, extraction jobs, admin correction routes, upload handling, provider credentials, or database/RLS changes.

Run the local contract/eval suite with:

```bash
npm run test:extraction
```

Live Gemini evals are isolated behind `npm run test:extraction:live`. They call Gemini with synthetic fixture text, validate output through `family-logistics-v1`, and compare it with the existing evaluator. They require `GEMINI_API_KEY` in the process environment and deliberately do not write to Supabase, jobs, storage, analytics, or app routes.

The pasted source detail slice adds `/app/sources/[sourceInputId]` as a read-only household route for pasted sources only. It requires an authenticated active household member and explicitly limits full source detail to `parent` and `household_admin` roles, matching the full-source trust boundary on board cards. It shows source metadata, normalized pasted text, and linked card summaries without adding correction controls, upload/OCR, extraction jobs, provider credentials, or database/RLS changes.

## Phase 2 Upload Metadata Foundation

The upload metadata/storage foundation adds the database layer for file-backed source inputs without adding OCR, Gemini extraction, production credentials, or large file handling through Next.js routes:

- `source_artifacts` stores private `source-artifacts` bucket metadata for uploaded PDFs, images, screenshots, and text files.
- Artifacts are tied to a `source_inputs` row with `source_type = 'upload'`, a household, submitter, original filename, MIME type, file size, optional SHA-256 checksum, and text extraction status.
- Database checks enforce the existing 10 MB file limit and the local allowlist: PDF, JPEG, PNG, WebP, and plain text.
- Artifact rows must reference a source input in the same household and use storage paths scoped as `household_id/source_input_id/file`.
- `create_upload_source_metadata` creates an upload source plus its first artifact metadata row and returns the storage path used by the direct-to-Supabase browser upload.
- Household admins can create upload metadata and upload objects to the private bucket path; parents/admins can read artifact metadata through authenticated app surfaces.
- `/app/sources/[sourceInputId]` can now show upload source metadata and linked artifact rows, but it does not expose signed downloads yet.
- Raw `source-artifacts` storage object reads use the same full-source boundary as source detail: internal admins, parents, and household admins only. Helpers should not be able to download raw artifacts even if they know a storage path.
- Direct browser uploads to `source-artifacts` are allowed only when the object path exactly matches an existing `source_artifacts.storage_path` row for an upload source in a household administered by the signed-in user. A household-prefixed path alone is not enough.

The upload UI validates one PDF/JPEG/PNG/WebP/plain-text file up to 10 MB before creating metadata, uploads bytes directly to the returned private Storage path, and opens the source detail page for review.

This slice intentionally did not extract text, enqueue jobs, call Gemini, create coverage cards from uploads, add signed downloads, or send analytics for uploaded file content. Later slices added approval-gated upload text/OCR extraction and card creation after parent/admin review; signed downloads and uploaded-content analytics remain out of scope.

## Phase 2 Extraction Run Persistence

The next narrow Phase 2 slice adds an audit/foundation row for every source input without calling production Gemini:

- `extraction_runs` is the unit of record for each source input's extraction attempt. It captures provider, model, schema version, status (`pending`, `running`, `succeeded`, `failed`, `skipped_no_text`), attempts, review reasons, raw output, no-action reason, card count, started/finished timestamps, and last error.
- A unique index on `source_input_id` keeps the relationship 1-to-1: every source input has exactly one run row across its lifetime; retries increment `attempts` and rewrite status on the same row.
- An `AFTER INSERT` trigger on `source_inputs` creates the `pending` run row and enqueues exactly one `jobs.kind = 'extract_source'` payload `{ extraction_run_id, source_input_id, household_id, source_type }`. The trigger uses `on conflict (source_input_id) do nothing` so replays cannot create duplicate runs or duplicate jobs.
- `start_extraction_run` and `record_extraction_run` are `service_role`-only `SECURITY DEFINER` RPCs. The first transitions the run to `running`, bumps `attempts`, and stamps `started_at`. The second writes the terminal state (`succeeded`, `failed`, or `skipped_no_text`) and clears `last_error` on success.
- A same-household trigger enforces that `extraction_runs.household_id` matches the linked `source_inputs.household_id`. Parents, household admins, and internal admins can read run rows through RLS; no other roles can read or write.
- The protected `/api/cron/jobs` route claims `extract_source` jobs through the existing job runner and dispatches them to `runExtractionForSourceInput`, which loads the source input, runs the local stub extractor, validates output through `family-logistics-v1`, and calls `record_extraction_run`.
- The local stub extractor in `src/lib/extraction/local-extractor.ts` is deterministic: paste sources return a schema-valid result with `noActionReason = 'stub-extractor: pasted source not yet processed by a model'` and no cards. Upload sources return `kind: 'skipped'` and the run row settles into `skipped_no_text`.
- When the extracted output contains one or more cards, the runner calls the service_role-only `create_extracted_cards(p_extraction_run_id, p_cards jsonb)` RPC, which iterates over the cards array and inserts one `coverage_cards` row per element (source-linked via `full_source_ref = 'source_inputs:<id>'`), one `coverage_slots` row per suggested slot kind (falling back to `general_owner` when none are suggested), one `readiness_items` row per item, and an `extracted_source_card_created` audit event with a coarse confidence bucket in metadata. Attention flags and `computed_coverage_state` are derived server-side from card fields (review reasons, confidence, changed fields) so browser-supplied state cannot influence the board.
- `create_extracted_cards` is idempotent: if the run row's `card_count > 0`, the RPC returns the existing source-linked card ids without inserting anything. The runner uses the returned row count for `record_extraction_run.p_card_count`.
- The local stub still produces zero cards by default, so this path is exercised in tests but not in normal local runs. Once Gemini is enabled (see below), the same path is used for live extraction output.
- Provider selection lives in `src/lib/extraction/provider.ts`. The protected `/api/cron/jobs` route resolves an extractor through `selectExtractor(env)` and injects it into the job runner. The default is the local stub (`provider = 'local-stub'`, `model = 'local-stub-v1'`). When `EXTRACTION_PROVIDER = 'gemini'` and `GEMINI_API_KEY` are both present in local or hosted env, the runtime uses `createGeminiRuntimeExtractor`, which validates output through `family-logistics-v1` before returning. Default model is `gemini-3.5-flash`; override with `GEMINI_MODEL` if a different model name is required.
- Gemini credentials are local/hosted environment only by convention. Do not commit a key to `.env`, `.env.local` checked-in fragments, docs, or chat. Keep local keys in shell environment or a gitignored env file, and hosted keys only in the deployment provider's sensitive env storage.
- Resend outbound coverage-request email, one-way Google Calendar export, approval-gated upload OCR/text extraction, parent card correction, and hosted provider credentials now exist behind narrow gates. Twilio/SMS sends, Resend inbound email, provider callbacks, signed downloads, broad admin correction, Calendar import/two-way sync, and production credentials in code/docs remain deferred.

## Privacy Defaults

- Household data is scoped through membership RLS policies.
- Phase 1 household reference triggers enforce that card children, slot owners, readiness owners, card events, requests, source submitters, and external contacts point only at rows from the same household.
- Non-admin slot updates are constrained by trigger logic to the narrow self-cover path: accepting an unaccepted slot for the signed-in member without changing slot kind, card, or external-owner fields.
- Household admins can manage setup and manual cards; active household members can read their household board and accept their own coverage slot through server actions.
- Internal founder/admin access uses `internal_admins`, separate from household administration.
- Household bootstrap uses a transactional `create_household_bootstrap` RPC so household, first admin member, and cohort consent are created together.
- Direct `household_members` inserts are not available to ordinary authenticated users; later invitation/member-management flows should use explicit server-side paths.
- Job runner RPCs are executable by `service_role` only, so browser clients cannot bypass the protected Cron route.
- Source artifacts live in a private bucket and should be served through authorized app routes or signed URLs.
- Source detail stores raw extraction/OCR failure text for audit, but parent/admin UI must render only fixed, sanitized user-facing failure copy. Ops/admin snapshots should continue using coarse error buckets and must not expose raw source text, artifact paths, token hashes, emails, phone numbers, or provider payloads.
- Early cohort consent warns families not to submit detailed medical, financial, legal, custody, or highly sensitive records.
