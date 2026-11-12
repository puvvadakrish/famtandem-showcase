# FamTandem User Evaluation Regression Suite

## Purpose

This suite is the product-level regression pass to run before inviting a family, after every meaningful feature slice, and before any hosted deploy that changes app flows.

It complements unit, integration, and Playwright E2E tests by navigating the app like an overloaded default parent would: mobile-first, with real clicks, realistic logistics text, helper responses, source review, and layout checks.

## Current Family-Test Status

- Latest clean hosted reference run: `202606071653-mobile-auth5`, using `test-user+mobile-auth5@example.com`.
- Result: passed with empty `networkErrors` and `consoleErrors`; only known-benign events were recorded under `ignoredNetworkEvents`.
- Product path covered: magic-link login, same-browser new-tab session persistence, household setup, three pasted logistics sources, generated linked cards, one coverage ask, and mobile no-account acceptance. For analytics-specific changes, also confirm the expected PostHog validation events.
- Family handoff stance: go for a guarded first family session. The parent should review generated cards against the source before using coverage asks.
- Real family testing should use a fresh household/account. The standard `test-user@example.com` test household is additive QA data and may contain clutter from prior runs.

## Test Accounts And Data Rules

- Use the standard hosted test household/account before touching real family data.
- Use synthetic logistics only. Never paste real medical, legal, financial, custody, or sensitive family records into test runs.
- Name synthetic records with a `QA` prefix and timestamp so they are easy to identify later.
- Do not reset or delete hosted production data during this suite.
- Do not print provider secrets, magic links, raw tokens, or private source text in reports.

## Standard Hosted Command

Run the guarded hosted regression suite with:

```bash
npm run test:user-eval:hosted -- --help
CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted
```

The command uses `test-user@example.com` by default, sends a fresh hosted magic link, reads it through the authenticated Spark CLI, creates timestamped synthetic test data, captures desktop/mobile screenshots, and writes a JSON summary under `output/playwright/hosted-user-eval/<stamp>/`.

Safety defaults:

- The command refuses to run unless `CONFIRM_HOSTED_USER_EVAL=1` is set.
- It is additive-only on hosted data. It never resets, deletes, or truncates production data.
- It uses low-sensitivity synthetic logistics notes only.
- It redacts the coverage response token from `summary.json`.

Optional overrides:

```bash
FAMTANDEM_USER_EVAL_EMAIL=test-user+qa-202605311411@example.com
FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com
FAMTANDEM_USER_EVAL_BASE_URL=https://app.famtandem.com
FAMTANDEM_USER_EVAL_STAMP=202605311411
HEADED=1
```

For repeated hosted runs, prefer a unique Gmail plus-address for `FAMTANDEM_USER_EVAL_EMAIL` while keeping `FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com`. The runner waits for a fresh Spark message and verifies the email `To:` line before opening a magic link.

Harness diagnostics:

- `networkErrors` must be empty.
- `ignoredNetworkEvents` may include benign Next server-action redirect aborts, canceled `/_next/static/chunks/*.js` fetches, and canceled PostHog `/ingest/flags/` feature-flag polling.
- React page errors, framework overlays, and blank screens remain blocking non-functional failures.

Run this command before handing the app to a new family, after source intake/extraction/coverage-response/calendar changes, and before any deploy that could affect the product-facing first session. Keep the narrative report below for go/no-go findings and qualitative UX notes that the automated runner cannot judge well.

## Required Viewports

- Mobile: 390-430 px wide, representative of a parent using the app between tasks.
- Desktop: 1280-1440 px wide, representative of browser usage with left nav, center board, and right action panel.

## P0 User Flows

### 1. Authentication And First Screen

- Open hosted `/app` while authenticated as the test account.
- Confirm the app reaches the coverage board, not `/login`.
- Open hosted `/login` in the same browser context and confirm the app returns to `/app` without sending another magic link.
- Open hosted `/app` again in the same browser context and confirm the board still loads without another magic link.
- In local E2E, use `Sign out` and confirm `/app` redirects back to `/login`.
- Confirm the first meaningful screen shows `Today needs attention`, coverage counters, `Needs Attention`, and `This Week`.
- Confirm no framework overlay, blank shell, or console errors.

