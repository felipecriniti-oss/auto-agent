---
phase: 06-supabase-integration
status: active
created: 2026-04-21
updated: 2026-04-22
estimated_duration: 5-7 days
priority: critical
decision_source: pivot 2 on 2026-04-22 — produto real full-auto WebMotors needs multi-tenant DB foundation
---

# Phase 6 — Supabase foundation

## Status: ACTIVE (next phase to plan + execute)

**Scope expanded 2026-04-22:** was "Supabase + Stripe" in original seed. Stripe moved to Phase 13 (closing flow). Schema expanded to include all tables used by Phases 7-12 (wishlists, listings, agent_threads, agent_messages, bot_accounts, pending_outbox, scrape_runs) — ship complete schema once so downstream phases don't need destructive migrations.

## Goal

Build multi-tenant foundation that unblocks every phase 7-13. At end of Phase 6:
- Supabase project is live
- All domain tables exist with RLS policies
- Auth works (email magic-link + Google)
- Existing Phase 5 Zustand stores are migrated to Supabase hooks preserving API surface
- Route protection gates `/app/*` behind auth
- Seed data script populates a dev user + 3 sample wishlists + 5 sample listings for local testing

Critically: **no business logic yet** — this phase is foundation. Wishlist UI is Phase 7, scraping Phase 8, etc.

## Why this ordering (foundation-first)

Alternative path considered: build Wishlist UI (Phase 7) with localStorage first, then migrate to Supabase later. Rejected because:
1. Multi-tenant UX (emails, logout, "meu perfil") is different from single-tenant — doing both is wasted work
2. Realtime subscriptions (Phase 9 notifications, Phase 12 inbox) require Supabase — can't prototype without it
3. Agent loop edge functions (Phase 11) need Supabase service role

## Scope

### 6.1 — Supabase project setup

- Create Supabase project via dashboard
- Region: **sa-east-1 (São Paulo)** if available, else **us-east-1** (closest backup)
- Enable extensions: `uuid-ossp`, `pg_cron` (for scheduled scraping later), `pgcrypto`
- Configure auth providers:
  - Email magic-link (no password required)
  - Google OAuth (client ID + secret from Google Cloud Console)
- Configure site URL: `https://workspace.autoagente.ai`
- Configure redirect URLs: `https://workspace.autoagente.ai/auth/callback`, `http://localhost:3000/auth/callback`

### 6.2 — Schema + migrations

**Directory:** `supabase/migrations/`

Single initial migration `0001_init.sql` containing all tables. Rationale: cleaner than 13 micro-migrations during this stage; we can add decimal migrations (0002, 0003) later for feature additions.

**Tables (complete schema for phases 7-13):**

