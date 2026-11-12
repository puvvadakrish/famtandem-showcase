---
title: Coverage response analytics and hosted hydration investigation
date: 2026-05-31
category: integration-issues
tags:
  - analytics
  - posthog
  - hosted-user-eval
  - hydration
status: resolved
---

# Coverage response analytics and hosted hydration investigation

## Symptom

The hosted user-evaluation suite completed the product flow through a no-account coverage response, but PostHog Activity did not show a clearly matching `coverage_request_accepted` event for the newest run's `coverage_request_link_opened` row after reloads and waiting.

The same hosted run also failed the command because Playwright observed minified React error `#418` on `/app#add-logistics`. React documents error `#418` as a hydration mismatch: server-rendered HTML did not match the client-rendered tree.

## What Was Confirmed

- The coverage response product flow reached the accepted confirmation page and returned the board to the covered state.
- Production logs showed the public response page loading, the submit route returning a redirect, and the confirmation page loading again during the validation window.
- `coverage_request_accepted` is no longer globally absent from PostHog Activity; accepted rows appeared for earlier response attempts.
- Local Playwright coverage-request tests passed after the analytics change.
- A local desktop Playwright stress pass of the paste-intake path did not reproduce the hydration mismatch.
- A later hosted run with stamp `202605311701` passed end to end and showed matching `coverage_request_accepted` rows in PostHog for the same request token id.

## Investigation Findings

The response route and signed confirmation page both capture completion analytics, but they intentionally swallow analytics errors so the product flow is not blocked by PostHog. That is correct product behavior, but it left the hosted run unable to distinguish:

- PostHog capture succeeded but Activity had not surfaced the row yet.
- PostHog capture failed or was rejected.
- The confirmation page fallback ran but produced a delayed or differently grouped person row.
- The product flow succeeded and analytics correlation was the only gap.

The hosted user-eval harness also lacked a few breadcrumbs needed for exact correlation: it redacted the response URL entirely, did not store the final accepted status URL, and did not separately report network request failures or non-2xx/3xx responses.

The remaining accepted-event gap was in the signed confirmation-page fallback. Used response links intentionally hide card details, so the fallback sometimes had a valid signed `statusProof` and request token id but no `cardId`. The previous guard required `cardId`, which skipped the analytics capture even though the product response had already succeeded. The final fix captures `coverage_request_accepted` or `coverage_request_declined` from the confirmation page when the signed proof verifies and the request token id is present, adding `card_id` only when it is available.

## Diagnostic Patch

The follow-up patch kept the product flow unchanged and added privacy-safe observability:

- `captureServerEvent` now omits `uuid` entirely when no event id is provided, instead of passing `uuid: undefined`.
- Submit-route completion events include `response_source=submit_route`.
- Submit-route analytics failures log only the event name and generic failure reason, never response tokens, raw source text, names, emails, or provider payloads.
- The hosted user-eval summary now records:
  - the redacted final response URL,
  - the final response `status` query value,
  - network failures separately from console/page errors.
- Magic-link polling now waits for a fresh Spark email, ignores messages older than the run, and verifies the email `To:` line matches the login address before opening a link.
- Expected Next server-action redirect aborts are recorded as `ignoredNetworkEvents`.
- Expected `GET /_next/static/chunks/*.js` `net::ERR_ABORTED` requests are also recorded as `ignoredNetworkEvents`; these happen when navigation cancels in-flight chunk fetches and are not equivalent to a 404/500 chunk load failure.

## Final Verification

This patch was merged in PR #50 and deployed to production on Vercel.

Two immediate hosted reruns after deployment did not reach the app because Spark did not see a fresh magic-link email for either the base test account or a plus-address test account within the harness polling window, even though `/login` returned 303.

A direct Supabase Auth probe and later hosted-app login probes confirmed email delivery was not down: Spark eventually received fresh plus-address confirmation emails. The failure mode was delayed or competing mailbox messages, not a total app/Auth outage. The hosted harness now waits longer, verifies that the Spark email `To:` line matches the login address, and records benign Next server-action redirect aborts separately from real network failures.

Final verification used:

```bash
CONFIRM_HOSTED_USER_EVAL=1 \
FAMTANDEM_USER_EVAL_EMAIL=test-user+postchunk2-202605311701@example.com \
FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com \
FAMTANDEM_USER_EVAL_STAMP=202605311701 \
npm run test:user-eval:hosted
```

Result:

- `status: "passed"`.
- `coverageResponseStatus: "accepted"`.
- `consoleErrors: []`.
- `networkErrors: []`.
- `ignoredNetworkEvents` included only benign `POST /household/new` and `POST /app` redirect aborts.
- Vercel logs contained no `Coverage response analytics capture failed`, errors, or warnings.
- PostHog Activity showed `coverage_request_accepted` rows for the same request token id as the accepted hosted request.

If the product status is accepted and Vercel logs show no capture failure, but Activity still lacks the accepted row, treat it as a PostHog visibility/correlation issue rather than a coverage-response product defect.

## Hydration Follow-Up

Do not suppress React `#418` by default. It should stay a non-functional hosted suite finding until one of these is true:

- a production-style local run reproduces and fixes the mismatch,
- a future hosted run with the new network/URL breadcrumbs shows it was caused by an external failed request or transient deploy state,
- repeated hosted reruns no longer reproduce it and the suite can document it as observed transient behavior.

React's decoded cause for `#418` includes variable server/client inputs, locale/date formatting drift, changing external data without a consistent snapshot, invalid HTML nesting, or browser/extension HTML mutation.

For this investigation, a full hosted run with stamp `202605311657` reproduced `#418` after the product flow completed, but a targeted authenticated `/app` reload diagnostic on the same test account did not reproduce it and the next full hosted run with stamp `202605311701` passed with no console/page errors. Keep future React page errors as valid failures, but the latest clean hosted run means this is no longer a handoff blocker.
