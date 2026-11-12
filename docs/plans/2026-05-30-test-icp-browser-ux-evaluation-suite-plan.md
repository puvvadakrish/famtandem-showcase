---
title: test: Add ICP browser UX evaluation suite
type: test
status: draft
date: 2026-05-30
---

# test: Add ICP browser UX evaluation suite

## Overview

Create a repeatable user-experience evaluation suite for FamTandem's hosted and local web app. The suite should model the overloaded default parent in a high-complexity household: set up the household, add children/helpers, add real logistics, create and resolve coverage cards, inspect source trust, and verify that the browser experience stays usable, fast, private, and coherent after every feature change.

This is not a replacement for unit/security/RLS tests. It is the product-facing regression loop that answers: "Could a real parent get from logistics chaos to shared coverage without friction?"

## Data Preservation Rule

Treat hosted FamTandem as production now. Every release must preserve existing first beta household data.

- Never run `supabase db reset`, broad deletes, truncates, or destructive cleanup against hosted projects.
- Prefer additive migrations, feature flags, and hidden UI over deleting data when features are removed.
- Before hosted migrations, record a backup/PITR timestamp, verify storage bucket preservation, and record pre-release row counts for core household tables.
- After hosted deploy, smoke the real beta/test flows without touching private household content.

## Primary Test Account

Use `test-user@example.com` for hosted browser UX evaluation unless the user explicitly names another test account. Do not run exploratory tests in the first beta household account or any personal account.

## Evaluation Set

### Household Setup

- New or resettable test account reaches `/household/new`.
- Household name, display name, timezone, and cohort consent complete successfully.
- Add two to three children with realistic grades/groups.
- Add another parent/helper with email and confirm invite state is legible.
- Verify first-week checklist updates as children, helper, source, cards, and coverage asks are completed.

### Logistics Intake

- Paste a school/coach email with pickup, time, location, and readiness details.
- Paste a form/deadline note with due date, fee/form, and child.
- Upload one safe text/image/PDF source, verify source-review page, and ensure raw source is not shown in inbox lists.
- Verify "email forwarding later" copy does not imply a live inbox.

### Card Creation And Review

- Create manual event, deadline, decision, and change cards.
- Attach cards to different children and one family-level item.
- Use long but realistic titles, locations, and source summaries to test wrapping.
- Add readiness items with due dates and owners.
- Correct card details and verify source text is not mutated.

### Coverage Resolution

- Ask an in-household member for coverage through manual link and email/local-stub paths.
- Ask an external person through manual link and email/local-stub paths.
- Accept and decline through `/respond/coverage/[token]`.
- Verify used, expired, stale, and invalid links do not expose household details.
- Use "I'll cover it" and "Mark already covered" with both member and external owner text.
- Verify covered cards move from Needs Attention to This Week when appropriate.

### Source Review And Privacy

- `/app/inbox` shows source summaries, statuses, linked-card counts, and review links without raw source text.
- `/app/sources/[id]` shows full source only to parent/admin.
- Helper users cannot access inbox/source detail or correction controls.
- Extraction run states are understandable: pending, succeeded, failed, no actionable cards, needs review.

### Calendar Secondary Action

- With Google Calendar disabled/unconfigured, calendar controls stay hidden.
- With the test account connected, timed cards can be added/updated.
- Calendar export stays secondary to coverage actions and does not block the coverage aha moment.
- Disconnect state is visible and reversible.

### Navigation, Scroll, And Layout

- Desktop Chrome: sidebar, center board, sticky right rail, long board scroll, and right-rail form scroll do not trap the user.
- Mobile viewport: bottom nav, first-week panel, cards, action forms, and source pages fit without overlap or clipped text.
- Tablet/narrow desktop: cards wrap without horizontal overflow.
- Deep links work for `#add-logistics`, `#new-card`, `#household-setup`, `#Needs-Attention`, and card anchors.

### Accessibility And Copy

- Authenticated app, inbox, source detail, and response-link pages pass axe with only intentionally documented contrast exceptions.
- Repeated form controls are accessible inside card regions and can be targeted uniquely.
- Error states use parent-friendly language and tell the user how to proceed.

### Non-Functional Checks

- Page load and reload on a dense board are within an agreed threshold on hosted Chrome.
- Console has no app errors or unexplained warnings.
- No framework overlays, blank shells, stale loading states, or hydration failures.
- Provider defaults stay safe: local tests do not call real SMS/email/OCR/Gemini/Calendar unless explicitly enabled.

## Proposed Automation Shape

1. Local Playwright suite with isolated seeded users/households.
2. One hosted smoke suite against `test-user@example.com` for production-like OAuth/browser behavior.
3. Screenshot checkpoints for desktop and mobile on the dense ICP board.
4. Axe checks for authenticated app surfaces.
5. A small migration/release guard that scans for destructive SQL before hosted deploys.

## Quality Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:local`
- New `npm run test:ux:e2e` or equivalent ICP browser suite
- Hosted smoke only when explicitly requested and only with the test account

## Acceptance Criteria

- The suite creates a realistic household with 2-3 children and at least one helper.
- The suite creates or ingests at least five logistics items across event, deadline, decision, change, and readiness cases.
- The suite resolves coverage through self-cover, already-covered external owner, and response-link accept/decline.
- The suite checks desktop and mobile layout, scroll behavior, console health, and source privacy.
- Failures produce a clear UX report: finding, reproduction path, screenshot/DOM/log evidence, likely owner, and severity.
- Hosted production/beta data is preserved and never reset as part of the suite.

## Open Decisions

- Whether to run the hosted smoke on every PR, nightly, or only before deploy.
- Whether to keep screenshots as CI artifacts only or commit named baselines later.
- Whether to add test IDs/region labels to improve robust automation of repeated card controls.
- The no-account response-link POST failure found on 2026-05-30 has been fixed before standardizing the suite; keep the `Origin: null` regression in the coverage-request E2E path.
