# Mobile Chrome Auth Persistence Brainstorm

Date: 2026-06-07

## Problem

A real mobile Chrome diagnostic failed: after signing in from a Gmail magic link, opening `app.famtandem.com` in a new Chrome tab asked for another magic link.

This directly breaks the product promise. A parent should sign in once on a device and stay signed in until explicit sign out.

## What We Know

- Automated hosted checks proved same-browser-context persistence, but the physical mobile flow still failed.
- FamTandem already uses app-owned token hash links through `/auth/confirm`.
- The auth route currently verifies/exchanges the token with a Supabase server client, then returns a fresh `NextResponse.redirect`.
- Supabase SSR auth depends on auth tokens being persisted as cookies through `Set-Cookie` on the server response.

## Likely Failure Mode

The token exchange succeeds, but the cookies are not reliably attached to the final redirect response in the mobile Gmail -> Chrome -> new tab lifecycle.

Desktop automation can miss this because the same Playwright page/context may preserve state differently from a physical mobile browser opening links across app/tab boundaries.

## Chosen Slice

Make auth route cookie persistence explicit:

- Create a route-handler Supabase client that writes cookies onto the exact `NextResponse` that will be returned.
- Use it in `/auth/confirm` and `/auth/callback`.
- Add regression coverage that opens `/app` in a new tab after magic-link sign-in.

## Non-Goals

- Do not add passwords for this fix.
- Do not add long-lived custom device tokens.
- Do not weaken Supabase session semantics.
- Do not change household authorization or invite claim behavior.

## Success Criteria

- Magic-link sign-in sets session cookies on the returned redirect response.
- Same device/browser can open `/app` in a new tab without another magic link.
- Explicit sign out still clears the device session.
- Hosted user-eval passes after deploy.
