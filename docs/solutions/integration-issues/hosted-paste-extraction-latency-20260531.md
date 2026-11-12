# Hosted Paste Extraction Latency Fix - 2026-05-31

## Problem

Hosted pasted logistics were visible in the source inbox, but they stayed in `Reading source` because extraction depended on the scheduled job path. On the hosted test household, source detail showed `pending`, `provider=local-stub`, `attempts 0 / 3`, and `0 linked cards`.

That breaks the beta aha moment: a parent pastes logistics and expects FamTandem to create source-backed coverage cards soon enough to act.

## Root Cause

- Pasted sources correctly created `source_inputs`, `extraction_runs`, and queued `extract_source` jobs.
- The hosted cron schedule was daily (`0 13 * * *`), so beta users could wait too long for card creation.
- Vercel Hobby rejected a sub-daily cron schedule during deploy, so frequent cron was not available on the current plan.
- Production Vercel env vars for `EXTRACTION_PROVIDER`, `GEMINI_MODEL`, and `GEMINI_API_KEY` were present but empty, so fresh hosted extraction could not use Gemini until those values were replaced.

## Decision

For beta, process new pasted sources on demand during the paste submit server action while keeping the existing extraction run and job records as the system of record.

This keeps the parent-facing paste-to-card moment immediate without replacing the job architecture. The daily cron remains a fallback for failures and older queued jobs.

## What Changed

- Added `processSourceInputExtractionNow(sourceInputId)` in `src/lib/extraction/process-source-input.ts`.
- Updated the paste submit action to run the configured extractor immediately after source creation.
- Marked the queued `extract_source` job succeeded after successful on-demand processing so the job queue does not later duplicate work.
- Added privacy-safe analytics for immediate extraction failures.
- Updated local E2E coverage so paste intake verifies immediate local-stub processing without manually invoking cron.
- Added local E2E coverage for readiness item persistence across reload.
- Replaced empty production Vercel Gemini env values and redeployed production.

## Verification

Local:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:local -- tests/e2e/paste-intake.spec.ts tests/e2e/readiness-items.spec.ts`
- `npm run build:local`
- `git diff --check`

Hosted:

- A production deployment was promoted to `app.famtandem.com`.
- Fresh source `QA hosted Gemini extraction 20260531` processed on submit.
- Source detail showed `provider=gemini`, `model=gemini-3.5-flash`, `attempts 1 / 3`, `status=succeeded`, and `1 linked card`.
- The linked card was `Ava's Soccer Practice` with pickup needing coverage and readiness items.
- Vercel logs for the validation window showed successful app and source-detail requests with no server errors.

## Caveats

- On-demand live Gemini can add noticeable submit latency. It is acceptable for the beta only while hosted validation remains within function limits and the UI gives an understandable reading/result state.
- Vercel Hobby still only gives a daily fallback cron. Minute-level retry behavior requires a plan change or a different job runner.
- Sources created before the env fix remain historical `local-stub` records. Create a fresh source to validate current behavior.
- One hosted synthetic source rendered one hour earlier than the text, likely from timezone normalization. Validate real parent notes with explicit timezone/date phrasing.
- Provider credentials should remain in hosted/local environment variables and must not be committed, logged, or documented. Escalate credential rotation only if requested or if a secret exposure occurs.

## Future Guardrails

- Do not rely on Vercel cron cadence for parent-facing beta immediacy unless the deployment plan supports the needed interval.
- When Vercel env looks configured but providers do not activate, pull env metadata carefully and verify non-secret lengths/non-empty values rather than assuming names imply values.
- Keep local tests provider-safe by default. Hosted/provider tests should use synthetic logistics and never print secrets.
- Any future extraction changes should verify: provider/model stamps, attempt count, linked card count, source privacy, and no duplicate work after job fallback.
