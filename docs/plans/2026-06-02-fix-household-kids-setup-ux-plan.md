---
title: Fix Household Kids Setup UX
type: fix
status: complete
date: 2026-06-02
---

# Fix Household Kids Setup UX

## Problem

During a real first-family setup, adding children was not intuitive. Baseline browser testing showed the child record saves, but the UI gives weak feedback:

- The form title and submit button both say `Add child`, which makes the button feel like "add another blank row" instead of "save this child."
- Saved children appear in the same undifferentiated list as household members, with no `Children saved` label or next-step cue.
- On desktop, `Household setup` appears below the large manual-card form in the right rail, so setup is harder to reach during first-session onboarding.

## Scope

Keep this narrow and UI-focused:

- Reorder the right rail so `Household setup` appears before the manual-card form.
- Make saved children visually explicit with count, empty state, and saved-state language.
- Rename the child submit action to `Save child`.
- Add focused unit and local E2E coverage for the save affordance and persisted child list.

## Non-Goals

- No database schema changes.
- No child editing/deleting surface.
- No production account cleanup.
- No new onboarding wizard.
- No broad redesign of the coverage board.

## Acceptance Criteria

- [x] A new parent can find household setup before manual-card creation controls.
- [x] The child form tells the parent that saving happens one child at a time.
- [x] The child submit button says `Save child`.
- [x] After saving, the child appears under an explicit `Children saved` section.
- [x] The onboarding checklist still marks child setup complete once a child exists.
- [x] Desktop and mobile browser checks show no layout breakage, framework overlay, or relevant console errors.
- [x] Focused unit/E2E checks pass, then core lint/typecheck/test/build checks pass.

## Implementation Checklist

- [x] Update right-rail ordering in `BoardShell`.
- [x] Update `HouseholdSetup` copy and structure.
- [x] Update tests that target the child form button.
- [x] Add or update unit coverage for saved child list affordance.
- [x] Add or update E2E coverage for the child setup save flow.
- [x] Run rendered browser checks on desktop and mobile.
- [x] Run verification commands.
- [x] Review diff for scope creep and regressions.

## Post-Deploy Monitoring & Validation

If merged/deployed, run one production smoke with a fresh test account:

- Open `/app`, navigate to `People`, add one child, and confirm the child appears under `Children saved`.
- Watch Vercel errors for `addChild`, `children`, and `household-setup`.
- Watch PostHog for `child_profile_added` from the test run.
- Failure trigger: child does not appear after submit, setup cannot be reached from `People`, or the app emits framework/runtime errors.
