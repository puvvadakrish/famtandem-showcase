---
title: "feat: Improve household feedback, invites, and recurring manual events"
type: feat
status: active
date: 2026-06-03
---

# feat: Improve household feedback, invites, and recurring manual events

## Overview

Improve three family-onboarding and manual-planning gaps reported from real use:

1. Child and event edits currently persist, but the UI does not make success visible enough.
2. Adding adults/helpers stores their email and allows later email-claim by magic-link login, but the People flow does not clearly send or expose an invite path.
3. Manual recurring events require repetitive manual entry instead of asking for frequency and generating the expected near-term instances.

This plan keeps the slice narrow: make successful saves visible, make family invites explicit through the existing magic-link/member-claim pattern, and add practical recurrence for manually-created timed event cards without building a full calendar engine.

## Problem Statement / Motivation

The real user pain is confidence, not just data entry.

- After adding a child, the parent needs a visible "done" moment and a collapsed form so they know they can move on.
- After editing an event, the parent needs an explicit saved state, especially because the card remains in place and values may change subtly.
- After adding a spouse/helper, the parent expects FamTandem to invite them, not just store a row.
- Recurring routines are common family logistics: practice every Tuesday, therapy weekly, tutoring every Thursday. Manually recreating these defeats the "coverage board" promise.

## Current Local Findings

- `src/components/board-shell.tsx` renders the household setup, child/member forms, card edit forms, and manual card form.
- `src/app/app/actions.ts` already has `addChild`, `addHouseholdMember`, `createManualCard`, and `updateCoverageCard`.
- `supabase/migrations/20260527100000_phase3_household_member_email_claim.sql` already supports claim-by-email for an authenticated user whose verified email matches an unclaimed household member.
- `src/app/app/page.tsx` calls `claim_household_member_by_email()` when an authenticated user has no membership.
- `src/app/login/actions.ts` already sends Supabase magic links to `/auth/callback?next=/app`.
- Coverage requests already have sender seams and default-safe local stubs; this slice should not repurpose coverage request tokens as household invitations.
- Google Calendar export is one-way per card. It should remain secondary and should export individual generated card instances, not introduce Calendar import/two-way sync.

## Proposed Solution

### 1. Save Feedback and Collapsed Forms

Add client-side progressive feedback around server-action forms:

- Split household setup forms into lightweight client components using `useActionState`/`useFormStatus` or a small equivalent client wrapper.
- After `addChild` succeeds:
  - Show an inline success state such as `Ava saved`.
  - Reset the input fields.
  - Collapse the add-child form behind a compact `Add another child` control.
  - Keep the saved child list visible and update after revalidation.
- After `addHouseholdMember` succeeds:
  - Show `Invite ready for [name]` or `Added [name]`.
  - If the member has email, expose a clear invite action/copy state.
  - Collapse the add-member form behind `Add another person`.
- After `updateCoverageCard` succeeds:
  - Collapse the edit/details form back to the card's compact state when possible.
  - Show a small saved confirmation anchored to the card, e.g. `Changes saved`.
  - Preserve keyboard/accessibility affordances with `aria-live="polite"`.

### 2. Household Member Invites

Use the existing magic-link login plus email claim pattern as the first invite mechanism:

- When a household admin adds a member with an email, trigger a safe invite email through a new server action path.
- The invite email should send a normal Supabase magic link to that email with `next=/app`.
- When the invited person opens it, `/app` already attempts `claim_household_member_by_email()` and binds them to the household member row.
- Keep invite sending provider-safe:
  - Local tests must not call external email providers directly beyond Supabase local auth/Mailpit.
  - Hosted production may use Supabase's configured email delivery.
  - Do not include raw source text, coverage tokens, provider payloads, or private household details in the invite.
- If auto-send is too risky or unavailable in local provider mode, ship a visible "Send invite" button next to pending email members that calls the same server action.

Recommended UX:

- Add member form copy:
  - `Email is used for their sign-in link.`
  - Button: `Add and send invite` when email is present.
  - Button: `Add member` when no email is present.
- Member row states:
  - `Joined`
  - `Invite sent`
  - `Invite pending`
  - `No email`
