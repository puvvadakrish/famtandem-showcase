---
title: Login Screen And Optional Password Auth
type: feat
status: active
date: 2026-06-03
---

# Login Screen And Optional Password Auth

## Recommendation

Improve the login screen now, but keep email sign-in links as the primary beta path. Do not replace magic links with passwords.

If password auth is added, make it an optional secondary path for returning users who want fewer Gmail round trips. Passwords should not be required for first-session family setup, spouse/helper onboarding, or coverage-response links.

## Why

The current login works but feels generic and still uses `magic link` language. For a real family handoff, the screen should feel like the doorway to the coverage board, not a technical auth form.

Passwords can reduce repeated email switching, but they also add reset, weak-password, lockout/rate-limit, account-existence, and support flows. For the current cohort phase, the smaller valuable slice is a clearer mobile-first email-link screen. Optional password auth is the next slice only if repeated sign-in friction is real after the user and spouse start using production.

## Current State

- `src/app/login/page.tsx` renders a compact magic-link-only login card.
- `src/app/login/actions.ts` lowercases the submitted email, calls `supabase.auth.signInWithOtp`, captures only `email_domain`, and redirects to `sent=1`.
- `src/app/auth/confirm/route.ts` is the app-owned token-hash confirmation route and must remain intact.
- `src/app/auth/callback/route.ts` remains a backward-compatible PKCE/code callback for local/default Supabase links.
- Local E2E tests read Mailpit links shaped like Supabase `/auth/v1/verify`.
- Hosted user-eval expects delivered auth emails to contain `/auth/confirm?...` links and must track the visible login CTA when that copy changes.

## Research Notes

- Supabase supports password-based auth through `signUp`, `signInWithPassword`, `resetPasswordForEmail`, and `updateUser`, and says SSR apps use PKCE-style flows for email confirmation and recovery.
- Supabase email-link auth already matches the current implementation: `signInWithOtp` sends a magic link by default, and SSR token-hash email templates should land on an app route that calls `verifyOtp`.
- Supabase Auth has rate limits for OTP, signup, recovery, token refresh, verification, and MFA challenge endpoints; UI should continue mapping expected auth-provider failures into calm retry states.
- Supabase stores password hashes with bcrypt, but password auth still requires good UX around password reset and safe failure messages.
- OWASP guidance reinforces strong password controls, generic authentication responses, login throttling, and MFA where practical.

Primary references:

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/password-security
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

## PR Boundary

Recommended PR 1: login screen redesign only.

- Keep current `signInWithOtp` behavior.
- Rename visible copy away from `magic link` to parent-friendly `email sign-in link`.
- Preserve all existing success/error routes.
- Update unit/E2E selectors for the new CTA.
- Run full local auth and UI verification.
- Deploy and run hosted user-eval if auth selectors or delivered email behavior changed.

Optional PR 2: password auth as secondary path.

- Add password sign-in and password setup/reset flows.
- Keep email link as primary and fallback.
- Use server actions and the existing Supabase SSR client; do not write sessions through ad hoc browser-only auth plumbing.
- Add hosted Supabase configuration checks for email/password provider, password policy, email confirmation, recovery redirect URLs, and rate limits.
- Run CE review and a specialized auth/privacy review before merge.

## Login Screen Design Direction

Use the existing V2 design system rather than a new visual concept. This is a small UI redesign inside an established product surface, so no generated image concept is required before implementation.

Default state:

- Brand: `FamTandem`.
- Heading: `Open your coverage board`.
- Supporting copy: `We'll email a secure sign-in link. No password to remember.`
- Email field label: `Email`.
- Primary CTA: `Email me a sign-in link`.
- Small trust copy: `Use the email you want tied to your household.`

Sent state:

- Heading or status: `Check your email`.
- Show the submitted email.
- Tell the user to open the newest FamTandem email.
- Keep the email field available for typo correction and resending.
- In local development only, keep Mailpit guidance.

Error states:

- Rate limited: keep the current calm retry guidance.
- Send failed: check address and try again.
- Invalid link: send a new link.
- Expired/reused link: send a new link and open the newest email.
- If password auth is added, password failures must remain generic and should not reveal whether the account exists.

Visual rules:

- Use `paper`, `cream`, `moss`, `sage`, `line`, `ink`, and `graphite`.
- Avoid a marketing landing page, decorative blobs, or a broad SaaS hero.
- Keep mobile first: email field and CTA visible without hunting.
- A small coverage-preview strip is acceptable if it reinforces `Needs coverage`, `Changed`, and `Waiting`; do not make it decorative or dense.
- Use accessible status/alert semantics for sent and error states.

## Optional Password UX

If we add passwords, the preferred model is:

- Primary tab/path: `Email link`.
- Secondary path: `Use password instead`.
- New or unconfirmed users still get email confirmation before household data access.
- Password setup can be offered after email-link sign-in as `Set a password for faster sign-in`.
- Password reset uses email recovery and lands on an app-owned reset/update-password route.
- Password change for signed-in users should require current password where supported.

Do not add:

- SMS login.
- Passkeys.
- Social login.
- MFA enforcement.
- Admin-created passwords.
- Passwordless coverage-response claiming.

Those are separate product/security decisions.

## User Flows

1. Returning parent signs in with email link.
   - Open `/login`.
   - Enter email.
   - Click `Email me a sign-in link`.
   - See sent state.
   - Open newest email.
   - Land on `/app` or safe relative `next`.

2. Parent mistypes email.
   - Sent state keeps email visible.
   - Parent edits and resends.
   - Rate-limit state is handled without a 500.

