---
title: "Vercel branch preview builds need branch-scoped env or safe defaults"
date: "2026-05-29"
category: build-errors
component: vercel_preview_deployments
tags:
  - vercel
  - preview-deployments
  - environment-variables
  - hosted-beta
  - nextjs
severity: medium
status: resolved
related_prs:
  - 33
related_files:
  - src/lib/env-core.ts
  - src/app/app/admin/ops/page.tsx
  - docs/ops/2026-05-26-hosted-cohort-readiness-runbook.md
---

# Vercel Branch Preview Builds Need Branch-Scoped Env Or Safe Defaults

## Summary

PR #33 added the parent source inbox and passed local verification, but the first Vercel preview build failed during Next.js prerendering:

```text
Error occurred prerendering page "/app/admin/ops"
ZodError: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, and CRON_SECRET Required
```

The failure was not caused by the inbox code. The Vercel project had preview environment variables scoped to an older branch, so the new PR branch did not receive the required build-time env vars.

## Root Cause

FamTandem parses required server env through `src/lib/env-core.ts`. Some dynamic admin routes can be evaluated during build/prerender collection, so missing env vars fail the build before deployment.

Vercel environment variables were present for:

- `Production`
- `Preview (codex/public-preview-faster-value)`

They were not present for:

- `Preview (codex/parent-source-inbox)`

That made the PR preview behave like a hosted build with no Supabase/Cron env.

One extra trap: `vercel env pull` redacts sensitive env values. Re-adding those pulled values to another branch writes empty strings for sensitive vars, which then fails validation differently:

```text
SUPABASE_SERVICE_ROLE_KEY String must contain at least 1 character(s)
CRON_SECRET String must contain at least 16 character(s)
COVERAGE_REQUEST_SENDER Invalid enum value, received ""
```

## Working Fix

For the PR preview, configure branch-scoped preview env values. If the branch only needs to prove that the build succeeds, use safe non-production placeholders and keep all providers disabled/local:

```text
ARTIFACT_TEXT_PROVIDER=disabled
COVERAGE_REQUEST_SENDER=local-stub
EXTRACTION_PROVIDER=local-stub
HOUSEHOLD_NOTIFICATION_SENDER=local-stub
JOB_BATCH_SIZE=5
CRON_SECRET=preview-cron-secret-not-for-real-runs
COVERAGE_REQUEST_TOKEN_SECRET=preview-token-secret-not-for-real-sends
SUPABASE_SERVICE_ROLE_KEY=preview-service-role-placeholder
NEXT_PUBLIC_SUPABASE_URL=https://preview.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=preview-anon-key-placeholder
```

Do not point ad hoc preview branches at production Supabase unless the preview is intentionally being used for a hosted functional smoke and the data/privacy implications are understood.

After setting branch-scoped preview env for PR #33, Vercel passed. The temporary branch-scoped env overrides were removed after the PR was merged and the branch was deleted.

## Verification

Local verification for PR #33 passed:

```bash
npm run lint
npm run typecheck
npm test
npm run test:extraction
npm run build:local
npm run test:e2e:local
git diff --check
```

Vercel verification:

```bash
vercel inspect <preview-url> --logs --scope <team-scope>
vercel ls famtandem --scope <team-scope>
```

After merge, production deployed successfully and `https://app.famtandem.com/app/inbox` returned a `307` redirect to `/login` for unauthenticated users, confirming the route was live and protected.

## Prevention

- Prefer project-wide Preview env vars for required build-time values when every PR branch needs to build.
- Use branch-scoped Preview env only for branch-specific experiments, and clean them up after merge.
- Do not use `vercel env pull` output as a source of truth for sensitive values; sensitive values are redacted.
- For PR previews that should not touch real providers, use safe placeholder Supabase/Cron secrets and local-stub/disabled provider flags.
- If a Vercel build fails during prerendering with env validation errors, check `vercel env ls` before changing app code.
- Keep production and preview provider posture explicit: preview build-success placeholders are not the same as production beta credentials.

## Related Context

- PR #33: parent source inbox and review queue.
- Gemini Code Assist also found an unrelated performance issue in the PR: related inbox queries were initially household-wide. That was fixed by loading the capped `source_inputs` list first and constraining cards, extraction runs, and artifacts to those source IDs plus the household filter.
