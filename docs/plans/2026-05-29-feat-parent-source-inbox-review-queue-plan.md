---
title: "feat: Add parent source inbox review queue"
type: feat
status: complete
date: 2026-05-29
origin: docs/brainstorms/2026-05-28-beta-next-phase-recommendation-brainstorm.md
---

# feat: Add Parent Source Inbox Review Queue

## Overview

Build the next narrow FamTandem beta slice: a parent-facing source inbox and review queue. This is the missing control surface between "families submit real logistics inputs" and "the board has trustworthy source-backed cards."

The original product plan was not "build a calendar." It was:

1. Capture scattered family logistics inputs.
2. Turn them into source-backed cards.
3. Surface uncovered/changed/uncertain logistics.
4. Let the default parent ask the right person for coverage.
5. Measure whether this reduces reminders, follow-up, and mental tracking.

Most backend foundations now exist: paste, upload metadata, OCR/text extraction, extraction runs, card creation, parent correction, request links, Resend coverage email, daily/weekly notification jobs, hosted ops, and self-serve household onboarding. The next blocker is that parents cannot easily see what happened to each submitted source, especially uploads, failed/no-card extraction, and review-needed text.

## Current State

Built and verified enough for hosted beta:

- Auth/household onboarding and member joining.
- Mobile-first coverage board with Needs Attention and This Week.
- Paste source intake that can run extraction and create cards.
- Upload file/screenshot/PDF metadata and private artifact storage.
- Upload text/OCR extraction with parent/admin approval before card creation.
- Source detail page for one source, parent/admin only.
- Parent/household-admin card correction.
- Manual and Resend-backed coverage requests.
- No-account response links.
- Daily unresolved and weekly coverage review backend jobs, disabled by default.
- Internal-admin validation and ops snapshots.
- Hosted Supabase/Vercel beta environment with repaired auth email templates.

Still weak for real beta use:

- No parent-facing list of all submitted sources.
- No clear place to find sources that produced no cards.
- Uploads can be confusing when OCR is disabled, pending, failed, or waiting for approval.
- Board navigation includes "Inbox" affordances that do not map to a real surface.
- The first coverage ask is still too buried inside card/slot management.

## Recommendation

Build **Parent Source Inbox And Review Queue** first.

Why this comes before the next bigger features:

- It supports the original "family logistics inbox" wedge without building inbound email or Gmail.
- It improves beta reliability for the two-family loop immediately.
- It makes upload/OCR useful without implying every screenshot/PDF instantly becomes a card.
- It gives the default parent a place to recover from extraction failures or no-action results.
- It preserves privacy boundaries: helpers should not get raw source text or artifact details.

## PR Boundaries

Do not bundle this with guided coverage ask, notification opt-in, Google Calendar, inbound email, or SMS.

### PR 1: Source Inbox Route And Navigation

Add a real `/app/inbox` parent/admin route.

In scope:

- Route guarded by normal auth plus same-household membership.
- Parent and household-admin access only; helpers get `notFound()` or a plain denied state consistent with source detail.
- Query same-household `source_inputs` with:
  - source type
  - subject/title
  - status
  - received/created/updated timestamps
  - linked card count
  - latest extraction run status/card count/no-action reason/last error
  - upload artifact count and text extraction status summary
- Render a compact mobile-first queue using the V2 design system.
- Add real navigation from existing board `Inbox` affordances to `/app/inbox`.
- Keep list rows privacy-bounded: no raw source text, artifact paths, checksums, token hashes, provider payloads, emails, or storage URLs.
- Row actions link to existing `/app/sources/[sourceInputId]`.

Out of scope:

- No raw artifact downloads.
- No signed URLs.
- No bulk retry/approve actions.
- No helper inbox.
- No inbound email/Gmail.
- No provider configuration changes.

### PR 2: Shared Source Review State Helper

Add a small shared helper used by `/app/inbox` and source detail to classify parent-facing source states.

State examples:

- `Reading source`
- `Cards created`
- `Needs review`
- `Ready to approve text`
- `No actionable cards found`
- `OCR disabled or unavailable`
- `Extraction failed`
- `Upload still finalizing`

This should derive from existing rows, not add a new database state machine.

In scope:

- `src/lib/source-review-state.ts` or similar.
- Unit tests for paste, upload, failed extraction, no-action, review-needed, and created-card cases.
- Source detail copy can reuse the helper where it reduces duplicated logic.

Out of scope:

- No schema changes unless a specific missing field is discovered.
- No broad source lifecycle rewrite.

### PR 3: Source Inbox E2E And Mobile Polish

Add focused E2E coverage and visual QA for the new inbox.

In scope:

- Household admin sees source inbox after paste/upload.
- Parent/admin can open source detail from a queue row.
- Helper cannot access the inbox or source detail.
- Upload queue state explains whether text needs approval before cards appear.
- Mobile viewport screenshot/manual check for overflow, button wrapping, and design consistency.

Out of scope:

- No live Gemini/OCR in default E2E.
- No real provider sends.

## Later Slices

After the source inbox lands, the next build sequence should be:

1. **Guided First Coverage Ask**  
   Make `Ask for coverage` a top-level, guided card action. The parent should pick slot/person/channel and send/copy with minimal fields. This directly serves the strongest aha moment: a request gets accepted.

2. **Upload Expectations And OCR Review UX**  
   Tighten upload and source-detail copy/states after the inbox establishes where stalled uploads live. Keep OCR provider opt-in and review-gated.

