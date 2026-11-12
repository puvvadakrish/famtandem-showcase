# Handoff: Phase 2 Extraction Run Persistence + Card Creation + Gemini Gating

Last updated: 2026-05-24.

## Status

**MERGED.** All four Phase 2 PRs (#2 → #3 → #4 → #5) squash-merged into `main` on 2026-05-24. This doc is a historical record of what shipped plus pickup guidance for the next slice.

Workspace:

```text
(repo root)
```

Default branch: `main` at commit `0f82891 feat(phase-2): extraction runs, run-driven cards, Gemini provider gating`.

All `codex/phase-2-*` branches have been deleted on both remote and local. Open PRs: 0. Start the next slice from a fresh branch off `main` (see "Codex Handoff Notes" below).

## What Shipped

Three tightly related slices on the same branch, in three commits:

### 1. Extraction run persistence + stubbed source-to-extraction job

- New migration `supabase/migrations/20260524103000_phase2_extraction_run_persistence.sql`:
  - `public.extraction_run_status` enum (`pending`, `running`, `succeeded`, `failed`, `skipped_no_text`).
  - `public.extraction_runs` with provider/model/schema_version, attempts, review_reasons jsonb, raw_output jsonb, no_action_reason, card_count, started/finished timestamps, last_error, and a unique index on `source_input_id` enforcing strict 1-to-1 with source inputs.
  - RLS read policy limited to parent/household_admin/internal_admin; no insert/update/delete policy (writes go exclusively through `SECURITY DEFINER` RPCs as `service_role`).
  - `validate_extraction_run_household` trigger ensures `extraction_runs.household_id` matches the linked source input.
  - `enqueue_source_input_extraction` `AFTER INSERT` trigger on `source_inputs` creates one `extraction_runs` row plus one `jobs.kind = 'extract_source'` payload `{ extraction_run_id, source_input_id, household_id, source_type }`. `on conflict (source_input_id) do nothing` makes the enqueue idempotent.
  - `start_extraction_run(p_run_id uuid)` and `record_extraction_run(p_run_id, p_status, p_review_reasons, p_raw_output, p_no_action_reason, p_card_count, p_last_error)` `service_role`-only RPCs. `record_extraction_run` rejects non-terminal status writes.
- New `src/lib/extraction/local-extractor.ts` deterministic stub: paste sources with non-empty `normalized_text` return a schema-valid `family-logistics-v1` result with zero cards and a stub `noActionReason`; uploads and empty paste return `{ kind: 'skipped', reason: 'no_text_available' }`.
- New `src/lib/extraction/runner.ts` worker:
  - Calls `start_extraction_run`, loads `source_inputs.source_type` + `normalized_text`, runs the injected extractor (defaults to local stub), validates output through `parseExtractedFamilyLogistics`, calls `record_extraction_run` with terminal status.
  - On extractor or schema failure: records the run as `failed` with `last_error` and re-throws so the job runner increments `jobs.attempts` and applies the existing backoff/stale-lock logic.
- Updated `src/lib/jobs/runner.ts`:
  - `processSingleJob` handles `extract_source` payloads by extracting `extraction_run_id` and dispatching to `runExtractionForSourceInput`.
  - Payloads missing `extraction_run_id` are marked failed with a clear error message — they never reach the extractor.

### 2. Run-driven card creation foundation

- New migration `supabase/migrations/20260524110000_phase2_extraction_card_creation.sql`:
  - `service_role`-only `create_extracted_cards(p_extraction_run_id uuid, p_cards jsonb)` `SECURITY DEFINER` RPC.
  - For each element of `p_cards`: inserts one `coverage_cards` row (source-linked via `full_source_ref = 'source_inputs:<id>'`), one `coverage_slots` row per `coverageRelevance.suggestedSlots` element (falling back to a single `general_owner` slot when none are suggested), one `readiness_items` row per `readinessItems` entry, and an `extracted_source_card_created` `card_events` row with extraction run id and a coarse confidence bucket in metadata.
  - Attention flags derived server-side: `needs_coverage` always, `needs_review` when `reviewReasons` is non-empty or `confidence < 0.75`, `changed` when card type is `change_standalone` or `changedFields` is non-empty. `computed_coverage_state` follows from the flags.
  - Idempotent: when `extraction_runs.card_count > 0`, the RPC returns the existing source-linked card ids without inserting anything.
- Updated `src/lib/extraction/runner.ts`:
  - When the validated output contains at least one card, the runner calls `create_extracted_cards` and uses the returned row count for `record_extraction_run.p_card_count`. Zero-card paths skip the RPC entirely.
  - Public `ExtractorFn` type and `extractor?` injection point so the runner can be tested independently of the live extractor and so provider selection can be swapped in.

### 3. Gemini provider gating

- New `src/lib/extraction/gemini-runtime.ts`:
  - Runtime extractor distinct from the existing fixture-eval path. Builds a prompt from `(source_type, normalized_text)`, calls the Gemini `generateContent` endpoint with `responseMimeType: application/json`, and validates output through `parseExtractedFamilyLogistics`.
  - Skips upload sources and empty/whitespace paste text without making any network call.
- New `src/lib/extraction/provider.ts`:
  - `selectExtractor(env)` returns either the local stub or a Gemini runtime extractor based on `EXTRACTION_PROVIDER` and `GEMINI_API_KEY`. Defaults to local stub. Whitespace-only API keys are treated as missing.
  - `GEMINI_MODEL` overrides the default `gemini-3.5-flash`.
- Updated `src/lib/env-core.ts`:
  - Adds `EXTRACTION_PROVIDER` (enum `local-stub`|`gemini`, default `local-stub`), `GEMINI_API_KEY` (optional string), and `GEMINI_MODEL` (default `gemini-3.5-flash`).
- Updated `src/lib/jobs/runner.ts` and `src/app/api/cron/jobs/route.ts`:
  - Cron route resolves `selectExtractor(env)` once per invocation, passes the resulting extractor into `processJobBatch`, and reports the active `provider` on the `cron_jobs_processed` PostHog event.

### Tests

- `tests/unit/phase2-extraction-run-persistence-migration.test.ts` (new) — pins migration shape, enum coverage, RLS policy, same-household trigger, AFTER INSERT trigger idempotency, RPC signatures, and grant boundaries.
- `tests/unit/phase2-extraction-card-creation-migration.test.ts` (new) — pins `create_extracted_cards` signature, idempotency, attention-flag derivation, default `general_owner` slot, source linkage, and audit-event shape.
- `tests/unit/local-extractor.test.ts` (new) — paste yields schema-valid no-card result, determinism, upload/empty text return skipped.
- `tests/unit/extraction-runner.test.ts` (extended) — start + record flow, upload skipped path, schema validation failure rethrows, start_extraction_run no-row guard, card-bearing extractor path through `create_extracted_cards`, zero-card path skips `create_extracted_cards`.
- `tests/unit/extraction-provider.test.ts` (new) — every env-combination of `EXTRACTION_PROVIDER` + `GEMINI_API_KEY` + `GEMINI_MODEL`, including whitespace-only key fallback.
- `tests/unit/gemini-runtime.test.ts` (new) — prompt shape, upload + empty-text skip without network calls, success path with fetch mock asserts URL + headers + schema parse, error response throws with provider message.
- `tests/unit/jobs-runner.test.ts` (rewritten) — `extract_source` dispatches into the extraction runner; missing payload fields produce a clear failure; unknown kinds still fail.
- `vitest.setup.ts` mocks `server-only` so test-side imports of provider/gemini-runtime work.

### Docs

- `docs/architecture.md` — "Phase 2 Extraction Run Persistence" section now covers card creation and provider gating.
- `docs/qa/famtandem-thin-app-test-plan.md` — new "Phase 2 Run-Driven Card Creation Checks" and "Phase 2 Provider Selection Checks" sections.
- `docs/plans/2026-05-19-feat-thin-real-app-plan.md` — new slice status blocks for run persistence, card creation, and Gemini gating.
- `AGENTS.md` and `CLAUDE.md` build-status sections updated.

### 4. Cursor-agent review fixes

A read-only review pass with `cursor-agent --model gpt-5.5-high` on commit `22dbb77` surfaced three HIGH findings; all three are fixed in migration `supabase/migrations/20260524120000_phase2_extraction_review_fixes.sql` and the corresponding runner updates.

- **Duplicate cards on retry** — `create_extracted_cards` now updates `extraction_runs.card_count` inside the same transaction as the card inserts. A crash or `record_extraction_run` failure after card creation no longer creates duplicates on retry; the idempotency branch sees `card_count > 0` and returns existing card ids.
- **Derived review reasons not reaching attention flags** — the runner now calls `deriveExtractionReviewReasons` per card and merges those reasons into `card.reviewReasons` before sending the array to `create_extracted_cards`. Action-heavy items, missing date/time, ambiguous dates, and coercion-flagged cards now correctly land as `needs_review` on the board.
- **Gemini runs recorded as `local-stub`** — `start_extraction_run` now accepts optional `p_provider` and `p_model` and writes them to the run row at claim time. The runner and `/api/cron/jobs` route pass the active provider/model from `selectExtractor(env)`. The auditable row reflects which extractor actually handled the source.
- **Gemini fetch timeout (MEDIUM)** — `createGeminiRuntimeExtractor` now uses an `AbortController` with a 60s default timeout, configurable via `timeoutMs`. A hung provider call no longer holds the cron request until platform timeout.

Migration shape and the cards-with-review-reasons forwarding path are covered by new tests.

## Latest Verification

Run sequentially on the final pre-merge state of the branch (now squashed into `main` at `0f82891`):

- `npx --yes supabase db reset` — all migrations apply cleanly, including the two new ones.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 92 unit tests across 19 files, all passing (post-review-fix run).
- **Live Gemini runtime smoke** (`tests/live/gemini-runtime-live.test.ts`) against `gemini-3.5-flash` — schema-valid output, ~10s.
- **Live intake→trigger→job→Gemini→cards loop** (`tests/live/extraction-e2e-live.test.ts`) — bootstraps a household via service-role, inserts a paste source, drives the real `processJobBatch` with Gemini, asserts the run reaches `succeeded` with provider/model stamped and any cards linked via `full_source_ref`. Verified `cards=1, reviewReasons=2` for a synthetic school note in ~14s.
- `npm run test:extraction` — 11 schema/fixture tests, all passing.
- `npm run build:local` — production build succeeds.
- `npm run test:e2e:local` — 8 Playwright tests pass on mobile + desktop, covering authenticated paste intake and direct upload intake.

Known local caveats unchanged: run `build:local` and `test:e2e:local` sequentially to avoid the `.next` race; `npm run build` without local env fails because Supabase/cron secrets are required at build time.

## Operating Notes

- **Gemini stays off by default.** The cron route uses the local stub unless both `EXTRACTION_PROVIDER=gemini` and `GEMINI_API_KEY` are present in the process env. Tests never call Gemini.
- **Key handling.** Gemini credentials must come from local shell env or a gitignored `.env.local`. Do not commit, log, or paste keys into chat, docs, or test fixtures. If a key leaks, rotate it through the issuing console immediately.
- **Default model.** `GEMINI_MODEL` defaults to `gemini-3.5-flash`. If that model name does not exist in the API account being used, set `GEMINI_MODEL` in local env to a valid model (e.g., `gemini-2.5-flash`) without changing code.
- **Stub extractor produces no cards.** With the default provider, `create_extracted_cards` is exercised only by tests. Once Gemini is enabled locally, real card creation runs the same code path.
- **Run row vs job row drift.** If the runner crashes between `start_extraction_run` and `record_extraction_run`, the run row stays `running` while the job row is picked up by the 15-minute stale-lock recovery. The next run pickup increments `attempts` and overwrites status; eventual consistency is fine, but a monitoring view should eventually surface long-running runs.

## Best Next Slice

Strong candidates after this lands:

1. **Source-detail surface for extraction runs** — extend `/app/sources/[sourceInputId]` to display the run row (provider, status, attempts, last error, card count) for parent/admin trust visibility. No new RPCs.
2. **Admin correction RPC** — narrow `SECURITY DEFINER` RPC for internal admins to retry a failed extraction or override a card's review state. Reuses existing roles. No production credentials.
3. **Fixture coverage expansion** — add anonymized real-shape fixtures so the live Gemini eval suite has stronger ground truth before Gemini is enabled for real households.

Defer: Resend inbound email, Twilio coverage requests, Google Calendar, signed downloads, OCR on uploaded files, and production provider credentials until their narrower slices specifically call for them.

## Codex Handoff Notes

Read this section if you are the agent picking this work up next (likely in a fresh codex session). Everything below is what you'd need to know to be productive immediately.

### Current state on remote

- **All four Phase 2 PRs (#2 → #3 → #4 → #5) merged into `main` on 2026-05-24.** Main is at `0f82891 feat(phase-2): extraction runs, run-driven cards, Gemini provider gating`.
- Open PRs: 0. All `codex/phase-2-*` branches deleted on remote and locally.
- Start fresh: `git checkout main && git pull origin main` then create a new branch named `codex/phase-3-<slice-slug>` for whichever slice you pick below.
- No GitHub Actions CI is configured. All verification is local.

### Local environment expectations

- `.env.local` lives in the project root, gitignored via `.env*.local` in `.gitignore`. **Never commit it.**
- Required for Gemini integration: `GEMINI_API_KEY`, `EXTRACTION_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash`.
- Default behavior with no env vars: local stub extractor (zero cards, schema-valid no-action result). All unit tests run in this mode.
- Live tests under `tests/live/` skip cleanly when `GEMINI_API_KEY` is absent.
- Treat any Gemini key that appears in a transcript as compromised. Rotate at https://aistudio.google.com/ and store the new key in `.env.local` only.

### How to verify before changing anything

```bash
git checkout main
git pull origin main
npx --yes supabase db reset
npm run lint && npm run typecheck && npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local

# Live (requires GEMINI_API_KEY in env or sourced .env.local):
set -a && source .env.local && set +a
eval "$(npx supabase status -o env)" && \
  export NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
         SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
npx vitest run --config vitest.live.config.ts tests/live/gemini-runtime-live.test.ts
npx vitest run --config vitest.live.config.ts tests/live/extraction-e2e-live.test.ts
```

### Architecture quick map

- **Migrations** (`supabase/migrations/`):
  - `20260524103000_phase2_extraction_run_persistence.sql` — extraction_runs table, AFTER INSERT trigger, start_extraction_run/record_extraction_run RPCs.
  - `20260524110000_phase2_extraction_card_creation.sql` — initial create_extracted_cards RPC.
  - `20260524120000_phase2_extraction_review_fixes.sql` — supersedes earlier fns; stamps card_count in-transaction, accepts provider/model on start.
- **Runner** (`src/lib/extraction/runner.ts`): orchestrates start → load source → extract → validate → create cards → record terminal state. Takes an injected `ExtractorFn`.
- **Provider selection** (`src/lib/extraction/provider.ts`): returns local stub by default; only flips to Gemini when both env vars set.
- **Local stub** (`src/lib/extraction/local-extractor.ts`): deterministic; returns schema-valid no-card result for paste, skipped for upload.
- **Gemini runtime** (`src/lib/extraction/gemini-runtime.ts`): builds runtime prompt with full output-shape template; 60s AbortController timeout.
- **Job runner integration** (`src/lib/jobs/runner.ts` + `src/app/api/cron/jobs/route.ts`): cron route resolves the extractor once per invocation and injects it into the batch runner.

### Pick exactly one of these next slices

**Rank 1 — Fixture-eval prompt repair (HIGHEST leverage).**

Why: `tests/live/gemini-extraction-live.test.ts` fails against both `gemini-2.5-flash` and `gemini-3.5-flash`. This is the only thing blocking real confidence in Gemini extraction quality. The fix is the same prompt-engineering pattern PR #5's runtime prompt already got: full output-shape template + explicit REQUIRED/OPTIONAL field annotations + "do not add fields" instruction.

Files: `src/lib/extraction/gemini.ts` (`buildGeminiExtractionPrompt`). Possibly `tests/fixtures/extraction/phase2-fixtures.ts` if expected outputs need to be relaxed for `change_standalone` vs `event` classification ambiguity.

Verify: `GEMINI_API_KEY=... GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npm run test:extraction:live`.

**Rank 2 — Surface extraction runs on `/app/sources/[sourceInputId]`.**

Why: Parents/admins currently see source metadata and linked cards but not the audit row that connects them — provider/model/status/attempts/last_error/card_count/review_reasons. Surfacing this builds trust without adding new RPCs or RLS changes.

Files: `src/app/app/sources/[sourceInputId]/page.tsx` (or whatever the current source detail file is), a new presentational component for the run summary, the existing source-detail query extended to join `extraction_runs`.

Verify: New unit test for the renderer + Playwright e2e asserting parent/admin can see the section and helpers get denied.

**Rank 3 — Admin retry RPC for failed runs.**

Why: When Gemini extraction fails for a source, the only path forward today is wait-for-stale-lock-recovery. An admin retry button is a small, low-risk affordance that handles real production hiccups without broadening the admin surface.

Files: new migration adding a `service_role`-callable RPC that requires the caller to be an `internal_admin`, resets the run to `pending`, clears `last_error`, and re-enqueues an `extract_source` job. A small UI affordance on the source-detail page gated behind `is_internal_admin()`.

Verify: migration shape tests + RLS denial test for non-admins + idempotency test.

**Rank 4 — Expand synthetic fixtures.**

Why: The 15-fixture suite covers basic shapes. Once Rank 1 lands, growing this suite is the lever for extraction quality observability — multi-child schedules, carpool details, change notices, payment/form/readiness items, ambiguous ownership, no-action sources.

Files: `tests/fixtures/extraction/phase2-fixtures.ts`. No migration, no app changes.

### Hard constraints — do not touch in your slice

- Do not enable Resend, Twilio, Google Calendar, signed downloads, OCR on uploaded files, or any broad admin correction surface. Those are explicitly out of scope until the cohort validation signal demands them (see plan section "NOT In Scope").
- Do not commit secrets to docs, env files in the repo, test fixtures, or PR descriptions. `.env.local` only.
- Do not change `EXTRACTION_PROVIDER` default in `env-core.ts` — must stay `local-stub` so unit/CI behavior is deterministic.
- Do not modify the `AFTER INSERT` trigger on `source_inputs` casually — it's the database invariant that "every source input gets exactly one extraction run."
- When in doubt about scope: read `docs/plans/2026-05-19-feat-thin-real-app-plan.md` § Scope Boundaries and § NOT In Scope.

### Helpful starting reads

- `AGENTS.md` and `CLAUDE.md` — both kept in sync; AGENTS.md is the canonical agent-facing spec.
- `docs/architecture.md` § Phase 2 Extraction Run Persistence — design rationale.
- `docs/qa/famtandem-thin-app-test-plan.md` § Phase 2 Run-Driven Card Creation Checks + § Phase 2 Provider Selection Checks — what each test must cover.
- `docs/plans/2026-05-19-feat-thin-real-app-plan.md` — the full validation arc and what comes after Phase 2.

## Pointer Commands

```bash
git checkout main
git pull origin main
npx --yes supabase db reset
npm run lint && npm run typecheck && npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local

# Enable Gemini locally (key must not be committed)
# Source .env.local if you already have it, or set vars inline:
# export EXTRACTION_PROVIDER=gemini
# export GEMINI_API_KEY=...
# export GEMINI_MODEL=gemini-3.5-flash   # adjust if needed
# npm run test:e2e:local
```
