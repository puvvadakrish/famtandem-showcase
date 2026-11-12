---
title: fix: Extracted event time consistency
type: fix
status: complete
date: 2026-05-31
---

# fix: Extracted event time consistency

Hosted first-session QA for `test-user@example.com` proved that paste extraction, source detail, coverage ask, and no-account response all work end to end, but it exposed a blocker for family handoff: one source said soccer practice was June 9, 2026 at 5:30 PM, while surfaces showed 4:30 PM or 9:30 PM depending on where the parent looked.

This was fixed and hosted-verified in PR #43. See `docs/solutions/integration-issues/extracted-time-consistency-20260531.md` for the durable solution record.

## Scope

- Keep the slice limited to time extraction and time presentation consistency.
- Do not add Google Calendar behavior, SMS, inbound email, provider callbacks, or admin correction expansion.
- Keep provider calls default-safe locally; local tests must not call Gemini unless an explicit live test command is used.
- Preserve helper/source privacy boundaries and no-account response privacy.

## Acceptance Criteria

- [x] Runtime Gemini extraction receives household timezone and source received time context.
- [x] Runtime extraction prompt tells Gemini to preserve explicit local source times as local times with the household timezone offset.
- [x] A source saying June 9, 2026 at 5:30 PM to 6:45 PM in `America/Chicago` stores the equivalent instants for 5:30 PM and 6:45 PM local time.
- [x] Board, source detail, and no-account coverage response render the same local event time for the same card.
- [x] Focused unit tests cover runtime prompt context and no-account response timezone formatting.
- [x] Relevant local verification passes: lint, typecheck, unit tests, build, and targeted E2E.
- [x] Hosted first-session QA is rerun after deploy with `test-user@example.com` and documents whether the app is ready for the first beta household to try.

## Implementation Checklist

- [x] Branch from latest `main`.
- [x] Pass household timezone and source `received_at` from extraction runner into the extractor input.
- [x] Update runtime Gemini prompt to include timezone/receivedAt context and explicit local-time preservation rules.
- [x] Add response-page timezone support by returning the household timezone for valid coverage request links.
- [x] Format coverage request response times using that household timezone.
- [x] Add/update unit tests.
- [x] Run local verification.
- [x] Review the diff with CE review discipline before merge.
- [x] Deploy via normal main merge path.
- [x] Rerun the hosted guarded first-session flow and update the user-evaluation artifact.

## Post-Deploy Monitoring & Validation

- Hosted validation: run one guarded first-session flow with `test-user@example.com`, including paste intake, source detail check, coverage ask, no-account response, and mobile viewport.
- Healthy signal: the soccer note's source text, board card, source detail linked card, and response page all show 5:30 PM local time.
- Failure signal: any same-card surface shows a different clock time or source extraction creates no card.
- Mitigation: block family handoff, revert the PR or patch extraction prompt/context, and rerun hosted validation.
