# Fix Mobile Chrome Auth Cookie Persistence Plan

Date: 2026-06-07

## Goal

Fix the real-device failure where a parent signs in from a Gmail magic link on mobile Chrome, then opening FamTandem in a new Chrome tab asks for another magic link.

## Boundary

Keep this narrow to auth session persistence. Do not introduce passwords, new auth providers, custom remember-me tokens, or broader login redesign.

## Plan

- [x] Add a route-handler Supabase client that binds cookie writes to the returned `NextResponse`.
- [x] Update `/auth/confirm` token-hash magic links to return the response that received Supabase cookies.
- [x] Update legacy `/auth/callback` code links the same way.
- [x] Add unit coverage proving successful auth redirects carry `Set-Cookie`.
- [x] Add local E2E coverage for opening `/app` in a new tab after sign-in.
- [x] Strengthen hosted user-eval session persistence to include a new-tab check.
- [x] Run lint, typecheck, unit tests, focused E2E, and build before deploy.
- [x] Run CE review/adversarial auth review before merge.
- [x] Run hosted eval after deploy.
- [x] Compound the learning in docs after verification.

## Local Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test -- tests/unit/auth-email-routes.test.ts` — passed.
- `npm test` — passed, 278 tests after the redirect hardening.
- `npm run test:extraction` — passed.
- `npm run build:local` — passed.
- `npm run test:e2e:local -- tests/e2e/app-shell.spec.ts` — passed, 8 tests across mobile and desktop.
- `npm run test:e2e:local` — passed, 44 tests across mobile and desktop.
- Adversarial auth review found a P2 open-redirect edge in `safeAuthRedirectPath`; fixed by rejecting backslashes/control characters and adding route/helper regression tests.
- A later parallel `build:local` + Playwright run hit the known local `.next` artifact race. After `rm -rf .next`, sequential `npm run build:local` and `npm run test:e2e:local -- tests/e2e/app-shell.spec.ts` both passed.

## Hosted Verification

- PR #67 merged as `00ddf0b`.
- Follow-up PR #68 merged as `ac2f7bf` to open the collapsed helper disclosure in hosted user-eval.
- Follow-up PR #69 merged as `e8bdb47` to ignore only benign canceled PostHog `/ingest/flags/` feature-flag polling.
- Hosted run `202606071653-mobile-auth5` passed against production.
- Key auth evidence: `sessionPersistenceStatus=same_context_new_tab_reused_without_new_magic_link`.
- Full product evidence: three children added, three pasted logistics sources extracted into linked cards, one coverage ask created, mobile response accepted, `coverageResponseStatus=accepted`, and no blocking `consoleErrors` or `networkErrors`.

## Review Risks

- Auth cookies must be set only after a successful token exchange.
- Failure redirects should not continue into the app.
- Explicit sign out must still clear the session.
- The fix must not depend on real provider calls in local tests.
