# FamTandem Project Context

@AGENTS.md

> `AGENTS.md` is the canonical repository instruction source. This file preserves Claude-specific context; where the two conflict, follow `AGENTS.md`.

## Summary

FamTandem is a family logistics coordination product in the validation stage.

The central thesis is:

> Families do not have a calendar problem. They have a logistics and coverage problem.

The goal is to help households coordinate as a unit by turning scattered commitments into covered plans. The first wedge is busy parents managing kids' school, sports, classes, appointments, forms, reminders, recurring routines, and last-minute changes.

## Current Working Name And Domains

Use **FamTandem** as the working product name.

Rationale:

- It suggests families moving together.
- It reinforces shared responsibility rather than one default parent carrying everything.
- `famtandem.com` and `famtandem.app` have been registered.
- It is more practical than HomeBase, which is crowded, and clearer than obscure names like Kithline.

Naming is still subject to trademark review.

## Audience And Pain

Primary audience:

- The overloaded default parent in a high-complexity household.

Early ICP:

- Dual-income families with 2+ kids.
- Families juggling school emails, sports apps, class registrations, PDFs, appointments, forms, and schedule changes.
- Families who already use Google/Apple calendars but still coordinate through texts, screenshots, forwarded emails, and memory.
- Families with caregivers, grandparents, carpools, shared cars, or tight commute constraints.

Core customer feeling:

> I am the only one who knows what needs to happen.

## Positioning

FamTandem should not be positioned as another shared family calendar.

Calendars show what is happening. FamTandem should show:

- Who saw it.
- Who owns it.
- What changed.
- What is uncovered.
- What needs a decision or reconfirmation.

Core line:

> FamTandem turns family logistics into shared coverage.

Emotional promise:

> Never be the only one who knows what needs to happen.

## Product Wedge

Start narrow:

- Live shared coverage board fed by a family logistics inbox.
- Forwarding address, upload/share, and paste-text intake.
- AI extraction from emails, PDFs, calendar invites, screenshots, registrations, and copied logistics text.
- Event-anchored coverage cards with source and confidence.
- Optional Google Calendar sync; do not require it before the first value moment.
- Coverage status on every event, especially split drop-off and pickup ownership.
- Change detection and reconfirmation.
- Daily unresolved nudge and weekly coverage review.

## Current First Product Shape

Start with a **mobile-first web app**, not native iOS. The core surface is a live shared coverage board that opens to **Needs Attention** and then shows **This Week** below it.

The core object is a **coverage card**, usually anchored to an event. Cards may include deadlines, decisions, changes, and readiness items such as forms, payments, supplies, permission slips, or "bring/wear/pack" details when those items are tied to a time-bound family logistics commitment.

Primary action:

- Ask for coverage.

Secondary actions:

- I'll cover it.
- Mark already covered.

"Mark already covered" must still capture who is responsible, including free-form external owners such as Grandma, a carpool parent, aftercare, or the school bus.

Participation model:

- The default parent can start alone.
- Other parents, caregivers, helpers, and one-off external contacts can respond through lightweight SMS/email links.
- Children can have profiles and be attached to events, but should not own coverage or receive v1 notification targets.

Notification model:

- SMS asks for action.
- Email gives context.

Provider assumptions:

- SMS: Twilio.
- Email: Resend.
- Analytics: PostHog.
- Extraction/backend: GCP/Gemini is preferred if it fits the implementation plan.

Trust model:

- Show compact source on every AI-created card.
- Put full source behind tap/click.
- Use **Needs Review** for low-confidence or meaningful action-heavy cards.
- Support both user-side editing and a small admin correction surface.

## V2 UI Direction

The accepted product UI direction is **The Covered Plan** with a visible thread of **Inbox Chaos to Coverage**.

Use `docs/design/famtandem-v2-design-system.md` as the continuity guide for future frontend work. The current concept reference is:

- Design reference image (not included in this repo)

Design priorities:

- Mobile-first. The default parent is likely checking the app between meetings, school pickup, errands, or evening planning.
- The first authenticated screen should say what needs attention before anything else.
- Keep the interaction centered on coverage, source trust, household coordination, and quick action.
- Use compact useful coverage cards, source-backed trust strips, and plain parent language.
- Keep the visual tone warm, modern, professional, and friendly enough for daily return.
- Do not drift into a marketing landing page, generic CRM dashboard, chores app, or broad family organizer.
- Avoid decorative gradient blobs/orbs and one-note purple/blue/slate palettes.

Do not start with:

- Chores.
- Meal planning.
- Grocery lists.
- Full chat.
- Hardware displays.
- Social/community features.
- Activity marketplace.
- Payment splitting.

## Immediate Validation Plan

The next phase should build a thin real app that validates whether the live coverage board reduces default-parent logistics load before building a broad family organizer.

Recommended path:

1. Recruit 10-20 high-complexity families.
2. Give each family a simple intake process: forwarding address, upload/share, and paste text.
3. Ask them to send 3-5 recent real logistics inputs: school emails, sports schedules, class registrations, PDFs, appointment reminders, screenshots, flyers, and change notices.
4. Generate source-backed coverage cards in the shared board.
5. Get to the first aha moment: FamTandem identifies an uncovered item and a coverage request gets accepted.
6. Measure whether families feel relief and whether they would pay $8-15/month.

Validation success quote:

> I no longer have to ask my spouse 10 times a week who is handling what.

## Metrics To Track

- Inputs sent per family per week.
- Coverage cards created.
- Source mix: email, PDF, screenshot, pasted text, calendar invite, registration, change notice.
- Uncovered logistics items found.
- Uncovered logistics items resolved.
- Coverage requests sent, accepted, and declined.
- Schedule changes detected and reconfirmed.
- Spouse/caregiver handoffs clarified.
- Willingness to pay.
- Verbatim customer language.

Truth metric:

> Did this reduce the number of times you had to ask, remind, clarify, or hold the plan in your head this week?

## Important Context Files

- `.agents/product-marketing.md`
- `docs/brainstorms/2026-05-18-familyops-positioning-brainstorm.md`
- `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`
- `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`
- `docs/solutions/documentation-gaps/famtandem-phase-0-3-validation-loop-summary.md`

## Current Build Status