### 2. Household Setup

- Add at least one synthetic child with grade/group.
- Add at least one synthetic helper or second parent.
- Confirm the child and helper render in household setup.
- Confirm the helper invite/pending state is understandable.
- Confirm setup cards/checklist update or remain explainable.

### 3. Source Intake

- Submit one synthetic pasted logistics source with a clear time, place, child, pickup/drop-off responsibility, and readiness item.
- Confirm the app creates a source detail page.
- Confirm the source inbox shows the source under the correct state.
- Confirm raw source text is visible only on parent/admin source detail surfaces, not in coverage request response pages or broad board summaries.
- Confirm extraction moves from reading/pending to linked cards within the expected beta time window.
- Confirm extracted cards include source summary, source link, child, time/location when present, coverage slot, and readiness item.

### 4. Manual Card Backup Flow

- Create one manual card from the board.
- Include a synthetic title, child, location, source summary, coverage slot, and readiness item.
- Confirm the card appears in `Needs Attention`.
- Confirm coverage health reflects the new uncovered or unresolved item.

### 5. Coverage Ask And Response

- From an uncovered card, open `Ask for coverage`.
- Request coverage from an existing helper/household member.
- Confirm a response link is created without navigating the parent away from the board.
- Open the response link in a separate unauthenticated context.
- Confirm the response page shows only the minimum needed context and does not leak raw source text.
- Accept coverage.
- Return to the board and confirm the slot owner/status updates.

### 6. Readiness Resolution

- Mark a readiness item `Done` or `Not needed`.
- Confirm the card leaves `Needs Attention` only when both coverage and readiness are resolved.
- Confirm coverage health and counters update consistently.

### 7. Google Calendar Export

- Confirm Calendar controls appear only for eligible timed cards when the account is connected.
- Confirm Calendar remains a secondary action under the coverage workflow.
- Export one timed card.
- Re-export the same card and confirm it updates rather than duplicating.
- Confirm `View in Google Calendar` opens the event for the connected test account.
- Confirm Calendar state remains intact after coverage ask/response.

### 8. Source Inbox And Review

- Open `/app/inbox`.
- Confirm source state counts are understandable: needs review, reading, created cards, no cards, failed.
- Open a source detail page from the inbox.
- Confirm linked cards and extraction run state are visible enough for a parent/admin to understand what happened.

### 9. Responsive Layout And Scrolling

- On mobile, confirm bottom navigation remains visible, cards fit the viewport, and there is no horizontal overflow.
- On desktop, confirm left nav, center board, and right action panel fit without awkward clipping or trapped scrolling.
- Confirm long card names, helper names, source summaries, and readiness labels wrap cleanly.
- Confirm controls remain reachable without hidden submit buttons or dead-end panels.

## P0 Non-Functional Checks

- Console health: no relevant `error` or `warn` logs during the flow.
- Blank-page check: every route renders meaningful content.
- Privacy: response links and board summaries do not expose raw source text, artifact paths, provider payloads, token hashes, or secrets.
- Data integrity: adding cards, coverage requests, responses, and readiness changes should not duplicate rows or regress unrelated cards.
- Performance: primary route transitions should feel responsive enough for a parent on mobile; any "reading source" state needs an honest expected wait.
- Recovery: pending/failed source extraction should leave the parent with a clear next action.

## Latest Hosted Run: 2026-05-30

The run log below is chronological. Older no-go findings are kept to explain the failure history; use **Current Family-Test Status** above for the active handoff recommendation.

Environment:

- Hosted URL: `https://app.famtandem.com/app`
- Browser path: Codex in-app browser
- Mobile viewport: 430 x 932
- Desktop viewport: 1440 x 900
- Test household display: `TEST`

Passes:

