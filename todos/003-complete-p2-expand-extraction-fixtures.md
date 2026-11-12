---
status: complete
priority: p2
issue_id: "003"
tags: [phase-2, extraction, evals, fixtures]
dependencies: []
---

# Expand Extraction Fixtures

## Problem Statement

Phase 2 has the first local extraction schema and an initial synthetic fixture set. Before live Gemini calls, the repo needs broader fixture coverage so the extraction contract reflects the family logistics cases FamTandem actually needs to handle.

## Findings

- The current `family-logistics-v1` schema is local-only and does not require Supabase, provider credentials, or database changes.
- The plan calls for 10-20 anonymized logistics fixtures with expected cards, slots, readiness items, changes, confidence bands, and review reasons.
- Fixtures must stay synthetic/anonymized and should not include real cohort source text, names, addresses, phone numbers, emails, or source excerpts.

## Proposed Solutions

1. Expand local TypeScript fixtures now.
   - Pros: strengthens the contract before provider integration, low privacy/ops risk.
   - Cons: still evaluates static expected outputs until Gemini is wired.
2. Fetch Gemini credentials and build live extraction immediately.
   - Pros: tests live model behavior sooner.
   - Cons: premature before the expected output matrix is broad enough.

## Recommended Action

Use option 1. Expand the local fixture suite to cover representative synthetic logistics cases and keep all work in tests/docs/local helpers.

## Acceptance Criteria

- [x] Fixture suite includes at least 10 synthetic/anonymized logistics cases.
- [x] Fixtures cover events, deadlines, decisions, changes, readiness items, ambiguous/missing fields, and review confidence bands.
- [x] Eval checks include expected card types, suggested slots, readiness labels, review expectations, and change expectations.
- [x] No provider credentials, Gemini calls, Supabase migrations, app routes, or analytics events are added.
- [x] Relevant docs and the Phase 2 plan reflect the expanded fixture coverage.
- [x] Verification commands pass.

## Work Log

### 2026-05-21 - Slice Started

**By:** Codex

**Actions:**
- Continued on `codex/phase-2-extraction-schema-evals`.
- Started fixture expansion with GPT-5.5 High sidecars for coverage and privacy review.

**Learnings:**
- The next credentials fetch should wait until the local fixture contract is broad enough to judge live Gemini extraction.

### 2026-05-21 - Fixture Coverage Expanded

**By:** Codex with GPT-5.5 High sidecar review

**Actions:**
- Expanded the local fixture suite to 15 synthetic/anonymized examples.
- Added evaluator checks for no-action sources, timing/location fields, known coverage hints, decision details, source evidence labels, confidence bands, and change expectations.
- Kept the slice local-only with no Supabase/RLS, provider, analytics, route, or Gemini changes.
- Updated architecture, setup, QA, and plan docs with the expanded fixture boundary.

**Learnings:**
- The fixture set needs a small no-action representation and known-coverage hints before live extraction, but recurrence can wait for a later slice.

### 2026-05-21 - Verification Completed

**By:** Codex

**Actions:**
- Ran `npm run test:extraction`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:local`, and `npm run test:e2e:local`.
- Confirmed the expanded extraction contract remains local-only and does not require keys.

**Learnings:**
- The next provider credential fetch should be for Gemini when the team is ready to compare live model outputs against this fixture suite.
