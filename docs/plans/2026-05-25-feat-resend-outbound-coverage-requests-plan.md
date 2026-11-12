---
title: "feat: Add Resend outbound coverage request emails"
type: feat
status: complete
date: 2026-05-25
origin: docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md
---

# feat: Add Resend outbound coverage request emails

## Overview

Add real outbound email sending for coverage requests through Resend when a helper/spouse email is available, while keeping the existing manual copy-link behavior safe by default.

This carries forward the external-cohort decision to ship **Resend outbound email first** as a pragmatic provider-backed coverage-request lever, with Twilio left as the likely next provider after SMS compliance/sender decisions are ready (see brainstorm: `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`).

## Decisions Carried Forward

- Resend outbound email is the only provider in this slice (see brainstorm: `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`).
- Manual copy-link remains the default/safe local fallback.
- Twilio/SMS remains out of scope, except preserving the existing channel abstraction so SMS can reuse it later.
- No Resend inbound email, provider webhooks/status callbacks, Google Calendar, OCR, signed downloads, broad admin correction, or committed provider credentials.
- Founder will create the Resend account/domain.
- Sender identity for this slice: `FamTandem <coverage@updates.famtandem.com>` because `updates.famtandem.com` is the currently verified Resend sending domain. Move to `FamTandem <coverage@famtandem.com>` after the root domain is verified.
- First cohort volume is low: up to 10 families and likely low double-digit requests in week one.

## Research Summary

### Repo Context

- `src/lib/coverage-requests/create.ts` already orchestrates token generation, `create_coverage_request`, sender selection, response URL composition, and `mark_coverage_request_sent`.
- `src/lib/coverage-requests/senders/types.ts`, `local-stub.ts`, and `provider.ts` are the existing seam for coverage request sending.
- `src/components/board-shell.tsx` already collects optional external email and hidden `manual_link` channel.
- `src/app/app/actions.ts` creates coverage requests and captures privacy-safe PostHog events.
- `supabase/migrations/20260525120000_phase3_coverage_requests.sql` currently constrains `mark_coverage_request_sent` to `local-stub`, so this slice needs a migration that allows `resend`.
- `tests/e2e/coverage-requests.spec.ts` already covers no-account accept/decline and manual-link safety.
- `tests/unit/coverage-request-sender.test.ts` is the natural place for sender/provider unit coverage.

### Resend Notes

- Resend sends email with `POST /emails`, requiring `from`, `to`, `subject`, and content such as `html` or `text`.
- Resend supports idempotency on `POST /emails` through an `Idempotency-Key` header or SDK option; keys are unique per API request and kept for 24 hours.
- Resend API calls authenticate with `Authorization: Bearer <api key>`.
- Direct HTTP requests must include a `User-Agent` header.
- Once a domain is verified, Resend can send from any address at that domain; Resend recommends using addresses that can receive replies.
- Resend errors include unverified-domain, invalid-from, invalid/duplicate idempotency, quota, and rate-limit cases.

## Proposed Solution

### Provider Selection And Env

Add server-only env vars:

- `COVERAGE_REQUEST_SENDER`: enum, default `local-stub`, allowed values `local-stub` and `resend`.
- `RESEND_API_KEY`: optional server-only key. Required only when `COVERAGE_REQUEST_SENDER=resend`.
- `RESEND_FROM_EMAIL`: default `FamTandem <coverage@updates.famtandem.com>` until root `famtandem.com` is verified.
- `RESEND_REPLY_TO_EMAIL`: optional. If omitted, omit `reply_to` or use the sender address only if the founder has reply handling for `coverage@famtandem.com`.

Hosted configuration:

- Set `COVERAGE_REQUEST_SENDER=resend` only in the hosted cohort environment after the Resend domain is verified.
- Store `RESEND_API_KEY` only in hosted env/local `.env.local`; never commit or paste it.
- Keep local development and E2E on `local-stub` unless a developer explicitly opts into Resend.

### Sender And Reply-To Behavior

- Use `FamTandem <coverage@updates.famtandem.com>` for `from` in this slice.
- For this slice, do not set a dynamic parent reply-to because that would expose the requesting parent's private email and can create support/privacy confusion.
- If `RESEND_REPLY_TO_EMAIL` is configured, set it as `reply_to`.
- If not configured, send without `reply_to`; the email body should tell recipients to use the response link.

### Email Content And Privacy Boundaries

Email should include:

- Plain parent-language subject, e.g. `Coverage request: Soccer pickup`.
- Recipient label greeting when available.
- Compact context from existing request inputs: card title, date/time when available, location when available, requested role/slot, requester label if already in token context, optional note, and response link.
- A short line that replies may not be monitored unless a reply-to is configured.

Email must not include:

- Raw source text.
- Full source URLs or artifact paths.
- Extraction run details.
- Token hashes or internal ids.
- Other household cards, member lists, child profile metadata beyond existing public request context, provider credentials, phone numbers, or analytics identifiers.

Implementation should avoid HTML-only content; send both `text` and simple escaped `html`.

### Idempotency

- Reuse the existing idempotency key shape from `createCoverageRequestWithStubSend`: `coverage-request/<requestTokenId>/<channel>`.
- For Resend, pass this value as the Resend idempotency key.
- Store the returned Resend email id in `coverage_requests.provider_message_id`.
- Keep `attempt_count` increment behavior in `mark_coverage_request_sent` based on provider message id change.
- Do not add provider webhooks; delivery status remains provider-side for now.