- Mobile board loaded without horizontal overflow or console errors.
- Added synthetic child `QA Maya 202605310355`.
- Added synthetic helper `QA Helper 202605310355`.
- Submitted a synthetic pasted logistics source and confirmed the source detail page preserved the original text.
- Created a manual backup card `QA pickup gap 202605310358`.
- Created a household coverage request from the manual card.
- Accepted the request through the no-account response link.
- Verified the response page did not expose raw source text.
- Verified the board updated the pickup owner to the helper.
- Verified the previously exported Google Calendar card still showed `Already on your calendar`, `View in Google Calendar`, and `Update Google Calendar`.
- Verified desktop layout at 1440 x 900 has no horizontal overflow and shows left nav, center board, and right action panel coherently.
- Vercel error logs were clean for the validation window.

Findings:

- **Blocker for real first-family source intake:** pasted sources on hosted stayed in `Reading source` / `pending` with `provider=local-stub`, `attempts 0 / 3`, and `0 linked cards`. The hosted environment has `EXTRACTION_PROVIDER` configured, but the environment list did not show a production `GEMINI_API_KEY`, and Vercel Cron is scheduled daily at `0 13 * * *`. That means paste-to-card creation is not currently a near-real-time hosted experience.
- **Manual fallback works:** manual card creation plus coverage request/response works well enough to validate the coverage loop.
- **Readiness resolution needs a focused retest:** the automation could not reliably change the native readiness status select from `Open` to `Done` in the in-app browser. Treat this as inconclusive until a human/manual browser check or local Playwright run confirms whether it is an automation limitation or a real UX issue.
- **Test identity should be clarified:** the app surface showed the `TEST` household and `test-user@example.com` member email during this run. Confirm whether the Google Calendar account and the FamTandem auth account are intentionally different test accounts.

Go/No-Go:

- Go for manual-card, helper setup, coverage ask/response, source review, and Google Calendar visibility testing.
- No-go for telling a real first family that pasted logistics will create cards automatically until hosted Gemini extraction and job timing are configured and revalidated.

## Chrome Follow-Up: 2026-05-30

Environment:

- Hosted URL: `https://app.famtandem.com/app`
- Browser path: test browser profile
- Desktop viewport observed by the app: 1280 x 1091
- Test household display: `Test`

Passes:

- Chrome automation could claim the already-authenticated FamTandem tab and is the preferred path for future authenticated hosted QA.
- Board loaded as the authenticated `Krish` session with no horizontal overflow and no relevant console warnings/errors.
- The desktop layout kept left nav, center board, and right-side actions reachable at the observed viewport.
- Google Calendar connected state rendered on timed cards.
- Source inbox loaded without horizontal overflow and showed understandable state counts.
- Source detail preserved parent/admin source visibility and showed extraction run details without exposing provider secrets.
- Vercel logs for the validation window showed only successful `POST /app` requests and no server error entries.

Findings:

- **Hosted extraction blocker confirmed in Chrome:** the Chrome-profile source inbox showed two pasted sources stuck in `Reading source`; source detail showed `pending`, `provider=local-stub`, `model=local-stub-v1`, `attempts 0 / 3`, and `0 linked cards`.
- **Readiness persistence still needs product QA:** Chrome could interact with the native readiness status select and submit the form, but repeated refresh checks did not prove a stable `Done` state. Treat readiness resolution as not cleared for family go-ahead until a local Playwright test or manual browser check confirms persistence and counter/card movement.
- **Account surfaces differ by browser profile:** the in-app browser run showed `TEST`; Chrome showed `Krish` / `Test`. Reports must always name the visible account/household before treating results as canonical.

Go/No-Go:

- Go for Chrome-backed hosted QA of signed-in board, inbox, source detail, Calendar connected state, and manual coverage-loop checks.
- No-go for real first-family automatic intake until hosted extraction runs to cards.
- No-go for relying on readiness-resolution UX until the persistence check is cleared.

## Historical Fix Blocker: 2026-05-30

This section is historical for the 2026-05-30 hosted run. The hosted extraction blocker was addressed and revalidated on 2026-05-31 for fresh pasted sources. Older sources created before the fix may still show historical `local-stub` runs.

## Hosted Extraction Fix Follow-Up: 2026-05-31

