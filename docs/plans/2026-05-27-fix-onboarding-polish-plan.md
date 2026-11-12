---
title: "fix: Tighten hosted beta onboarding polish"
type: fix
status: complete
date: 2026-05-27
origin: docs/brainstorms/2026-05-27-child-profile-context-field-brainstorm.md
---

# fix: Tighten hosted beta onboarding polish

Ship one small hosted-beta onboarding polish slice:

- Use the child context decision from the brainstorm: ask for `Age, grade, or group`, not a narrow grade-only field and not date of birth.
- Stop silently hardcoding household timezone to `America/Chicago`; detect the browser timezone and let the parent see/edit the value during household creation.
- Make the login continuation link less confusing by only showing it after a magic link has been sent.
- Rename `Add parent/helper` to plainer parent-facing language.

## Acceptance Criteria

- [x] Child setup asks for optional `Age, grade, or group` with toddler/school/sports examples.
- [x] Household creation captures a browser-detected timezone when available and displays the timezone field before submit.
- [x] Login only shows the continue link after the user has requested a magic link.
- [x] Household setup says `Add adult or helper` while keeping existing role values and permissions unchanged.
- [x] Unit tests cover the changed copy and timezone field behavior.
- [x] Playwright or equivalent browser smoke confirms the public hosted page still loads without client errors.
- [x] Production deploy succeeds and `app.famtandem.com` aliases to the new deployment.

## Scope Boundaries

- No database migration; existing `children.grade` remains the storage field for now.
- No notification preference redesign.
- No broad onboarding redesign.
- No new provider calls or credentials.

## Verification

- `npx vitest run tests/unit/board-shell.test.tsx tests/unit/login-page.test.tsx tests/unit/household-timezone-field.test.tsx`
- `npm run lint`
- `npm run typecheck`
- `npm run build:local`
- Hosted smoke against `https://app.famtandem.com/`

## Post-Deploy Monitoring & Validation

- Check `vercel logs https://app.famtandem.com --since 10m --level error --expand`.
- Healthy signal: no production errors and the public page returns HTTP 200.
- Failure signal: server-side exception, client console errors in smoke, or custom domains not aliased to the latest deployment.
