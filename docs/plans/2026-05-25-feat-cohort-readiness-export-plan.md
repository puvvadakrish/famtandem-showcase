---
title: Cohort Readiness Export
type: feat
status: complete
date: 2026-05-25
origin: docs/plans/2026-05-19-feat-thin-real-app-plan.md
---

# Cohort Readiness Export

Add the next narrow pre-cohort slice: make the internal validation snapshot easier to use outside the app, refresh current project context, and document how to run a small validation cohort without adding provider integrations.

## Scope

- [x] Add an internal-admin-only CSV export for the existing `/app/admin/validation` snapshot data.
- [x] Keep the export read-only and derived from existing rows only.
- [x] Keep service-role reads behind the existing authenticated `internal_admins` gate.
- [x] Add cohort operating docs/checklist: family intake ask, privacy guardrails, weekly review flow, and success metrics.
- [x] Refresh stale project context in `AGENTS.md` and `CLAUDE.md` so future agents see the current main state.
- [x] Keep out of scope: migrations, writes, analytics events, production credentials, Twilio, Resend, Google Calendar, OCR, signed downloads, broad admin correction.
- [x] Add focused tests for export formatting and internal-admin download access.
- [x] Run relevant local verification and review before PR.

## Context

The validation snapshot from PR #13 gives an internal view of intake and coverage progress. The next pre-cohort need is a lightweight way to export those counts for founder analysis and a concise operating guide for the first 10-20 family cohort.

## Verification

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build:local`
- [x] `npm run test:e2e:local`
- [x] CE/delegated review

## Post-Deploy Monitoring & Validation

No additional operational monitoring required. This slice is a read-only internal-admin export and documentation update; validate manually by downloading the CSV from `/app/admin/validation` as an active internal admin.
