# FamTandem

Families don't have a calendar problem. They have a logistics and coverage problem.

FamTandem turns commitments scattered across texts, emails, and screenshots into structured family events. Each event has a named owner, so everyone knows who is covering what.

> **About this repo.** Built on my own time with Claude Code as my pair. Published as a single snapshot commit. Personal email addresses and names are replaced with test values.

## Stack

Next.js (App Router, TypeScript) · Supabase (Auth, Postgres with row-level security, Storage) · Gemini for extraction · Resend · PostHog · Vercel · Vitest and Playwright

## Run it

```bash
npm ci
npm test        # 278 unit tests
npm run dev
```

Product context lives in [`AGENTS.md`](AGENTS.md) and [`docs/`](docs/). Architecture notes are in [`docs/architecture.md`](docs/architecture.md).