Environment:

- Hosted URL: `https://app.famtandem.com/app`
- Browser path: test browser profile
- Desktop hosted household display: `Test`
- Test account shown in household setup: `test-user@example.com`
- Production deploy: a production deployment

Passes:

- Replaced empty production `EXTRACTION_PROVIDER`, `GEMINI_MODEL`, and `GEMINI_API_KEY` Vercel env values with non-empty production values. The API key is stored as a sensitive Vercel env var and is not documented in repo files.
- Fresh source `QA hosted Gemini extraction 20260531` processed during paste submit instead of waiting for daily cron.
- Source detail showed `processed`, `provider=gemini`, `model=gemini-3.5-flash`, `attempts 1 / 3`, `status=succeeded`, and `1 linked card`.
- Linked card `Ava's Soccer Practice` was created with pickup needing coverage and readiness items for cleats, shin guards, water bottle, and a signed permission slip.
- Parent/admin source detail preserved the original source text and extraction run summary without exposing provider secrets.
- Vercel logs for the validation window showed successful `POST /app` and source-detail requests with no server errors.
- Local Playwright now covers readiness persistence: mark readiness `Done`, reload, confirm the status persists and the card can move to covered when coverage is also resolved.

Findings:

- Vercel Hobby blocks sub-daily cron schedules. `vercel.json` remains daily, so on-demand paste extraction is the beta immediacy path and daily cron remains the fallback for failures/older queued work.
- Sources created before the env fix remain historical `local-stub` records and should not be used to judge the current hosted path.
- The synthetic source text said 5:30 PM and the created card rendered 4:30 PM, likely due to timezone normalization. Validate real family notes with explicit timezone/date phrasing if parents find the displayed time surprising.
- Provider credentials should remain in hosted/local environment variables and must not be committed, logged, or documented.

Go/No-Go:

- Go for a guarded first family session after one clean hosted user-eval run: create household, add kids/helpers, paste 2-3 low-sensitivity logistics notes, review generated cards, and complete one coverage ask/response.
- Still do not promise minute-level background retries on the current Hobby plan. Fresh paste submit is immediate; fallback job processing remains daily unless the Vercel plan or job architecture changes.
- Continue using this regression suite before future feature slices, especially after changes to source intake, extraction, coverage ask/response, readiness state, Google Calendar, or layout.

## Guarded First-Session Test: 2026-05-31

Environment:

- Hosted URL: `https://app.famtandem.com/app`
- Browser path: Playwright headless against hosted app after browser automation was unavailable.
- Auth path: hosted login UI sent a fresh magic link to `test-user@example.com`; Spark CLI read the new email; Playwright opened the new link in the same browser context.
- Desktop viewport: 1440 x 1000 for setup, intake, source review, and board actions.
- Mobile viewport: 390 x 844 for no-account coverage response.
- Test household display: `Test`
- Test stamp: `202605311327`

Data created:

- Children:
  - `QA First Ava 202605311327` / `4th grade`
  - `QA First Leo 202605311327` / `1st grade`
- Helper:
  - `QA First Helper 202605311327`
  - `test-user+qa-first-helper-202605311327@example.com`
- Pasted sources:
  - `QA First Source 1 Soccer 202605311327`
  - `QA First Source 2 Field Trip 202605311327`
  - `QA First Source 3 Dentist 202605311327`
- Coverage request recipient:
  - `QA First Grandma 202605311327`

Passes:

- Household setup accepted two new children and one helper through the hosted UI.
- All three pasted sources processed immediately on submit.
- Each source detail showed Gemini extraction, `attempts 1 / 3`, `processed`, and `1 linked card`.
- The source inbox showed all three submitted source titles after the run.
- The extracted soccer card created a parent-facing coverage card with pickup needing an owner and readiness items.
- The guided `Ask for coverage` flow created a response link without navigating the signed-in parent away from the board.
- The no-account mobile response page showed only minimum context: card title, displayed time, location, and the parent's short request note.
- The mobile response accepted coverage and showed the completion state.
- The response page did not expose the pasted raw source text.
- No relevant browser console errors were observed during the run.