- `main` is the accepted baseline and includes Phase 0 + Phase 1.
- Phase 0 provides the Next.js/TypeScript/Tailwind scaffold, Supabase auth/RLS/storage/job foundation, protected household routes, PostHog helpers, cron route, tests, and docs.
- Phase 1 provides the real manual household board loop: members/helpers, children, manual cards, coverage slots, readiness items, external owners, shared coverage/attention logic, and database/RLS hardening.
- Phase 2 paste/manual source intake is implemented on branch `feat/phase-2-paste-source-intake` in commit `6c68e19 feat: add paste source intake`.
- Phase 2 paste intake includes an authenticated `create_paste_source_card` Supabase RPC, pasted `source_inputs`, source-backed cards, compact/full source trust display for parents/admins, privacy-safe analytics events, same-household source/card validation, and authenticated Playwright coverage through local Mailpit magic links.
- PR #2 (landed) introduced the local-only `family-logistics-v1` Zod extraction contract, fixture evaluator, 15 synthetic/anonymized fixtures, and `npm run test:extraction`. No Gemini calls, no Supabase writes from this slice.
- PR #3 (landed) added the opt-in `npm run test:extraction:live` runner. Credentials come from local process env only; no jobs, no Supabase writes, no app routes, no analytics events from this slice.
- PR #4 (landed) added the read-only authenticated `/app/sources/[sourceInputId]` detail view (parent/admin full-source access, helper denial), the upload metadata/storage foundation (`source_artifacts`, `create_upload_source_metadata`), private `source-artifacts` read-policy tightening, Storage insert-policy hardening against precreated `source_artifacts.storage_path`, and the single-file direct upload UI for PDF/JPEG/PNG/WebP/plain-text files up to 10 MB. Uploads deliberately do not create coverage cards yet.
- **All four Phase 2 PRs (#2 → #3 → #4 → #5) squash-merged into `main` on 2026-05-24.**
- **Phase 3 PR #6 through PR #24 landed on `main` by 2026-05-26.** Main is at `8e4b17f feat(ops): add hosted cohort readiness snapshot`.
- PR #6 repaired the Gemini fixture-eval prompt/evaluator drift and PR #7 surfaced read-only extraction run summaries on source detail.
- PR #8 added AI-first paste intake, PR #9 added internal-admin extraction retry, PR #10/#11 added lightweight no-account request links and token hardening, PR #12 expanded extraction fixtures, PR #13 added the internal-admin validation snapshot, and PR #14 added the internal-admin validation CSV export plus cohort readiness checklist.
- PR #17 added opt-in Resend outbound coverage-request email behind the existing sender seam. Manual/local-stub request links remain the default.
- PR #21 addressed Gemini/CE review follow-ups for upload finalization, scheduled notification failure behavior, provider failure recording, and concurrent notification enqueue repair.
- The current scheduled notification slices add shared household notification settings/runs, local-stub default notification sending, cron-processed `send_daily_unresolved_nudge` and `send_weekly_coverage_review` jobs, and reusable unresolved-item selection for coverage summaries. Daily nudges and weekly reviews are disabled per household by default and must not include raw source text or artifact paths.
- Upload text/OCR extraction now has an explicit finalize step after Storage upload succeeds, a cron-processed `extract_artifact_text` job, deterministic text/plain extraction, an opt-in Gemini OCR adapter for PDF/image artifacts, and a parent/admin approval step before upload text queues logistics extraction/card creation. OCR is disabled by default unless `ARTIFACT_TEXT_PROVIDER=gemini` and `GEMINI_API_KEY` are explicitly set in local env.
- Parent card correction now splits card-editing permission from household administration: `parent` and `household_admin` members can correct existing source-backed card details and readiness items, while helper users cannot see correction controls and household setup/intake/provider-sensitive actions remain household-admin only.
- Hosted cohort readiness now includes an explicit hosted runbook and a read-only internal-admin `/app/admin/ops` snapshot for jobs, extraction runs, upload text/OCR, notification runs, and coverage-request sends. The ops snapshot reports coarse status/count/error buckets only and must not expose raw source text, artifact paths, token hashes, emails, phone numbers, or provider payloads.
- Google Calendar coverage export is now implemented as a narrow, one-way parent/admin export for timed cards. Google remains disabled unless explicit Google OAuth env vars are configured, refresh tokens are encrypted server-side, local tests mock provider calls by default, helpers cannot connect/export, and Calendar stays secondary to the coverage CTA. Calendar import, two-way sync, webhooks, shared calendar management, recurrence handling, attendee invites, and Calendar-as-source-input remain out of scope.
- The extraction run foundation (now in main) adds `extraction_runs` as the audit unit-of-record, an `AFTER INSERT` trigger on `source_inputs` that creates upload runs without prematurely enqueueing logistics extraction, `service_role`-only `start_extraction_run`/`record_extraction_run`/`create_extracted_cards` RPCs, a deterministic local stub extractor, and the `extract_source` processor wired into the existing job runner.
- `create_extracted_cards` creates source-linked cards/slots/readiness/audit rows transactionally and is idempotent (stamps `card_count` in the same transaction as the inserts so retries cannot duplicate). Provider selection via `selectExtractor(env)` defaults to the local stub unless `EXTRACTION_PROVIDER='gemini'` and `GEMINI_API_KEY` are both set in local or hosted env. Default model `gemini-3.5-flash`, overridable via `GEMINI_MODEL`. Gemini calls remain off by default in local tests; credentials must stay in local process env, gitignored env files, or hosted sensitive env storage only.
- During PR #5 development, a cursor-agent review (`gpt-5.5-high`) caught 3 real HIGH bugs (duplicate cards on retry, derived review reasons not reaching cards, Gemini runs audited as local-stub) all fixed before merge.
- Live Gemini smoke (`tests/live/gemini-runtime-live.test.ts`) against `gemini-3.5-flash` passes — schema-valid output in ~10s. The model name was confirmed via the `/v1beta/models` endpoint.
- A live integration test (`tests/live/extraction-e2e-live.test.ts`) exercises the **full intake→trigger→job→Gemini→cards** loop end-to-end. With `EXTRACTION_PROVIDER=gemini`, a pasted synthetic school note produced `provider=gemini, model=gemini-3.5-flash, status=succeeded, cards=1, reviewReasons=2` in ~14s. Real Gemini-extracted coverage card created, linked to its source via `full_source_ref`.
- The Gemini fixture-eval suite (`tests/live/gemini-extraction-live.test.ts`) now passes against `gemini-3.5-flash` after PR #6. The evaluator rejects hallucinated extra readiness items while still tolerating harmless title/readiness wording drift.

## Latest Verification Snapshot

For the PR #4 pre-merge state (historical record):

- `npx supabase db reset` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run test:extraction` passed.
- `npm run build:local` passed after rerunning with sandbox escalation because the wrapper shells out to `npx supabase status`.
- `npm run test:e2e:local` passed after rerunning with sandbox escalation. It now includes authenticated paste intake plus direct upload intake coverage on mobile and desktop.
- After adding Storage insert-policy hardening, `npx --yes supabase db reset`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:extraction`, `npm run build:local`, and `npm run test:e2e:local` passed. E2E now also verifies an authenticated admin cannot upload to an arbitrary household-prefixed object path without metadata and that helpers cannot read raw artifact objects.

For the merged Phase 2 final state on `main` (commit `0f82891`), with `EXTRACTION_PROVIDER=gemini` active in local `.env.local`:

- `npx --yes supabase db reset` — 8 migrations apply cleanly.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 92 unit tests across 19 files passing.
- `npm run test:extraction` — 11 schema/fixture tests passing.
- `npm run build:local` — production build succeeds.
- `npm run test:e2e:local` — 8 Playwright tests pass on mobile + desktop.
- Live Gemini runtime smoke (`tests/live/gemini-runtime-live.test.ts`) — schema-valid output in ~10s.
- Live intake→trigger→job→Gemini→cards loop (`tests/live/extraction-e2e-live.test.ts`) — succeeded with 1 real Gemini-extracted card in ~14s.
- At the Phase 2 final state, fixture-eval drift (`tests/live/gemini-extraction-live.test.ts`) still failed against both `gemini-2.5-flash` and `gemini-3.5-flash`; PR #6 has since repaired this for `gemini-3.5-flash`.

For the merged Phase 3 PR #6 through PR #14 state on `main` (commit `82f7713`):

- PR #6 (`Repair Gemini fixture eval prompt`) — `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:extraction`, `npm run build:local`, `npm run test:e2e:local`, and `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npm run test:extraction:live` passed before merge. A follow-up CE review plus read-only Cursor `gpt-5.5-high` review found and fixed the readiness-eval strictness gap before merge.
- PR #7 (`Surface extraction run summary on source detail`) — `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:extraction`, `npm run build:local`, and `npm run test:e2e:local` passed before merge. The source detail page now shows read-only run state to parent/admin users and keeps helper denial intact.
- PR #8 through PR #14 added AI-first paste intake, internal-admin extraction retry, lightweight no-account coverage request links, token hardening, expanded extraction fixtures, the read-only internal-admin validation snapshot, and the internal-admin validation CSV export/cohort readiness checklist. These slices kept production Gemini, Twilio, Resend, Google Calendar, OCR, signed downloads, and broad admin correction out of scope.

For the merged PR #21 through PR #24 state on `main` (commit `8e4b17f`):

- PR #21 fixed review follow-ups for upload finalization cleanup, notification scheduler isolation, provider failure recording, and concurrent enqueue repair.
- PR #22 added parent/household-admin card correction while keeping helper users out of correction controls and keeping source/provider-sensitive actions admin-scoped.
- PR #23 added approval-gated upload OCR/text extraction: artifact text can be extracted into reviewable source text, but card creation waits for parent/admin approval.
- PR #24 added hosted cohort readiness docs plus `/app/admin/ops`; CE ops review caught sampled job-health totals, Gemini Code Assist caught duplicate React keys, and both were fixed before merge.

For the hosted Google Calendar validation on 2026-05-30:

- Hosted OAuth connect completed from the authenticated in-app browser session and returned `/app?calendar=connected`.
- A timed synthetic card exported to Google Calendar and returned `/app?calendarExport=created`; re-export returned `/app?calendarExport=updated` instead of creating a duplicate.
- The card then showed `Already on your calendar`, `View in Google Calendar`, `Update Google Calendar`, and `Disconnect`.
- `View in Google Calendar` opened the event in Google Calendar without a sign-in wall for the connected test account.
- A mobile hosted end-to-end pass on the same card created a coverage request, accepted it through the no-account response link, returned the board to 100% coverage, and preserved the Calendar exported/update state.
- Vercel error logs for the hosted app were clean during the validation window.

For the hosted user-evaluation run on 2026-05-30:

- See `docs/qa/famtandem-user-evaluation-regression-suite.md` for the reusable product-level regression suite and latest run report.
- Mobile setup, manual card creation, coverage request creation, no-account response acceptance, source inbox visibility, Google Calendar exported-card state, and desktop layout checks passed on the hosted test household.
- Hosted paste intake stored the source and showed it in the source inbox, but it remained `Reading source` / `pending` with `provider=local-stub`, `attempts 0 / 3`, and `0 linked cards`. This was the blocker that led to the 2026-05-31 hosted extraction latency fix below.
- A Chrome-profile follow-up confirmed the same hosted extraction blocker in the `Krish` / `Test` household, with two pasted sources still pending on `local-stub`.
- Readiness-item resolution was inconclusive in browser automation during this run; it is now covered by the 2026-05-31 local Playwright readiness persistence test.
- Manual-card plus coverage ask/response is usable as a fallback validation loop, but it is not the promised paste-to-card aha moment.

For the hosted paste extraction latency fix on 2026-05-31:

- See `docs/plans/2026-05-31-fix-hosted-paste-extraction-latency-plan.md`, `docs/qa/famtandem-user-evaluation-regression-suite.md`, and `docs/solutions/integration-issues/hosted-paste-extraction-latency-20260531.md`.
- Vercel Hobby rejected sub-daily cron schedules, so `vercel.json` remains daily at `0 13 * * *`. New paste submissions now process extraction on demand from the paste submit server action; the queued `extract_source` job remains as audit/fallback and is marked succeeded after successful on-demand processing.
- Production Vercel env values for `EXTRACTION_PROVIDER`, `GEMINI_MODEL`, and `GEMINI_API_KEY` were replaced after discovering existing entries were present but empty. The Gemini key is stored only as a sensitive Vercel env var and must not be committed or documented.
- Hosted Chrome QA created fresh source `QA hosted Gemini extraction 20260531`; source detail showed `provider=gemini`, `model=gemini-3.5-flash`, `attempts 1 / 3`, `status=succeeded`, and `1 linked card`.
- Older local-stub source detail pages remain historical records. Always create a fresh source when validating current hosted extraction behavior.
- Local E2E now verifies immediate paste processing without manually invoking cron and readiness `Done` persistence across reload.
- Provider credentials are stored only in hosted/local environment variables and must not be committed, logged, or documented. Escalate credential rotation only if the user asks or a secret exposure occurs.
- PR #51 through PR #55 hardened the guarded hosted user-eval runner after PostHog instrumentation: Spark magic-link polling now waits for fresh recipient-matched emails, benign Next redirect/static chunk aborts are reported as `ignoredNetworkEvents`, accepted coverage responses are correlated in PostHog, and hosted run `202605311701` passed with empty `networkErrors`/`consoleErrors`. The current clean hosted reference after PR #65 is `20260607-sanitize-errors2`.

Even older PR #4 baseline notes (kept for context, no longer current):

- `npm run build` was run exactly and failed locally because the raw shell lacked required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`.
- `npm run test:e2e` passed with local-only authenticated tests skipped.
- A local preview was restarted at `http://127.0.0.1:3000` and returned HTTP 200.

Known local caveat: running `npm run build:local` and Playwright against the same `.next` output concurrently can cause a transient Next build artifact race. Run build and E2E sequentially.

The previously unrelated untracked `docs/gstack-codex-guide.html` file was moved out of the repo by the user and no longer appears in git status.

## Next Recommended Phase

The first real validation loop is now in place: parents can paste/upload logistics sources, extraction can create source-backed cards, parents can correct cards, uncovered slots can get no-account request links, daily/weekly coverage emails can run behind household opt-in, timed cards can be exported one-way to Google Calendar when configured, internal admins can inspect/export validation metrics, and internal admins can monitor hosted operations through `/app/admin/ops`.

**Rank 1 — Hosted cohort smoke and operations.**

Use `docs/ops/2026-05-26-hosted-cohort-readiness-runbook.md` to configure a small hosted environment, keep providers opt-in, run cron manually first, and verify `/app/admin/validation` plus `/app/admin/ops` before inviting families.

**Rank 2 — Run the real cohort loop.**

Recruit 10-20 high-complexity families, collect 3-5 real logistics inputs per household, use parent correction where extraction is imperfect, send at least one coverage request per household, and measure whether unresolved coverage actually drops.

Before a real first-family run, run or reference one clean observed hosted smoke with the standard test account using `CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted`, then confirm the expected PostHog validation events. The current clean reference run is `20260607-sanitize-errors2` on production after PR #65; rerun after any meaningful app-flow, source intake, coverage-response, analytics, or Calendar change. The first-family path is: create/update household, add kids/helpers, paste 2-3 low-sensitivity logistics notes, review generated source-backed cards, and complete one coverage ask/response. Real family testing should use a fresh household/account, not the cluttered additive QA household, and production data must be preserved across upgrades.

**Do not start yet without an explicit slice decision:** Resend inbound email, Twilio/SMS, Google Calendar work beyond one-way card export (imports, two-way sync, webhooks, shared calendar management, recurrence, or attendee invites), signed downloads, broad admin correction surface, provider webhooks/status callbacks, or production credentials in code/docs. These remain out of scope until cohort validation demands them and the relevant provider/compliance plan exists.

**Provider credentials policy stays unchanged:** local/hosted env only; never commit, log, or paste provider secrets into docs/chat. Local tests must stay provider-safe by default.

## Guidance

- Keep the work focused on validation until the pain and willingness to pay are proven.
- Do not turn this into a broad family organizer too early.
- Keep the language warm, plain, and parent-centered.
- Preserve the strategic distinction: visibility is not coverage.
- When in doubt, optimize for reducing the overloaded default parent's mental load.
- Use sub-agents wherever work can be safely parallelized to speed up delivery, especially for read-only research, code review, test investigation, and independent UX/security/privacy checks. Keep implementation ownership clear in the main thread so parallel work does not create conflicting edits.
- Use `test-user@example.com` as the standard FamTandem hosted test account for browser-authenticated smoke tests and cohort-style flow checks, unless the user explicitly names another account. Keep it as a test account.
- For repeated hosted user-eval runs, prefer a unique Gmail plus-address via `FAMTANDEM_USER_EVAL_EMAIL` while keeping `FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com`; the runner should only open fresh Spark magic-link emails whose `To:` line matches the login identity.
- In hosted user-eval summaries, treat `ignoredNetworkEvents` as informational only for known benign Next server-action redirect aborts and canceled `/_next/static/chunks/*.js` fetches. `networkErrors`, React page errors, framework overlays, and blank screens remain blocking.

## Compound Engineering Workflow

Follow the canonical `## Compound Engineering Workflow` section in `AGENTS.md`. Do not duplicate or override it here; this file is only a Claude-specific context overlay.
