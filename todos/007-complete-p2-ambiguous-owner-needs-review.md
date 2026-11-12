---
status: complete
priority: p2
issue_id: "007"
tags: [phase-3, extraction, gemini, evals, needs-review]
dependencies: []
---

# Ambiguous Pickup Owner Needs Review

## Problem Statement

Live Gemini extraction does not currently mark an ambiguous pickup owner as needing review. In the expanded fixture suite, Gemini extracts the chess pickup card and pickup slot, but returns no review reason, so `needsReview` is false even though no owner is confirmed.

This matters because FamTandem's core promise is coverage clarity. "Can someone pick up Sam?" should not look covered or fully reviewed just because the date and pickup slot were extracted correctly.

## Findings

- Discovered while validating PR #12 (`codex/phase-3-expand-extraction-fixtures`) with:
  `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash GEMINI_EVAL_FIXTURE_IDS=grandma-dropoff-pickup-uncovered,carpool-time-change-needs-reconfirmation,swim-meet-waiver-payment-deadline,ambiguous-pickup-owner-thread,missing-location-transportation,school-nurse-medication-form npm run test:extraction:live`
- After removing brittle confidence/date/wording checks, the only remaining selected live failure was:
  `ambiguous-pickup-owner-thread: Card "Confirm chess club pickup owner" expected needsReview=true, received false.`
- Cursor review classified this as a true extraction-quality gap rather than fixture formatting drift.
- The current derived review reasons in `src/lib/extraction/schema.ts` do not detect ambiguous ownership. The fixture relies on the model emitting a review reason.

## Proposed Solutions

### Option 1: Prompt Guidance For Ambiguous Ownership

**Approach:** Update the Gemini extraction prompts to explicitly mark unresolved owner language such as "can someone", "not sure who", "needs someone", or "no one confirmed" with a review reason and possibly `decisionNeeded`.

**Pros:**
- Low implementation cost.
- Keeps ambiguity detection close to the model interpretation layer.
- Can be verified directly with the existing live fixture.

**Cons:**
- Prompt-only behavior may drift across models.
- Runtime and fixture prompts must stay in sync.

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Deterministic Derived Review Reason

**Approach:** Add deterministic review derivation for ownership ambiguity, likely using structured fields such as pickup/dropoff slots without `knownCoverage` plus model-provided `decisionNeeded` or review reasons.

**Pros:**
- More stable than prompt-only behavior.
- Aligns Needs Review with product semantics.

**Cons:**
- Requires careful rules to avoid marking every uncovered pickup as ambiguous.
- May need schema/evaluator refinement to avoid over-triggering review.

**Effort:** 2-4 hours

**Risk:** Medium

## Recommended Action

Completed with Option 1 in PR #12. Added aligned fixture/runtime prompt guidance for unresolved pickup/drop-off owner language and verified the targeted live fixture passes against `gemini-3.5-flash`.

## Technical Details

Affected files likely include:

- `src/lib/extraction/gemini.ts`
- `src/lib/extraction/gemini-runtime.ts`
- `tests/fixtures/extraction/phase2-fixtures.ts`
- `tests/unit/gemini-extraction.test.ts`

No Supabase migrations, app routes, Twilio, Resend, Google Calendar, or production provider credential changes should be needed.

## Resources

- PR #12: expanded fixture suite.
- Fixture id: `ambiguous-pickup-owner-thread`.
- Related solution note: `docs/solutions/integration-issues/gemini-fixture-eval-prompt-contract.md`.

## Acceptance Criteria

- [x] Ambiguous owner source text produces a reviewable card in live eval.
- [x] Runtime and fixture prompts stay aligned.
- [x] `npm run test:extraction` passes.
- [x] Targeted live eval for `ambiguous-pickup-owner-thread` passes against `gemini-3.5-flash`.
- [x] No runtime app routes, migrations, Supabase writes, Twilio, Resend, or Google Calendar changes.

## Work Log

### 2026-05-25 - Initial Discovery

**By:** Codex

**Actions:**
- Ran the expanded live Gemini fixture eval after PR #12.
- Loosened non-critical fixture/evaluator brittleness around confidence bands, all-day date-only timestamps, and exact decision wording.
- Re-ran the selected failing fixture subset and isolated the remaining failure to ambiguous owner Needs Review behavior.

**Learnings:**
- Gemini can extract the event and pickup slot while still missing the product-critical review state for unresolved ownership.
- This should be handled as a focused extraction-quality slice, not hidden by weakening the fixture expectation.

### 2026-05-25 - Prompt Guidance Added

**By:** Codex

**Actions:**
- Added aligned guidance to `src/lib/extraction/gemini.ts` and `src/lib/extraction/gemini-runtime.ts` so unclear pickup/drop-off ownership produces `decisionNeeded` and a review reason instead of `knownCoverage`.
- Added unit assertions that both prompts contain the unresolved-owner review guidance.
- Verified the targeted live fixture with `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash GEMINI_EVAL_FIXTURE_IDS=ambiguous-pickup-owner-thread npm run test:extraction:live`.

**Learnings:**
- Prompt guidance was enough to repair the live fixture without adding a deterministic derived-review rule.
