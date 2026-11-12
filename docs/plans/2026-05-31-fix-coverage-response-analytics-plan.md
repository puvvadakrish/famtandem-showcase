---
title: Fix coverage response analytics reliability
type: fix
status: complete
date: 2026-05-31
origin: docs/brainstorms/2026-05-31-coverage-response-analytics-reliability-brainstorm.md
---

# Fix coverage response analytics reliability

## Problem

The hosted user-evaluation suite completed the coverage ask/response flow, but `coverage_request_accepted` did not appear in PostHog Activity immediately afterward. The response route already attempts to capture the event, so the smallest useful slice is to make server response-event capture more explicit and verifiable.

Status update: complete. PR #53 closed the accepted-event visibility gap, and hosted run `202605311701` showed matching `coverage_request_accepted` rows for the run's request token id.

## Scope

- Response completion analytics for accepted/declined coverage links.
- Server analytics helper support for optional event ids.
- Focused tests and docs/todo cleanup.

## Out Of Scope

- UI changes.
- Dashboard creation.
- New customer-facing disclaimers.
- Adding raw source details or recipient PII to analytics.

## Implementation Checklist

- [x] Add optional event-id support to server analytics capture.
- [x] Try stable ids for accepted/declined coverage response events.
- [x] Remove stable ids from coverage response completion events after hosted PostHog did not show the event.
- [x] Add signed confirmation-page completion capture as fallback for the POST route.
- [x] Keep invalid/malformed response paths analytics-free.
- [x] Add/update focused unit coverage.
- [x] Update the PostHog/user-eval docs after hosted verification.
- [x] Run lint, typecheck, focused unit tests, and relevant user-eval verification as appropriate.
- [x] Open PR, run CE review/GitHub review checks, and merge if clean.

## Verification Plan

- `npm run lint`
- `npm run typecheck`
- `npx vitest run tests/unit/coverage-response-route.test.ts`
- `npx vitest run tests/unit/posthog-server.test.ts tests/unit/posthog-sdk-runtime.test.ts`
- If the code change is clean locally, run hosted user-eval again only if needed to prove the production event after deploy.
