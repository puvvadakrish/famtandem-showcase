---
title: "feat: Invite confidence and recurring event polish"
type: feat
status: completed
date: 2026-06-04
---

# feat: Invite confidence and recurring event polish

## Result

Completed and deployed in PR #62.

Hosted production validation passed with run stamp `20260604043439`:

- Primary login identity: `test-user+invite-confidence-20260604043439@example.com`, mailbox `test-user@example.com`.
- Helper invite identity: `test-user+famtandem-helper-20260604043439@example.com`, mailbox `test-user@example.com`.
- Helper invite status: `claimed`.
- Coverage request response status: `accepted`.
- Browser console errors: none.
- Network errors: none.
- Vercel logs during the validation window showed info-only route activity and no runtime errors.

## Overview

Close the remaining family-onboarding confidence gaps from real usage:

1. Prove household member invites with a real second mailbox, not only local Mailpit.
2. Make invite failure/retry states more useful for parents.
3. Give parents a safe fallback when a helper invite cannot be delivered immediately.
4. Polish recurring manual events with a fast "create another like this" path.
5. Keep the first-session checklist aligned to what families actually need to do.

This is a narrow follow-up to the household feedback/recurring events slice. It should not introduce password auth, SMS, a custom invite-token system, broad role management, or recurring-series editing.

## Current Findings

- `addHouseholdMember` and `sendHouseholdMemberInvite` already send Supabase magic links and redirect back with setup flash state.
- Local E2E proves an invited member can claim an existing household member row by verified email.
- Hosted user-eval now handles the collapsed child form and passed the core first-session flow.
- Hosted user-eval does not yet prove real second-mailbox household invite delivery/claim.
- The member row has `Invite pending` and `Send invite`, but the failure guidance does not give the parent a concrete fallback.
- Manual recurring card creation creates bounded separate cards, which is correct for per-occurrence coverage.

## Proposed Solution

### 1. Real Hosted Invite Evaluation

Add a guarded hosted invite-claim check that:

- Logs in as `test-user@example.com` or a plus-address under that mailbox.
- Adds a household helper/parent using `test-user@example.com` or a plus-address under that mailbox when configured.
- Confirms the invite email lands in Spark for `test-user@example.com`.
- Opens the magic link in a separate browser context and verifies the invited account claims the existing household row.
- Confirms helper privacy boundaries: no raw member emails or invite status visible to a non-admin helper after claim.

Keep this opt-in because it creates hosted test data and reads real test mailboxes.

### 2. Invite UX Hardening

Keep the current Supabase magic-link mechanism, but improve parent-facing confidence:

- Add copy explaining that the person should use the exact email saved on the row.
- On failed invite send, show that the person is saved and can still sign in from `/login` with that email.
- Add a safe sign-in-page fallback link that opens `/login?email=<encoded>` only. Do not expose one-time tokens in the UI.
- Keep email addresses hidden from non-admin users.

### 3. Recurring Event Polish

Add a low-risk shortcut:

- For manual cards, show a "Create another like this" affordance that links to `#new-card` and makes the intent explicit.
- Do not prefill via query string yet unless it can be done without leaking private card data into URLs.
- Keep separate generated cards as the recurrence model.
- Do not implement edit-all-series, skipped dates, RRULE, or Google recurring events.

### 4. First-Session Checklist

Adjust onboarding copy to reflect the real first-family path:

- Add kids.
- Add another adult/helper.
- Paste real logistics.
- Create or send one coverage ask.
- Review source-backed cards before acting.

## Acceptance Criteria

### Product

- [x] Admin member rows show clearer invite guidance and a safe sign-in-page fallback.
- [x] Invite failure state gives a useful next step, not only "try again."
- [x] Non-admin/helper users still cannot see emails or invite state.
- [x] Manual/recurring cards offer an obvious next manual-entry action without creating broad recurrence-series scope.
- [x] First-session checklist copy reflects the real setup sequence.

### Hosted Evaluation

- [x] A guarded hosted test can use Spark to read both `test-user@example.com` and `test-helper@example.com`.
- [x] The deployed hosted run proves a household invite email is received by the second mailbox.
- [x] The deployed hosted run proves the invited account claims the existing household row and lands in the app.
- [x] The deployed hosted run confirms helper privacy boundaries after claim.
- [x] The test remains opt-in and redacts tokens in summary output.

### Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] Relevant local E2E
- [x] Hosted user-eval
- [x] Hosted invite-claim eval with `test-user@example.com`
- [x] Build/deploy smoke and Vercel error logs

## Out Of Scope

- Password login.
- SMS/Twilio.
- Custom invite tokens.
- Provider webhooks.
- Calendar import/two-way sync.
- Recurring-series editing or deletion.
- Showing private household/member/source data in unauthenticated links.
