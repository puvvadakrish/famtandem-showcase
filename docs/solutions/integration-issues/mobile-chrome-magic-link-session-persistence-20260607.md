# Mobile Chrome Magic-Link Session Persistence

Date: 2026-06-07

## Symptom

A real mobile Chrome diagnostic failed: after opening the Gmail magic link in Chrome, opening `app.famtandem.com` in a new Chrome tab asked for another magic link.

Automated same-page checks had passed, so the missing coverage was the physical-user shape: email link -> Chrome session establishment -> new Chrome tab.

## Cause

The auth routes verified or exchanged Supabase email-link credentials, then returned a new redirect response. That can miss the critical requirement that the Supabase auth cookies must be written onto the exact response returned to the browser.

The fix creates a route-handler Supabase client that receives the `NextRequest` and the final `NextResponse`, then writes Supabase cookies onto that response.

## Fix

Changed:

- `src/lib/supabase/route-handler.ts`
- `src/app/auth/confirm/route.ts`
- `src/app/auth/callback/route.ts`
- `src/lib/auth/redirect.ts`
- `tests/unit/auth-email-routes.test.ts`
- `tests/unit/auth-redirect.test.ts`
- `tests/e2e/app-shell.spec.ts`
- `scripts/hosted-user-eval.mjs`

The same slice also hardened auth `next` redirects against backslash/control-character origin escape tricks found during adversarial review.

## Verification

Local:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed, 278 tests.
- `npm run test:extraction` passed.
- `npm run build:local` passed.
- `npm run test:e2e:local -- tests/e2e/app-shell.spec.ts` passed across mobile and desktop, including reopened-tab session persistence.
- `npm run test:e2e:local` passed before the redirect-helper hardening; auth-focused E2E was rerun after.

Hosted:

- PR #67 merged as `00ddf0b`.
- PR #68 merged as `ac2f7bf` to keep the hosted eval compatible with the collapsed helper disclosure.
- PR #69 merged as `e8bdb47` to treat canceled PostHog `/ingest/flags/` polling as an ignored hosted-eval network event.
- Clean hosted run `202606071653-mobile-auth5` passed against `https://app.famtandem.com`.
- Hosted summary recorded `sessionPersistenceStatus=same_context_new_tab_reused_without_new_magic_link`.
- The same hosted run added three children, submitted three synthetic logistics sources, verified generated linked cards, created one coverage response link, accepted it on mobile, and ended with empty `consoleErrors` and `networkErrors`.

## Operating Notes

- Use unique Gmail plus-addresses for repeated hosted user-eval runs while keeping `FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com`.
- A single hosted run `202606071649-mobile-auth4` hit a transient `POST /app` 500 during source submission after the first source succeeded. The next fresh run passed the same flow end to end, so it is not treated as the auth fix blocker.
- The family handoff recommendation is still guarded: parents should review generated cards against the source before using coverage asks.