3. **Notification Opt-In Preview**  
   Add household-admin UI to enable/disable daily unresolved and weekly coverage emails, preview the compact item list, and keep sends disabled by default.

4. **Beta Week Operator Checklist**  
   Add a small internal-admin or household-admin checklist around the validation loop: sources submitted, cards created, ask sent, response accepted/declined, truth metric captured.

Do not start yet:

- Twilio/SMS.
- Resend inbound email.
- Gmail or broad inbox scanning.
- Google Calendar.
- Provider webhooks/status callbacks.
- Signed downloads.
- Broad admin correction.
- Full notification preference center.

## Implementation Notes

### Data Loading

Prefer server-side route data loading with the normal Supabase SSR client and existing RLS.

Use limited selects:

- `source_inputs(id, source_type, raw_subject, status, received_at, created_at, updated_at)`
- `coverage_cards(id)` filtered by `source_input_id`
- `extraction_runs(status, provider, model, card_count, no_action_reason, last_error, started_at, finished_at)`
- `source_artifacts(id, original_file_name, mime_type, text_extraction_status, text_extraction_error, created_at)`

Avoid selecting:

- `source_inputs.normalized_text` for the list page.
- `source_artifacts.storage_path`.
- checksums, token hashes, provider payloads, raw artifacts, or emails.

### UI

Follow `docs/design/famtandem-v2-design-system.md`.

Mobile order:

- Header: `Source inbox`
- Short copy: "Track what FamTandem read, what created cards, and what needs review."
- Filter chips: `Needs review`, `Reading`, `Created cards`, `No cards`, `Failed`
- Queue rows grouped or sorted by newest/update-needed first.
- Each row shows title, source type, status, card count, last update, and one next-action line.
- Primary row action: `Review source`.

Use plain parent language. Avoid operations terms like "job", "artifact", "provider", or "RPC" in the parent UI.

### Privacy

- Parent/admin inbox list may show source title, source type, and coarse status.
- Full source text remains only on source detail for parent/admin/internal-admin.
- Helpers must not access the inbox or source detail.
- Public response links must remain source-private.
- Do not add signed artifact downloads.

### Tests

Unit:

- Source review state helper maps row combinations to correct labels and priority.
- Inbox row component does not render raw source text or artifact internals.

Local DB / E2E:

- Admin can see paste and upload sources in `/app/inbox`.
- Source row links to `/app/sources/[sourceInputId]`.
- Helper is denied.
- Upload with review-needed text shows the approval next action.
- Failed/no-action extraction states are visible without leaking provider internals.

Default tests must not call real providers.

Suggested verification:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

## Review Requirements

Run `ce-review` before merge.

Run read-only Cursor GPT-5.5 high review before merge if the implementation touches any of:

- RLS or `SECURITY DEFINER` RPCs.
- Source privacy.
- Storage/artifact fields.
- Extraction runs/jobs.
- OCR/text approval.
- Provider configuration or provider sends.

For PR 1 as planned, Cursor review is recommended because the route touches source privacy and helper visibility.

## Acceptance Criteria

- [x] Parent/household-admin can open `/app/inbox` and see submitted sources for the current household.
- [x] Helpers cannot access `/app/inbox`.
- [x] The board's Inbox navigation points to the real route.
- [x] Each source row shows a clear parent-facing status and next action.
- [x] Sources with no cards, failed extraction, pending extraction, or upload text needing approval are findable.
- [x] Inbox list does not expose raw source text, artifact paths, storage URLs, checksums, token hashes, emails, or provider payloads.
- [x] Source detail remains the place for parent/admin raw source review and upload text approval.
- [x] Local/default verification passes without real Gemini, OCR, Resend, Twilio, or other provider calls.

## Post-Deploy Monitoring & Validation

After deploy:

- Check `/app/inbox` as the founder household and one beta household.
- Submit one paste source and confirm it appears with card count/status.
- Upload one text/PDF/image source and confirm the row explains whether text review is needed.
- Confirm helper account access is denied.
- Watch Vercel logs for `/app/inbox` errors and source-detail navigation errors.
- Watch `/app/admin/ops` for extraction/upload failures that should now be visible to parents through the inbox.

Healthy signal:

- Beta parent can answer "what happened to the thing I sent?" without founder/database help.

Failure signal:

- Parents still cannot find stalled/no-card sources, or the inbox exposes raw source/artifact internals.

Rollback:

- Remove or hide the `/app/inbox` navigation link and rely on existing source-detail redirects from paste/upload until fixed.

## Sources

- `AGENTS.md`
- `CLAUDE.md`
- `docs/brainstorms/2026-05-19-famtandem-first-product-shape-brainstorm.md`
- `docs/brainstorms/2026-05-25-external-cohort-lever-brainstorm.md`
- `docs/brainstorms/2026-05-28-beta-next-phase-recommendation-brainstorm.md`
- `docs/design/famtandem-v2-design-system.md`
- `docs/ops/2026-05-26-hosted-cohort-readiness-runbook.md`
- `docs/solutions/documentation-gaps/famtandem-phase-0-3-validation-loop-summary.md`
- `docs/solutions/integration-issues/upload-ocr-approval-gated-extraction-20260526.md`
- `src/app/app/page.tsx`
- `src/app/app/sources/[sourceInputId]/page.tsx`
- `src/lib/source-detail-state.ts`
- `src/components/board-shell.tsx`
