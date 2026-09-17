# Proofer — App

Self-hosted photography business platform. Next.js (App Router, TypeScript) on Cloudflare (Pages/Workers via OpenNext), Supabase (Postgres + auth), Cloudflare R2 (media), Stripe (payments), Resend (email), Sentry (errors).

This is the Phase 0 scaffold: framework in place, integration modules read from env vars, no feature logic yet. See ../specs/phase-0-foundations.md and ../project-plan.md.

## Setup (after accounts exist — task 0.1)
1. `npm install`
2. Copy `.env.example` to `.env.local` (local) and set the same vars in Cloudflare + as `.dev.vars` for Workers. Never commit secrets.
3. Apply `supabase/migrations/0001_init.sql` to your Supabase project.
4. `npm run dev` for local; `npm run preview` to test the Cloudflare build; deploy via CI (push to develop = staging, main = prod).

## Env vars
See `.env.example` for the full list. All secrets live in the host env, never in git.
