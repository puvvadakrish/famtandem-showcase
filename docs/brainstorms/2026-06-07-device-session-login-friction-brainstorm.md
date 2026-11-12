# Device Session Login Friction Brainstorm

Date: 2026-06-07

## Problem

A real beta user reports that having to sign in every time is frustrating enough to reduce app usage. That is a product blocker because FamTandem only works if the default parent can open the board quickly during real family logistics moments.

## Product Principle

FamTandem should feel like a remembered household board on the user's own device. Magic link should be an initial verification or recovery path, not a repeated daily hurdle.

## What Is Already True

- The app uses Supabase passwordless auth and server-side session cookies.
- `/app` already redirects unauthenticated users to `/login`.
- The hosted user-eval signs in by opening the magic link in the same browser context because Supabase PKCE sessions are browser-context bound.
- The current `/login` page does not first check whether the browser already has a valid session.
- The app has no obvious explicit sign-out surface.

## Likely User-Facing Failure Modes

- A user bookmarks or reopens `/login`; the page asks for email again even if the device session is still valid.
- A user opens the email link in one browser container, then later opens FamTandem in another browser or home-screen container, so the session is not shared.
- A session expires or is cleared by the browser, but the UI copy implies magic link is the default way to open the app every time.
- Because there is no visible sign-out control, making sessions persistent lacks a clear user-controlled exit.

## Considered Options

### Keep Magic Link Only, But Make It Remembered

- Redirect authenticated visitors away from `/login` to `/app`.
- Clarify login copy: after opening the link on this device, FamTandem keeps the user signed in until sign-out or session expiry.
- Add an explicit sign-out control.
- Add automated checks that the same browser context can return to `/app` and `/login` without another magic link.

This is the recommended slice.

### Add Passwords

Passwords add account-management, reset, lockout, and security-support surface area. They do not solve the core issue if the session is already being lost due to cross-browser magic-link opens. Defer unless beta users need cross-device sign-in without email.

### Custom Device Token

A bespoke remembered-device token would duplicate Supabase refresh-token behavior and increase auth risk. Do not add unless Supabase sessions prove insufficient after targeted diagnostics.

## Decision

Use the existing Supabase session model as the device tether:

- If the browser has a valid session, `/login` should immediately continue to `/app`.
- The board should expose sign out.
- Login copy should set the right expectation for the same device/browser.
- Hosted user-eval should explicitly verify same-context persistence.

## Non-Goals

- Password login.
- Custom device-token auth.
- OAuth provider login.
- Admin session tooling.
- Any change to helper/source privacy boundaries.

## Success Criteria

- A signed-in user who opens `/login` lands back on `/app` without another email.
- A signed-in user who reopens `/app` in the same browser context lands on the board.
- A user can explicitly sign out and then `/app` redirects to `/login`.
- The hosted user-eval covers the persistence behavior with the test mailbox.
