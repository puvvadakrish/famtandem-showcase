---
date: 2026-05-27
topic: child-profile-context-field
---

# Child Profile Context Field

## What We're Building

Child profiles need one lightweight optional field beyond name so parents can recognize which kid a logistics card belongs to. The field should work for toddlers, preschoolers, school-age children, and sports/activity groupings without collecting more sensitive personal data than the product needs.

This field is not currently used for eligibility, scheduling logic, personalization, or provider routing. It is a parent-facing context label.

## Why This Approach

The original `Grade` prompt is too narrow for toddlers, daycare, preschool, homeschool, camp groups, and sports age bands. A date of birth is too precise for the current product need and creates unnecessary privacy burden. A structured age/grade selector would look tidy, but it adds complexity and still fails edge cases like `U10 soccer`, `Butterfly room`, `Pre-K`, or `aftercare`.

For beta, the best fit is a bounded free-text label: parents can enter `2 years old`, `Toddler`, `Daycare`, `Pre-K`, `3rd grade`, or `U10`. The UI should make the intent obvious through the label and examples, while keeping the field optional.

## Key Decisions

- Use a context label, not DOB: FamTandem only needs enough child context to make logistics cards recognizable.
- Keep the field optional: child name is the required identifier; context helps but should not block setup.
- Prefer bounded free text over a dropdown for beta: the data is display/context only, and real family labels vary widely.
- Avoid the narrow word `Grade` as the main prompt: it excludes toddlers and non-school logistics.
- Suggested parent-facing label: `Age, grade, or group`.

## Open Questions

- None for the beta slice.

## Next Steps

→ Update the existing child setup prompt from `Grade, class, or age group` to the simpler `Age, grade, or group`, with examples that include toddlers and sports.
