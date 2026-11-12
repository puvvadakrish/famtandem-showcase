---
status: complete
priority: p1
issue_id: "001"
tags: [phase-0, nextjs, supabase, tooling]
dependencies: []
---

# Phase 0 Foundation

## Problem Statement

FamTandem needs the first real app foundation before later product phases can build the board loop, intake, extraction, and coverage requests.

## Findings

- The repo currently contains product docs and no app scaffold.
- Phase 0 is limited to Next.js/TypeScript scaffolding, baseline tooling/tests, Supabase/Vercel/PostHog environment structure, app shell, and local setup docs.
- Existing product docs are untracked and should not be rewritten except for the requested plan progress update.

## Proposed Solutions

- Build a thin Next.js App Router shell with TypeScript, Tailwind, Supabase helpers, PostHog helpers, and a protected cron route.
- Add Supabase migrations for household membership, consent, private storage, and baseline jobs.
- Add Vitest and Playwright smoke coverage so Phase 0 can be verified locally.

## Recommended Action

Implement the Phase 0 scaffold only, run lint/typecheck/unit tests/build, and update the plan document with Phase 0 completion status.

## Acceptance Criteria

- [x] Next.js/TypeScript app scaffold exists.
- [x] Baseline tooling/tests are configured and pass.
- [x] Supabase, Vercel Cron, and PostHog environment structure exists.
- [x] Initial mobile-first app shell exists.
- [x] Local setup docs exist.
- [x] Phase 0 plan status is updated.

## Work Log

### 2026-05-19 - Start Phase 0

**By:** Codex

**Actions:**
- Created `feat/phase-0-thin-app-foundation`.
- Began additive app scaffold without modifying existing untracked docs beyond planned progress tracking.

**Learnings:**
- There is no existing application code to preserve, so Phase 0 establishes project conventions.

### 2026-05-19 - Complete Phase 0

**By:** Codex

**Actions:**
- Added Next.js App Router scaffold, TypeScript, Tailwind, linting, Vitest, and Playwright.
- Added Supabase config, migration, seed data, RLS baseline, private `source-artifacts` bucket, job claiming, retry helpers, and Vercel Cron route.
- Added PostHog client/server structure, environment validation, consent copy, app shell, login shell, local setup docs, architecture notes, and QA plan.
- Verified `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

**Learnings:**
- Playwright browsers needed installation before E2E could run.
- A stale `.next` artifact from concurrent dev/build verification caused one transient `/_document` build error; clearing `.next` and rebuilding passed.

### 2026-05-19 - Security Hardening Follow-Up

**By:** Codex with Cursor Agent review

**Actions:**
- Replaced direct household/member/consent inserts with transactional `create_household_bootstrap`.
- Tightened direct `household_members` inserts to internal admins only.
- Revoked public/anon/authenticated execute on job RPCs and granted execution to `service_role`.
- Added magic-link sign-in action, auth callback, and `/app` session protection.
- Added migration security tests and updated local setup, architecture, and QA docs.
- Verified `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

**Learnings:**
- The initial scaffold passed app-level checks but still had security boundary gaps; Phase 0 is stronger when those boundaries are test-visible before Phase 1 adds real household data.