Findings:

- **P1 time consistency issue:** the same extracted soccer source had inconsistent times across surfaces. The pasted note said `5:30 PM to 6:45 PM`; source-linked card summary showed `Jun 9, 2026, 4:30 PM`; the board card showed `Tue, Jun 9, 4:30 PM`; the no-account response page showed `Tue, Jun 9, 9:30 PM`. This is too confusing for a real parent and should be fixed before relying on extracted timed cards for family use.
- **Auth automation caveat:** magic-link testing must wait for a newly delivered Spark email ID. Reusing the latest-looking email can hit stale links and produce `auth_link_failed`.
- **Provider behavior:** extraction worked for fresh sources, but all generated cards were still marked `Needs review`, which is acceptable for beta but means first-session guidance should tell the parent to review generated cards before acting.

Go/No-Go:

- Go for a supervised first session that validates the setup, paste-to-card, source review, and coverage ask/response loop with the test account.
- No-go for unsupervised real-family use of extracted timed cards until the timezone/display inconsistency is fixed or the first family is explicitly warned to verify times against the source detail.
- Manual cards and coverage request/response remain usable as a fallback when extraction output needs correction.

## Guarded First-Session Retest: 2026-05-31

Environment:

- Hosted URL: `https://app.famtandem.com/app`
- Code deployed: `main` commit `f61f72e` from PR #43, `fix: keep extracted coverage times consistent`
- Database deployed: hosted Supabase migration `20260531150000_coverage_request_timezone.sql`
- Browser path: Playwright headless against hosted app; Spark CLI read fresh magic-link emails for `test-user@example.com`.
- Desktop viewport: 1440 x 1200 for setup, intake, source review, and board actions.
- Mobile viewport: 390 x 844 for no-account coverage response.
- Test household display: `Test`
- Test stamp: `202605311411`

Data created:

- Children:
  - `QA First Ava 202605311411` / `4th grade`
  - `QA First Leo 202605311411` / `1st grade`
  - `QA First Nina 202605311411` / `Kindergarten`
- Helper:
  - `QA First Helper 202605311411`
  - `test-user+qa-first-helper-202605311411@example.com`
- Pasted sources:
  - `QA First Source 1 Soccer 202605311411`
  - `QA First Source 2 Field Trip 202605311411`
  - `QA First Source 3 Dentist 202605311411`
- Coverage request recipient:
  - `QA First Grandma 202605311411`

Passes:

- Hosted login with the test account worked using a fresh Spark magic-link email.
- Three children and one helper were added through the hosted UI.
- All three low-sensitivity logistics notes processed through Gemini with `succeeded`, `attempts 1 / 3`, and linked cards.
- The soccer source detail preserved the original `5:30 PM` source text and showed a linked card without the old `4:30 PM` / `9:30 PM` drift.
- The board card for the new soccer source showed `Tue, Jun 9, 5:30 PM` and did not show `4:30 PM` or `9:30 PM`.
- The guided external `Ask for coverage` path created a manual response link.
- The no-account mobile response page showed `Tue, Jun 9, 5:30 PM`, did not expose raw source text, and accepted pickup coverage successfully.
- No relevant browser console or page errors were observed during the passing continuation.

Harness notes:

- Two automation issues happened before the passing continuation:
  - The first script expected a hidden `<option>` for a newly added child to be visible. The child was added correctly; the harness assertion was wrong.
  - The second script matched an older card because hidden child dropdown options made unrelated cards contain the new child name. The continuation targeted the unique source text instead.
- Future hosted QA should target source/card-specific text, not global child names, because the board renders child options inside correction/owner forms for many cards.

Go/No-Go:

- Go for a guarded first family session after one clean hosted user-eval run.
- Do not present generated cards as automatically final. The safe beta instruction is: paste logistics, review generated cards against their source, then send/accept at least one coverage ask.
- Continue running this first-session suite before future source intake, extraction, coverage ask/response, response-link, or mobile layout changes.

## Standard Command Run: 2026-05-31

