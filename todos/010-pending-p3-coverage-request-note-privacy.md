---
status: pending
priority: p3
issue_id: "010"
tags: [phase-3, coverage-requests, privacy, ux]
dependencies: []
---

# Coverage Request Note Privacy Guardrails

## Problem Statement

Coverage request notes are user-authored and are sent verbatim in Resend email content. The UI warns parents not to paste source text or private details, but there is no enforcement or review step.

## Findings

- Claude Opus review of PR #17 flagged this as a deliberate trust surface, not a merge blocker.
- `src/lib/coverage-requests/create.ts` builds the message from the trimmed note and response link.
- `src/components/board-shell.tsx` includes copy warning users not to paste source text or private details.
- This matches the current cohort model, but future broader usage may need stronger privacy affordances.

## Proposed Solutions

### Option 1: Keep Warning Copy Only

Continue relying on parent judgment during the founder-assisted cohort.

**Pros:** No friction, appropriate for small cohort.

**Cons:** Users may still paste raw source or sensitive details.

**Effort:** None

**Risk:** Medium if cohort expands.

### Option 2: Add Lightweight Client/Server Screening

Warn or block notes containing email-like strings, phone-like strings, long pasted text, or source-like content.

**Pros:** Reduces accidental leakage.

**Cons:** False positives can slow urgent coverage asks.

**Effort:** 2-4 hours

**Risk:** Medium

### Option 3: Add Review Copy In Email Composer

Show a final confirmation preview of exactly what will be emailed.

**Pros:** Clear user control without brittle automated detection.

**Cons:** Adds interaction cost.

**Effort:** 2-4 hours

**Risk:** Low

## Recommended Action

Keep warning copy for the first cohort. Revisit if real users paste sensitive text into coverage request notes or if coverage sends scale beyond founder-assisted testing.

## Acceptance Criteria

- [ ] Product decision is made before broader cohort use.
- [ ] If screening or preview is added, manual link fallback remains fast.
- [ ] Email content tests continue to assert no system-generated raw source text is included.

## Work Log

### 2026-05-25 - PR #17 Review

**By:** Codex

**Actions:**
- Captured Claude Opus review note.
- Kept current warning-copy approach for PR #17 because it matches the small-cohort trust model.

**Learnings:**
- The app prevents system-added source leakage, but user-authored notes remain a social/product privacy boundary.
