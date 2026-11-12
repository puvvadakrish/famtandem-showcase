---
title: "Google Calendar hosted OAuth and export validation"
date: 2026-05-30
type: integration_issue
status: resolved
components:
  - google-calendar
  - oauth
  - hosted-validation
tags:
  - famtandem
  - google-calendar
  - oauth
  - hosted-smoke
---

# Google Calendar Hosted OAuth And Export Validation

## Problem

FamTandem needed a hosted smoke test for the narrow Google Calendar export slice before a real family account started using the app. The test had to prove connect, create export, update export, and the mobile coverage request loop without turning Calendar into the primary product surface.

## Key Learning

The Google OAuth callback must complete in the same browser session that is already logged into FamTandem. The callback verifies the signed OAuth state against the active FamTandem user before storing the connection. Copying a long Google OAuth URL into a different browser profile can authenticate with Google but fail to persist the FamTandem connection if that browser does not also have the FamTandem auth session.

Use the app's `Connect Google Calendar` action from the logged-in FamTandem session, or restart from the app if the OAuth URL is stale or opened in the wrong profile.

## Validation Performed

- Hosted OAuth connect completed from the authenticated in-app browser and returned `/app?calendar=connected`.
- A timed synthetic card exported to Google Calendar and returned `/app?calendarExport=created`.
- Re-exporting the same card returned `/app?calendarExport=updated`, confirming the local mapping prevents duplicate events.
- `View in Google Calendar` opened the event for the connected test account without a sign-in wall.
- Vercel error logs were clean during the validation window.
- A mobile hosted end-to-end pass created a coverage request from the Calendar-exported card, accepted it through the no-account response link, returned the board to 100% coverage, and preserved the Calendar exported/update state.

## Prevention

- Keep Google Calendar disabled by default unless explicit Google OAuth env vars are configured.
- Keep Calendar UI secondary to `Ask for coverage`.
- Do not include raw source text, artifact paths, token hashes, emails, provider payloads, or helper-hidden details in Google event descriptions.
- For future hosted smoke tests, use the same authenticated browser session for FamTandem and Google OAuth, then verify both `calendarExport=created` and `calendarExport=updated`.
- Keep local tests mocked so default verification never calls real Google APIs.
