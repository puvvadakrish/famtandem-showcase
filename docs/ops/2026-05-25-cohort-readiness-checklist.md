# FamTandem Cohort Readiness Checklist

This checklist is for the first 10-20 family validation cohort. It keeps the test centered on whether FamTandem reduces default-parent logistics load, not whether the app has every future integration.

## Recruit

- Target dual-income or high-complexity households with 2+ kids and regular school, sports, appointment, class, or caregiver logistics.
- Prefer families already juggling email, texts, screenshots, PDFs, and calendar invites.
- Ask each household for one default parent and, when possible, one spouse/helper who can respond to coverage requests.
- Avoid families that need medical, legal, custody, or financial document handling in the first cohort.

## Intake Ask

Ask each household to send 3-5 recent logistics inputs:

- School schedule or announcement.
- Sports/team schedule or change notice.
- Class registration or recital/performance notice.
- Appointment reminder.
- Camp, payment, permission slip, form, supply, or readiness note.
- Screenshot or copied text for a carpool or caregiver handoff.

Use paste intake first. Uploads can capture metadata and files, and uploaded text/OCR can produce reviewable source text only after artifact upload finalization. Text extraction for plain-text uploads is deterministic; PDF/image OCR remains opt-in through Gemini and disabled by default. Parent/admin approval is required before uploaded text queues logistics extraction/card creation.

For the first beta households, the app should show the beta setup panel on an empty board. Families should use paste/upload from `/app`; Gmail connection, Google Calendar, and email forwarding are not available yet.

## Privacy Guardrails

- Tell families not to send detailed medical, legal, financial, custody, or highly sensitive records during early testing.
- Ask them to redact unrelated names, phone numbers, account numbers, and private notes when practical.
- Do not paste Gemini keys, provider credentials, token links, or raw private source contents into docs, chats, or PRs.
- Keep all review and export access limited to active `internal_admins`.
- Exported validation CSV is aggregate/cohort operations data. Treat household names as private customer data.

## Weekly Operating Loop

1. Ask each household to submit fresh logistics inputs early in the week.
2. Review `/app/admin/validation` for inputs, source-backed cards, needs-attention cards, coverage requests, and responses.
3. Review `/app/admin/ops` for failed or stale jobs, extraction failures, upload text/OCR failures, notification failures, and coverage-request send failures.
4. Check source detail pages for failed or Needs Review extraction runs before families rely on the board.
5. Ask the default parent to identify one uncovered item and send a coverage request through the app.
6. When helper/spouse email is available and Resend is configured, use email delivery; otherwise use the manual response link fallback.
7. If the household is opted into daily unresolved nudges, check `notification_runs` for a `daily_unresolved` run and confirm the default parent received only compact coverage-status context.
8. If the household is opted into weekly coverage reviews, check `notification_runs` for a `weekly_coverage_review` run at the configured send weekday/hour and confirm the email summarizes only uncovered, pending, changed, due-soon, or needs-review logistics for the upcoming week.
9. Confirm whether the spouse/helper accepted, declined, or required a manual follow-up.
10. Export the validation CSV and keep it with weekly interview notes.
11. Ask the truth-metric question: "Did this reduce the number of times you had to ask, remind, clarify, or hold the plan in your head this week?"

## Success Signals

- Families submit at least 3 real logistics inputs per week.
- Most inputs create source-backed cards without manual card authoring.
- FamTandem identifies at least one uncovered or ambiguous ownership item per household.
- Coverage request links get accepted or declined without account creation.
- Daily unresolved nudges surface a small number of truly uncovered, changed, pending, or due-soon items without exposing raw sources.
- Weekly coverage reviews help the default parent catch upcoming uncovered, uncertain, changed, or due-soon logistics before the week starts.
- Default parents report fewer repeated reminders, clarifications, or mental tracking moments.
- Families use plain-language relief statements close to: "I no longer have to ask who is handling what."

## Stop Or Rework Signals

- Families cannot figure out what to send.
- Extracted cards frequently require heavy founder correction before the board is useful.
- Helpers do not understand request links or cannot respond from mobile.
- Coverage requests do not reduce follow-up messages.
- Daily nudges become noisy, duplicate, or include already-resolved items.
- Weekly reviews become a generic calendar digest instead of a short unresolved-logistics planning summary.
- Sensitive source content is too hard to avoid or redact in real usage.

## Still Out Of Scope

- Production Twilio SMS sends.
- Resend inbound email and provider webhooks/status callbacks.
- Google Calendar import or write-back.
- Default-on OCR/text extraction from uploaded PDFs/images.
- Signed source artifact downloads.
- Broad admin correction workflows.
- Hosted production provider credentials.