3. Expired or reused email link.
   - `/auth/confirm` or `/auth/callback` fails safely.
   - User lands on `/login?error=auth_link_failed`.
   - UI explains to request a new link.

4. Optional password returning-user sign-in.
   - User chooses password path.
   - Enters email and password.
   - Server action calls `signInWithPassword`.
   - On success, redirect to safe `next` or `/app`.
   - On failure, show generic sign-in error.

5. Optional password reset.
   - User chooses forgot password.
   - Enters email.
   - Server action calls `resetPasswordForEmail`.
   - Recovery email lands on an app route that creates a recovery session and allows password update.
   - User returns to `/app` after successful update.

## Implementation Checklist

### PR 1: Login Screen Redesign

- [x] Update `src/app/login/page.tsx` layout, copy, and state presentation.
- [x] Keep `sendMagicLink` behavior in `src/app/login/actions.ts`.
- [x] Add accessible `role="status"` or equivalent for sent state and `role="alert"` for error state.
- [x] Update local and hosted E2E selectors from `Send magic link` to the new CTA or a stable helper.
- [x] Update `tests/unit/login-page.test.tsx` for default, sent, rate-limit, send-failed, invalid-link, and expired-link states.
- [x] Update `tests/e2e/app-shell.spec.ts` for desktop/mobile login accessibility and visible state checks.
- [x] Run rendered desktop and mobile login screenshots through Browser/IAB first; use Playwright fallback if IAB is unavailable.

### PR 2: Optional Password Auth

- [ ] Add `signInWithPassword` server action using `createSupabaseServerClient`.
- [ ] Add password reset request server action using `resetPasswordForEmail`.
- [ ] Add app-owned recovery/update-password route and page.
- [ ] Add privacy-safe analytics events or properties, without raw email and without account-existence leaks.
- [ ] Confirm hosted Supabase email/password provider, confirmation setting, password policy, recovery redirect URL, and rate limits.
- [ ] Keep `/auth/confirm` and `/auth/callback` backward compatibility.
- [ ] Add unit tests for password sign-in, generic failures, recovery request, and redirect safety.
- [ ] Add local E2E for password sign-in/reset only if local Supabase password setup is deterministic.
- [ ] Run CE review plus focused auth/privacy review before merge.

## Acceptance Criteria

- [x] Login default state uses parent-friendly email-link language, not `magic link` jargon.
- [x] Existing email-link login continues to work locally.
- [x] `/auth/confirm?token_hash=...` remains supported and tested.
- [x] `/auth/callback?code=...` remains supported for backward compatibility.
- [x] Rate-limit and provider errors render user-facing retry guidance, not a production 500.
- [x] No raw emails, passwords, tokens, magic links, or provider payloads are logged or sent to analytics.
- [x] Mobile and desktop login screens have no text overflow, clipped controls, or critical accessibility violations.
- [x] Hosted user-eval is updated if visible login selectors change.
- [ ] If password auth ships, email link remains primary and password remains optional.

## PR 1 Verification Notes

Completed for the login-screen-only slice:

- `npx vitest run tests/unit/login-page.test.tsx tests/unit/auth-email-routes.test.ts tests/unit/auth-redirect.test.ts`
- `node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/app-shell.spec.ts`
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1 node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/household-setup.spec.ts tests/e2e/household-member-claim.spec.ts`
- Playwright screenshot QA for default, sent, and expired-link states at mobile and desktop sizes.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build:local`
- `npx --yes supabase db reset`
- `npm run test:e2e:local`
- `CONFIRM_HOSTED_USER_EVAL=1 FAMTANDEM_USER_EVAL_EMAIL="test-user+login-redesign-<timestamp>@example.com" FAMTANDEM_USER_EVAL_MAILBOX="test-user@example.com" npm run test:user-eval:hosted`

`test:e2e:local` now runs Playwright with `--workers=2` because the default 9-worker run repeatedly caused local Supabase/Next auth-flow contention unrelated to the login UI. The full suite still runs both mobile and desktop projects and passed 42/42 after the clean reset.

The hosted user-eval run initially exposed a harness-only timeout waiting for the production login submit to reach `sent=1`; the product login completed successfully in a focused hosted probe. The runner now waits 30 seconds for the sent state. The follow-up hosted eval run `202606032002` passed.

## Verification Plan

Focused local:

```bash
npx vitest run tests/unit/login-page.test.tsx tests/unit/auth-email-routes.test.ts tests/unit/auth-redirect.test.ts
npm run lint
npm run typecheck
```

Rendered UI:

```bash
PLAYWRIGHT_REUSE_EXISTING_SERVER=1 node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/app-shell.spec.ts
```

Auth regression:

```bash
PLAYWRIGHT_REUSE_EXISTING_SERVER=1 node scripts/with-local-supabase-env.mjs npx playwright test tests/e2e/household-setup.spec.ts tests/e2e/household-member-claim.spec.ts
```

Full local before merge:

```bash
npm test
npm run build:local
npm run test:e2e:local
```

Hosted if auth behavior or selectors change:

```bash
CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted
```

Hosted checks:

- Confirm delivered auth email still contains `/auth/confirm?...`.
- Confirm login redirects into `/app`.
- Check Vercel errors for login/auth digest regressions.
- Check PostHog events for method/outcome without raw email.

## Risks

- Password auth can increase support burden if reset flows are incomplete.
- Changing the CTA can break the hosted user-eval runner if selectors are not updated.
- Incorrect Supabase email templates can reintroduce cross-browser/mobile auth failures.
- Too much visual storytelling on login can feel like marketing instead of utility.

## Open Decision

Implement PR 1 first. Defer PR 2 until there is direct evidence that repeated Gmail round trips are a real blocker for early beta families.