Environment:

- Command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+qa-user-eval-20260531d@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=20260531d npm run test:user-eval:hosted`
- Hosted URL: `https://app.famtandem.com/app`
- Auth path: hosted login UI sent a fresh magic link to a Gmail plus-address in the `test-user@example.com` test mailbox; Spark CLI read the new email; Playwright opened the link.
- Desktop viewport: 1440 x 1200 for setup, intake, source review, and board actions.
- Mobile viewport: 390 x 844 for no-account coverage response.
- Artifacts: `output/playwright/hosted-user-eval/20260531d/`

Passes:

- The standard hosted command is now packaged as `npm run test:user-eval:hosted`.
- The help path documents prerequisites, safety flags, optional overrides, and artifact locations.
- The unconfirmed command refuses to create hosted data.
- The confirmed hosted run added three children and one helper, pasted three low-sensitivity logistics sources, verified Gemini extraction and linked cards, created an external coverage request, accepted it on mobile, and returned to the board.
- The soccer card and mobile response page preserved the fixed `Tue, Jun 9, 5:30 PM` time and did not show the old `4:30 PM` / `9:30 PM` drift.
- The no-account mobile response page did not expose the raw pasted source text or source title.
- The command wrote screenshots plus a redacted `summary.json` under `output/playwright/`.
- No relevant browser console or page errors were observed in the passing run.

Harness notes:

- The exact `test-user@example.com` login identity did not receive a fresh sign-in email during one run, likely because recent repeated magic-link sends were stale/throttled. The runner now supports `FAMTANDEM_USER_EVAL_MAILBOX` so Gmail plus-address login identities can still use the canonical test inbox.
- One prior run observed an intermittent React hydration/page error after the full product flow completed. A rerun with URL-tagged error tracing did not reproduce it. Treat any future React page error from this command as a valid non-functional failure to investigate, not as something to ignore by default.

Go/No-Go:

- Go for running this command as the standard hosted user-evaluation regression before feature handoff.
- Go for a guarded first family session, with the existing beta instruction that generated cards should be reviewed against the source before sending coverage asks.

## PostHog Deploy Hosted Run: 2026-05-31

Environment:

- Command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+posthog-eval-202605311947@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com npm run test:user-eval:hosted`
- Hosted URL: `https://app.famtandem.com/app`
- PostHog project: `FamTandem`
- Artifacts: `output/playwright/hosted-user-eval/202605311947/`

Passes:

- The full hosted first-session suite passed after the PostHog production deploy.
- The run added three children and one helper, submitted three pasted logistics sources, verified Gemini-linked cards, created a coverage request, accepted it on mobile, and returned to the board.
- The response link stayed privacy-safe and no relevant browser console/page errors were observed.
- PostHog Activity showed the run's validation events for login, household setup, child/helper setup, three source submissions, coverage request creation/send attempt, and response-link open.

Analytics follow-up:

- Follow-up PRs #47, #48, and #49 tightened response analytics with immediate server capture, signed confirmation-page fallback capture, and removal of the custom PostHog event-id override. After the production deploy for `8682a96`, PostHog Activity showed `coverage_request_accepted` rows in the last-hour view.
- The hosted run with account `test-user@example.com`, stamp `202605312033`, completed through mobile response acceptance and wrote screenshots under `output/playwright/hosted-user-eval/202605312033/`, but the command failed on an intermittent React hydration error `#418`.
- PRs #51 and #52 restored reliable hosted login by waiting longer for fresh Spark messages, matching the recipient line, and classifying benign Next server-action redirect aborts separately from real network failures.
- PR #53 fixed the accepted-event gap: the confirmation-page fallback can now capture signed accepted/declined completion with the request token id even when the used-link view hides card details.
- The hosted run with account `test-user+postchunk2-202605311701@example.com`, stamp `202605311701`, passed end to end. It added three children and one helper, submitted three pasted logistics sources, verified linked cards, created a coverage request, accepted it on mobile, and returned to the board with `coverageResponseStatus: "accepted"`.
- PostHog Activity showed matching `coverage_request_accepted` rows for that run's request token id, and Vercel logs for the validation window showed no coverage analytics capture failures, errors, or warnings.
- One immediately preceding run, stamp `202605311657`, completed the product flow but failed on React hydration error `#418`. A targeted authenticated `/app` reload diagnostic did not reproduce it, and the next full hosted run passed with no console/page errors. Keep future React page errors as valid non-functional suite findings, but this is not blocking the latest handoff.
- `coverage_card_created` is manual-card-only today. The hosted user-eval's AI-extracted cards are verified through source detail and linked-card assertions, not through that event.

