---
title: Gemini Fixture Eval Prompt Contract Repair
category: integration-issues
status: documented
problem_type: test_failure
components:
  - extraction
  - gemini
  - fixture-evals
related_prs:
  - 6
tags:
  - code-review
  - llm
  - prompt-contract
  - extraction
created_at: 2026-05-25
---

# Gemini Fixture Eval Prompt Contract Repair

## Problem

The live Gemini fixture evaluator failed against both `gemini-2.5-flash` and `gemini-3.5-flash` even though the runtime Gemini extraction path could return schema-valid cards. The failing path lived in `src/lib/extraction/gemini.ts`, which used an older prompt than the runtime extractor and asked the model to satisfy fixture expectations that were sometimes absent from the synthetic source text.

## Symptoms

- Gemini returned extra fields or omitted required fields because the fixture prompt did not explicitly state required and optional fields.
- Some cards failed because expected child names were never present in the source.
- Relative dates, upload fixtures, already-covered transportation, RSVP decisions, and change/update cards drifted across model runs.
- Some failures were not product failures but brittle eval expectations, such as capitalization differences in titles or harmless wording differences in readiness labels.

## Root Cause

The runtime path had already been repaired with a full output-shape template, explicit required/optional annotations, and a no-extra-fields instruction. The fixture-eval prompt had not received the same contract. At the same time, the synthetic fixtures mixed two kinds of expectations:

- Important extraction invariants: card count, logistics timing, coverage slots, readiness items, known coverage, changes, decisions, confidence bands when meaningful, and review-trigger behavior.
- Brittle wording or invented-data checks: exact title casing, exact prep-label phrasing, child names absent from the source, and strict `event` versus `change_standalone` classification when changed fields were the real signal.

## Working Solution

Repair the fixture-eval path in three layers:

1. Update `buildGeminiExtractionPrompt` to match the runtime prompt contract.
   - Return JSON only.
   - Use the active `family-logistics-v1` schema version.
   - Do not add fields outside the output shape.
   - State required card fields and optional card fields.
   - Omit optional fields when not applicable and do not emit nulls.
   - Explain date handling, already-covered transportation, RSVP decisions, deadline readiness, and change detection.

2. Fix fixtures so expected facts are grounded in source text.
   - Do not require child names unless the source names a child.
   - Add explicit dates where the expected output requires exact dates.
   - Add enough context for already-covered carpool and school-bus cases.
   - Keep upload fixtures as already-extracted document text for eval purposes.

3. Make the evaluator robust to harmless model wording.
   - Match titles by normalized/token overlap when logistics facts align.
   - Accept semantic readiness-label matches like `Complete the supply checklist` for `Complete supply checklist`.
   - Treat `event` and `change_standalone` as compatible only when changed fields are explicitly expected.
   - Preserve strict checks for extra cards, extra readiness items when none are expected, wrong slots, missing changed fields, missing known coverage, and missing review triggers.

## Verification

Run local contract tests first:

```bash
npm run test:extraction
npx vitest run tests/unit/gemini-extraction.test.ts tests/unit/extraction-fixtures.test.ts
```

Then run the live eval with a local-only Gemini key:

```bash
set -a && source .env.local && set +a
GEMINI_EXTRACTION_MODEL=gemini-3.5-flash npm run test:extraction:live
```

Do not paste or commit `GEMINI_API_KEY`. Keep credentials in `.env.local` or the local shell only.

## Prevention

- Keep runtime and fixture prompts in sync whenever the extraction schema contract changes.
- Fixture expected outputs should not include facts absent from `sourceText`.
- Prefer exact checks for product-critical structure and semantic checks for parent-facing wording.
- When a live model produces schema-valid but differently phrased output, decide whether the issue is a real extraction failure or an eval brittleness failure before tightening prompts.
- Keep Gemini off by default; `EXTRACTION_PROVIDER` should continue to default to `local-stub`.

## Related Files

- `src/lib/extraction/gemini.ts`
- `src/lib/extraction/gemini-runtime.ts`
- `src/lib/extraction/eval.ts`
- `tests/fixtures/extraction/phase2-fixtures.ts`
- `tests/live/gemini-extraction-live.test.ts`
- `tests/unit/gemini-extraction.test.ts`
- `tests/unit/extraction-fixtures.test.ts`