### Failure Behavior

- If Resend is not configured but selected, fail before creating a request when possible.
- If Resend returns an error after the token/request rows are created, mark the send as `failed` through `mark_coverage_request_sent` with provider `resend`, capture the existing `coverage_request_send_attempted` event with `status=failed`, and redirect/show the manual copy-link fallback.
- Do not mark a slot accepted or covered on send success.
- Do not clear the request token on send failure; the fallback link should still work.
- Keep request rows pending because the default parent can still copy the link or retry in a later slice.

### UX

- Add an email channel option for typed external helper/spouse emails. Household-member email sends stay deferred until household members store email addresses in the app model.
- For this narrow slice, the board composer can stay simple:
  - Default to manual link.
  - Allow `Email request` when an email value exists.
  - Continue to show/copy the response link for manual fallback after failures.
- Do not add SMS UI beyond the existing type/channel compatibility.

### Tests

Unit tests:

- Provider selector defaults to local stub without env.
- Provider selector chooses Resend only when `COVERAGE_REQUEST_SENDER=resend` and `RESEND_API_KEY` exists.
- Resend sender sends `POST https://api.resend.com/emails` with authorization, user-agent, JSON body, and `Idempotency-Key`.
- Resend sender includes configured `from` and optional `reply_to`.
- Resend sender builds privacy-bounded text/html content and does not include raw source text.
- Resend sender maps success to `{ provider: "resend", providerMessageId: <id>, status: "sent" }`.
- Resend sender maps provider/API errors to `{ provider: "resend", providerMessageId: null, status: "failed" }` without throwing secrets.
- Migration/unit guard allows `resend` and `sent/failed` in `mark_coverage_request_sent` while preserving authenticated admin-only execution.

E2E:

- Keep existing E2E on local stub/manual link by default.
- Add E2E only if the UI channel switch is significant; mock/no-real-send is preferable.
- Do not send real Resend emails in CI or default local tests.

Verification commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build:local
npm run test:e2e:local
git diff --check
```

## Implementation Checklist

- [x] Add Resend sender env schema entries with safe defaults.
- [x] Extend coverage request sender types to include `resend` and `sent`.
- [x] Add a Resend sender using direct `fetch` rather than adding a new package.
- [x] Update provider selection to default to local stub and require explicit Resend env.
- [x] Build privacy-bounded email subject/text/html helpers.
- [x] Add a migration to allow `mark_coverage_request_sent` to record `resend` `sent/failed` results.
- [x] Keep `createCoverageRequestWithStubSend` name for now to avoid unrelated churn; provider behavior is no longer stub-only.
- [x] Update request action/UI so email sends can be selected when an email is available and manual link remains the fallback.
- [x] Add/refresh unit tests for local stub, provider selection, Resend request payload, failure mapping, and migration constraints.
- [x] Update local setup and cohort readiness docs with Resend env/config and no-real-send defaults.
- [x] Run verification commands.
- [x] Run `ce-review`.
- [x] Run read-only Cursor `gpt-5.5-high` review before merge because this touches provider sending, contact data, token links, privacy, and failure behavior. Initial wrapper attempts hung or timed out. Direct `cursor agent --print --model gpt-5.5-high` with a 600s timeout completed on PR #17; it found the stalled Resend send timeout risk and the missing executable DB auth coverage for `mark_coverage_request_sent`. Both were fixed before merge.

## Acceptance Criteria

- [x] With no Resend env, coverage request creation behaves as it does today and does not attempt external sends.
- [x] With Resend explicitly configured, an email coverage request sends to the supplied helper/spouse email and stores provider `resend` plus the Resend email id on request rows.
- [x] Resend requests use an idempotency key tied to the request token/channel.
- [x] Email content contains only compact request context and the response link, not raw source text or internal provider/extraction details.
- [x] Send failure leaves the request link usable and does not mark coverage accepted/covered.
- [x] Manual copy-link fallback remains available and covered by tests.
- [x] Docs explain local/hosted env setup and credential boundaries.

## Out Of Scope

- Resend inbound email.
- Twilio implementation.
- SMS sending or SMS compliance changes.
- Provider webhooks/status callbacks.
- Delivery dashboard.
- Google Calendar.
- OCR/text extraction from uploads.
- Signed source downloads.
- Broad admin correction.
- Production credentials committed to the repo.

## Risks

- **Credential leakage:** Keep keys only in local/hosted env. Do not log request headers or API keys.
- **Privacy leakage:** Keep email content compact and source-free.
- **Duplicate sends:** Use Resend idempotency and do not add retry loops in this slice.
- **Unverified domain:** Resend will reject sends if `famtandem.com` is not verified. Keep manual link fallback intact.
- **Silent delivery failure:** No webhooks in this slice, so provider delivery status must be checked in Resend during cohort operations.

## Post-Deploy Monitoring & Validation

- In app logs, search for `coverage_request_send_attempted`, `provider=resend`, and `status=failed`.
- In Resend, check outbound email activity for `coverage@famtandem.com`, bounces, quota/rate-limit errors, and idempotency conflicts.
- In `/app/admin/validation`, watch coverage requests sent, accepted, and declined.
- Healthy signal: low double-digit sends in week one, no repeated send failures, helpers open links and accept/decline without account creation.
- Failure signal: repeated unverified-domain/auth/rate-limit errors, helpers reporting missing email, or manual fallback used for most email-available helpers.
- Validation window: first cohort week; owner: founder/operator.
