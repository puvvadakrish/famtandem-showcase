---
title: fix: Hosted Paste Extraction Latency
type: fix
status: complete
date: 2026-05-31
---

# fix: Hosted Paste Extraction Latency

## Overview

Hosted pasted logistics currently create a `source_inputs` row, an `extraction_runs` row, and an `extract_source` job, but the parent-facing source stays in `Reading source` until the cron job runs. In the hosted QA pass, pasted sources stayed `pending` with `provider=local-stub`, `attempts 0 / 3`, and `0 linked cards`.

The beta product needs pasted logistics to become cards in a parent-friendly timeframe. The first-family experience should not depend on a daily cron cadence.

## Scope

- Keep the existing extraction/job architecture.
- Keep local tests provider-safe by default.
- Keep Gemini credentials in environment only; never commit or document secret values.
- Keep helpers out of source/provider-sensitive surfaces.
- Do not add SMS, inbound email, provider webhooks, Google Calendar imports, or broad admin correction.

## Final Solution

1. Configure hosted extraction intentionally:
   - `EXTRACTION_PROVIDER=gemini`
   - `GEMINI_API_KEY` in Vercel production env
   - `GEMINI_MODEL=gemini-3.5-flash` unless verification shows a better available model
2. Attempt to change hosted job cadence from daily to a beta-friendly interval.
3. Because Vercel Hobby rejects sub-daily cron schedules, keep daily `/api/cron/jobs` as the fallback runner and process new pasted sources on demand from the paste submit server action.
4. Keep the existing extraction run/job architecture as the unit of record: the server action runs the same extractor path, records the same extraction run result, and marks the queued `extract_source` job succeeded after successful on-demand processing.
5. Rerun the source-intake path on hosted: paste source -> extraction run attempts increment -> provider/model reflect Gemini -> source creates cards or a clear no-action result.
6. Add or run a focused readiness persistence test: status `Done` -> save -> reload -> status remains `Done`.

## Technical Considerations

- `enqueue_source_input_extraction()` already inserts `extract_source` jobs for non-empty paste sources.
- `processJobBatch()` already selects the configured extractor via `/api/cron/jobs`.
- Vercel cron cadence was the original bottleneck for beta latency.
- Vercel Hobby accounts allow only daily cron schedules, so a short cron interval is not available without a plan upgrade.
- Running Gemini directly in the user submit request can slow the submit path, but prior live local integration measured the path around 10-14 seconds. This is acceptable for beta only if hosted validation proves it stays within Vercel function limits and leaves a clear reading/result state.

## Acceptance Criteria

- [x] Vercel cron limitation is documented; sub-daily cron is blocked on the current Hobby plan.
- [x] On-demand paste extraction is implemented for new pasted sources, with daily cron retained as fallback.
- [x] Production Vercel env has Gemini extraction configured without committing credentials.
- [x] Local defaults still avoid real provider calls unless explicit env vars are set.
- [x] Hosted pasted source exits `pending` in the expected timeframe after deploy/config.
- [x] Hosted source detail shows provider/model/attempts consistent with the selected extractor.
- [x] Hosted source produces linked cards for an actionable synthetic logistics note, or a clearly explained no-action result for non-actionable text.
- [x] Readiness status persistence is verified locally before family go-ahead.
- [x] Regression suite artifact is updated with the new result and go/no-go.

## Verification Plan

- `npm run lint`
- `npm run typecheck`
- `npm test`
- Relevant Playwright E2E for paste intake and readiness persistence
- `npm run build:local`
- Hosted Chrome QA:
  - paste synthetic logistics
  - wait/recheck source detail
  - inspect inbox state
  - confirm no raw-source leakage in response flows if a card is created
- Vercel logs:
  - check `/api/cron/jobs`
  - check extraction provider/model/status without exposing secrets

## Result

- Local verification passed: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e:local -- tests/e2e/paste-intake.spec.ts tests/e2e/readiness-items.spec.ts`, `npm run build:local`, and `git diff --check`.
- Initial Vercel cron deploy with `*/5 * * * *` failed because the current Vercel Hobby plan only allows daily cron schedules.
- Production Vercel env had `EXTRACTION_PROVIDER`, `GEMINI_MODEL`, and `GEMINI_API_KEY` present but empty. Replaced them with production values, with the API key stored as a sensitive Vercel env var.
- A production deployment was promoted to `app.famtandem.com`.
- Hosted Chrome QA on `app.famtandem.com` created source `QA hosted Gemini extraction 20260531`; source detail showed `provider=gemini`, `model=gemini-3.5-flash`, `attempts 1 / 3`, `status=succeeded`, and `1 linked card`.
- The linked card was `Ava's Soccer Practice` with pickup needing coverage and readiness items for cleats/shin guards/water bottle plus signed permission slip.
- Vercel logs for the validation window showed successful `POST /app` and source-detail requests, with no server errors.
- Older pending local-stub sources remain historical `local-stub` runs; create a fresh source to validate the fixed path.

## Post-Deploy Monitoring & Validation

- Logs:
  - Vercel logs for `/api/cron/jobs`
  - Vercel logs for source submission `POST /app`
- Healthy signals:
  - `cron_jobs_processed` has claimed/succeeded jobs.
  - extraction runs move from `pending` to `succeeded` or terminal clear failure.
  - source inbox count moves from `Reading` to `Created cards` or `No cards`.
- Failure signals:
  - pending extraction jobs older than the cron interval.
  - Gemini errors or `provider=local-stub` after Gemini env is configured.
  - repeated `failed` jobs in `/app/admin/ops`.
- Rollback/mitigation:
  - Disable or revert on-demand processing if Gemini latency causes function timeouts.
  - Upgrade Vercel plan and move beta latency back to frequent cron if submit-path latency is too high.
  - Fall back to manual card creation for families until extraction is stable.
