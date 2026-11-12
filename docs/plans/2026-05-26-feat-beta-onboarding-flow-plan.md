---
title: "feat: Add beta onboarding flow"
type: feat
status: complete
date: 2026-05-26
origin: docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md
---

# feat: Add Beta Onboarding Flow

## Overview

Make FamTandem usable for the first two beta families without founder handholding. The app already has household creation, household setup forms, paste/upload intake, extraction jobs, parent correction, coverage requests, and admin validation/ops. What is missing is a first-run path that explains what to do, avoids an empty-board dead end, and does not imply unavailable Gmail/forwarding support.

## Product Context

The first-product brainstorm says the first login should avoid an empty board and should offer a short checklist: add household members, forward first logistics email, upload screenshot/PDF, paste text, optional Google Calendar. It also says Google Calendar should not block first value, and Gmail should not start as whole-inbox scanning; watched senders come later after users forward a few sources.

Current implementation reality:

- Household creation exists at `/household/new`.
- Household setup forms exist inside `/app` for household admins.
- Paste intake and upload intake exist in `/app`.
- Resend inbound email/forwarding mailbox is not built.
- Gmail connect and Google Calendar are not built.

## In Scope

- [x] Add an empty/early-state beta onboarding panel to `/app`.
- [x] Show a practical setup checklist based on real household state:
  - household exists
  - child profile added
  - another adult/helper added
  - first source submitted/card created
  - coverage ask sent/available as next step
- [x] Include clear first-week instructions: paste email text or upload screenshots/PDFs/files; do not send highly sensitive records.
- [x] Add a clearly labeled sample coverage card in the empty state so the board does not feel broken.
- [x] Remove or disable the misleading `inbox@famtandem.app` forwarding option until inbound email exists.
- [x] Keep Gmail/Google Calendar/forwarding described as later, not available actions.
- [x] Add unit/E2E coverage for the onboarding copy and forwarding-not-available boundary.
- [x] Update setup/cohort docs to reflect beta onboarding.

## Out Of Scope

- No Gmail connection.
- No Google Calendar.
- No Resend inbound email or forwarding mailbox.
- No Twilio/SMS.
- No provider webhooks/status callbacks.
- No signed artifact downloads.
- No new hosted credentials or provider defaults.
- No broad admin console.

## Implementation Plan

1. Extend `/app` data loading with counts needed for onboarding:
   - source input count for the household
   - coverage request count for the household, if cheap through existing request/token relationships
   - existing member and child counts already loaded
2. Pass a compact `onboarding` state into `BoardShell`.
3. Add a `BetaOnboardingPanel` above the board sections when the household is early-stage, especially when there are zero cards or zero sources.
4. Keep the panel action-oriented with anchors to existing sections rather than building a separate wizard:
   - Add child
   - Add parent/helper
   - Paste logistics text
   - Upload source
   - Review first cards
   - Ask for coverage
5. Add one clearly labeled sample card in the panel only; do not insert sample data into the database.
6. Update `PasteSourceForm` intake choices:
   - Paste text: available
   - Upload file/screenshot: available via existing upload form
   - Forward email / Gmail: not available yet, shown as later if shown at all
7. Add tests:
   - unit render test for empty onboarding state and unavailable forwarding copy
   - E2E assertion on new household board that onboarding appears and no fake forwarding address is offered
8. Update docs:
   - local setup/cohort checklist mentions self-serve beta onboarding and paste/upload as first-week intake

## Acceptance Criteria

- [x] A new household lands on `/app` with a clear beta onboarding panel, not just an empty board.
- [x] The panel tells families to paste email text or upload files/screenshots/PDFs for the first beta.
- [x] The UI does not present `inbox@famtandem.app` as an available forwarding mailbox.
- [x] The panel shows concrete next actions and progress from existing household state.
- [x] Existing paste/upload/member/child forms remain the source of truth; no duplicate onboarding data model is added.
- [x] Tests pass and local/default behavior still avoids real providers.

## Verification

```bash
npm run lint
npm run typecheck
npx vitest run tests/unit/board-shell.test.tsx
node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/app-shell.spec.ts tests/e2e/paste-intake.spec.ts
npm run build:local
git diff --check
```

## Review Requirements

Run CE review before merge. Cursor GPT-5.5 high is optional for this slice because it is UI/docs only and does not change RLS, provider sending, jobs, source privacy, or storage behavior. If the implementation touches source privacy or job/extraction behavior after all, run Cursor review too.