- Pending member row action:
  - `Send invite`
  - Optional `Copy sign-in link` only if a safe, non-token login URL is useful: `/login?email=<encoded>`. Do not expose one-time auth tokens in the UI.

### 3. Recurring Manual Events

Add recurrence only for manual timed event cards:

- Frequency options:
  - `Does not repeat`
  - `Daily`
  - `Weekly`
  - `Every 2 weeks`
  - `Monthly`
- End options for v1:
  - `Create next 4`
  - `Create next 8`
  - `Until date` only if quick to implement safely.
- Generate separate coverage cards for each occurrence at creation time.
- Keep each generated card source-backed as `Manual entry` / same source summary.
- Link generated siblings with a lightweight `recurrence_group_id` and `recurrence_index` if a schema change is acceptable; otherwise defer group metadata and still create distinct cards.
- Do not implement edit-all-recurring-series, exceptions, skipped dates, holiday rules, RRULE import/export, or recurrence inference from pasted sources in this slice.
- Google Calendar behavior:
  - Each generated card exports individually through the existing card export.
  - Do not create one Google Calendar recurring event yet.

## Technical Approach

### UI Architecture

- Keep existing V2 visual system:
  - warm paper/cream surfaces
  - moss primary action
  - compact parent language
  - no new dashboard metaphor
- Prefer focused client wrappers inside or adjacent to `board-shell.tsx`; avoid moving the whole board to client-side state.
- Success confirmations should be inline, not toast-only, so mobile users see them in context.
- Use `aria-live="polite"` for save status and avoid focus loss where possible.
- Implementation note: the shipped path uses server-action redirects with sanitized query-string flash state instead of client action state. This keeps the server-rendered board pattern intact and gives users a visible saved state after reload/revalidation.

### Server Actions

- Return or redirect with structured save state for:
  - `addChild`
  - `addHouseholdMember`
  - `updateCoverageCard`
  - `createManualCard`
- Preserve existing `revalidatePath("/app")`.
- For member invites:
  - Add `sendHouseholdMemberInvite(memberId)` or integrate invite send into `addHouseholdMember`.
  - Authorize household admin only.
  - Confirm member belongs to admin household and has an email.
  - Send Supabase OTP/magic link using the member email and `next=/app`.
  - Record analytics with coarse properties only: household id, member id, role, invite status, no raw email.

### Data Model

For recurring manual events, preferred schema addition:

- `coverage_cards.recurrence_group_id uuid null`
- `coverage_cards.recurrence_index integer null`
- Optional `coverage_cards.recurrence_label text null`

This avoids a new full recurrence-series table while allowing cards from one creation flow to be identified later.

### Recurrence Generation

- Only generate recurrence when:
  - card type is `event`
  - start time exists
  - frequency is not `none`
  - count is bounded
- Generate a bounded list server-side.
- Insert cards, slots, children, readiness items, and card events in a transaction-equivalent pattern that preserves existing derived coverage state behavior.
- Add tests that verify no recurrence is generated for missing time or non-event card types.

## System-Wide Impact

### Interaction Graph

- Child/member add form submits to server action, writes `children` or `household_members`, captures analytics, revalidates `/app`, then client wrapper displays success and collapses.
- Member invite sends Supabase magic link; invited user opens link; `/auth/callback` creates session; `/app` calls `claim_household_member_by_email`; matching member row gets `user_id`.
- Recurring manual card creation inserts multiple `coverage_cards`; each generated card gets a coverage slot and optional child/readiness links; each appears independently in board queries and can be covered/exported individually.

### Error & Failure Propagation

- Save errors must remain visible inline and not collapse the form.
- Invite send failures should leave the member saved but show `Invite not sent` with retry action.
- Recurrence partial failure should not silently create only some cards. Use RPC/transaction if possible; otherwise stage carefully and add cleanup or fail before inserting broad fan-out.

### Privacy & Access Boundaries

- Helpers can claim their member row through verified email, but should not gain parent/admin source access unless their role is parent.
- Invite emails must not include private source text, coverage response tokens, artifact paths, card details, or provider payloads.
- Analytics must avoid raw emails; use coarse state and internal ids only.

## Acceptance Criteria

### Save Feedback

