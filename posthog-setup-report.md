<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into FamTandem. The existing partial integration (PostHogProvider, server client, events registry) was extended with 10 new events, user identification on sign-in, a reverse proxy for better event capture reliability, and 5 dashboard insights covering the core validation metrics.

## Summary of changes

- **next.config.ts** — Added `/ingest` reverse proxy rewrites (`/ingest/static/:path*`, `/ingest/array/:path*`, `/ingest/:path*`) plus `skipTrailingSlashRedirect: true` for reliable PostHog ingestion.
- **src/components/posthog-provider.tsx** — Switched `api_host` to `/ingest`, added `ui_host`, `capture_exceptions: true`, and `debug` in development.
- **src/lib/posthog/events.ts** — Added 8 new typed event names: `loginMagicLinkSent`, `userSignedIn`, `coverageSlotSelfAccepted`, `coverageSlotMarkedCovered`, `householdMemberAdded`, `childProfileAdded`, `googleCalendarConnected`, `googleCalendarExportCompleted`.
- **src/app/login/actions.ts** — Fires `login_magic_link_sent` (with privacy-safe email domain) after the OTP send succeeds.
- **src/app/household/new/actions.ts** — Fires `household_created` (with timezone) after RPC succeeds.
- **src/app/app/actions.ts** — Fires `coverage_card_created`, `coverage_slot_self_accepted`, `coverage_slot_marked_covered` (with owner_type), `household_member_added`, `child_profile_added`, `google_calendar_export_completed` (with status).
- **src/app/api/google-calendar/callback/route.ts** — Fires `google_calendar_connected` on successful OAuth token exchange.
- **src/app/auth/callback/route.ts** — Server-side `user_signed_in` capture + `captureServerEvent` wired in after `exchangeCodeForSession` succeeds, using `user.id` as the distinct ID for cross-device correlation.
- **src/components/posthog-user-identifier.tsx** — New client component that calls `posthog.identify(userId)` on mount; used in the app board page so all client-side events are tied to the authenticated user without sending raw email.
- **src/app/app/page.tsx** — Renders `<PostHogUserIdentifier userId={user.id} />` so the browser session is identified on every board load without passing the user's email into PostHog.
- **.env.local** — `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` written via wizard-tools (never committed). The app now also supports `NEXT_PUBLIC_POSTHOG_UI_HOST` for PostHog UI links when proxying ingestion through `/ingest`.

## Events table

| Event name | Description | File |
|---|---|---|
| `login_magic_link_sent` | User requested a magic link to sign in | `src/app/login/actions.ts` |
| `user_signed_in` | User completed magic-link sign-in (auth callback) | `src/app/auth/callback/route.ts` |
| `household_created` | New household created during onboarding | `src/app/household/new/actions.ts` |
| `coverage_card_created` | Manual coverage card created by household admin | `src/app/app/actions.ts` |
| `coverage_slot_self_accepted` | Member clicked "I'll cover it" | `src/app/app/actions.ts` |
| `coverage_slot_marked_covered` | Admin marked a slot as already covered | `src/app/app/actions.ts` |
| `household_member_added` | Parent or helper added to household | `src/app/app/actions.ts` |
| `child_profile_added` | Child profile added to household | `src/app/app/actions.ts` |
| `google_calendar_connected` | Parent connected Google Calendar via OAuth | `src/app/api/google-calendar/callback/route.ts` |
| `google_calendar_export_completed` | Coverage card exported to Google Calendar | `src/app/app/actions.ts` |
| `source_input_submitted` _(existing)_ | Paste/upload source submitted | `src/app/app/actions.ts` |
| `coverage_request_created` _(existing)_ | Coverage request created | `src/app/app/actions.ts` |
| `coverage_request_accepted` _(existing)_ | No-account responder accepted coverage | `src/app/respond/coverage/[token]/submit/route.ts` |
| `coverage_request_declined` _(existing)_ | No-account responder declined coverage | `src/app/respond/coverage/[token]/submit/route.ts` |
| `upload_extracted_text_approved` _(existing)_ | Parent approved upload OCR text | `src/app/app/actions.ts` |

## Next steps

We've built 5 insights and a pinned dashboard to keep an eye on user behavior as the cohort validation loop begins:

- **Dashboard — Analytics basics**
- **Intake-to-Coverage Funnel** (magic link → household → source → card → accepted)
- **Weekly Coverage Activity** (sources, cards, requests, acceptances over time)
- **Coverage Request Outcomes** (accepted vs declined vs expired)
- **Onboarding Progress Funnel** (magic link → household → child → adult → source)
- **Coverage Resolution Methods** (self-accept, marked-covered, request accepted)

## Hosted user-eval verification note

The standard hosted user-eval command exercises the AI-first paste-to-card path, not manual card creation. The run should produce these PostHog events:

- `login_magic_link_sent`
- `household_created` for a fresh plus-address test identity
- `child_profile_added`
- `household_member_added`
- `source_input_submitted`
- `coverage_request_created`
- `coverage_request_send_attempted`
- `coverage_request_link_opened`
- `coverage_request_accepted`

`coverage_card_created` is currently emitted by manual card creation only. AI-extracted cards are validated through source detail, linked-card checks, and the hosted user-eval screenshots rather than through that manual-card analytics event. If the PostHog funnel should treat extracted cards as the card-created step, add a separate extracted-card analytics event or extend `coverage_card_created` at the extraction creation boundary in a future analytics slice.

On 2026-05-31, follow-up PRs #47, #48, and #49 tightened response analytics with immediate server capture, signed confirmation-page fallback capture, and removal of the custom PostHog event-id override. PR #53 closed the remaining used-link fallback gap by allowing signed completion capture with the request token id even when card details are hidden. The hosted run with stamp `202605311701` passed end to end, and PostHog Activity showed matching `coverage_request_accepted` rows for the run's request token id.

### Agent access

The wizard's optional MCP/editor setup was cancelled before confirmation to avoid writing unrelated editor configuration. Production Vercel env now uses the app's actual `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` names instead of the wizard's unused `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` name. Install the PostHog MCP server for Codex separately if agent-side analytics access becomes useful.

</wizard-report>
