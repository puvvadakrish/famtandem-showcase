# Cursor Handoff: Phase 2 Next Slice

Last updated: 2026-05-24.

## Recommendation

Move the next work to a fresh Cursor conversation after confirming the current PR stack state. This handoff now reflects the pushed PR #4 upload/source-detail branch, not local-only uncommitted work.

## Current Branch And Stack

Workspace:

```text
(repo root)
```

Current branch:

```text
codex/phase-2-source-input-detail
```

Open PR stack:

1. PR #2: `codex/phase-2-extraction-schema-evals`
   - Target: `main`
   - Adds local-only `family-logistics-v1` extraction schema, fixture evaluator, and 15 synthetic/anonymized fixtures.
2. PR #3: `codex/phase-2-live-gemini-evals`
   - Target: `codex/phase-2-extraction-schema-evals`
   - Adds optional `npm run test:extraction:live` against Gemini with `GEMINI_API_KEY` from local env only.
3. PR #4: `codex/phase-2-source-input-detail`
   - Target: `codex/phase-2-live-gemini-evals`
   - Current title: `feat(sources): add source detail and upload intake`
   - Pushed through commit `046c4c4 docs: sync phase 2 upload handoff` after implementation commit `f40d46a feat(sources): add direct upload intake`.
   - Adds authenticated `/app/sources/[sourceInputId]` source detail for parent/admin review and helper denial.
   - Adds single-file direct upload intake and private Storage policy hardening.

No local uncommitted app work should be required after the latest push. Start from the current branch/PR state or, after the PR stack lands, from latest `main`.

## Completed PR #4 Work

PR #4 includes:

- V2 mobile-first UI revamp using `docs/design/famtandem-v2-design-system.md`.
- Upload metadata/storage foundation:
  - `source_artifacts`
  - `create_upload_source_metadata`
  - source detail artifact metadata display
  - migration/unit/docs coverage
- Raw `source-artifacts` object read-policy tightening:
  - parent, household admin, and internal admin can read raw objects
  - helpers cannot read raw objects even with exact paths
- Source artifact Storage insert-policy hardening:
  - direct upload objects must exactly match a precreated `source_artifacts.storage_path`
  - arbitrary household-prefixed object paths are rejected
- Single-file direct upload intake UI:
  - `src/components/upload-source-form.tsx`
  - `Add logistics` renders `Upload file or screenshot`
  - one PDF/JPEG/PNG/WebP/plain-text file, max 10 MB
  - client-side validation before metadata creation
  - calls `create_upload_source_metadata`
  - uploads bytes directly to private Supabase Storage at returned `storage_path`
  - redirects to `/app/sources/[sourceInputId]`
  - does not create coverage cards from uploads
- Authenticated E2E coverage for paste intake and direct upload intake.

The previously unrelated untracked `docs/gstack-codex-guide.html` file was moved out of the repo by the user and no longer appears in git status.

## Latest Verification

Required checks passed for the local upload UI work plus Storage insert-policy hardening:

- `npx supabase db reset`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:extraction`
- `npm run build:local`
- `npm run test:e2e:local`

Notes:

- `npx --yes supabase db reset` was used locally because `npx supabase migration new ...` initially waited without output; the empty duplicate migration left by that attempt was removed.
- `npm run build:local` and Playwright should run sequentially to avoid `.next` races.
- `npm run build` without local env is expected to fail unless `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` are present.

## Completed Next Slice

Completed next slice:

**Harden source-artifact storage insert policy.**

Problem:

- Previous storage insert policy allowed authenticated household admins to insert objects under a household-prefixed path.
- The hardened policy requires inserted `source-artifacts` object paths to match an existing `source_artifacts.storage_path` row for an upload source in the administered household.

Scope:

- Added a narrow migration that updates the `source-artifacts` Storage insert policy.
- Kept direct browser upload working.
- Preserved read boundary: internal admin, parent, and household admin can read raw objects; helpers cannot.
- Added migration/unit coverage.
- Added focused authenticated Supabase smoke coverage for successful upload, arbitrary-path denial, and helper raw-read denial.

Do not add:

- OCR/text extraction
- Gemini extraction jobs or production calls
- upload-to-card creation
- signed download routes
- Twilio
- Resend inbound email
- Google Calendar
- broad admin correction
- production provider credentials

## Best Next Slice

Recommended next narrow Phase 2 slice:

**Extraction run persistence and local/stubbed source-to-card job foundation.**

Keep it narrow:

- Add `extraction_runs` and a small persisted job/run record path for source inputs.
- Wire paste/upload sources into a queued or invokable extraction workflow without production Gemini calls by default.
- Store model/provider metadata, schema version, status, errors, review reasons, and raw output references safely.
- Reuse the existing local `family-logistics-v1` schema and fixture evaluator.
- Add tests for idempotency, failure states, and no partial card creation.

Good companion or follow-up:

- Expand fixtures beyond 15 with more anonymized real-like cases: multi-child schedules, change notices, carpool details, payment/form/readiness items, ambiguous ownership, and no-action sources.
- If `GEMINI_API_KEY` is available, run/tune `npm run test:extraction:live` locally, but do not commit the key or wire production calls in this slice.

Defer:

- Resend inbound email, Twilio coverage requests, Google Calendar, signed download routes, broad admin correction, and production credentials until their narrower slices.

## Prior Exact Next Steps

1. Read the project context:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `WIGGINS.md`
   - `docs/architecture.md`
   - `docs/design/famtandem-v2-design-system.md`
   - `docs/setup/local-development.md`
   - `docs/qa/famtandem-thin-app-test-plan.md`
   - `docs/plans/2026-05-19-feat-thin-real-app-plan.md`

2. Inspect current local changes:
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff -- supabase/migrations tests src/components/upload-source-form.tsx tests/e2e/paste-intake.spec.ts`

