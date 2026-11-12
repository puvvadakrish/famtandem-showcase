---
status: complete
priority: p1
issue_id: "012"
tags: [extraction, timezone, hosted-qa, coverage-response]
dependencies: []
---

# Fix Extracted Event Time Consistency

## Original Problem Statement

The guarded hosted first-session test on 2026-05-31 found that a single extracted timed card displayed different times across source detail, board, and no-account response surfaces.

This undermines parent trust because coverage coordination depends on knowing exactly when pickup/drop-off happens.

## Findings

- Test account: `test-user@example.com`
- Test household display: `Test`
- Test stamp: `202605311327`
- Source: `QA First Source 1 Soccer 202605311327`
- Pasted text said: soccer practice on Tuesday, June 9, 2026 from `5:30 PM` to `6:45 PM` in the household's `America/Chicago` timezone. The expected stored start instant is `2026-06-09T22:30:00.000Z`; the expected stored end instant is `2026-06-09T23:45:00.000Z`.
- Source-linked card summary showed: `Jun 9, 2026, 4:30 PM`.
- Board card showed: `Tue, Jun 9, 4:30 PM`.
- No-account coverage response page showed: `Tue, Jun 9, 9:30 PM`.
- The response page did not leak raw source text, and the ask/accept loop completed, but the displayed time mismatch is a blocker for unsupervised real-family use of extracted timed cards.

## Proposed Solutions

1. Audit extraction timezone normalization end-to-end.
   - Confirm what timezone Gemini returns for notes with no explicit timezone.
   - Confirm whether `create_extracted_cards`, card rendering, and coverage response rendering all interpret `starts_at` the same way.
   - Pros: fixes root cause.
   - Cons: requires careful tests across source detail, board, and response pages.

2. Require explicit household timezone normalization before persistence.
   - Convert extracted local times using the household timezone once, store canonical UTC, and render through one shared formatter.
   - Pros: durable and predictable.
   - Cons: needs regression coverage for DST and notes without timezone.

3. Short-term UX guardrail only.
   - Display "Check time against source" for action-heavy extracted cards until normalization is fixed.
   - Pros: quick risk reduction.
   - Cons: does not fix conflicting displays.

## Original Recommended Action

At discovery time, the recommended path was solution 1 plus solution 2: audit the full path, fix the canonical conversion/formatting boundary, and add tests that assert the same source time renders consistently on source detail, board card, and response page. That work is now complete.

## Acceptance Criteria

- [x] A pasted note with `Tuesday, June 9, 2026 from 5:30 PM to 6:45 PM` in an `America/Chicago` household stores `startsAt` as `2026-06-09T22:30:00.000Z` and `endsAt` as `2026-06-09T23:45:00.000Z`.
- [x] Source detail linked-card summary, board card, and no-account response page all display `Tue, Jun 9, 5:30 PM` or the equivalent local-time format.
- [x] Unit or integration coverage protects timezone normalization for extracted cards.
- [x] E2E or component coverage protects response-page display from UTC/local drift.
- [x] Existing Google Calendar export behavior still exports the intended local time.

## Work Log

### 2026-05-31 - Fix Merged And Hosted Retest Passed

**By:** Codex

**Actions:**
- Merged PR #43, `fix: keep extracted coverage times consistent`, into `main`.
- Applied hosted Supabase migration `20260531150000_coverage_request_timezone.sql`.
- Reran the guarded hosted first-session path with `test-user@example.com`.
- Verified the new soccer source for `QA First Ava 202605311411` showed `Tue, Jun 9, 5:30 PM` on the board and no-account mobile response page.
- Accepted the response link successfully and confirmed no raw source text leaked on the response page.

**Outcome:**
- P1 blocker is fixed for the guarded first-session flow.
- Remaining beta expectation: generated cards can still be marked `Needs review`, so parents should review extracted cards against source before acting.

### 2026-05-31 - Hosted First-Session Finding

**By:** Codex

**Actions:**
- Ran guarded hosted first-session QA with `test-user@example.com`.
- Added children/helper, submitted three low-sensitivity real-shaped logistics sources, reviewed generated cards, and completed one coverage ask/response.
- Captured the time inconsistency in `docs/qa/famtandem-user-evaluation-regression-suite.md`.

**Learnings:**
- Hosted immediate Gemini extraction works for fresh pasted sources.
- Coverage ask/response privacy boundary held.
- Time display consistency is now the main blocker before unsupervised real-family use of extracted timed cards.
