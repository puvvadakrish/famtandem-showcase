# FamTandem Agent Context

## Overall Goal

FamTandem is an early-stage product concept for family logistics coordination.

The core thesis:

> Families do not have a calendar problem. They have a logistics and coverage problem.

The product should help busy households capture commitments from scattered sources, turn them into structured family events, sync those events to existing calendars, and make clear who owns each event.

The aspiration is broader than kids' schedules. The first wedge is school, sports, classes, appointments, and recurring routines for high-complexity families. Over time, the product should support the full household unit: caregivers, grandparents, pets, shared cars, errands, home services, medical appointments, travel, and recurring responsibilities.

## Working Name And Domains

Use **FamTandem** as the current working product name.

Why:

- It communicates families moving together.
- It supports the emotional promise of shared responsibility.
- `famtandem.com` and `famtandem.app` have been registered.
- It is more practical than HomeBase, which is too crowded, and clearer than more obscure names like Kithline.

Do not treat naming as legally final until trademark review is complete.

## Audience

Primary audience:

- The overloaded default parent in a high-complexity household.

Early ICP:

- Dual-income households with 2+ kids.
- Families juggling school, sports, enrichment, appointments, forms, reminders, and last-minute changes.
- Families using Google/Apple calendars but still coordinating through texts, forwarded emails, screenshots, and memory.
- Families with caregivers, grandparents, carpools, or shared vehicle constraints.

The first narrative should speak to the parent who feels:

> I am the only one who knows what needs to happen.

## Positioning

FamTandem is not a shared calendar replacement.

Calendars answer:

- What is happening?
- When is it?
- Where is it?

FamTandem answers:

- Who saw it?
- Who owns it?
- What changed?
- What is still uncovered?
- What needs a decision before the day falls apart?

Core line:

> FamTandem turns family logistics into shared coverage.

Emotional promise:

> Never be the only one who knows what needs to happen.

## MVP Wedge

Focus narrowly on:

1. Live shared coverage board fed by a family logistics inbox.
2. Family inbox / forwarding address, upload/share, and paste-text intake.
3. AI extraction from emails, PDFs, calendar invites, screenshots, registrations, and copied logistics text.
4. Event-anchored coverage cards with source and confidence.
5. Optional Google Calendar sync; do not require it before the first value moment.
6. Coverage status for each event, especially drop-off / pickup ownership.
7. Change detection and reconfirmation.
8. Daily unresolved nudge and weekly coverage review.

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

Provider assumptions for first planning pass:

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

Avoid v1 distractions:

- Meal planning.
- Chores.
- Grocery lists.
- Full chat app.
- Hardware display.
- Social/community features.
- Activity marketplace.
- Payment splitting.
- Deep WhatsApp integration.

## Immediate Product Validation Path

The next phase should build a thin real app that validates whether the live coverage board reduces default-parent logistics load before building a broad family organizer.

Recommended validation path:

1. Recruit 10-20 high-complexity families.
2. Give each family a simple intake process: forwarding address, upload/share, and paste text.
3. Ask them to send 3-5 recent real logistics inputs: school emails, sports schedules, class registrations, PDFs, appointment reminders, screenshots, and change notices.
4. Generate source-backed coverage cards in the shared board.
5. Get to the first aha moment: FamTandem identifies an uncovered item and a coverage request gets accepted.
6. Measure whether this creates real relief and whether families would pay $8-15/month.

Success signal:

> I no longer have to ask my spouse 10 times a week who is handling what.

## Validation Metrics

Track:

- Inputs sent per family per week.
- Coverage cards created.
- Number of uncovered logistics items found.
- Number of uncovered logistics items resolved.
- Coverage requests sent, accepted, and declined.
- Number of changes detected.
- Number of changes reconfirmed.
- Number of spouse/caregiver handoffs clarified.
- Willingness to pay $8-15/month.
- Exact customer language about the pain.

Truth metric:

> Did this reduce the number of times you had to ask, remind, clarify, or hold the plan in your head this week?

