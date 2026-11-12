# FamTandem Local Development

## Prerequisites

- Node.js 22 LTS or newer.
- npm 10 or newer.
- Supabase CLI for local database/auth/storage.
- Playwright browsers installed with `npx playwright install`.

If the Supabase CLI is not installed globally, use `npx supabase ...` for local commands.

## First Setup

```bash
npm install
cp .env.example .env.local
supabase start
supabase db reset
npm run dev
```

After `supabase start`, copy the local API URL, anon key, and service role key into `.env.local`.

Equivalent local commands through npm exec:

```bash
npx supabase start
npx supabase db reset
```

## Environment Groups

- `NEXT_PUBLIC_*`: safe browser-exposed app, Supabase, and PostHog values.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for cron/admin/server jobs.
- `CRON_SECRET`: required by `/api/cron/jobs`; use a long random value in every environment.
- Coverage request sending defaults to `COVERAGE_REQUEST_SENDER=local-stub`; this creates a local response link and does not contact external providers.
- Resend outbound coverage-request email is opt-in with `COVERAGE_REQUEST_SENDER=resend` plus `RESEND_API_KEY`. Keep Resend keys in local/hosted env only.
- Household notification emails default to `HOUSEHOLD_NOTIFICATION_SENDER=local-stub`; daily unresolved nudge and weekly coverage review jobs can exercise the notification ledger without contacting Resend.
- Provider keys for Resend, Twilio, and Gemini are present as placeholders or opt-in local values.

Do not send raw child names, source text, addresses, phone numbers, emails, or source excerpts to PostHog properties.

## Resend Outbound Coverage Requests

Resend email sends are disabled by default. To test real outbound coverage request email locally, verify the FamTandem sending domain in Resend, then set server-only env values:

```bash
COVERAGE_REQUEST_SENDER=resend
RESEND_API_KEY=replace-with-local-resend-key
RESEND_FROM_EMAIL="FamTandem <coverage@updates.famtandem.com>"
RESEND_REPLY_TO_EMAIL=
```

Use `coverage@updates.famtandem.com` while that is the verified Resend sending domain. Move back to `coverage@famtandem.com` only after the root domain is verified for sending.

If `RESEND_REPLY_TO_EMAIL` is blank, coverage request emails tell recipients to use the response link and do not expose a parent email address. Do not commit or paste `RESEND_API_KEY`. Default local tests and E2E should keep `COVERAGE_REQUEST_SENDER=local-stub` so no real email is sent. The `scripts/with-local-supabase-env.mjs` wrapper forces local-stub/disabled providers unless `ALLOW_LIVE_PROVIDERS=1` is set for an intentional live-provider smoke.

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build
npm run test:e2e
```

For commands that need local Supabase credentials from the Docker stack, use:

```bash
npm run build:local
npm run test:e2e:local
```

These commands read `npx supabase status -o env` and inject the local API URL, anon key, service-role key, app URL, cron secret, and Playwright base URL for that one process. They do not write credentials into the repo.

## Vercel Cron

Configure a Vercel Cron job to call:

```text
GET /api/cron/jobs
Authorization: Bearer $CRON_SECRET
```

The route also accepts `x-cron-secret` for local smoke testing. The route claims a bounded batch of due jobs through the `claim_due_jobs` database function and records a PostHog server event when configured.

The underlying job RPCs are granted to Supabase `service_role` only. Browser clients should never call job functions directly.

The same route also checks `household_notification_settings` for enabled daily unresolved nudges and weekly coverage reviews before claiming jobs. Both are disabled by default. To test the scheduler locally, insert or update a settings row for a household and keep `HOUSEHOLD_NOTIFICATION_SENDER=local-stub` unless you explicitly want a real Resend send:

```sql
insert into public.household_notification_settings (
  household_id,
  daily_unresolved_enabled,
  daily_send_hour_local,
  weekly_coverage_review_enabled,
  weekly_send_weekday,
  weekly_send_hour_local
)
values ('<household-id>', true, 6, true, 0, 8)
on conflict (household_id) do update
set daily_unresolved_enabled = excluded.daily_unresolved_enabled,
    daily_send_hour_local = excluded.daily_send_hour_local,
    weekly_coverage_review_enabled = excluded.weekly_coverage_review_enabled,
    weekly_send_weekday = excluded.weekly_send_weekday,
    weekly_send_hour_local = excluded.weekly_send_hour_local;
```

Set `HOUSEHOLD_NOTIFICATION_SENDER=resend` only in a controlled local or hosted cohort environment with `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured. Default tests and local E2E should not send real notification email.

## Supabase Storage

The `source-artifacts` bucket is private and limited to 10 MB files. The upload intake path writes files directly from the browser to Supabase Storage so large files do not pass through Vercel request bodies.

