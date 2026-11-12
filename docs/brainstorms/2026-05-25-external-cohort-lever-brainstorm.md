---
date: 2026-05-25
topic: external-cohort-lever
---

# External Cohort Lever Decision

## What We're Deciding

FamTandem now has the first validation loop in place: pasted logistics source intake, extraction runs, source-backed cards, no-account coverage request links, internal-admin retry, validation snapshot, and validation export.

The next decision is which external-cohort lever should come first:

1. Outbound Resend email for coverage requests.
2. Outbound Twilio SMS for coverage requests.
3. Both outbound email and SMS together.
4. Daily unresolved nudges before provider-backed coverage sends.

This brainstorm answers what to build next, not how to build it.

## Product Context

The core thesis from the earlier brainstorms still holds:

> Families do not have a calendar problem. They have a logistics and coverage problem.

The strongest aha moment remains:

> A coverage request gets accepted.

The prerequisite aha is:

> FamTandem identifies an uncovered item from a messy input.

Since source-backed cards and local/manual request links now exist, the next bottleneck is whether real families can receive and respond to coverage asks in the channels they naturally use.

## Alternatives Considered

### Option 1: Resend Outbound Email First

Add real outbound email for coverage requests while keeping SMS/manual links available as non-production or copy-link fallback.

Pros:

- Lower compliance and carrier-registration burden than SMS.
- Aligns with the existing principle that email gives context.
- Good for context-rich requests where the helper needs source summary, schedule, child, location, and note.
- Resend supports idempotency keys, which fits the existing request-token model.
- Faster to test with external families than Twilio A2P SMS.

Cons:

- Email may be slower to notice than SMS.
- It is less aligned with the brainstorm principle that SMS asks for action.
- Some helpers may ignore email, especially for same-day pickup coverage.

Best when:

- The first cohort is small and partly founder-assisted.
- The team wants to validate real provider delivery without taking on SMS compliance first.
- Requests are not primarily urgent same-day asks.

### Option 2: Twilio SMS First

Add real outbound SMS for coverage requests.

Pros:

- Best channel for lightweight action.
- Closest to the intended production behavior for "Can you cover pickup?"
- Likely highest response rate for spouse/helper requests.
- Validates the most important behavior: a request gets seen and accepted.

Cons:

- Twilio setup and US messaging compliance can become the real bottleneck.
- A2P 10DLC, opt-out language, sender type, segment cost, and failed-message behavior need decisions before cohort use.
- More privacy sensitivity: SMS content must be short and avoid exposing too much family context.
- Status callbacks and failure handling can tempt scope expansion.

Best when:

- The founder already has Twilio sender/compliance path ready or is willing to handle it before the cohort.
- The first cohort depends on fast action from spouses/helpers.
- The product wants to validate real SMS response behavior immediately.

### Option 3: Email And SMS Together

Add both Resend outbound email and Twilio SMS sends in one slice.

Pros:

- Matches the long-term notification principle: SMS asks for action, email gives context.
- Gives fallback across channels.
- More complete cohort experience.

Cons:

- Too much scope for the next slice.
- Doubles provider setup, failure modes, compliance questions, and test surface.
- Makes it harder to learn which channel is actually carrying the validation value.

Best when:

- The team has provider setup, compliance, and enough engineering capacity ready.
- The slice can be split internally into two independently testable provider adapters.

### Option 4: Daily Unresolved Nudges First

Add daily unresolved nudge generation before real outbound coverage request sends.

Pros:

- Reinforces recurring planning relief.
- Avoids SMS/provider compliance temporarily if generated as an internal preview first.
- Helps default parents see what still needs coverage each day.

Cons:

- It does not directly validate the strongest aha moment.
- It can become another reminder stream without proving shared ownership.
- If coverage asks still require manual link sharing, the household handoff remains founder/default-parent mediated.

Best when:

- Families are already using manual request links successfully.
- The real pain in the cohort is repeated daily planning, not getting helpers to respond.

## Recommendation

Recommended next path: **plan Resend outbound email first, with a deliberately Twilio-compatible request sender interface and manual/SMS copy-link fallback.**

Why:

- It advances the accepted-coverage aha without taking on SMS compliance as the first provider blocker.
- It validates real provider delivery, idempotency, message content, and helper response flow.
- It keeps the next implementation slice smaller than "both channels."
- It preserves the option to add Twilio next with the same sender abstraction once sender/compliance decisions are ready.

This is a pragmatic cohort path, not a permanent product-channel decision. The long-term product likely still needs SMS because coverage asks are action-oriented. But the next engineering slice should avoid turning provider setup into the main risk before the first external families can test the loop.

## Proposed Slice Boundary

The next `ce-plan` should cover only outbound Resend email for coverage requests.

In scope:

- Provider decision doc or plan section for Resend-first rationale.
- Server-side Resend sender implementation behind the existing coverage request sender interface.
- Local/provider selector that remains safe by default and requires explicit env to send real email.
- Idempotency key based on the coverage request token or request id.
- Minimal plain-language email content with request link and compact context.
- Failure handling that does not mark coverage as accepted or covered.
- Tests with mocked Resend fetch/client behavior.
- Docs for required env vars and local/staging test behavior.

Out of scope:

- Resend inbound email.
- Twilio SMS sending.
- Twilio/Resend provider webhooks.
- Delivery-status dashboard.
- Daily unresolved nudges.
- Weekly coverage review.
- Google Calendar.
- OCR/upload extraction.
- Signed source downloads.
- Broad admin correction.
- Production provider credentials committed to code/docs.

## Risks And Guardrails

- **Provider credentials:** Keep credentials in local/hosted env only. Never paste keys into docs, PRs, or chat.
- **Privacy:** Email content must avoid raw source text and sensitive details. Use compact event/request context only.
- **Idempotency:** Use provider idempotency keys so retries do not double-send.
- **Scope creep:** Do not add inbound email or webhooks in the same slice.
- **Deliverability:** Treat early sends as cohort validation, not full production notification infrastructure.
- **Measurement:** Continue using the validation snapshot/export to track requests, responses, and accepted coverage.

## Decisions

- Start with **Resend outbound email first** as the next planned implementation slice.
- Keep Twilio SMS as the likely follow-up after sender/compliance decisions are clear.
- Do not build both providers in the same slice.
- Do not start daily unresolved nudges before real provider-backed request delivery unless cohort feedback shows manual links are already enough.
- Preserve the product distinction: provider sending exists to get coverage accepted, not to become a generic notification system.

## Open Questions For Founder

- Do you already have a Resend account and sending domain available for FamTandem?
- What sender identity should families see, for example `FamTandem <coverage@famtandem.com>`?
- Should the first cohort use real family/helper emails, or should the founder forward/copy links manually for the first few tests?
- Are there any families in the first cohort where SMS is non-negotiable from day one?
- What is the acceptable first-week email volume: roughly 10-20 families times 1-5 requests per family?

## Next Steps

Use `ce-plan` for a narrow Resend outbound coverage-request slice after the founder answers the open questions. Use `ce-review` and read-only Cursor GPT-5.5 high review before merge because the slice will touch provider sending, notification content, tokens, and privacy boundaries.
