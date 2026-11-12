---
title: "Supabase magic-link rate limits caused hosted login 500s"
date: "2026-05-27"
category: runtime-errors
component: auth_login
tags:
  - supabase-auth
  - magic-link
  - hosted-beta
  - login
severity: medium
status: resolved
---

# Supabase Magic-Link Rate Limits Caused Hosted Login 500s

## Summary

During hosted beta setup, a user tapping **Send magic link** repeatedly on `app.famtandem.com` hit a production error page:

```text
Application error: a server-side exception has occurred while loading app.famtandem.com.
Digest: 4096134722
```

Vercel logs mapped that digest to:

```text
POST /login
Error: email rate limit exceeded
```

This was a Supabase Auth magic-link send throttle, not FamTandem's Resend integration. Resend coverage-request and notification senders were still disabled behind `local-stub`.

## Root Cause

`sendMagicLink` called `supabase.auth.signInWithOtp`. When Supabase returned an error, the server action threw the raw error:

```ts
if (error) {
  throw new Error(error.message);
}
```

In production Next.js, that uncaught server-action error rendered the generic application-error screen. The user saw a crash instead of a retry instruction.

Hosted Supabase Auth also had `max_frequency = "1m0s"`, so repeated sign-in attempts during setup hit the throttle quickly.

## Fix

The login server action now maps Supabase send failures to URL-safe UI states:

- `rate_limited` for messages containing `rate limit`
- `signin_failed` for other magic-link send failures

The login page renders plain parent-facing copy instead of crashing:

```text
We could not send another sign-in link yet. Wait a bit, then try again. If it keeps happening, contact FamTandem.
```

Hosted Supabase Auth email throttle was adjusted from `1m0s` to `20s` for the small beta while keeping `enable_confirmations = true`.

Follow-up hosted smoke testing also showed that the app can still hit Supabase's broader built-in Auth email provider quota. For beta, Supabase Auth should be configured with custom SMTP; FamTandem's Resend coverage-request sender does not affect Supabase Auth magic-link delivery unless it is also wired into Supabase Auth SMTP.

Resolution follow-up on 2026-05-27: Supabase Auth custom SMTP was configured through Resend using the verified `updates.famtandem.com` sending domain. A hosted smoke to a Resend test recipient reached the check-email redirect, Resend reported the auth email as `delivered`, and Vercel showed no fresh login errors.

## Verification

Local checks:

```bash
npx vitest run tests/unit/login-page.test.tsx
npm run lint
npm run typecheck
```

Hosted checks:

```bash
vercel logs https://app.famtandem.com --since 5m --level error --expand
```

The hosted login error state was verified directly:

```text
https://app.famtandem.com/login?error=rate_limited&email=parent@example.com
```

Expected result: the login page renders the retry message and keeps the email field populated.

## Prevention

- Do not let expected provider/user-action errors escape server actions as production 500s.
- Treat Supabase Auth email as a separate provider path from FamTandem's Resend senders.
- When investigating login email issues, check Vercel logs by digest first.
- For beta onboarding, expect double taps and repeated sign-in attempts; the UI should explain throttles calmly.
- Keep email confirmation required when relaxing Auth email send frequency.

## Related Files

- `src/app/login/actions.ts`
- `src/app/login/page.tsx`
- `tests/unit/login-page.test.tsx`
- `docs/ops/2026-05-26-hosted-cohort-readiness-runbook.md`