Upload metadata is represented locally by `source_inputs` rows with `source_type = upload` and matching `source_artifacts` rows. The metadata RPC returns the scoped storage path used by the direct browser-to-Supabase upload. After Storage upload succeeds, the browser finalizes the artifact and the cron job runner can process `extract_artifact_text`.

The Storage insert policy requires the uploaded object path to exactly match a precreated `source_artifacts.storage_path` row. This keeps direct browser upload working while blocking arbitrary uploads under a household-prefixed path.

## Paste Source Intake

The first Phase 2 slice uses local Supabase only. No hosted Supabase, Resend, Gemini, Twilio, or Google credentials are required to paste logistics text and create a source-backed card.

To smoke test locally:

1. Start Supabase and the app with `npx supabase start`, `npx supabase db reset`, and `npm run dev`.
2. Sign in, create a household, and open `/app`.
3. Confirm the beta setup panel appears for a new household and points to household setup plus paste/upload intake.
4. Use `Add logistics` to paste copied school/team/appointment text.
5. Confirm the card appears on the board with a compact source summary and the pasted source text inside the card source details.
6. Open `View source` from the card source details to review the pasted source metadata, full normalized text, and linked card summary.

For the first beta households, email forwarding and Gmail connection are not available. Families should paste email text or upload files/screenshots/PDFs from the app.

## Upload Source Intake

The upload path is local-first direct intake for reviewing source files before extraction exists:

- Supported file MIME types: PDF, JPEG, PNG, WebP, and plain text.
- Maximum file size: 10 MB.
- Storage path shape: `household_id/source_input_id/file-name`.
- Storage object insert requires a matching `source_artifacts.storage_path` metadata row created before upload.
- Upload sources start as `needs_review`; after upload finalization, artifact text extraction moves to `pending`.
- Full raw artifact reads are parent/household-admin only, matching full source detail. Helpers should not be able to download objects from `source-artifacts` even if they know the storage path.

Plain-text uploads are extracted locally by the `extract_artifact_text` job into reviewable `source_inputs.normalized_text`. PDF/image OCR remains disabled by default and records `not_applicable` unless `ARTIFACT_TEXT_PROVIDER=gemini` and `GEMINI_API_KEY` are explicitly set in local process env. Extracted upload text does not create cards until a parent or household admin approves it on the source detail page. Default local tests do not call OCR, Gemini, Resend, Twilio, or Google providers; use `ALLOW_LIVE_PROVIDERS=1` with `scripts/with-local-supabase-env.mjs` only for deliberate live-provider checks.

To smoke test locally:

1. Sign in as a household admin and open `/app`.
2. In `Add logistics`, choose one supported file under `Upload file or screenshot`.
3. Submit `Upload source`.
4. Confirm the app opens `/app/sources/[sourceInputId]` with uploaded file metadata. Run `GET /api/cron/jobs` with `CRON_SECRET` to process `extract_artifact_text`.
5. Review the extracted text on the source detail page and choose `Approve and create cards` to queue the existing `extract_source` path.

Optional Gemini OCR for local experiments:

```bash
ARTIFACT_TEXT_PROVIDER=gemini \
ARTIFACT_TEXT_MODEL=gemini-3.5-flash \
GEMINI_API_KEY=your-local-key \
npm run dev
```

Keep Gemini credentials in local env only. Do not commit them to `.env`, docs, fixtures, chat transcripts, or PR descriptions.

Authenticated paste intake E2E uses local Mailpit magic-link email capture. Run it with the same local Supabase env used for builds, for example:

```bash
eval "$(npx supabase status -o env | grep -E '^(ANON_KEY|API_URL|SERVICE_ROLE_KEY)=')"
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
CRON_SECRET=local-development-cron-secret \
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
npm run test:e2e
```

The shorter equivalent is:

```bash
npm run test:e2e:local
```

## Extraction Schema Fixtures

The fixture-based extraction scaffold is local-only and does not call Gemini or write Supabase rows. It validates the versioned extraction output shape and 15 synthetic/anonymized fixture expectations:

```bash
npm run test:extraction
```

Fixtures should stay privacy-safe: no real child names, raw family source text, addresses, phone numbers, emails, or source excerpts from cohort families.

## Live Gemini Extraction Evals

Live extraction evals compare Gemini output against the synthetic fixture suite without writing Supabase rows, source artifacts, jobs, analytics events, or app-state records.

```bash
GEMINI_API_KEY=... npm run test:extraction:live
```

Optional controls:

```bash
GEMINI_EXTRACTION_MODEL=gemini-2.5-flash
GEMINI_EVAL_FIXTURE_IDS=soccer-pickup-change,field-trip-readiness
```

Do not commit `GEMINI_API_KEY`, paste it into docs, or store it in `.env.local` unless the file stays ignored locally. Live eval failures are expected while the prompt/schema is being tuned; inspect the mismatch report, adjust the prompt/schema/fixtures deliberately, and keep real family source text out of fixture data.