3. Confirm the direct upload path still works conceptually:
   - metadata RPC creates `source_inputs` and `source_artifacts`
   - browser uploads object to `source-artifacts`
   - source detail displays artifact metadata
   - upload source remains cardless

4. Implement the storage insert policy hardening:
   - update or add a migration that drops/recreates the `"household admins can upload source artifact objects"` policy
   - require `storage.objects.name` to equal an existing `source_artifacts.storage_path`
   - require the matching artifact/source household to be administered by `auth.uid()`
   - keep bucket constrained to `source-artifacts`

5. Update tests:
   - migration/unit test should assert policy references `source_artifacts.storage_path`
   - if feasible, add/extend Supabase smoke coverage for:
     - admin can upload to returned path
     - admin cannot upload to an arbitrary household-prefixed path without metadata
     - helper cannot upload/read raw object

6. Update docs:
   - `docs/architecture.md`
   - `docs/setup/local-development.md`
   - `docs/qa/famtandem-thin-app-test-plan.md`
   - `docs/plans/2026-05-19-feat-thin-real-app-plan.md`
   - `WIGGINS.md` if the slice completes

7. Run verification, sequentially:
   - `npx supabase db reset`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run test:extraction`
   - `npm run build:local`
   - `npm run test:e2e:local`

## Cursor Prompt

```text
We are in the repo root.

Read:
- AGENTS.md
- CLAUDE.md
- WIGGINS.md
- docs/handoffs/2026-05-24-cursor-phase2-next-slice.md
- docs/architecture.md
- docs/design/famtandem-v2-design-system.md
- docs/setup/local-development.md
- docs/qa/famtandem-thin-app-test-plan.md
- docs/plans/2026-05-19-feat-thin-real-app-plan.md

Continue from branch codex/phase-2-source-input-detail.

Preserve all existing working tree changes, including:
- V2 mobile-first UI revamp
- upload metadata/storage foundation
- source-artifact raw read-policy tightening
- single-file direct upload intake UI

Do not revert unrelated changes. Ignore unrelated untracked docs/gstack-codex-guide.html.

Next narrow Phase 2 slice:
Harden the private source-artifacts Storage insert policy so direct upload objects must match an existing source_artifacts.storage_path row created by create_upload_source_metadata. Keep direct browser upload working.

Scope:
- Update/add a Supabase migration for the storage insert policy.
- Preserve parent/household_admin/internal_admin raw object read boundary.
- Add or update migration/unit coverage.
- Add focused authenticated Supabase smoke coverage if practical.
- Update relevant docs/handoff notes.

Do not add:
- OCR/text extraction
- Gemini extraction jobs or production calls
- upload-to-card creation
- signed download routes
- Twilio
- Resend inbound email
- Google Calendar
- broad admin correction
- production provider credentials

Before finishing, run:
- npx supabase db reset
- npm run lint
- npm run typecheck
- npm test
- npm run test:extraction
- npm run build:local
- npm run test:e2e:local

Report changed files, verification results, and remaining Phase 2 risks.
```
