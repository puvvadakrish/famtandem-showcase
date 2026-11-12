---
title: Supabase SSR email links need app-owned token-hash confirmation
date: 2026-05-28
category: integration-issues
systems:
  - Supabase Auth
  - Next.js SSR
  - Vercel hosted beta
status: resolved
related_files:
  - src/app/auth/confirm/route.ts
  - src/app/auth/callback/route.ts
  - src/app/login/page.tsx
  - tests/unit/auth-email-routes.test.ts
---

# Supabase SSR email links need app-owned token-hash confirmation

## Symptom

Hosted beta users received FamTandem auth emails, but clicking the email link did not reliably sign them in or confirm their account. The clearest affected case was `test-user@example.com`: the Supabase `auth.users` row existed, `confirmation_sent_at` was populated, but `email_confirmed_at` and `last_sign_in_at` were still null.

## Root Cause

The hosted Supabase email templates still used `{{ .ConfirmationURL }}`, which generated links through Supabase's provider route:

```text
https://<project>.supabase.co/auth/v1/verify?token=pkce_...&type=magiclink&redirect_to=https%3A%2F%2Fapp.famtandem.com%2Fauth%2Fcallback%3Fnext%3D%2Fapp
```

That PKCE callback can fail when the link is opened in a different browser/session from the one that requested the email, which is common on mobile and across email clients. The app also previously ignored callback exchange errors, so a failed link could feel like it did nothing.

## App-Side Fix

Commit `6e5569a` added an app-owned confirmation route:

```text
/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app
```

The route calls `supabase.auth.verifyOtp({ token_hash, type })` server-side, sets the Supabase auth cookies through the SSR server client, and redirects only to a safe relative app path.

The old `/auth/callback` route remains for backward compatibility, but now redirects to `/login?error=auth_link_failed` when Supabase sends an error or `exchangeCodeForSession` fails.

## Hosted Supabase Template Change

After deploying the route, hosted Supabase Auth templates were updated so new emails point to the app route instead of `{{ .ConfirmationURL }}`:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app">Sign in</a>
```

Use the same token-hash link shape for confirmation and magic-link templates. Keep `Site URL` set to:

```text
https://app.famtandem.com
```

Be careful with `supabase config push`: it pushes service config beyond email templates. If using it, work from a complete hosted-safe config that preserves API schemas, storage limits, auth redirect allow-list, MFA, and confirmation settings. Do not push the repo's local `supabase/config.toml` to hosted.

## Verification

Local/code verification for commit `6e5569a`:

- `npx vitest run tests/unit/auth-email-routes.test.ts tests/unit/login-page.test.tsx tests/unit/auth-redirect.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build:local`

Hosted verification after deployment:

- `https://app.famtandem.com/auth/confirm` redirects to `/login?error=auth_link_invalid`.
- `https://app.famtandem.com/login?error=auth_link_failed` renders clear retry guidance.
- A Spark-inspected test email still used the old Supabase `{{ .ConfirmationURL }}` link before the template update, confirming that code deployment alone is not enough.
- After the hosted template update, a fresh confirmation email to a Gmail plus-address contained `https://app.famtandem.com/auth/confirm?token_hash=...&type=email&next=/app`.
- Opening the fresh confirmation link landed on `/household/new`, and hosted Supabase marked the test user confirmed with `last_sign_in_at` populated.
- A follow-up `supabase config push` from the hosted-safe repair config reported API, DB, Auth, and Storage config all up to date.

## Prevention

- For Supabase SSR auth, prefer token-hash email templates that land on app-owned server routes.
- Do not rely on default Supabase confirmation URLs for hosted mobile beta flows.
- Keep route tests for invalid token links and callback exchange failures.
- When changing hosted auth behavior, verify both the app route and the actual delivered email link format.
