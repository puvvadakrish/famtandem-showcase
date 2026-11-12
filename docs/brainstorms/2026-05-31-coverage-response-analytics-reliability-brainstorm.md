---
title: Coverage response analytics reliability
date: 2026-05-31
status: captured
---

# Coverage response analytics reliability

## What We Are Building

Make the existing `coverage_request_accepted` and `coverage_request_declined` analytics events reliable enough for the hosted user-evaluation funnel. The product flow already works: a recipient can open a no-account coverage link, accept coverage, and the board updates. The gap is that PostHog Activity did not show the accepted event during the post-PostHog hosted user-eval.

## Why It Matters

The beta aha moment is not just card creation. It is an uncovered item becoming covered through a lightweight ask/response loop. If acceptance is missing from analytics, the validation funnel undercounts the moment we care about most.

## Key Decisions

- Keep this narrow: repair response-funnel analytics only.
- Do not change the user-facing coverage response UX.
- Keep source/helper privacy unchanged: no raw source text, recipient email, phone number, or token value in analytics.
- Prefer server-side capture because no-account responders may not have a stable browser identity and should not need app-side JavaScript for the validation metric.
- Prefer reliable delivery over deduplication. A stable event id was tried first, but hosted PostHog Activity still did not show the accepted event. Remove the event-id override if it interferes with ingestion.
- Treat missing PostHog Activity visibility as an analytics reliability bug, not a blocker to the working product flow.

## Non-Goals

- No new PostHog dashboards in this slice.
- No broad event taxonomy redesign.
- No changes to coverage request token semantics.
- No production data cleanup.

## Success Criteria

- Unit tests prove accepted and declined response events are captured from the POST route and signed confirmation page without leaking tokens or family details.
- Existing invalid/malformed response behavior still avoids analytics capture.
- Hosted user-eval docs/todos capture whether the accepted event is visible and whether the latest run can be correlated cleanly.
- Local tests still do not call real PostHog by default.
