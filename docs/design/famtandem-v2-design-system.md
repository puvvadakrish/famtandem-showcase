# FamTandem V2 Product Design System

Last updated: 2026-05-23.

## Direction

The accepted visual direction is **The Covered Plan** with a visible thread of **Inbox Chaos to Coverage**.

FamTandem should feel like a calm, warm, practical coverage board for the overloaded default parent. It is not a marketing site, not a shared calendar replacement, and not a generic CRM dashboard. The first screen is the real product surface: what needs attention, what changed, what is uncovered, who owns what, and what source it came from.

Accepted concept reference:

- Design reference image (not included in this repo)

## ICP Design Bar

Design for a tired, capable default parent checking the app between real-life moments: after a school email, before pickup, between meetings, or at night before the next day.

The UI should create a small daily exhale:

- The parent can tell what needs a decision in under five seconds.
- Uncovered ownership is obvious before calendar detail.
- Changes and source trust are visible without hunting.
- Action buttons use plain parent language.
- The app feels friendly enough to revisit, but serious enough to trust.

## Product Surface Priority

Mobile leads the design. Desktop extends the same system; it should not introduce a separate dashboard metaphor.

Primary mobile order:

1. `Today needs attention`
2. Compact status chips: `need coverage`, `changed`, `waiting`
3. `Needs Attention` grouped coverage cards
4. `Coverage health`
5. `This Week`
6. `Add logistics`
7. `Household setup` and secondary admin controls

Bottom mobile navigation:

- Today
- Week
- Add
- Inbox
- People

## Visual Tokens

Use the existing Tailwind tokens as the product palette:

- `paper` `#f7f4ed`: app canvas.
- `cream` `#fffdf8`: primary warm surface.
- `ink` `#1f2933`: primary text.
- `graphite` `#52606d`: secondary text.
- `moss` `#315f4b`: primary action and selected state.
- `sage` `#dfe8dc`: calm selected/background state.
- `coral` `#cf4f3d`: needs coverage/uncovered.
- `amber` `#c97f1a`: changed/needs review.
- `sky` `#dcebf0`: waiting/source/email accents.
- `oat` `#efe7da`: neutral avatar/accent.
- `line` `#ddd4c5`: borders and dividers.

Avoid one-note purple, blue, slate, beige-only, or CRM-style palettes. Do not add decorative gradient blobs or orbs.

## Typography

Use clear, compact, mobile-readable typography:

- Page titles: confident, warm, plain. Example: `Today needs attention`.
- Section headings: compact and scannable. Examples: `Needs Attention`, `This Week`.
- Body copy: short parent language, not product jargon.
- Labels: sentence case where possible; avoid loud uppercase except tiny metadata labels.
- Buttons and controls must define deliberate font size, weight, line height, and minimum height.

Preferred copy:

- `A few things need a decision.`
- `Ask for coverage`
- `I'll cover pickup`
- `Mark already covered`
- `Every card keeps the source attached.`
- `Send the details. We'll turn them into coverage cards.`

Avoid:

- Polished SaaS jargon.
- Cheerleading that can feel patronizing.
- Marketing hero language inside the authenticated app.

## Components

Coverage cards:

- Useful and compact, not decorative.
- Show child/family, title, time, location, coverage state, owner/slot state, source, and confidence/review context when present.
- Keep source detail tappable through the card's source summary.
- Use status colors consistently: coral for uncovered, amber for changed/review, moss/sage for covered, sky for waiting.

Source detail:

- Lead with the source-backed trust strip.
- Show source type, received time, confidence when available, linked event/card, coverage slots, and original message.
- Preserve full source access boundaries: parents/admins only for full pasted source detail.

Add logistics:

- Present the intake choices as practical rows: paste text, upload file or screenshot, forward email.
- Paste remains the currently functional path.
- Keep future upload/forward affordances visually present but do not imply backend support until the narrow slice ships.

Empty/loading/error/permission states:

- Keep language calm and direct.
- Explain what happened and what the parent can do next.
- Do not use whimsical filler art or generic dashboard empty cards.

## Implementation Guardrails

- Preserve existing behavior and tests unless a visible UI label intentionally changes.
- Use lucide icons for nav/actions/status metaphors.
- Keep mobile text from overflowing buttons or cards.
- Keep app UI code-native; do not ship generated screenshots as UI.
- When adding new features, extend shared tokens/components instead of introducing a competing design style.
- Run screenshot checks at desktop and mobile sizes after meaningful visual changes.

