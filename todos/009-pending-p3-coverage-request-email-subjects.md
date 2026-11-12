---
status: pending
priority: p3
issue_id: "009"
tags: [phase-3, coverage-requests, resend, email-copy]
dependencies: []
---

# Coverage Request Email Subjects

## Problem Statement

The Resend sender supports a configurable `subject`, but the production caller always passes the generic `Coverage request from FamTandem`. This keeps the first slice privacy-safe, but the parameter is effectively unused for product value.

## Findings

- Claude Opus review of PR #17 flagged the subject parameter as functionally dead.
- `src/lib/coverage-requests/create.ts` passes a fixed subject.
- `src/lib/coverage-requests/senders/resend.ts` also defaults to the same fixed subject when no subject is supplied.
- The unit test exercises a custom subject, but the app path does not yet generate one.

## Proposed Solutions

### Option 1: Remove The Subject Parameter

Simplify the sender input until product copy needs dynamic subjects.

**Pros:** Less API surface.

**Cons:** Likely to be re-added soon when cohort feedback asks for clearer inbox context.

**Effort:** 30 minutes

**Risk:** Low

### Option 2: Add Privacy-Bounded Dynamic Subjects

Generate subjects such as `Coverage request: pickup` or `Coverage request for tomorrow`, avoiding child names and raw event titles.

**Pros:** More useful inbox scanning while preserving privacy.

**Cons:** Needs copy decisions and tests.

**Effort:** 1-2 hours

**Risk:** Low

## Recommended Action

Defer until cohort feedback shows whether generic subjects are causing missed requests. Prefer Option 2 if email becomes a real cohort channel.

## Acceptance Criteria

- [ ] Subject behavior is either simplified or made intentionally dynamic.
- [ ] Tests cover the chosen behavior.
- [ ] Subjects do not expose raw source text, child names, addresses, or sensitive event details.

## Work Log

### 2026-05-25 - PR #17 Review

**By:** Codex

**Actions:**
- Captured Claude Opus review finding.
- Left current generic subject in place for the narrow Resend-first slice.

**Learnings:**
- Email subject copy is a product/privacy decision, not just a technical cleanup.
