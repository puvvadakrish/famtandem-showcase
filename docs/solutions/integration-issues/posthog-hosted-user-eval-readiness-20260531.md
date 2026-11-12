---
title: PostHog hosted user-eval readiness after production analytics wiring
date: 2026-05-31
category: integration-issues
status: resolved
tags:
  - posthog
  - hosted-qa
  - user-eval
  - analytics
---

# PostHog hosted user-eval readiness after production analytics wiring

## Problem

After production PostHog analytics was wired through the `/ingest` reverse proxy, the hosted user-evaluation suite needed to be rerun so future agents could trust that the app still worked and that validation events reached PostHog.

Some durable docs still pointed to the legacy PostHog app host and some current-agent context still repeated stale first-family prerequisites. That created risk that future agents would copy outdated setup instructions or keep raising resolved operator concerns.

## What changed

- The standard hosted user-eval was rerun after the PostHog deploy and passed.
- `.env.example` and the hosted cohort runbook now use the current PostHog hosts:
  - `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`
  - `NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com`
- Agent context now points future agents to the hosted user-eval command and PostHog validation events as the first-family readiness gate.
- Historical docs were adjusted so credential guidance stays general: secrets belong in local/hosted env only and should not be committed, logged, or documented.

## Verification

Hosted command:

```bash
CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+posthog-eval-202605311947@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com npm run test:user-eval:hosted
```

Result:

- Status: passed.
- Screenshots and redacted summary were written under `output/playwright/hosted-user-eval/202605311947/`.
- PostHog Activity showed the run's login, household setup, child/helper setup, source submission, coverage request creation/send, and response-link open events.

## Follow-up

The hosted user-eval exercises AI-extracted card creation, while `coverage_card_created` currently represents manual card creation only. If the validation dashboard needs an extracted-card funnel step, add a dedicated extracted-card event or emit `coverage_card_created` from the extraction card-creation boundary.

`coverage_request_accepted` did not appear in PostHog Activity immediately after the first passing run even though the product flow reached the accepted completion state. That was tracked as an analytics follow-up, not a product-flow blocker.

Later on 2026-05-31, PRs #47, #48, and #49 improved the response analytics path with immediate server capture, signed confirmation-page fallback capture, and removal of the custom PostHog event-id override. PR #53 closed the remaining used-link fallback gap: the confirmation page can capture signed accepted/declined completion with the request token id even when card details are hidden.

The follow-up hosted run with stamp `202605311701` passed end to end. PostHog Activity showed matching `coverage_request_accepted` rows for the run's request token id, and Vercel logs showed no coverage analytics capture failures.

## Prevention

- Keep PostHog setup docs aligned with `src/lib/env-core.ts`, `src/lib/env-client.ts`, and `next.config.ts`.
- Run `CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted` after analytics instrumentation changes.
- Confirm both product behavior and event visibility; do not assume a dashboard funnel proves a path unless the event names match the path being exercised.
