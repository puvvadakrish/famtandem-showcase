---
status: complete
priority: p2
issue_id: "005"
tags: [phase-2, source-inputs, review-surface]
dependencies: ["004"]
---

# Pasted Source Input Detail

## Problem Statement

Parents and household admins can see full pasted source text inside each source-backed card, but there is no dedicated source detail/review page for checking the original paste and the cards created from it.

## Recommended Action

Add a read-only household source detail route for pasted sources only:

- `/app/sources/[sourceInputId]`
- Requires authenticated active household membership.
- Allows only `parent` and `household_admin`.
- Shows source metadata, full normalized pasted text, submitter, and linked card summaries.
- Adds a board link from source-backed cards.

## Acceptance Criteria

- [x] Pasted source detail route exists and is read-only.
- [x] Helpers cannot view full pasted source detail.
- [x] Linked cards show enough card/slot/readiness context for review.
- [x] No Supabase migration, RLS change, upload/OCR, Gemini production call, Twilio, Resend, Google Calendar, or correction workflow is added.
- [x] Verification commands were run and documented; plain `npm run build` still needs env injection, while `npm run build:local` passes.

## Work Log

### 2026-05-22 - Slice Started

**By:** Codex

**Actions:**
- Created stacked branch `codex/phase-2-source-input-detail`.
- Used GPT-5.5 High sidecar review to confirm the slice boundary and tests.

**Learnings:**
- Keep this as household parent/admin review, not internal founder/admin correction. A true internal admin console needs separate routing and audit work.

### 2026-05-22 - Verification Completed

**By:** Codex

**Actions:**
- Added `/app/sources/[sourceInputId]` for pasted source detail review.
- Added `View source` links from source-backed board card details.
- Extended authenticated Playwright coverage for source detail and helper denial.
- Ran the full requested verification sequence.

**Learnings:**
- The source detail route can stay fully read-only and reuse existing RLS plus an explicit role gate.
- `npm run build` still fails in a shell without Supabase/Cron env; `npm run build:local` is the passing local Docker Supabase build path.

### 2026-05-25 - Marked Complete

**By:** Codex

**Actions:**
- Confirmed the read-only source input detail work has landed and acceptance criteria are already checked.
- Renamed the todo from ready to complete as housekeeping before the next validation slice.

**Learnings:**
- This todo was stale tracking state, not active remaining work.
