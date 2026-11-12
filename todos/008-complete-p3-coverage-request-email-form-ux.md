---
status: complete
priority: p3
issue_id: "008"
tags: [phase-3, coverage-requests, resend, ux]
dependencies: []
---

# Complete: Coverage Request Email Form UX

This todo is complete. Later guided-ask and household-member-email work supports emailing existing household members when a member email is present, keeps manual response links available, and validates missing/invalid email states server-side.

## Original Problem Statement

At discovery time, the coverage request form allowed a household admin to select a household member and also choose email delivery. The server rejected that combination because household-member email sends were deferred until member contact routing was explicit, but the UI did not prevent the invalid combination or show an inline error.

## Findings

- Claude Opus review of PR #17 flagged this as a low-severity UX issue.
- Server-side protection exists in `src/app/app/actions.ts`: email requests require an external helper name/email and reject selected household members.
- The board form in `src/components/board-shell.tsx` still leaves the invalid combination selectable.
- The thrown server-action error is not a friendly inline form state.

## Proposed Solutions

### Option 1: Client-Side Conditional UI

Disable or hide the email delivery option when a household member is selected.

**Pros:** Small, clear, prevents the invalid action.

**Cons:** Requires a small client component or progressive-enhancement tradeoff if the current form remains server-only.

**Effort:** 1-2 hours

**Risk:** Low

### Option 2: Inline Server-Action Error Handling

Keep the current form but route server-action validation errors into visible form feedback.

**Pros:** More generally useful for other form validation.

**Cons:** Larger UI/state slice.

**Effort:** 2-4 hours

**Risk:** Medium

## Original Recommended Action

The original recommendation was to defer until the next coverage-request UX polish slice. Later guided-ask/member-email work made the better product decision: support member email when the member has an email, and keep validation for missing/invalid destinations.

## Acceptance Criteria

- [x] Household member + email delivery is supported when the member has an email.
- [x] Manual link remains available for household members.
- [x] External helper name + email delivery still works.
- [x] Server-side validation remains in place for missing or invalid email destinations.

## Work Log

### 2026-05-25 - PR #17 Review

**By:** Codex

**Actions:**
- Captured Claude Opus review finding after PR #17.
- Confirmed server-side validation is already in place, making this a UX follow-up rather than a merge blocker.

**Learnings:**
- The model should eventually represent member email addresses explicitly before household-member email delivery is enabled.

### 2026-05-31 - Completed By Later Guided Ask Work

**By:** Codex

**Actions:**
- Confirmed later implementation supports household-member email requests through the guided coverage ask flow.
- Confirmed `tests/e2e/coverage-requests.spec.ts` covers `household admin can email an existing household member coverage request`.
- Closed this todo as stale pending state rather than active product work.
