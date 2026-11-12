---
title: test: Add hosted user evaluation command
type: test
status: complete
date: 2026-05-31
origin: docs/plans/2026-05-30-test-icp-browser-ux-evaluation-suite-plan.md
---

# test: Add hosted user evaluation command

Package the guarded hosted first-session flow into a repeatable repo command so future feature work can run the same product-facing smoke without reconstructing an ad hoc Playwright script.

Status update: complete. The command is available as `npm run test:user-eval:hosted`; PR #51 through PR #55 hardened login polling, accepted-response analytics correlation, and benign network-event classification. The latest clean reference run is `202605311701`.

## Scope

- Add one guarded hosted runner for the current first-session suite.
- Keep the command off by default unless explicitly confirmed with an environment flag.
- Use the standard hosted test account `test-user@example.com` unless overridden.
- Preserve hosted data: create additive timestamped test rows only; never reset, delete, or truncate hosted data.
- Do not add CI wiring yet; this is an operator-run command.

## Acceptance Criteria

- [x] `npm run test:user-eval:hosted -- --help` documents prerequisites and safety flags.
- [x] `npm run test:user-eval:hosted` refuses to run without explicit confirmation.
- [x] Confirmed runs log in through hosted magic link, add children/helper, paste three low-sensitivity logistics notes, verify Gemini linked cards, create one coverage request, accept it on mobile, and assert response-link privacy/time consistency.
- [x] Run artifacts are written under `output/playwright/` and not committed.
- [x] QA docs explain how and when to run the command.

## Implementation Checklist

- [x] Add `scripts/hosted-user-eval.mjs`.
- [x] Add `test:user-eval:hosted` npm script.
- [x] Update QA documentation with command usage and safety notes.
- [x] Support separate Spark mailbox lookup for Gmail plus-address test identities.
- [x] Verify help/refusal paths locally.
- [x] Run the confirmed hosted command once.
- [x] Review through normal PR flow.

## Post-Deploy Monitoring & Validation

No production code path changes. Validation is the hosted test command itself, plus checking that it remains opt-in and additive-only.
