# FamTandem Hosted Cohort Readiness Runbook

Use this runbook before inviting the first 10-20 family validation cohort into a hosted FamTandem environment.

The goal is a controlled validation loop, not a broad production launch. Keep real providers opt-in, keep raw source material private, and preserve manual fallbacks.

## Hosted Environment

Set these in the hosted app environment. Do not commit real values.

This repository does not currently include a committed Vercel project link or hosted environment configuration. A hosted smoke requires a linked hosted project, deployed Supabase project, and environment variables configured outside the repo. If `vercel` or `.vercel/project.json` is unavailable locally, stop after local verification and have the project owner link the hosted project before running the hosted smoke.

```bash
NEXT_PUBLIC_APP_URL=https://<hosted-app-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<hosted-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<hosted-service-role-key>
CRON_SECRET=<long-random-secret>
JOB_BATCH_SIZE=5

NEXT_PUBLIC_POSTHOG_KEY=<optional-project-key>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com

COVERAGE_REQUEST_TOKEN_SECRET=<long-random-secret>
COVERAGE_REQUEST_SENDER=local-stub
HOUSEHOLD_NOTIFICATION_SENDER=local-stub

RESEND_API_KEY=
RESEND_FROM_EMAIL="FamTandem <coverage@updates.famtandem.com>"
RESEND_REPLY_TO_EMAIL=

EXTRACTION_PROVIDER=local-stub
GEMINI_MODEL=gemini-3.5-flash
GEMINI_API_KEY=

ARTIFACT_TEXT_PROVIDER=disabled
ARTIFACT_TEXT_MODEL=gemini-3.5-flash
```

Safe hosted defaults:

- `COVERAGE_REQUEST_SENDER=local-stub`
- `HOUSEHOLD_NOTIFICATION_SENDER=local-stub`
- `EXTRACTION_PROVIDER=local-stub`
- `ARTIFACT_TEXT_PROVIDER=disabled`

Enable real providers only for an explicit cohort exercise.

## Vercel Cron

Configure a Vercel Cron job:

```text
GET /api/cron/jobs
Authorization: Bearer $CRON_SECRET
```

The route also accepts `x-cron-secret` for local/manual smoke testing. In hosted environments, prefer the bearer token.

Healthy response shape includes:

- `claimed`
- `succeeded`
- `failed`
- `dailyNudgeEnqueue`
- `weeklyReviewEnqueue`

FamTandem sends browser analytics through the app's `/ingest` reverse proxy, while server-side analytics use `NEXT_PUBLIC_POSTHOG_HOST` directly. Watch the PostHog server event `cron_jobs_processed` when PostHog is configured.

Before inviting families, run one manual hosted cron smoke against the deployed app with the hosted `CRON_SECRET`, then verify `/app/admin/ops` shows no unexpected backlog, stale running jobs, or provider failures. Do not paste the secret or response body if it contains private operational data into chat or PR comments.

## Provider Enablement

### Supabase Auth Email

Before inviting beta families, configure Supabase Auth with a custom SMTP provider. The built-in Supabase Auth email sender is only suitable for demos and has a very low project-wide send limit, so repeated magic-link attempts can block sign-in even when the app is healthy.

Recommended beta setup:

- Keep Supabase Auth email confirmations enabled.
- Set the Supabase Auth Site URL to the canonical app URL, for example `https://app.famtandem.com`.
- Include the canonical app URL, fallback Vercel URL, apex domains, and localhost in the Supabase Auth redirect allow-list.
- Configure a verified sender domain through the chosen SMTP provider.
- Keep the app login UI tolerant of provider throttles; a rate-limited magic-link send must show retry guidance, not a hosted 500.

Auth email is separate from FamTandem's coverage-request and household-notification senders below. Enabling Resend for coverage emails does not automatically raise Supabase Auth magic-link limits unless Supabase Auth SMTP is also configured.

Current hosted beta state as of 2026-05-27:

- Supabase Auth custom SMTP is configured through Resend.
- Sender: `FamTandem <coverage@updates.famtandem.com>`.
- SMTP host/user: `smtp.resend.com` / `resend`.
- SMTP port: `465`.
- Auth email hourly limit: `30`.
- The Resend SMTP key is scoped to the verified `updates.famtandem.com` domain and is stored only in Supabase hosted Auth config.
- Hosted smoke: `delivered+...@resend.dev` reached the app's check-email redirect and Resend reported the auth email as `delivered`.

### Coverage Request Email

Enable only after the Resend sending domain is verified:

```bash
COVERAGE_REQUEST_SENDER=resend
RESEND_API_KEY=<hosted-resend-key>
RESEND_FROM_EMAIL="FamTandem <coverage@updates.famtandem.com>"
```

Rollback:

```bash
COVERAGE_REQUEST_SENDER=local-stub
```

Manual/no-account response links remain the fallback.

### Household Notification Email

Daily unresolved nudges and weekly coverage reviews require both household-level settings and sender enablement.

```bash
HOUSEHOLD_NOTIFICATION_SENDER=resend
RESEND_API_KEY=<hosted-resend-key>
RESEND_FROM_EMAIL="FamTandem <coverage@updates.famtandem.com>"
```

Rollback:

```bash
HOUSEHOLD_NOTIFICATION_SENDER=local-stub
```

Messages must remain compact coverage-status summaries. Do not include raw source text, artifact links, token hashes, provider IDs, or broad member lists.

### Gemini Logistics Extraction

Enable only when ready to process cohort source text through Gemini:

```bash
EXTRACTION_PROVIDER=gemini
GEMINI_API_KEY=<hosted-gemini-key>
GEMINI_MODEL=gemini-3.5-flash
```

Rollback:

```bash
EXTRACTION_PROVIDER=local-stub
```

Source inputs and extraction runs remain auditable. Failed runs can be retried by internal admins from source detail when appropriate.

### Gemini Upload OCR

PDF/image OCR is more sensitive because it touches raw uploaded artifacts. Keep it disabled unless explicitly testing uploaded screenshots/PDFs:

```bash
ARTIFACT_TEXT_PROVIDER=gemini
ARTIFACT_TEXT_MODEL=gemini-3.5-flash
GEMINI_API_KEY=<hosted-gemini-key>
```

Rollback:

```bash
ARTIFACT_TEXT_PROVIDER=disabled
```

Extracted upload text must remain parent/admin review-gated before card creation.

## Weekly Operator Checks

Before each cohort week:

1. Open `/app/admin/validation`.
2. Export the validation CSV for weekly notes.
3. Open `/app/admin/ops`.
4. Check pending/failed jobs and stale running jobs.
5. Check extraction run failures and sources stuck in review.
6. Check upload artifact text/OCR failures or review-needed text.
7. Check notification run failures and skipped-empty counts.
8. Check coverage-request send failures.
9. Check provider dashboards outside the app for Resend/Gemini quota, cost, and delivery errors.
10. Confirm household notification settings are enabled only for families who opted in.

Escalate if:

- job backlog stays above 50 for 30 minutes
- normal source processing takes more than 15 minutes
- extraction p95 exceeds 120 seconds
- provider timeout/failure rate exceeds 5%
- stale running jobs recur after cron retries
- helpers report exposed raw source text or confusing request-link behavior
- daily/weekly emails become noisy or include already-resolved items

## Privacy Rules

- Do not ask families to send medical, legal, financial, custody, or highly sensitive documents during the first cohort.
- Do not put raw source text, screenshots, PDFs, artifact paths, token hashes, provider payloads, emails, phone numbers, or API keys in docs, chats, PRs, or analytics.
- Keep full source and upload artifact access to parent, household-admin, and internal-admin paths only.
- Helpers and public response links must not see raw source material.

## Deployment Notes

- Run migrations in order against the hosted Supabase project.
- Do not run `supabase db reset` against hosted projects.
- Keep local `.env.local` ignored and local-only.
- Rotate any provider key that appears in chat, docs, screenshots, logs, or PR descriptions.
- Run build and E2E sequentially locally; do not run both against the same `.next` output at the same time.
