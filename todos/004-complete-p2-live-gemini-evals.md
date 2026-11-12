---
status: complete
priority: p2
issue_id: "004"
tags: [phase-2, extraction, gemini, evals]
dependencies: ["003"]
---

# Live Gemini Extraction Evals

## Problem Statement

The local extraction contract now has 15 synthetic/anonymized fixtures. The next slice should compare live Gemini output against that contract without creating app state or adding provider-backed intake.

## Findings

- `family-logistics-v1` already validates extraction-shaped output locally.
- The fixture evaluator can compare expected cards, timing/location fields, slots, known coverage, readiness items, changes, confidence bands, and review state.
- This is the first slice that needs a real cloud provider key: `GEMINI_API_KEY`.

## Proposed Solutions

1. Add a server/local script that calls Gemini for fixture source text and validates output against the existing schema/evaluator.
   - Pros: tests the real model while preserving the local-only app boundary.
   - Cons: requires `GEMINI_API_KEY` and may have model/cost variability.
2. Jump directly to source-input processing jobs.
   - Pros: closer to production path.
   - Cons: premature; would add jobs/persistence/retry/admin concerns before model behavior is understood.

## Recommended Action

Use option 1. Add a local eval runner that requires `GEMINI_API_KEY`, calls Gemini with synthetic fixtures, validates output through `family-logistics-v1`, and reports pass/fail without writing Supabase rows.

## Acceptance Criteria

- [x] Gemini eval runner requires `GEMINI_API_KEY` and fails clearly when missing.
- [x] Live model output is parsed through `family-logistics-v1`.
- [x] Runner evaluates live outputs against the existing synthetic fixture expectations.
- [x] No Supabase migrations, app routes, card creation, jobs, provider webhooks, Twilio, Resend, Google Calendar, or analytics events are added.
- [x] Docs explain how to run live evals and expected privacy rules.
- [x] Verification commands were run and documented; plain `npm run build` still needs env injection, while `npm run build:local` passes.

## Work Log

### 2026-05-21 - Slice Started

**By:** Codex

**Actions:**
- Created stacked branch `codex/phase-2-live-gemini-evals`.
- Started a GPT-5.5 High sidecar review for implementation boundaries.

**Learnings:**
- This slice should pause for `GEMINI_API_KEY` before any live model call is implemented or verified.

### 2026-05-22 - Live Eval Runner Added

**By:** Codex

**Actions:**
- Added a dependency-free Gemini REST client that reads `GEMINI_API_KEY` from the process environment.
- Added `npm run test:extraction:live` for optional live model evals against the synthetic fixture suite.
- Added unit coverage with mocked fetch so normal tests do not call Gemini.
- Updated setup, QA, architecture, and plan docs with the live eval boundary.

**Learnings:**
- Live evals are intentionally expected to fail during prompt/schema tuning; failures are mismatch reports, not app-state failures.

### 2026-05-22 - Verification Completed

**By:** Codex

**Actions:**
- Tuned the schema/evaluator against a real one-fixture Gemini smoke without persisting the key.
- Rejected copied source evidence refs with a `source:line-N` schema pattern.
- Re-ran local Supabase reset, lint, typecheck, unit tests, extraction tests, build, and E2E.

**Learnings:**
- The first live smoke exposed that fixtures must not expect child names absent from source text.
- `npm run build` still fails without Supabase/Cron env in the shell; `npm run build:local` passes by injecting the local Docker Supabase env for the process.

### 2026-05-25 - Marked Complete

**By:** Codex

**Actions:**
- Confirmed live Gemini eval runner work has landed and acceptance criteria are already checked.
- Renamed the todo from ready to complete as housekeeping before the next validation slice.

**Learnings:**
- This todo was stale tracking state, not active remaining work.
