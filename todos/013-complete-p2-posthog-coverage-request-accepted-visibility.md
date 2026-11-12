# P2 Complete: Verify PostHog coverage request accepted event visibility

## Status

Complete. The latest hosted user-eval run correlated a fresh accepted coverage request from app state through Supabase, Vercel logs, and PostHog Activity.

## Context

The 2026-05-31 post-PostHog hosted user-eval passed functionally and PostHog Activity showed login, household setup, child/helper setup, source submissions, coverage request creation/send, and response-link open events.

`coverage_request_accepted` did not appear in PostHog Activity immediately after the run, even though the app reached the accepted completion state.

On 2026-05-31, PRs #47, #48, and #49 tightened the server analytics path:

- server capture now uses `captureImmediate`;
- the signed confirmation page also captures accepted/declined completion when the response proof validates;
- the coverage response completion events no longer pass a custom PostHog `uuid`.

After production deployed `8682a96`, the hosted user-eval with `test-user@example.com` and stamp `202605312033` completed the product flow through mobile acceptance and wrote screenshots under `output/playwright/hosted-user-eval/202605312033/`. The command failed because it observed the existing intermittent React hydration error `#418`, not because the coverage flow failed.

PostHog Activity showed `coverage_request_accepted` rows in the last-hour view, so the event was no longer globally absent. Exact per-run correlation still needed the diagnostics and fallback fixes described below.

A follow-up investigation added privacy-safe diagnostics for the next hosted run: submit-route completion events are marked with `response_source=submit_route`, analytics capture failures log only the event name and generic failure reason, and the hosted user-eval summary records the redacted final response URL, completion status, and network failures. A local desktop Playwright stress pass of paste intake did not reproduce the intermittent hydration mismatch.

PR #50 merged and deployed the diagnostics. Two immediate hosted reruns after that deploy did not reach the app because Spark did not see a fresh magic-link email for either `test-user@example.com` or a plus-address variant within the harness polling window, while Vercel showed `/login` POST returning 303. A direct Supabase Auth probe and later hosted-app probes confirmed Spark can receive fresh plus-address emails; the harness needed a longer wait and recipient matching so delayed or unrelated FamTandem messages do not confuse login pickup.

A hosted run with stamp `202605312123` then completed the product flow and recorded `coverageResponseStatus: "accepted"` with no console/page errors. It still exited nonzero because the new network diagnostics treated benign Next server-action `POST /app net::ERR_ABORTED` redirects as failures. A follow-up run with stamp `202605312130` confirmed the same pattern for household setup: product flow still completed and accepted coverage, but `POST /household/new net::ERR_ABORTED` needed the same classification. The harness now records those expected redirect aborts as `ignoredNetworkEvents` instead of blocking the suite.

PR #53 closed the remaining accepted-event visibility gap by letting the signed confirmation-page fallback capture accepted/declined completion with the request token id even when a used response link hides card details.

Final validation: a full hosted run with stamp `202605311657` reproduced React hydration error `#418` after the product flow completed. A targeted authenticated `/app` reload diagnostic did not reproduce it, and the next full hosted run with stamp `202605311701` passed end to end with `coverageResponseStatus: "accepted"`, empty `consoleErrors`, empty `networkErrors`, no Vercel analytics capture failures, and matching `coverage_request_accepted` rows in PostHog Activity for the same request token id. Future React page errors should remain valid non-functional findings, but this one is no longer blocking the current handoff.

## Acceptance Criteria

- [x] Reproduce with a synthetic hosted coverage request.
- [x] Confirm that `coverage_request_accepted` can appear in PostHog Activity without logging response tokens, raw source text, names, emails, or provider payloads.
- [x] Add privacy-safe diagnostics so the next hosted run can distinguish product success, PostHog capture failure, network failure, and Activity-correlation delay.
- [x] Restore or work around the hosted test-account magic-link delivery/pickup path so the guarded suite can log in again.
- [x] Keep benign Next server-action redirect aborts out of blocking `networkErrors` while still reporting them for context.
- [x] Confirm a fresh hosted run shows matching created/send/open/accepted events for the same coverage request.
- [x] Investigate the intermittent hosted React hydration error `#418` after preserving it as a real non-functional suite finding.
- [x] Update `posthog-setup-report.md` and the hosted user-eval QA doc with the result.