```
users
  id uuid PK (= auth.users.id)
  email text unique not null
  name text
  company_name text
  cnpj text
  plan text check in ('starter','premium','enterprise') default 'starter'
  role text check in ('lojista','admin') default 'lojista'
  created_at, updated_at timestamptz

wishlists
  id uuid PK
  user_id uuid FK users
  name text not null            -- "Honda Civic 2018+ SP"
  brand text not null            -- "Honda"
  model text not null            -- "Civic"
  trim text                      -- "EXL", "Touring"
  year_min int, year_max int
  km_max int
  price_max numeric(12,2)
  fuel_type text[] default '{}'
  transmission text[] default '{}'
  armored boolean
  region_uf text[]               -- ["SP","RJ"]
  region_cities text[]           -- optional city narrowing
  status text check in ('active','paused','archived') default 'active'
  created_at, updated_at timestamptz

listings
  id uuid PK
  source text not null           -- 'webmotors'
  source_listing_id text not null
  fingerprint text not null      -- hash(anunciante_id+model+year+km+price)
  brand, model, trim text
  year int
  km int
  price numeric(12,2)
  fipe numeric(12,2)
  savings_vs_fipe numeric(12,2)  -- fipe - price
  savings_pct numeric(5,2)       -- (savings / fipe) * 100
  seller_type text                -- 'PF' | 'PJ'
  seller_location text
  seller_uf text(2)
  seller_city text
  listing_url text
  photo_url text
  days_online int
  reductions int
  attributes jsonb                -- raw extras: color, armored, accept_trade, etc.
  motivation_signals jsonb       -- computed heuristics
  first_seen_at timestamptz default now()
  last_scraped_at timestamptz default now()
  status text check in ('active','removed','stale') default 'active'
  unique (source, source_listing_id)
  unique (fingerprint)

opportunities
  id uuid PK
  user_id uuid FK users
  wishlist_id uuid FK wishlists
  listing_id uuid FK listings
  match_score numeric(5,4)
  status text check in ('pending','initiating','negotiating','converged','lost','escalated','assumed','expired') default 'pending'
  fee_amount numeric(12,2)       -- computed from user.plan + savings
  agent_thread_id uuid FK agent_threads
  created_at, updated_at timestamptz
  unique (user_id, wishlist_id, listing_id)

bot_accounts
  id uuid PK
  source text default 'webmotors'
  email text not null
  encrypted_password text not null   -- via Supabase Vault
  status text check in ('warming','active','shadow_banned','dead') default 'warming'
  messages_sent_today int default 0
  messages_sent_total int default 0
  last_used_at timestamptz
  max_daily_messages int default 10   -- ramps from 5 → 25 as warming
  cooldown_until timestamptz
  notes text
  created_at, updated_at timestamptz

agent_threads
  id uuid PK
  opportunity_id uuid FK opportunities unique
  bot_account_id uuid FK bot_accounts
  webmotors_thread_url text      -- stable URL to inbox thread
  status text check in ('initiating','awaiting_pf_response','awaiting_agent_response','converged','lost','escalated') default 'initiating'
  round int default 0             -- counter of exchanges
  first_message_sent_at timestamptz
  last_pf_message_at timestamptz
  last_agent_message_at timestamptz
  converged_at timestamptz
  target_price numeric(12,2)     -- from Claude negotiation strategy
  current_offer numeric(12,2)
  pf_name text                   -- scraped from thread metadata
  pf_phone text                  -- revealed if PF shares it
  escalation_reason text         -- "asked for CRLV" etc
  created_at, updated_at timestamptz

agent_messages
  id uuid PK
  thread_id uuid FK agent_threads
  direction text check in ('inbound','outbound') not null
  body text not null
  model text                     -- "claude-sonnet-4-6" for outbound
  prompt_version text             -- tracking which opener/reply prompt was used
  sent_at timestamptz              -- for outbound, server-side timestamp
  received_at timestamptz          -- for inbound, parsed from WebMotors
  created_at timestamptz default now()
  webmotors_message_id text       -- dedup inbound

pending_outbox
  id uuid PK
  thread_id uuid FK agent_threads
  body text not null
  scheduled_for timestamptz default now()   -- delay for humanization
  attempts int default 0
  last_error text
  status text check in ('queued','sending','sent','failed','dead_lettered') default 'queued'
  created_at, updated_at timestamptz

scrape_runs
  id uuid PK
  source text default 'webmotors'
  started_at, ended_at timestamptz
  status text check in ('running','completed','failed') default 'running'
  apify_run_id text
  cost_usd numeric(8,4)
  listings_new int default 0
  listings_updated int default 0
  listings_error int default 0
  notes text
  created_at timestamptz default now()

deals
  id uuid PK
  user_id uuid FK users
  opportunity_id uuid FK opportunities unique
  status text check in ('contract_pending','signed','inspection','transferring','finalized','canceled') default 'contract_pending'
  fee_paid_amount numeric(12,2)
  stripe_charge_id text
  contract_url text
  zapsign_document_id text
  seller_contact_shared_at timestamptz
  created_at, updated_at timestamptz

subscriptions
  id uuid PK
  user_id uuid FK users unique
  stripe_customer_id text
  stripe_subscription_id text
  tier text check in ('starter','premium','enterprise') default 'starter'
  current_period_end timestamptz
  cancel_at_period_end boolean default false
  created_at, updated_at timestamptz
```

**Triggers:** `updated_at` auto-update via trigger on every `UPDATE`.

**Indexes:**
- listings: (fingerprint), (brand, model, year), (status, last_scraped_at)
- wishlists: (user_id, status), (brand, model)
- opportunities: (user_id, status), (wishlist_id), (listing_id)
- agent_threads: (opportunity_id), (bot_account_id, status)
- agent_messages: (thread_id, created_at)
- pending_outbox: (status, scheduled_for)

### 6.3 — RLS policies (hard multi-tenant isolation)

Default-deny on every table. Authenticated users can read/write ONLY rows matching `auth.uid() = user_id`.

