---
title: "feat: Add Google Calendar coverage export"
type: feat
status: complete
date: 2026-05-30
origin: docs/brainstorms/2026-05-30-google-calendar-coverage-export-brainstorm.md
---

# feat: Add Google Calendar Coverage Export

## Overview

Add the narrowest useful Google Calendar integration: parent/admin users can connect Google Calendar and export a timed coverage card to their own primary calendar. This carries forward the brainstorm decision that FamTandem stays centered on coverage, while Google Calendar becomes an optional visibility destination.

Official docs referenced:

- Google OAuth 2.0 for web server apps: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Calendar `events.insert`: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google Calendar sync guide, used only to defer two-way/incremental sync: https://developers.google.com/calendar/api/guides/sync

## PR Boundary

Build one narrow PR.

In scope:

- [x] Add encrypted Google Calendar connection storage for parent/admin users.
- [x] Add OAuth start/callback routes using Google web-server OAuth.
- [x] Add a one-way export action from eligible coverage cards with `starts_at`.
- [x] Use Google Calendar `events.insert` on first export and `events.update` or equivalent on re-export.
- [x] Store local card-to-Google-event mappings to avoid duplicates.
- [x] Render a mobile-first card-level secondary calendar action that does not compete with `Ask for coverage`.
- [x] Keep Google disabled unless explicit env vars are configured.
- [x] Add focused unit coverage with no real Google calls by default.

Out of scope:

- Two-way sync or calendar import.
- Incremental sync tokens.
- Calendar webhooks/watch channels/status callbacks.
- Recurring event expansion.
- Attendee invites or Google notification sending.
- Household shared calendar creation/management.
- Google Calendar as a source input pipeline.
- Production credentials in code, tests, docs, or chat.

## Implementation Plan

### 1. Data And Security

- [x] Add `google_calendar_connections` scoped to `household_members`.
- [x] Add `coverage_card_calendar_exports` scoped to cards and connections.
- [x] Enable RLS and keep tables server-only for authenticated browser clients.
- [x] Store refresh tokens encrypted with `GOOGLE_OAUTH_TOKEN_SECRET`.
- [x] Store connect/export/disconnect state in server-only calendar tables without card-event provider leakage.

### 2. Google Provider Layer

- [x] Add env parsing for optional Google OAuth config.
- [x] Add OAuth authorization URL builder and callback token exchange.
- [x] Add token refresh and Calendar event create/update helpers using `fetch`.
- [x] Keep provider calls behind explicit config checks.
- [x] Add unit tests for disabled config, state signing, token encryption, and event payload privacy.

### 3. App Routes And Actions

- [x] Add connect/callback/disconnect/export routes or server actions following current app patterns.
- [x] Require parent or household admin membership.
- [x] Only export cards from the user's household.
- [x] Reject cards without `starts_at` with a parent-friendly message.
- [x] Revalidate `/app` after connect/export/disconnect.

### 4. UI/UX

- [x] Add a compact card secondary action using existing V2 tokens.
- [x] Keep `Ask for coverage` as the primary action.
- [x] Show clear states: not configured, connect needed, ready to export, exported, export failed.
- [x] Avoid raw source text in UI copy and Google event descriptions.
- [x] Verify mobile and desktop rendering with Playwright screenshots.

### 5. Verification

- [x] `npx supabase db reset`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run test:extraction`
- [x] `npm run build:local`
- [x] Relevant local E2E
- [x] `npm run test:e2e:local`
- [x] `git diff --check`

## Acceptance Criteria

- [x] A parent/admin can connect Google Calendar when env vars are configured.
- [x] A parent/admin can export a timed coverage card to Google Calendar.
- [x] Re-exporting the same card does not create a duplicate event.
- [x] Helpers do not see or use Google Calendar export controls.
- [x] Disabled/missing Google config does not break local app usage.
- [x] Local tests do not call Google by default.
- [x] No raw source text, token material, provider payloads, emails, or artifact paths are exposed in calendar event descriptions or ops-style logs.

## Review Requirements

- [x] Run CE review before merge.
- [x] Run Cursor GPT-5.5 high read-only review because this touches OAuth, token storage, provider calls, privacy, and RLS.
- [x] Check Gemini Code Assist after opening the PR.

## Post-Deploy Monitoring & Validation

After deploy:

- [x] Connect one test Google account in the hosted environment.
- [x] Export one timed beta card and confirm the event appears once.
- [x] Re-export the same card and confirm it updates instead of duplicating.
- [x] Watch Vercel logs for OAuth callback/export failures.
- [x] Confirm `/app` still loads when Google env vars are absent through local disabled-config tests.
- [x] Run one hosted mobile end-to-end pass through board, Calendar-exported card, coverage request creation, no-account response acceptance, and board return.

Hosted validation result on 2026-05-30:

- OAuth completed from the authenticated FamTandem in-app browser session and returned `/app?calendar=connected`.
- Timed synthetic card `C` exported with `/app?calendarExport=created`; the card showed `Already on your calendar` and `View in Google Calendar`.
- Re-export returned `/app?calendarExport=updated`, preserving the same card-level Calendar state.
- `View in Google Calendar` opened the event in Google Calendar for the connected test account.
- Mobile hosted E2E created a coverage request from card `C`, accepted it through the response link, returned to the board at 100% coverage, and kept the Calendar update/view controls visible.
- Vercel error logs were clean during the validation window.

Healthy signal:

- A beta parent can put one FamTandem card on Google Calendar without needing founder help, while still using FamTandem for coverage ownership.

Failure signal:

- Export creates duplicate events, exposes source text, blocks the board when Google is unconfigured, or makes calendar feel like the primary product surface.

Rollback:

- Hide the calendar export UI and leave stored connections inert while preserving the board and coverage flows.
