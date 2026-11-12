---
title: "feat: Add guided first coverage ask"
type: feat
status: complete
date: 2026-05-30
origin: docs/brainstorms/2026-05-28-beta-next-phase-recommendation-brainstorm.md
---

# feat: Add Guided First Coverage Ask

## Overview

Make the first coverage request a direct, parent-friendly card action. A household admin should be able to see an uncovered item, tap `Ask for coverage`, choose the slot and recipient, then send an email request or create a response link using the existing coverage request infrastructure.

This carries forward the beta recommendation that the core aha is still: a request gets accepted. The backend already supports tokenized coverage request links, manual-link fallback, opt-in Resend email through the sender seam, and no-account accept/decline pages. The gap is that the visible app hides the first ask inside `Manage coverage`.

## PR Boundary

Build one narrow PR.

In scope:

- [x] Add a guided `Ask for coverage` flow directly on eligible coverage cards/slots.
- [x] Let household admins select the slot when a card has multiple eligible slots.
- [x] Let household admins choose an existing household member/helper or enter an external recipient name.
- [x] Support optional external email when `Email request` is selected.
- [x] Default to `Create response link`; keep email on the existing local-stub/Resend seam.
- [x] Reuse `createCoverageRequest`, coverage request tokens, public response pages, and send marking.
- [x] Keep helper/source privacy boundaries intact.
- [x] Keep mobile-first V2 design language and plain parent copy.
- [x] Add focused unit and E2E coverage.

Out of scope:

- Twilio/SMS implementation.
- Resend inbound email.
- Provider webhooks or delivery-status callbacks.
- Google Calendar.
- New RLS policies or `SECURITY DEFINER` RPCs unless an existing bug is discovered.
- Broad admin correction surface.
- Production credentials or default live-provider calls.

## Existing Context

- `src/app/app/actions.ts` already exposes `createCoverageRequest(formData)` and validates household-admin access, member household membership, channel, and email presence.
- `src/lib/coverage-requests/create.ts` creates the token/request rows, selects a sender, builds the response URL, and marks send result.
- `src/lib/coverage-requests/senders/provider.ts` defaults to the local stub unless email is explicitly configured for Resend.
- `src/components/board-shell.tsx` already renders coverage slots, self-cover buttons, `Mark already covered`, and a dense nested request composer.
- `tests/e2e/coverage-requests.spec.ts` already proves public response links, manual-link creation, and member email/local-stub request creation.
- `docs/solutions/integration-issues/resend-coverage-request-provider-review-20260526.md` warns that provider send paths must keep timeouts and manual fallback behavior safe.

## Implementation Plan

### 1. Guided Ask UI

- [x] Add a card-level guided ask panel that appears only for household admins and only when at least one slot is eligible.
- [x] Treat `needs_coverage` and `declined` slots as eligible for a first/new ask.
- [x] For a single eligible slot, preselect it and show the slot label plainly.
- [x] For multiple eligible slots, show a compact slot selector.
- [x] Use explicit recipient paths for household members/helpers and `Someone else`.
- [x] Show required external recipient name only in the `Someone else` path.
- [x] Keep `Create response link` as the default delivery mode and `Email request` as the optional existing-provider path.
- [x] Include brief privacy copy near the note field: do not paste source text or private details.
- [x] Keep the nested `Manage coverage` area for already-covered and slot admin controls, but do not duplicate the first-ask composer there.

### 2. State And Copy

- [x] Update the card primary action to jump to the guided ask panel for eligible cards.
- [x] Update beta onboarding copy from "Use coverage controls" to the direct guided flow.
- [x] Preserve helper and public preview behavior: helpers do not see admin request composition; public preview signs in to ask.
- [x] Keep response-link flash behavior unchanged after submission.

### 3. Tests

- [x] Update `tests/unit/board-shell.test.tsx` for the guided ask composer.
- [x] Add unit coverage that helpers do not see the guided composer.
- [x] Update coverage-request E2E to create a manual response link through the direct card-level flow.
- [x] Update member-email E2E to use the guided flow and assert provider remains `local-stub` by default.
- [x] Keep tests from requiring real Resend, Twilio, Gemini, OCR, or Google providers.

## Acceptance Criteria

- [x] A household admin can tap `Ask for coverage` on a card with an uncovered slot and create a response link without opening `Manage coverage`.
- [x] A household admin can email an existing household member through the guided flow; default local E2E records `provider=local-stub`.
- [x] A household admin can ask an external recipient by name and optional email.
- [x] Cards with multiple eligible slots let the admin choose which slot to ask about.
- [x] Helpers cannot see or use request-composition controls.
- [x] The public response page remains source-private and no request UI encourages copying raw source text.
- [x] Default local tests do not call real providers.

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

Targeted during development:

```bash
npx vitest run tests/unit/board-shell.test.tsx
node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/coverage-requests.spec.ts
```

## Review Requirements

- [x] Run CE review before merge.
- [x] Run a bounded read-only Cursor GPT-5.5 high review before merge because this touches request sending, recipient contact handling, token links, and privacy copy.
- [x] Check Gemini Code Assist comments after opening the PR.

## Post-Deploy Monitoring & Validation

After deploy:

- Use a beta household to create one uncovered card, send/copy one guided request, and accept it through the no-account response link.
- Watch Vercel logs for `createCoverageRequest` failures and `/respond/coverage/*` errors.
- Watch `/app/admin/validation` for coverage requests sent and accepted/declined.
- Watch `/app/admin/ops` for coverage-request send failure event buckets if email is enabled.

Healthy signal:

- A beta parent can create one coverage ask from a card without founder coaching and the recipient can respond from the link.

Failure signal:

- Parents still need to open nested controls to understand how to ask, or default/local usage attempts real provider sends unexpectedly.

Rollback:

- Hide the guided composer and keep the existing `Manage coverage` controls until fixed.
