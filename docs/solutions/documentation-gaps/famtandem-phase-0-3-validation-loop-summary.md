---
title: FamTandem Phase 0-3 Validation Loop Summary
category: documentation-gaps
status: documented
problem_type: documentation_gap
components:
  - validation-loop
  - extraction
  - coverage-requests
  - internal-admin
related_prs:
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
  - 12
  - 13
  - 14
  - 15
tags:
  - phase-summary
  - validation
  - agent-context
  - cohort-readiness
created_at: 2026-05-25
---

# FamTandem Phase 0-3 Validation Loop Summary

## Why This Exists

FamTandem has moved from product concept to a thin validation loop. The important context is now spread across brainstorms, plans, handoffs, PRs, and agent files. This document is the durable summary for future agents and humans: what has shipped, what patterns matter, what boundaries remain, and what should happen next.

The strategic product decision remains unchanged:

> Families do not have a calendar problem. They have a logistics and coverage problem.

The first validation goal is not a broad family organizer. It is proving that messy family logistics inputs can become source-backed coverage cards and that an uncovered item can get resolved through a lightweight coverage request.

## What Has Shipped

### Phase 0: Foundation

The repo has a Next.js App Router / TypeScript / Tailwind web app with Supabase local configuration, household auth/bootstrap, protected app routes, PostHog helpers, a protected cron route, Vitest/Playwright setup, architecture docs, QA docs, and baseline migrations.

### Phase 1: Manual Household Board

The app supports a real household board loop:

- Household members and helpers.
- Children attached to cards.
- Manual cards.
- Coverage slots.
- Readiness items.
- External owner text and external contacts.
- Shared attention and coverage state derivation.
- Database/RLS hardening for household boundaries.

This established the core object model before AI/provider work.

### Phase 2: Source Intake And Extraction Foundation

Phase 2 established source-backed logistics intake:

- Paste/source intake and source-backed cards.
- Read-only source detail for parent/admin users.
- Upload metadata and direct-to-Supabase Storage foundation.
- Private `source-artifacts` storage policies.
- The `family-logistics-v1` extraction contract.
- Fixture evaluator and optional live Gemini eval runner.
- `extraction_runs` as the audit unit for extraction.
- `source_inputs` insert trigger that creates one extraction run and one `extract_source` job.
- Service-role-only run/card RPCs.
- Deterministic local stub extractor by default.
- Gemini provider selection gated by local/hosted env only.

The initial upload path deliberately did not run OCR or create cards from uploaded files. Later Phase 3 slices added approval-gated upload text/OCR extraction: text/plain extraction is deterministic, Gemini OCR for PDF/image artifacts is opt-in, and card creation waits for parent/admin approval of extracted text.

### Phase 3: First Validation Loop

Phase 3 made the first real validation loop possible:

- PR #6 repaired Gemini fixture-eval prompt/schema drift.
- PR #7 surfaced read-only extraction run summaries on source detail.
- PR #8 made paste intake AI-first: paste creates a source input, the trigger enqueues extraction, and extracted cards can be created from the run.
- PR #9 added internal-admin retry for failed extraction runs.
- PR #10/#11 added and hardened lightweight no-account coverage request links.
- PR #12 expanded synthetic/anonymized extraction fixtures to 24 real-shape cases.
- PR #13 added a read-only internal-admin validation snapshot.
- PR #14 added internal-admin CSV export and cohort readiness docs.
- PR #15 synced `AGENTS.md` and `CLAUDE.md` with the current state.
- PR #17 added opt-in Resend outbound coverage request emails behind the coverage sender seam, with manual copy-link fallback preserved by default.

Current loop:

1. Parent submits pasted logistics text.
2. A `source_inputs` row is created.
3. The database trigger creates `extraction_runs` and an `extract_source` job.
4. The local stub or locally-gated Gemini extractor returns `family-logistics-v1` output.
5. `create_extracted_cards` creates source-linked cards, coverage slots, readiness items, and card events transactionally.
6. The board shows uncovered/pending/review states.
7. Household admin can create a no-account request link.
8. When Resend is explicitly configured and a recipient email is available, the app can send the request email through Resend and store the provider result; otherwise the manual link flow remains available.
9. Recipient can accept or decline from the public token route.
10. Internal admin can inspect run status and validation metrics, retry failed runs, and export aggregate CSV.

## Key Implementation Patterns

### Source Inputs

`source_inputs` is the source-of-truth for submitted logistics material. Paste sources include normalized text. Upload sources carry metadata/artifact references and can receive extracted text through the approval-gated upload text/OCR flow. Full source access stays parent/household-admin/internal-admin only; helpers do not get raw source access.

### Extraction Runs And Jobs

`extraction_runs` is the audit unit for extraction. Every new source input should get exactly one extraction run and one `extract_source` job through the database trigger. The runner records provider/model/schema/status/error/card count and keeps `source_inputs.status` aligned at terminal states.

### Card Creation

