---
module: Household Membership
date: 2026-05-27
problem_type: security_issue
component: auth_membership_claim
symptoms:
  - "Pending household member rows could be claimed by signing in with the saved email"
  - "Initial review found the claim flow did not explicitly require a confirmed auth email"
  - "Initial UI exposed member emails and invite/join status to helpers"
root_cause: missing_auth_privacy_boundary
resolution_type: code_fix
severity: high
tags:
  - household-members
  - email-claim
  - auth
  - rls
  - source-privacy
  - pr-29
---

# Household Member Email Claim Boundary

## Problem

PR #29 added the beta household join path: a household admin can add another parent/helper with an email address, and that person can sign in with the same email to claim the pending `household_members` row.

The first implementation had the right narrow product shape, but review found two security/privacy boundaries that needed to be explicit before merge:

- The claim RPC granted household access based on the signed-in email without checking that Supabase considered the email confirmed.
- The board loaded and rendered member emails plus `Joined` / `Invite pending` status to all same-household users, including helpers.

## Root Cause

Email becomes a lightweight credential in this flow. The app is not issuing invite tokens or public join links; it is trusting the authenticated user’s email to match a pending household member row. That means the claim boundary must require a verified/confirmed auth email, not just any authenticated session with an email-shaped value.

Member email addresses and invite status are also coordination metadata, not general board data. Helpers may need to see coverage cards and respond to requests, but they should not automatically see parent/helper email addresses or which invite emails have claimed accounts.

## Working Solution

`claim_household_member_by_email()` now derives the email from `auth.users`, checks `email_confirmed_at`, and returns `unverified_email` without claiming when the auth email is not confirmed.

The RPC still keeps the rest of the narrow claim rules:

- caller must be authenticated
- caller must not already have an active household membership
- exactly one active unclaimed member row must match `lower(email)`
- ambiguous duplicate pending emails do not claim anything
- caller-supplied email is never accepted
- execute is granted only to `authenticated`

The board now only selects `email` and `user_id` when the current member is a `household_admin`. `HouseholdSetup` renders invite emails and join status only for household admins. Non-admin members still see display names and roles, but not email addresses or invite state.

## Verification

The fixed PR was verified with:

```bash
npx --yes supabase db reset
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/household-member-claim.spec.ts tests/e2e/coverage-requests.spec.ts -g "invited household member|email an existing household member"
npm run test:e2e:local
git diff --check
```

Final full local E2E passed with 32 tests.

Review gates:

- CE/local review and a Codex review agent flagged the unverified-email claim risk and helper email/status visibility.
- Cursor GPT-5.5 high flagged helper email/status visibility.
- Gemini Code Assist later suggested SQL simplifications in the claim `UPDATE`, which were applied.

## Prevention

Use these rules for future membership, invitation, helper, and no-account access work:

- If an email address grants account access or links identity to a row, require provider-confirmed email state.
- Do not accept caller-supplied email for membership claims; derive it from authenticated provider state.
- Treat member emails, invite status, phone numbers, and pending helper metadata as admin-only unless there is an explicit product decision otherwise.
- Do not broaden helper visibility just because a user is same-household. Helpers remain a narrower role than parents/admins.
- For `SECURITY DEFINER` RPCs, review both authentication source and returned/updated row scope.
- Add E2E coverage for the full browser auth path, not only migration string tests, because callback/session timing can differ from direct SQL assumptions.

## Related Docs

- Related PR plan: [Household member join and coverage email safety](../../plans/2026-05-27-feat-household-member-join-and-privacy-plan.md)
- Related provider/send boundary: [Resend coverage request provider review](../integration-issues/resend-coverage-request-provider-review-20260526.md)
- Related source privacy boundary: [Upload OCR approval gated extraction](../integration-issues/upload-ocr-approval-gated-extraction-20260526.md)
