---
date: 2026-05-28
topic: beta-next-phase-recommendation
---

# Beta Next Phase Recommendation

## What We're Building

For the next FamTandem development phase, optimize the first two beta families around one narrow weekly loop:

1. Submit real logistics inputs.
2. See source-backed cards.
3. Identify one uncovered responsibility.
4. Ask the right person for coverage.
5. Record whether the request reduced follow-up and mental tracking.

The next phase should not expand into SMS, inbound email, Google Calendar, signed downloads, or a broad admin console yet. The app already has enough backend foundation to learn, but the rendered flow still makes the default parent work too hard to know what to send, what happened to uploads, where stalled sources live, and how to send the first coverage ask.

## Research Inputs

Reviewed:

- `AGENTS.md` and `CLAUDE.md`
- Major brainstorms for positioning, first product shape, and external cohort leverage
- Hosted cohort readiness runbook and cohort checklist
- Recent onboarding and validation plans
- Current app code for board, intake, source detail, request, notification, and ops surfaces
- Local rendered app screens captured under `test-results/beta-next-phase-screens/`

The strongest prior product decision still holds: FamTandem should prove shared coverage relief before broadening into calendar, inbox, or household organizer features.

## UX Friction From Screens

- Empty board onboarding is much clearer than before, but the first real input still depends on parent discipline: paste works immediately; uploads can still feel like they should create cards even when PDF/image OCR is disabled or waiting for review.
- There is no parent-facing source inbox or queue. A source can be reached after paste/upload redirect or from a linked card, but a family cannot easily return to all submitted sources, stalled extraction, upload text review, or no-card sources.
- The primary board CTA says `Ask for coverage`, but the real request composer is inside each slot's `Manage coverage` details. On mobile, this is discoverable only after scrolling and expanding nested controls.
- The request composer is flexible but dense. For a first beta week, the parent needs one guided happy path: choose Alex, email request or create link, add optional note, send/copy.
- Desktop and mobile preserve the coverage-board concept, but secondary chrome still contains placeholder navigation (`Inbox`, `People`, `Settings`) that does not map to real pages.
- Notifications and weekly/daily rhythm exist as backend/operator machinery, but there is no household-admin UI to opt in, preview, or understand what will be sent.

## Gaps Blocking Learning From Two Families

The highest-risk learning blockers are not Twilio or Google Calendar. They are:

- Families may submit screenshots/PDFs and not understand whether they need to paste text too.
- The founder/default parent may lose track of sources that produced no cards, need review, or are waiting for upload text approval.
- The default parent may create cards but not send a real coverage ask because the ask flow is hidden and too form-like.
- Weekly learning may be scattered unless the app nudges the operator/default parent to run the same test loop and capture the truth metric.

## Recommended Sequence

### Slice 1: Parent Source Inbox And Review Queue

Add a real parent-facing `Inbox` surface that lists submitted sources, extraction status, linked card count, upload text review state, and next action. This should include paste, upload, no-card, failed, pending, and needs-review sources, without exposing raw source to helpers.

Why first: it closes the biggest real-week hole in the current app. Families can send sources, but they cannot reliably manage what happened next.

### Slice 2: Guided First Coverage Ask

Make the first coverage request a top-level card action instead of a nested management task. A parent should be able to tap `Ask for coverage`, select the slot/person/channel, and send/copy with minimal fields.

Why second: the core aha is still "a request gets accepted." The current backend supports it, but the UI hides it behind `Manage coverage`.

### Slice 3: Upload Expectations And OCR Review UX

Tighten upload copy and source-detail states so PDF/image uploads clearly say whether cards will be created automatically, whether text extraction is disabled, whether text is awaiting review, and what the parent should do next.

Why third: upload is important for real family inputs, but it should not outrank the coverage ask unless beta users immediately hit screenshot/PDF friction.

### Slice 4: Beta Week Operator Checklist

Add a small internal-admin or household-admin beta-week checklist focused on the two-family loop: sources submitted, cards created, one ask sent, response recorded, truth metric captured. This can reuse validation data and avoid a broad admin console.

Why fourth: it improves learning quality without building a product feature that families may not need long-term.

### Slice 5: Notification Opt-In Preview

Add a narrow household-admin UI to opt into daily unresolved and weekly coverage emails, preview the compact item list, and keep sends disabled by default.

Why fifth: daily/weekly emails are useful, but for two families they should follow once the manual weekly loop proves the summaries are wanted and not noisy.

## Deferred

- Twilio/SMS until email/manual links fail to get responses or urgency becomes the blocker.
- Resend inbound email until paste/upload friction is proven to be the limiting factor.
- Google Calendar until families trust coverage cards and ask flows.
- Signed downloads until parents need raw artifact retrieval, not just source trust.
- Broad admin console until the two-family operator loop exceeds the current validation/ops surfaces.

## Key Decision

Recommended first plan: **Parent Source Inbox And Review Queue**.

It is the narrowest slice that improves real-week beta reliability without provider or compliance expansion. It also supports upload/OCR learning, extraction quality learning, and founder-assisted correction while preserving source privacy boundaries.

## Next Steps

Choose which slice to plan first with `ce-plan`.