`create_extracted_cards` is service-role-only and transactional. It creates cards, slots, readiness items, and audit events from validated `family-logistics-v1` output. It is idempotent: once cards exist for a run, retries should not duplicate them.

### Provider Selection

Extraction defaults to `local-stub`. Gemini requires both `EXTRACTION_PROVIDER='gemini'` and `GEMINI_API_KEY` in local or hosted env. Credentials stay in `.env.local`, process environment, or hosted sensitive env storage only. The local E2E wrapper defaults to local-stub unless explicitly overridden so browser tests are deterministic.

### Coverage Request Tokens

Coverage request links use a dedicated token table and hashed token storage. Public token pages use server-side lookup and show only minimal request context. Stale, expired, reused, and mixed stale/live cases were hardened before merge.

### Resend Outbound Coverage Requests

Resend outbound email is now implemented as an opt-in coverage request sender. It requires `COVERAGE_REQUEST_SENDER=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in local or hosted env. Local/manual behavior remains the safe default. The first verified sender domain is `updates.famtandem.com`, so the current sender is `FamTandem <coverage@updates.famtandem.com>` until the root `famtandem.com` domain is verified.

Resend sends use provider idempotency keys based on the request token/channel, compact privacy-bounded email content, and a sender-side timeout so stalled provider calls become failed send attempts instead of trapping the manual fallback path. No Resend inbound email, delivery webhooks, or provider status callbacks exist yet.

### Internal Admin Gating

Internal admin routes first authenticate the user through the normal Supabase server client and check active `internal_admins`. Service-role reads happen only after that gate. The validation export does not select token hashes, raw source text, source artifacts, provider secrets, or storage paths.

### Validation Snapshot And Export

`/app/admin/validation` summarizes cohort validation metrics from existing rows. `/app/admin/validation/export` exports the same aggregate view as CSV. CSV output is hardened against spreadsheet formula injection by neutralizing formula-leading text cells.

## Review Learnings

Several review findings should inform future slices:

- Card creation retries can duplicate rows unless the card-count/idempotency invariant is enforced transactionally.
- Derived review reasons must actually reach persisted card state, not only extraction output.
- Provider/model audit fields must reflect the real provider path; Gemini runs should not be stamped as local-stub.
- Fixture evals should be strict about product-critical facts but tolerant of harmless wording drift.
- Ambiguous ownership should trigger Needs Review rather than inventing owners.
- Token links must defend against stale, expired, reused, and mixed stale/live state transitions.
- Request metrics should count real `coverage_requests` rows, not request tokens, when labeled as requests.
- CSV exports that include user-controlled strings must prevent spreadsheet formula injection.
- Provider sends should have explicit timeouts before being called from actions that have already created local state.
- `SECURITY DEFINER` RPC changes should get executable local DB auth tests, not only migration-text assertions.

## Reliable Verification

Useful local commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

Useful focused commands:

```bash
npx vitest run tests/unit/validation-snapshot.test.ts
node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/admin-validation.spec.ts
```

Live Gemini evals are optional and require local credentials:

```bash
set -a && source .env.local && set +a
GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npm run test:extraction:live
```

Do not paste or commit Gemini keys.

## Known Local Caveats

- Do not run `npm run build:local` and Playwright against the same `.next` output concurrently; it can cause transient Next build artifact races.
- Local E2E should use the local-stub extraction provider unless explicitly testing live Gemini.
- Local E2E should use the local-stub coverage request sender unless explicitly testing live Resend.
- Existing local E2E data can accumulate, so admin aggregate assertions should avoid assuming exact global counts.

## Still Not Built

The following remain intentionally out of scope until a narrow slice demands them:

- Production Twilio SMS sends.
- Resend inbound email receiving.
- Twilio/Resend webhook/status callback processing.
- Signed artifact downloads.
- Google Calendar import/sync/write-back.
- Broad admin correction surface.
- Production credentials in code/docs.
- Full provider compliance work beyond the current hosted runbook.

## Recommended Next Decision

The next product decision is the first real cohort loop, not another platform expansion:

- Run a guarded first-family session with low-sensitivity logistics inputs, source-backed card review, and at least one accepted coverage request.
- Use parent correction where extraction is imperfect and capture exact customer language about whether coverage responsibility became clearer.
- Treat Twilio/SMS, inbound email, provider callbacks, signed downloads, broad admin correction, and deeper Calendar work as demand-driven follow-up slices, not prerequisites.

Before implementation of any new provider/platform surface, use a short `ce-brainstorm` or `ce-plan` slice to choose the lever and define the smallest safe boundary. For provider work, include compliance/cost/privacy decisions before adding credentials or hosted-provider behavior.

## Related Docs

- `docs/brainstorms/2026-05-18-familyops-positioning-brainstorm.md`
- `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`
- `docs/plans/2026-05-19-feat-thin-real-app-plan.md`
- `docs/plans/2026-05-25-feat-coverage-requests-lightweight-responses-plan.md`
- `docs/ops/2026-05-25-cohort-readiness-checklist.md`
- `AGENTS.md`
- `CLAUDE.md`
