# Fix Device Session Login Persistence Plan

Date: 2026-06-07

## PR Boundary

Make FamTandem behave like a remembered device session after the first magic-link login, using the existing Supabase session cookie infrastructure.

## Scope

- Redirect authenticated `/login` visits to `/app`.
- Update login copy so users understand the link is for this device/browser and the session remains until sign-out or expiry.
- Add an explicit sign-out action from the authenticated board.
- Extend local and hosted user-eval coverage for same-context session persistence.
- Keep password login and custom device tokens out of this slice.

## Implementation Checklist

- [x] Add authenticated-user redirect in `src/app/login/page.tsx`.
- [x] Keep login error/sent states usable for unauthenticated users.
- [x] Add a server-side sign-out route or action that clears the Supabase session and returns to `/login?signedOut=1`.
- [x] Add a compact sign-out control to the board navigation/profile area without disrupting mobile-first layout.
- [x] Add/adjust unit tests for login copy, signed-out feedback, and authenticated redirect.
- [x] Add/adjust E2E coverage for login persistence and explicit sign-out.
- [x] Extend `scripts/hosted-user-eval.mjs` to assert `/login` and `/app` reopen without another magic link in the same browser context.
- [x] Update the reusable user-eval doc with the new auth persistence check.
- [x] Run lint, typecheck, unit tests, local E2E, build.
- [x] Run CE review and adversarial auth/privacy review before merge.
- [x] Deploy and rerun hosted user-eval with `test-user@example.com` mailbox.

## Local Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, 269 tests.
- `npm run build:local` — passed. One immediate post-E2E run hit transient Next `/_document` page artifact collection failure; sequential rerun passed.
- `npm run test:e2e:local -- tests/e2e/app-shell.spec.ts` — passed, 8 tests across mobile and desktop.
- `npm run test:e2e:local` — passed, 44 tests.

## Review Notes

- CE review: no blocking issues in the reviewed diff.
- Adversarial auth/privacy review: one P3 finding that `/logout` could be cross-site POSTed into a forced logout. Fixed by rejecting explicit cross-origin `Origin`/`Referer` requests before calling `supabase.auth.signOut()`, with unit coverage.

## Hosted Verification

- PR: `PR #64`
- Merge commit: `dfb6fdb fix(auth): keep signed-in devices on the board (#64)`
- Production check: `https://app.famtandem.com/login` served the new remembered-device copy after deployment.
- Hosted run 1:
  - Command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+device-session-202606071242@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=202606071242 npm run test:user-eval:hosted`
  - Result: passed.
  - Evidence: `sessionPersistenceStatus: same_context_reused_without_new_magic_link`, `coverageResponseStatus: accepted`, no console or network errors.
  - Artifacts: `output/playwright/hosted-user-eval/202606071242/`
- Hosted run 2:
  - Command: `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+device-session-helper-202606071248@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_HELPER_EMAIL=test-user+famtandem-helper-202606071248@example.com FAMTANDEM_USER_EVAL_HELPER_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=202606071248 npm run test:user-eval:hosted`
  - Result: passed.
  - Evidence: `helperInviteStatus: claimed`, `sessionPersistenceStatus: same_context_reused_without_new_magic_link`, `coverageResponseStatus: accepted`, no console or network errors.
  - Artifacts: `output/playwright/hosted-user-eval/202606071248/`

Go/no-go: go for the first beta household to continue production app usage. The remaining login caveat is browser-container specific: opening the magic link in one browser/app container and later opening FamTandem in a different browser/app container can still require sign-in because those containers do not share cookies.

## Risk Review

- Auth/session handling is privacy-sensitive. Do not add a custom persistent token.
- Do not log magic links, refresh tokens, cookies, or user emails beyond existing redacted domain/event behavior.
- Sign-out must clear the Supabase browser session and not just navigate away.
- The persistence guarantee is same browser/device context. Different browser containers may still require sign-in.

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:local
npm run build:local
CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL=test-user+device-session-<stamp>@example.com FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com FAMTANDEM_USER_EVAL_STAMP=<stamp> npm run test:user-eval:hosted
```