- [x] After adding a child, the child form clears, collapses, and shows an inline success acknowledgement.
- [x] After adding a member/helper, the member form clears, collapses, and shows an inline success acknowledgement.
- [x] After editing a card, the edit area collapses or visibly returns to compact state and shows `Changes saved`.
- [x] Save errors remain inline and actionable.
- [x] Feedback is accessible with `aria-live="polite"`.

### Invites

- [x] Adding a household member with an email makes the invite status explicit.
- [x] A household admin can send or resend a sign-in invite to an unclaimed email member.
- [x] Invited users can open the magic link and claim the matching household member row.
- [x] Local tests use local Supabase/Mailpit or mocks; no real provider calls by default.
- [x] Helpers remain within helper permissions after claiming.

### Recurring Manual Events

- [x] Manual card creation offers bounded recurrence options for timed event cards.
- [x] Recurrence creates distinct card instances with correct dates/times, slot kind, child, and readiness fields.
- [x] The default remains `Does not repeat`.
- [x] Non-event or untimed cards do not create recurrence fan-out.
- [x] Google Calendar export still works per generated card and does not create two-way sync or Calendar import behavior.

### UX Quality

- [x] Mobile setup and manual-card flows are tested by clicking through the product.
- [x] Desktop setup and right-side/manual-card flow do not clip controls or hide confirmation states.
- [x] Copy stays parent-friendly and aligned to the V2 design system.

## Verification Plan

Local:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npx --yes supabase db reset` if migrations change
- [x] `npm run build:local`
- [x] `npm run test:e2e:local`
- [x] Focused E2E for child/member save feedback, invite claim, card edit save feedback, recurring manual card creation

Hosted after merge:

- [ ] Production deployment Ready
- [ ] `/login` and `/app` smoke
- [ ] Standard hosted user-eval if app-flow or auth/invite behavior changes materially
- [ ] Vercel error logs clean

Visual QA:

- [x] Mobile screenshot of child add success/collapsed state
- [x] Mobile screenshot of member invite state
- [x] Mobile screenshot of edit/create saved state
- [x] Desktop screenshot of manual recurring card controls
- [x] Check no text overflow, clipped primary controls, or hidden confirmation copy

## Dependencies & Risks

- Supabase auth invite/magic-link behavior must be verified locally and hosted. If Supabase only sends magic links to existing users or local email behavior differs, implement "send invite" as a safe login-link email using the same `signInWithOtp` path rather than a separate invite-token system.
- Recurrence introduces multiple row writes. Prefer an RPC/transaction if the fan-out becomes more than a small bounded server-action loop.
- Existing hosted QA household is additive and cluttered. Use timestamped test data and source/card-specific selectors.
- Avoid expanding into recurring edit-series management; that is a separate product problem.

## Implementation Checklist

- [x] Build a local product click-through to confirm current pain points.
- [x] Add structured action state for household setup and card edit forms.
- [x] Add collapsible child/member form UI with inline success/error states.
- [x] Add household member invite send/resend path and visible invite statuses.
- [x] Add bounded recurrence fields to manual card form.
- [x] Add recurrence creation server-side with tests.
- [x] Add or update unit tests for action results, invite safety, and recurrence generation.
- [x] Add or update E2E tests for the user-visible flows.
- [x] Run local verification.
- [x] Run CE review before PR merge.
- [ ] Open PR, merge when clean, deploy, and run post-deploy verification.

## Out Of Scope

- SMS/Twilio household invites.
- Provider webhooks/status callbacks.
- Calendar import, two-way sync, shared calendar management, attendee invites, or recurrence export as RRULE.
- Recurring-series edit-all/skip-one/exception management.
- Inviting children as users.
- Broad admin correction surface.
- Production credentials in code/docs.

## Sources & References

- `CLAUDE.md`
- `AGENTS.md`
- `docs/design/famtandem-v2-design-system.md`
- `src/components/board-shell.tsx`
- `src/app/app/actions.ts`
- `src/app/app/page.tsx`
- `src/app/login/actions.ts`
- `supabase/migrations/20260527100000_phase3_household_member_email_claim.sql`
- `docs/qa/famtandem-user-evaluation-regression-suite.md`