## Source Docs

Use these files for deeper context:

- `.agents/product-marketing.md`
- `docs/brainstorms/2026-05-18-familyops-positioning-brainstorm.md`
- `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`
- `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`
- `docs/solutions/documentation-gaps/famtandem-phase-0-3-validation-loop-summary.md`

## Current Build Status

- `main` is the accepted baseline and includes Phase 0 + Phase 1.
- Phase 0: Next.js/TypeScript/Tailwind scaffold, Supabase local config and migration, auth/household bootstrap, protected app routes, PostHog helpers, protected cron route, Vitest/Playwright/tooling, setup/architecture/QA docs.
- Phase 1: real manual household board loop with household members/helpers, children, manual cards, coverage slots, readiness items, external owners, shared attention/coverage logic, and database/RLS hardening.
- Phase 2 paste/manual source intake is implemented on branch `feat/phase-2-paste-source-intake` in commit `6c68e19 feat: add paste source intake`.
- Phase 2 paste intake includes an authenticated `create_paste_source_card` Supabase RPC, pasted `source_inputs`, source-backed cards, compact/full source trust display for parents/admins, privacy-safe analytics events, same-household source/card validation, and authenticated Playwright coverage through local Mailpit magic links.
- PR #2 (landed) introduced the local-only `family-logistics-v1` Zod extraction contract, fixture evaluator, 15 synthetic/anonymized fixtures, and `npm run test:extraction`. No Gemini calls, no Supabase writes from this slice.
- PR #3 (landed) added the opt-in `npm run test:extraction:live` runner. Credentials come from local process env only; no jobs, no Supabase writes, no app routes, no analytics events from this slice.
- PR #4 (landed) added the read-only authenticated `/app/sources/[sourceInputId]` detail view (parent/admin full-source access, helper denial), the upload metadata/storage foundation (`source_artifacts`, `create_upload_source_metadata`), private `source-artifacts` read-policy tightening, Storage insert-policy hardening against precreated `source_artifacts.storage_path`, and the single-file direct upload UI for PDF/JPEG/PNG/WebP/plain-text files up to 10 MB. Uploads deliberately do not create coverage cards yet.
- **All four Phase 2 PRs (#2 → #3 → #4 → #5) squash-merged into `main` on 2026-05-24.** Phase 2 includes paste intake, the `family-logistics-v1` extraction schema + fixture evaluator, optional live Gemini eval runner, source detail page, direct upload intake, storage policy hardening, and the extraction run foundation with run-driven card creation and Gemini provider gating.
- **Phase 3 PR #6 through PR #24 landed on `main` by 2026-05-26.** Main is at `8e4b17f feat(ops): add hosted cohort readiness snapshot`.
- PR #6 repaired the Gemini fixture-eval prompt/evaluator drift and PR #7 surfaced read-only extraction run summaries on source detail.
- PR #8 added AI-first paste submission: paste now creates a source input, the existing trigger enqueues extraction, and extraction runs create source-backed cards through the gated provider path. The local wrapper defaults E2E to `EXTRACTION_PROVIDER=local-stub` unless explicitly overridden so local tests do not depend on live Gemini.
- PR #9 added internal-admin retry for failed extraction runs.
- PR #10/#11 added lightweight no-account coverage request links and hardened stale/expired/reused token behavior. The visible local app still uses `manual_link`/local-stub sending, not production SMS/email.
- PR #12 expanded the synthetic/anonymized extraction fixture suite to 24 fixtures, including change notices, multi-child schedules, carpool details, payment/form/readiness items, ambiguous ownership, no-action sources, known coverage, and Needs Review cases.
- PR #13 added the read-only internal-admin `/app/admin/validation` snapshot for cohort validation metrics.
- PR #14 added the internal-admin CSV export for `/app/admin/validation`, hardened CSV output against spreadsheet formula injection, added the cohort readiness checklist, and refreshed agent context docs.
- PR #17 added opt-in Resend outbound coverage-request email behind the existing sender seam. Manual/local-stub request links remain the default.
- PR #21 addressed Gemini/CE review follow-ups for upload finalization, scheduled notification failure behavior, provider failure recording, and concurrent notification enqueue repair.
- The current scheduled notification slices add shared household notification settings/runs, local-stub default notification sending, cron-processed `send_daily_unresolved_nudge` and `send_weekly_coverage_review` jobs, and reusable unresolved-item selection for coverage summaries. Daily nudges and weekly reviews are disabled per household by default and must not include raw source text or artifact paths.
- Upload text/OCR extraction now has an explicit finalize step after Storage upload succeeds, a cron-processed `extract_artifact_text` job, deterministic text/plain extraction, an opt-in Gemini OCR adapter for PDF/image artifacts, and a parent/admin approval step before upload text queues logistics extraction/card creation. OCR is disabled by default unless `ARTIFACT_TEXT_PROVIDER=gemini` and `GEMINI_API_KEY` are explicitly set in local env.
- Parent card correction now splits card-editing permission from household administration: `parent` and `household_admin` members can correct existing source-backed card details and readiness items, while helper users cannot see correction controls and household setup/intake/provider-sensitive actions remain household-admin only.
- Hosted cohort readiness now includes an explicit hosted runbook and a read-only internal-admin `/app/admin/ops` snapshot for jobs, extraction runs, upload text/OCR, notification runs, and coverage-request sends. The ops snapshot reports coarse status/count/error buckets only and must not expose raw source text, artifact paths, token hashes, emails, phone numbers, or provider payloads.
- Google Calendar coverage export is now implemented as a narrow, one-way parent/admin export for timed cards. Google remains disabled unless explicit Google OAuth env vars are configured, refresh tokens are encrypted server-side, local tests mock provider calls by default, helpers cannot connect/export, and Calendar stays secondary to the coverage CTA. Calendar import, two-way sync, webhooks, shared calendar management, recurrence handling, attendee invites, and Calendar-as-source-input remain out of scope.
- The extraction run foundation (now in main) adds `extraction_runs` as the audit unit-of-record, an `AFTER INSERT` trigger on `source_inputs` that creates upload runs without prematurely enqueueing logistics extraction, `service_role`-only `start_extraction_run`/`record_extraction_run`/`create_extracted_cards` RPCs, a deterministic local stub extractor (`src/lib/extraction/local-extractor.ts`), and the `extract_source` processor wired into the existing job runner.
- `create_extracted_cards` creates source-linked cards/slots/readiness/audit rows transactionally and is idempotent (skips when `card_count > 0`; stamps `card_count` in the same transaction as the inserts so retries cannot duplicate). Attention flags and `computed_coverage_state` are derived server-side from card fields, not browser-supplied state.
- Provider selection via `selectExtractor(env)` (`src/lib/extraction/provider.ts`) defaults to the local stub unless **both** `EXTRACTION_PROVIDER='gemini'` and `GEMINI_API_KEY` are set in local or hosted env. Default Gemini model is `gemini-3.5-flash`, overridable via `GEMINI_MODEL`. Gemini calls are off by default in local tests; credentials must remain in local process env, gitignored env files, or hosted sensitive env storage only.
- During PR #5 development, a cursor-agent review (`gpt-5.5-high`) caught three real HIGH bugs (duplicate cards on retry, derived review reasons not reaching cards, Gemini runs audited as `local-stub`) — all fixed before merge.
- A live Gemini smoke (`tests/live/gemini-runtime-live.test.ts`) against `gemini-3.5-flash` produces schema-valid output in ~10s. The model name `gemini-3.5-flash` is real and available — confirmed against the `/v1beta/models` endpoint.
- A live integration test (`tests/live/extraction-e2e-live.test.ts`) exercises the **full intake→trigger→job→Gemini→cards** path. With `EXTRACTION_PROVIDER=gemini`, a pasted synthetic school note produces `provider=gemini, model=gemini-3.5-flash, status=succeeded, cards=1` in ~14s. This is the validation that the path works against real Gemini, not just unit-tested mocks.
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
- Live Gemini runtime smoke (`tests/live/gemini-runtime-live.test.ts`) against `gemini-3.5-flash` — schema-valid output in ~10s.
- Live intake→trigger→job→Gemini→cards loop (`tests/live/extraction-e2e-live.test.ts`) — succeeded with 1 real Gemini-extracted card in ~14s, provider/model stamped correctly on the run row.
- At the Phase 2 final state, fixture-eval drift (`tests/live/gemini-extraction-live.test.ts`) still failed against both `gemini-2.5-flash` and `gemini-3.5-flash`; PR #6 has since repaired this for `gemini-3.5-flash`.

For the merged Phase 3 PR #6 through PR #14 state on `main` (commit `82f7713`):

- PR #6 (`Repair Gemini fixture eval prompt`) — `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:extraction`, `npm run build:local`, `npm run test:e2e:local`, and `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npm run test:extraction:live` passed before merge. A follow-up `ce-review` plus read-only Cursor `gpt-5.5-high` review found and fixed the readiness-eval strictness gap before merge.
- PR #7 (`Surface extraction run summary on source detail`) — `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:extraction`, `npm run build:local`, and `npm run test:e2e:local` passed before merge. The source detail page now shows read-only run state to parent/admin users and keeps helper denial intact.
- PR #8 (`Add AI-first paste intake`) through PR #14 (`Add cohort readiness export`) kept the same verification discipline: lint, typecheck, unit tests, local build, local E2E, and targeted CE/delegated review passed before merge. PR #12 also passed the expanded local extraction fixture suite; PR #13 added E2E coverage for internal-admin validation access and non-admin denial. PR #14 added internal-admin CSV export coverage, formula-injection hardening, and cohort readiness docs.

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

## Working Style For Future Agents

- Stay focused on product validation before implementation.
- Preserve the distinction between calendar visibility and logistics coverage.
- Prefer plain parent language over polished SaaS jargon.
- Capture customer language verbatim whenever possible.
- Do not broaden the product into a generic family organizer too early.
- When brainstorming, answer WHAT to build before HOW to build it.
- Keep the product voice warmly practical: calm, caring, capable, and plainspoken.
- Use sub-agents wherever work can be safely parallelized to speed up delivery, especially for read-only research, code review, test investigation, and independent UX/security/privacy checks. Keep implementation ownership clear in the main thread so parallel work does not create conflicting edits.
- Use `test-user@example.com` as the standard FamTandem hosted test account for browser-authenticated smoke tests and cohort-style flow checks, unless the user explicitly names another account. Keep it as a test account.
- For repeated hosted user-eval runs, prefer a unique Gmail plus-address via `FAMTANDEM_USER_EVAL_EMAIL` while keeping `FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com`; the runner should only open fresh Spark magic-link emails whose `To:` line matches the login identity.
- In hosted user-eval summaries, treat `ignoredNetworkEvents` as informational only for known benign Next server-action redirect aborts and canceled `/_next/static/chunks/*.js` fetches. `networkErrors`, React page errors, framework overlays, and blank screens remain blocking.

## Compound Engineering Workflow

Use Compound Engineering v3.20 selectively. Optimize for the smallest workflow that improves FamTandem's product judgment, implementation safety, validation speed, and retained knowledge; do not run skills merely because they are available.

For meaningful, unsettled work, the proportional lifecycle is:

> Optional ideation -> requirements brainstorm in one unified plan -> proportional document review -> implementation enrichment in the same plan -> human scope approval -> implementation -> simplification and code review when warranted -> browser/polish validation when user-facing -> explicit shipping approval -> post-deploy validation -> compound reusable learning -> handoff when continuity warrants it

Skip stages whose decision or artifact is already settled. Tiny, low-risk, mechanical changes need only the checks that can catch a plausible failure.

### Artifacts and progress

- Use `ce-ideate` only when the next validation bet is genuinely unclear.
- Use `ce-brainstorm` to decide WHAT should change. In v3.20 it creates a requirements-only unified plan under `docs/plans/`; do not create a separate brainstorm artifact by default.
- Use `ce-doc-review` proportionally when requirements, plans, or other decision documents need an independent challenge.
- Use `ce-plan` to enrich that same unified artifact to implementation-ready. Keep one coherent slice, preserve settled decisions, and do not create a second plan for the same unit.
- Treat plans as decision artifacts, not execution logs. Never add mutable status fields or implementation checklists to a unified plan. Track live work in the task tracker and use diffs, commits, and Git history as durable execution evidence.
- Markdown is the default durable CE artifact format. Output modes are alternatives, not a requirement to maintain paired HTML and Markdown copies.

### Execution, quality, and retained learning

- Use `ce-work` only for an approved plan or explicitly authorized, clearly bounded slice. Native execution is the default; use a branch or worktree only when the current task authorizes the relevant Git operations.
- Use `ce-simplify-code` when a substantive implementation diff is large enough to benefit. Use `ce-code-review` for non-mechanical code changes and size the reviewer set to the actual risk. Documentation/configuration-only work may use a focused document and diff review when that provides the right evidence.
- Use `ce-test-browser` and `ce-polish` for user-facing work after local checks pass. Validate mobile-first and desktop states, copy, loading/empty/error paths, source trust, and whether the flow stays centered on coverage rather than generic scheduling.
- Fix blocking review findings and rerun the affected checks. Record a non-blocking residual in the repository's durable todo or review-finding path only when it remains actionable and is not already tracked elsewhere.
- Use `ce-compound` after a non-obvious fix, repeated failure, or reusable review lesson. Put stable engineering knowledge in `docs/solutions/`; do not turn routine completion notes into permanent documentation.
- Use `ce-handoff` when a fresh session would otherwise need to reconstruct active state, decisions, verification, or the next safe action.
- Run `ce-setup` as a diagnostic after Compound Engineering upgrades or when project configuration appears stale. Do not install optional tools or apply suggested fixes unless the current task authorizes them.

### Human and privacy gates

- Scope or implementation approval does not authorize shipping. Pushes, pull requests, deployments, hosted or provider mutations, customer contact, and post-deploy actions require explicit current authorization unless the user has already granted that exact authority for the active task.
- Local staging and commits are bounded by the current task's authority and repository workflow. Never infer permission for remote or hosted actions from permission to edit locally.
- `lfg`, mutating `ce-dogfood`, automatic PR babysitting, autonomous review/CI repair, and other hands-off execution paths are opt-in for each run. State the intended mutation and stopping boundary before requesting authorization.
- Before repository material is sent to an external model, agent harness, or model-review provider, disclose the recipient/model, harness or intermediary route, exact material to be sent, sensitive-data exclusions, and whether the recipient may mutate files. Then obtain separate, explicit authorization for that run. Invoking a skill, asking for review, configuring a peer, or presenting or acknowledging the disclosure does not itself authorize egress. Without that separate authorization, use an in-process reviewer or skip the external route. Never send credentials, secrets, real-family source text, uploaded source-artifact contents or storage paths, contact details, or other customer data.
- A configured model or peer is a routing preference, not consent to broaden scope, expose sensitive material, or mutate the repository.
- On a fresh clone or worktree, check for the ignored `.compound-engineering/config.local.yaml` before PR delivery. If it is absent, bootstrap it from the committed example and explicitly set `auto_babysit: false`, or pass `babysit:off` to `ce-commit-push-pr` for that run. Absence of local configuration never authorizes automatic PR babysitting; turning it on requires the per-run opt-in above.

### Repository-specific review guardrails

- For internal ops or monitoring snapshots, avoid deriving headline health from capped recent-row samples. Use exact counts or minimum-age queries for operational totals and reserve limited queries for recent failure examples.
- Preserve the one-narrow-slice discipline and FamTandem's validation wedge. Additional automation is justified only when it improves validation, judgment, quality, safety, speed, operational confidence, or retained knowledge.
