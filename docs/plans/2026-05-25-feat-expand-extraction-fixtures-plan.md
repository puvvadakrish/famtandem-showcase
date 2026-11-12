---
title: Expand Extraction Fixtures
type: feat
status: complete
date: 2026-05-25
origin: docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md
---

# Expand Extraction Fixtures

Grow the synthetic/anonymized `family-logistics-v1` fixture suite so extraction quality is evaluated against more real-shape family logistics sources, without changing runtime app behavior.

## Scope

- [x] Add fixture cases for change notices, multi-child schedules, carpool/external coverage, payment/form/readiness, ambiguous ownership, no-action sources, known coverage, and Needs Review triggers.
- [x] Keep expected outputs grounded in the synthetic source text.
- [x] Preserve the current extraction schema and evaluator contract.
- [x] Keep this fixture/eval-only: no app routes, migrations, Supabase writes, production Gemini calls, Twilio, Resend, or Google Calendar.
- [x] Run local extraction tests and relevant unit tests.
- [x] Run CE review plus delegated review/coverage-gap analysis before opening the PR.

## Context

The first-product brainstorm centers the product on source-backed coverage cards, especially uncovered pickup/dropoff ownership, changes needing reconfirmation, readiness items, decisions, and external helpers (see brainstorm: `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`). The prior Gemini fixture repair documented the current rule: expected facts must be present in source text, and evals should stay strict on product-critical structure while avoiding brittle phrasing checks.

## Verification

- [x] `npm run test:extraction`
- [x] Relevant unit tests covering fixture prompts/evaluator behavior.

## Post-Deploy Monitoring & Validation

No additional operational monitoring required. This slice only changes local synthetic fixture/eval coverage and does not alter runtime code paths.