## Device Session Hosted Run: 2026-06-07

Environment:

- Merged PR: `PR #64`
- Production commit: `dfb6fdb fix(auth): keep signed-in devices on the board (#64)`
- Hosted URL: `https://app.famtandem.com/app`
- Primary account command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+device-session-202606071242@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=202606071242 npm run test:user-eval:hosted`
- Helper-claim command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+device-session-helper-202606071248@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_HELPER_EMAIL=test-user+famtandem-helper-202606071248@example.com FAMTANDEM_USER_EVAL_HELPER_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=202606071248 npm run test:user-eval:hosted`
- Artifacts:
  - `output/playwright/hosted-user-eval/202606071242/`
  - `output/playwright/hosted-user-eval/202606071248/`

Passes:

- Production `/login` served the new remembered-device copy after deploy.
- Hosted user-eval passed twice after deploy.
- Both runs reported `sessionPersistenceStatus: same_context_reused_without_new_magic_link`.
- The second run verified the separate helper mailbox flow with `helperInviteStatus: claimed`.
- Both runs added children, pasted three low-sensitivity logistics sources, verified generated source-backed cards, created a coverage request, accepted it on mobile, and returned to the board.
- Both runs reported `coverageResponseStatus: accepted`.
- Both runs reported empty `consoleErrors` and empty `networkErrors`; only known benign Next redirect/static aborts were listed under `ignoredNetworkEvents`.

Go/No-Go:

- Go for production use by the first beta household after this login-friction fix.
- Keep the caveat explicit: the remembered session is tied to the same browser/device cookie container. If a user opens a magic link in Gmail's in-app browser but later opens FamTandem in Safari, Chrome, or a home-screen container that does not share cookies, they may need to sign in there once.

## Source Error Sanitization Hosted Run: 2026-06-07

Environment:

- Merged PR: `PR #65`
- Production commit: `1b170b2 fix: sanitize source processing errors`
- Hosted URL: `https://app.famtandem.com/app`
- Passing command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+sanitize-errors2-20260607@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=20260607-sanitize-errors2 npm run test:user-eval:hosted`
- Artifacts: `output/playwright/hosted-user-eval/20260607-sanitize-errors2/`

Passes:

- Production deploy for PR #65 reached `Ready` and was aliased to `https://app.famtandem.com`.
- The full hosted user-eval passed after deploy.
- The run added three children and one helper, submitted three pasted logistics sources, verified Gemini-linked cards, created a coverage request, accepted it on mobile, and returned to the board.
- The run reported `coverageResponseStatus: accepted`, empty `consoleErrors`, and empty `networkErrors`.
- Known benign Next redirect/static aborts appeared only under `ignoredNetworkEvents`.

Harness notes:

- An immediately preceding run, stamp `20260607-sanitize-errors`, processed the first two pasted sources but failed because the third source did not show `succeeded` within the runner's polling window. Vercel logs for that window showed 200 responses and no runtime errors. The next fresh run passed, so treat this as transient hosted extraction latency unless it repeats.

Go/No-Go:

- Go for continuing guarded hosted user testing after PR #65.
- Continue treating any repeated source that misses the extraction polling window as an operations follow-up before a real first-family session.

## Standard Report Template

Use this structure after every run:

- Date and environment
- Account/household used
- Viewports tested
- P0 pass/fail table
- Screenshots captured
- Console/log status
- Data created
- Findings ordered by severity
- Go/no-go recommendation
- Follow-up fixes or tests
