---
title: "feat: Add parent card editing"
type: feat
status: complete
date: 2026-05-26
origin: docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md
---

# feat: Add parent card editing

## Overview

Add the narrow parent correction surface needed before external cohort use. The first product brainstorm calls user-side editing non-negotiable: parents must be able to fix card details, time, location, child, owner, coverage slot, readiness items, and source interpretation while preserving source trust.

This slice should complete and harden the editing path that already exists on the board. It should not become a broad admin correction console.

## Baseline Context

- `src/components/board-shell.tsx` already renders an `Edit card` details form for household admins.
- `src/app/app/actions.ts` already has `updateManualCard`, `updateSlotKind`, `setSlotState`, `markSlotAlreadyCovered`, and `updateReadinessItem`.
- Source-backed cards can already be edited through the existing form because `updateManualCard` updates any same-household card, not only manual cards.
- The visible gap is product clarity and completeness: the action/event naming is manual-card flavored, readiness due dates are not editable, existing cards cannot receive a new readiness item from the correction surface, and tests do not lock in source-backed correction behavior.
- RLS currently allows household admins to manage cards, slots, card children, and readiness items. This slice should split `canEditCards` from `isHouseholdAdmin`: parents and household admins can correct existing cards, while household setup, intake, manual card creation, coverage request sending, and provider-sensitive flows stay household-admin only.

## In Scope

- [x] Rename the board correction action from manual-card language to coverage-card correction language.
- [x] Keep source-backed card source text/artifact links attached; do not mutate raw source text, artifact storage paths, extraction runs, provider metadata, or token data.
- [x] Let parents and household admins edit core card fields: title, card type, children, time, and location.
- [x] Let parents and household admins edit readiness item label, status, owner, and due date.
- [x] Let parents and household admins add one new readiness item to an existing card.
- [x] Preserve existing coverage slot management: kind, state, self-cover, mark already covered, and ask for coverage.
- [x] Add event logging that uses generic correction names, not manual-only names.
- [x] Refresh derived attention/coverage state after card/readiness changes.
- [x] Keep parent correction writes behind constrained RPCs instead of broad table-update RLS.
- [x] Parse editable card/readiness local datetimes in the household timezone.
- [x] Add unit tests for board rendering of correction controls and source-backed cards.
- [x] Add focused action/migration tests where practical.
- [x] Update docs/context with the new editing status.
- [x] Open PR, run CE review, and run Cursor/GPT-5.5 high review before merge.

## Out Of Scope

- No helper editing.
- No broad internal admin correction surface.
- No delete-card, delete-slot, or delete-readiness workflows.
- No editing compact source/trust metadata such as source summary, review note, or confidence.
- No editing raw source text, uploaded artifacts, extraction raw output, extraction runs, provider ids, request tokens, token hashes, or storage paths.
- No new OCR provider work in this PR.
- No Twilio/SMS, Resend inbound, webhooks, Google Calendar, or signed downloads.

## Implementation Plan

### 1. Server Actions

- Replace or alias `updateManualCard` with `updateCoverageCard` in `src/app/app/actions.ts`.
- Add `requireParentOrHouseholdAdmin` for existing-card correction actions.
- Keep household-admin authorization for setup, intake, manual card creation, coverage request sending, and provider-sensitive flows.
- Ensure the action updates only card-facing correction fields:
  - `card_type`
  - `title`
  - `starts_at`
  - `location`
  - `manually_edited`
  - `updated_at`
- Replace the child links only with the submitted same-household active children, preserving multi-child assignments.
- Log `coverage_card_corrected` with compact metadata.
- Call `refreshCardState(cardId)`.

### 2. Readiness Editing

- Extend `updateReadinessItem` to accept `dueAt`.
- Preserve owner semantics:
  - if `ownerMemberId` is provided, clear external owner text
  - otherwise preserve entered external owner text when present
- Set `completed_at` only when status is `done`.
- Call `refreshCardState(cardId)` after every update.

Add `addReadinessItemToCard`:

- parent or household-admin only
- validates card belongs to the current household
- accepts label, optional due date, optional owner
- inserts an open readiness item
- logs `readiness_item_created`
- refreshes card state

### 3. Board UI

- Pass a separate `canEditCards` prop from `src/app/app/page.tsx`.
- Rename the visible card editor from `Edit card` to `Correct details`.
- Add a short source-trust note inside the details panel: source stays attached; raw source is not changed.
- Wire the details form to `updateCoverageCard`.
- Add a due-date input to each readiness item form.
- Add a compact `Add readiness item` form inside the readiness section/correction area.
- Keep controls compact and mobile-friendly; no nested cards.

### 4. Tests

Unit/component tests:

- Source-backed cards render the `Correct details` panel for parents and household admins.
- Helpers/non-admins do not see card correction controls.
- Parents do not see household setup, paste/upload intake, manual card creation, or coverage request composer controls that remain admin-only.
- Existing readiness forms include editable due date.
- Existing source text/source link still render separately from correction fields.
- Add-readiness form is visible only to household admins.

Action-level tests if practical:

- `updateCoverageCard` updates a source-backed card without changing `source_input_id`.
- `updateReadinessItem` updates `due_at` and refreshes card state.
- `addReadinessItemToCard` inserts an item only for same-household parents/admins.

Verification:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

## Acceptance Criteria

- [x] A parent or household admin can correct source-backed card details from the board.
- [x] Source trust remains intact: raw source text, source input linkage, artifact metadata, and extraction audit rows are not edited.
- [x] A parent or household admin can update readiness due dates.
- [x] A parent or household admin can add a readiness item to an existing card.
- [x] Derived coverage/attention state updates after card/readiness edits.
- [x] Helpers and non-admin members cannot access correction controls.
- [x] Tests cover the visible correction controls and readiness due-date/add behavior.
- [x] Local verification passes without real provider calls.

## Review Requirements

Run `ce-review` before merge.

Also run read-only Cursor `gpt-5.5-high` review because this touches source-backed card correction, household write boundaries, derived state, and source privacy.