**Exceptions:**
- `listings` — readable by any authenticated user (public catalog). Insert/update only by service role (scraper).
- `bot_accounts` — service role only (never exposed to clients).
- `pending_outbox` — service role only.
- `scrape_runs` — admin users can read, service role writes.
- `agent_messages` — readable by user owning the parent opportunity (join through threads → opportunities → user_id).

**Service role** bypasses RLS entirely — used by Edge Functions / server actions for cross-tenant operations (scraping ingest, matching engine, agent loop).

### 6.4 — Client migration (Zustand → Supabase)

Preserve hook API surface. Existing modules in `src/components/v3/modules/` shouldn't need rewrites.

Strategy:
- `useAppStore` keeps: UI state (activeModule, mobileOpen, theme) — stays local
- `useAppStore` drops: opportunities, deals → replaced by `useOpportunities()` / `useDeals()` hooks backed by Supabase + React Query
- `useNegotiationStore` → wraps Supabase realtime subscription on `agent_messages` for the current thread
- `useOnboardingStore` → user metadata in `users` table (first-run fields)

New hooks:
```
src/lib/supabase/hooks/
├── useSupabaseUser.ts     — current auth session
├── useWishlists.ts        — CRUD for wishlists
├── useListings.ts         — browse catalog
├── useOpportunities.ts    — user's opps w/ realtime
├── useDeals.ts            — user's deals w/ realtime
├── useAgentThread.ts      — single thread w/ realtime messages
```

All hooks use React Query for cache + invalidation. Realtime subs overlay on top.

### 6.5 — Route protection

- `src/middleware.ts` — checks Supabase session cookie; redirects `/app/*` to `/login` if missing
- Public routes: `/`, `/login`, `/signup`, `/reset-password`, `/privacidade`, `/termos`
- Protected: everything under `/app/*`
- After Phase 6: root `/` redirects authenticated users to `/app`, unauthenticated to `/login`

### 6.6 — Auth UI

- `/login` — email input → magic-link OR Google button
- `/signup` — email + nome + empresa → magic-link → after verify goes to `/app/onboarding`
- `/reset-password` — email for reset flow
- `/auth/callback` — handles Supabase magic-link redirect, exchanges code for session, redirects to `/app`
- Sidebar `<UserChip>` updated: shows real user.email + plan badge, logout button

### 6.7 — Seed script (dev convenience)

`supabase/seed.sql` or `scripts/seed-dev.ts`:
- Creates dev user `dev@autoagente.local`
- 3 sample wishlists
- 5 sample listings matching those wishlists
- 2 sample opportunities (one pending, one converged)
- Runs via `pnpm seed` command

### 6.8 — Env vars + deploy config

Add to `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-side only
```

Update Vercel project env vars before deploying.

## Non-goals for Phase 6

- **Stripe billing** — moved to Phase 13
- **Complex subscription dunning / trial extensions**
- **Multi-org / multi-loja** — one user = one loja for now
- **Admin impersonation tooling** — deferred
- **Email marketing** — only transactional auth emails via Supabase

## Open questions (to resolve in /gsd-discuss-phase)

1. **React Query vs SWR?** Both work. React Query has more mature realtime patterns. Recommend React Query.
2. **Middleware vs page.tsx session check?** Middleware is canonical for Next 15; use it.
3. **Supabase SSR package version?** Use `@supabase/ssr` (latest, replaces deprecated `@supabase/auth-helpers-nextjs`).
4. **Onboarding flow after signup?** Probably: email verify → `/app/onboarding` with "welcome + cadastre sua primeira wishlist" wizard. Confirm in discuss.
5. **Admin role — needed in MVP?** Minimal — just a boolean role field. Actual admin UI is later.
6. **Dev auth convenience?** Provide a "dev login" backdoor gated by `NODE_ENV=development` that skips email verification. Speeds iteration.

## Dependencies (external — user actions)

- [ ] Criar projeto Supabase no dashboard (`app.supabase.com`)
- [ ] Google OAuth credentials (Google Cloud Console → OAuth 2.0 Client)
- [ ] Inserir 3 env vars no `.env.local` e Vercel
- [ ] (Opcional) Configurar região sa-east-1 se disponível

## Success criteria

- [ ] `pnpm dev` + `/login` → email magic-link flow completes
- [ ] Protected `/app` route redirects when logged out
- [ ] Seed script creates dev data; UI shows it
- [ ] Biome + typecheck + vitest all pass
- [ ] All 10 tables exist + RLS policies applied + dev seed runs
- [ ] Vercel deploy of branch works end-to-end with real Supabase
