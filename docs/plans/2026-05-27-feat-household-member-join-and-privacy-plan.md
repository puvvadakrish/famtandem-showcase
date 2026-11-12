---
title: feat: Household member join and coverage email safety
type: feat
status: complete
date: 2026-05-27
---

# feat: Household member join and coverage email safety

## Context

The hosted beta flow should let a founder-created household invite another parent/helper without manual database linking. The current board can add member rows, but those rows remain unclaimed (`user_id is null`), so a spouse/helper who signs in creates or is sent toward a separate household. Coverage requests can also be emailed to external helpers, but selecting an existing member plus `Email request` is rejected. Finally, source detail shows upload storage path and checksum metadata that is useful for internal debugging but unnecessary in the parent-facing trust surface.

This slice keeps the beta workflow narrow: email possession claims a pending household member row, existing-member email coverage uses the existing sender seam, and source detail hides raw artifact internals. No broad invite system, SMS, inbound email, provider webhooks, signed downloads, or notification preference center.

## Scope

- [x] Add a safe claim-on-sign-in path for active household members with a saved email and no `user_id`.
- [x] Only auto-claim when the signed-in email matches exactly one unclaimed active household member row.
- [x] Normalize saved household member emails to lowercase on insert.
- [x] Show joined vs invite-pending status in household setup using the existing design system.
- [x] Allow `Email request` to an existing household member when that member has an email address.
- [x] Preserve external helper email request behavior and local-stub default sender safety.
- [x] Hide `source_artifacts.storage_path`, storage bucket, and checksum from source detail UI.
- [x] Add focused tests for claim flow, member-email request, and artifact metadata privacy.
- [x] Run CE review and a high-reasoning delegated review before merge because this touches auth/RLS, sending, and source privacy.

## Out Of Scope

- Magic invitation emails separate from coverage requests.
- Public join links or invitation tokens.
- Household switcher or multi-household selection.
- Twilio/SMS sends.
- Resend inbound email or provider callbacks.
- Signed artifact downloads.
- Broad admin correction or member management console.
- Production provider credentials.

## Implementation Plan

### Database

- [x] Add a `claim_household_member_by_email()` RPC.
- [x] Use `auth.uid()` and `auth.jwt()->>'email'`; do not accept caller-supplied email.
- [x] Return a small result row with `claimed`, `member_id`, `household_id`, and `reason`.
- [x] Claim only when exactly one active unclaimed row matches `lower(email)`.
- [x] Refuse ambiguous duplicates and already-linked rows without exposing household details.
- [x] Grant execute to authenticated only.

### App Flow

- [x] In `/app`, if no linked membership exists, call the claim RPC once before redirecting to `/household/new`.
- [x] Redirect after a successful claim so the next request reads the linked membership normally.
- [x] Keep helper visibility unchanged after join; helpers still cannot read full source text.

### UI

- [x] Extend `HouseholdMemberSummary` with `email` and `hasUser`.
- [x] Select `email` and `user_id` when loading household members.
- [x] In `HouseholdSetup`, show compact member status: `Joined`, `Invite pending`, or `No email`.
- [x] Add calm setup copy: saved email is what the other adult uses to join.
- [x] Keep layout compact, warm, mobile-first, and consistent with `docs/design/famtandem-v2-design-system.md`.

### Coverage Requests

- [x] When `requestedMemberId` is selected and channel is `email`, look up the active same-household member.
- [x] Use that member's normalized email as the recipient destination.
- [x] If selected member has no email, show a plain error to use manual link or add an email.
- [x] Continue requiring a valid external email for external email requests.
- [x] Keep `manual_link` behavior unchanged.

### Source Privacy

- [x] Remove storage bucket/path/checksum from the source detail select and render path.
- [x] Keep parent/admin source detail useful with filename, MIME type, size, extraction status, and extraction errors.
- [x] Do not change helper denial behavior.

## Tests

- [x] Migration/unit test confirms the claim RPC exists, uses JWT email, handles ambiguity, and is authenticated-only.
- [x] Board unit test covers invite status UI.
- [x] E2E test: admin adds a parent/helper email; that email signs in and lands in the same household.
- [x] E2E or integration test: existing household member email coverage request succeeds with local-stub/default sending.
- [x] Upload/source E2E asserts source detail does not show storage paths or SHA-256 checksums.

## Verification

- [x] `npx --yes supabase db reset`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run test:extraction`
- [x] `npm run build:local`
- [x] `npm run test:e2e:local`

## Post-Deploy Monitoring & Validation

- Watch app logs for `claim_household_member_by_email`, `/app` redirects to `/household/new`, and coverage request creation errors.
- Healthy signal: second household member signs in and sees the existing board; local-stub/manual coverage links continue to work.
- Failure signal: users with saved emails land in new-household flow, duplicate/ambiguous claims increase, or email coverage request errors spike.
- Rollback trigger: disable the claim call path in `/app` and keep manual founder linking as fallback.
