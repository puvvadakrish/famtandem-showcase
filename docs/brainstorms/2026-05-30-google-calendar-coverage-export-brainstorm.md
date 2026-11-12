---
date: 2026-05-30
topic: google-calendar-coverage-export
---

# Google Calendar Coverage Export Brainstorm

## What We're Building

Add a narrow Google Calendar slice that lets a parent put a FamTandem coverage card on their own Google Calendar.

The product shape is one-way export from a card, not calendar import, two-way sync, webhooks, recurring expansion, or a generic calendar dashboard. FamTandem remains the place where coverage and ownership are decided; Google Calendar is where the family can keep the time block visible alongside everything else.

## Why Do It Now

The earlier reason to defer Google Calendar was sound: families do not need another shared calendar, and building calendar sync too early can move attention away from the beta aha moment of uncovered responsibility becoming covered.

That said, the guided ask flow is now in place. The next smallest useful calendar step can support the same loop instead of competing with it: after a parent sees a source-backed card, the card can become a calendar event with coverage context. This helps beta families trust that FamTandem fits their existing habits.

## Chosen Approach

Use one-way, user-initiated card export:

- A parent or household admin connects their own Google account with OAuth.
- Each export creates or updates one event in the connected user's primary calendar.
- The Google event contains the card title, time, location, and a short coverage summary.
- The Google event description must not include raw source text, artifact paths, token hashes, private provider payloads, or helper-hidden source details.
- Store enough local mapping to avoid duplicate events for the same card and connected account.

## Alternatives Rejected

Two-way sync/import is deferred because it introduces event identity, recurrence, deletions, sync tokens, conflict resolution, and privacy questions before beta families have proven they need it.

Calendar webhooks are deferred because provider callbacks add operational and privacy surface area without being necessary for a first cohort smoke.

Household-wide shared calendar creation is deferred because it turns this slice into calendar administration. Primary-calendar export is easier to understand and safer for a first pass.

## Key Decisions

- Calendar is secondary to coverage. The card's primary action remains `Ask for coverage`.
- Export is available from cards with a real start time.
- OAuth and Calendar API calls are disabled unless explicit Google env vars are configured.
- Local tests must mock/stub provider behavior and must not call Google.
- Store refresh tokens encrypted at rest with an app secret, never in plaintext logs or UI.
- Parent/admin users may connect/export; helpers should not get the calendar connection/export controls in this slice.

## Success Criteria

- A beta parent can connect Google Calendar and add one coverage card to their calendar.
- Re-exporting the same card updates the existing Google event instead of creating duplicates.
- The Google event carries useful coverage context without exposing raw source text.
- Missing credentials or unconnected accounts produce calm, local-safe UI.
- Local verification does not require real Google credentials.

## Open Questions

None for this narrow slice. Future questions, such as two-way sync, import, recurring event handling, and household calendar ownership, remain explicitly out of scope.

## Validation Note

The hosted validation on 2026-05-30 confirmed the chosen narrow shape: a parent can connect Google Calendar, create one event from a timed coverage card, re-export the same card as an update, and still complete the primary coverage loop on mobile through `Ask for coverage` and a no-account response link. Calendar stayed useful as visibility, not the main coordination surface.
