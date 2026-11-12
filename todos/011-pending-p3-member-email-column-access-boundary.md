---
status: pending
priority: p3
issue_id: "011"
tags: [privacy, rls, household-members]
dependencies: []
---

# Member Email Column Access Boundary

Track a defense-in-depth follow-up for household member email visibility.

## Problem Statement

PR #29 keeps helper users from seeing household member emails and invite status by selecting a reduced column set in the `/app` server page and rendering email/status only for household admins. That is correct for the current UI path, but Postgres RLS is row-level, not column-level. A future server query that accidentally selects `email` for same-household helpers could re-expose member email addresses without tripping an RLS denial.

## Findings

- `src/app/app/page.tsx` now uses separate member queries: admins select `email, user_id`; non-admins select only `id, display_name, role`.
- `src/components/board-shell.tsx` gates member email and invite/join status behind `isHouseholdAdmin`.
- PR #29 tests cover the current app-render path, including a helper/non-admin assertion that `helper@example.com` and invite status are not rendered.
- Claude Code review on PR #29 found no blocking issue, but recommended a follow-up for a stronger member-list access abstraction.

## Proposed Solutions

### Option 1: Security Definer Member Summary RPC

**Approach:** Add a `list_household_member_summaries` RPC that returns admin and non-admin shapes intentionally, then have `/app` consume that instead of direct table selects.

**Pros:**
- Centralizes the privacy boundary.
- Reduces future accidental `select("*")` or email-column exposure.
- Easy to test with parent/admin/helper roles.

**Cons:**
- Adds another RPC and typed mapping layer.
- Needs careful `SECURITY DEFINER` review.

**Effort:** 2-4 hours

**Risk:** Low

---

### Option 2: Database Views For Admin/Public Member Summaries

**Approach:** Add explicit views for admin-visible and general household member summaries, with app code using the appropriate view.

**Pros:**
- Keeps direct SQL access readable.
- Makes allowed columns visible in schema.

**Cons:**
- Still requires discipline to use the views.
- RLS/view semantics need careful Supabase testing.

**Effort:** 2-4 hours

**Risk:** Medium

## Recommended Action

To be filled during triage. Prefer Option 1 if household member visibility expands again, because the RPC can enforce role-specific output and is easier to test as a single boundary.

## Technical Details

Affected areas:

- `src/app/app/page.tsx`
- `src/components/board-shell.tsx`
- `supabase/migrations/*household_member*`
- `tests/e2e/household-member-claim.spec.ts`
- `tests/unit/board-shell.test.tsx`

## Resources

- PR #29: `feat(beta): let invited household members join`
- CE/Claude review residual risk: helper email privacy currently depends on app query shape rather than a DB-level member-summary abstraction.

## Acceptance Criteria

- [ ] Helpers cannot retrieve member emails or invite status through the app's member summary path.
- [ ] Household admins can still see member emails and joined/pending status.
- [ ] Parent/helper/admin tests cover the role-specific output boundary.
- [ ] Existing household member claim and coverage-request behavior remains unchanged.

## Work Log

### 2026-05-27 - Initial Discovery

**By:** Codex

**Actions:**
- Captured non-blocking PR #29 Claude Code review residual risk as a file todo.
- Confirmed current UI/server-render path is covered by PR #29 tests; this todo is for defense in depth, not a merge blocker.

**Learnings:**
- The current implementation is safe for the shipped route, but future household-member UI work should avoid reintroducing raw direct member selects for helper-visible surfaces.
