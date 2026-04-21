---
phase: 06-supabase-integration
status: seeded
created: 2026-04-21
trigger: after Phase 5 (v3 pivot) demo signed off by Felipe on 2026-04-24
estimated_start: 2026-04-28
estimated_duration: 5-7 days
priority: critical
decision_source: conversation 2026-04-21, user chose Option 1 over Options 2/3
---

# Phase 6 — Supabase Integration (auth + DB + billing) [SEED]

## Status: seeded, not yet active

This phase is **deferred by design** — the Friday 2026-04-24 demo (Phase 5 v3 pivot) ships on localStorage single-tenant to preserve delivery confidence. Phase 6 starts once Felipe signs off on the Friday demo direction.

## Why deferred

User committed to Option 1 (ship-first-Supabase-second) in conversation 2026-04-21 after three options were presented:

- **Option 1** (CHOSEN): demo Friday with localStorage; Supabase next sprint
- Option 2: auth-only Supabase for demo (risk: debug on demo day)
- Option 3: full Supabase in 3 days (high risk of missing deadline entirely)

Rationale: full Supabase (auth + DB migration + Stripe) is 24-35h of solo dev and would eat the 3-day Friday sprint. Demo's core value is the agent negotiating live, not the login UX. PRD v3 also explicitly frames Fase 1 piloto SP as white-glove with manually-provisioned accounts, so self-service signup is a Fase 2 requirement.

## Scope (to be refined at planning time)

### 6.1 — Supabase project setup
- Create Supabase project (region: São Paulo / `sa-east-1` when available, else `us-east-1`)
- Configure Auth providers: email magic-link + Google OAuth
- Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### 6.2 — Schema + migrations
Tables (see migrations dir `supabase/migrations/`):
- `users` — id (uuid), email, plan (enum: starter/premium/enterprise), created_at, updated_at
- `opportunities` — id (uuid), user_id (fk), vehicle, year, km, deal_price, fipe, savings, fee, source, score, motivation_signals (jsonb), time_left, status (enum: pending/assumed/expired), created_at
- `deals` — id (uuid), user_id (fk), opportunity_id (fk), status (enum: contrato_pendente/laudo_agendado/transferindo/finalizado), progress (int), seller_contact, assumed_at, next_step
- `negotiation_sessions` — id (uuid), opportunity_id (fk), messages (jsonb), started_at, ended_at, status (enum: active/ended/aborted), final_price, rounds_used
- `subscriptions` — id (uuid), user_id (fk), stripe_customer_id, stripe_subscription_id, tier, current_period_end, cancel_at_period_end, created_at

### 6.3 — RLS policies (multi-tenant hard isolation)
Every table gets a default-deny policy + authenticated-user can read/write own rows via `auth.uid() = user_id`. Service role bypasses for server-side mutations.

### 6.4 — Client migration
Replace Zustand persist-to-localStorage with Supabase queries:
- `useAppStore` opportunities/deals → `useSWR` or `@tanstack/react-query` against Supabase
- `useNegotiationStore` messages → Supabase realtime subscription + insert on new message
- Preserve the same hook API surface so modules don't need rewriting — just the internals swap.

### 6.5 — Route protection
- Middleware in `src/middleware.ts` checks Supabase session cookie
- `/app/*` routes redirect to `/login` when session missing
- Public routes: `/` (playground), `/login`, `/signup`, `/reset-password`

### 6.6 — Auth UI
- `/login` — email magic-link + Google button
- `/signup` — email collection, triggers magic-link confirmation
- `/reset-password` — email-based reset flow
- Session-aware `<UserChip>` in the Sidebar (shows real user.email + plan)

### 6.7 — Stripe billing
- `/pricing` public page (reuse the plans already in `plansConfig`)
- `/api/checkout` — creates Stripe Checkout session scoped to user
- `/api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → updates `subscriptions` table
- Settings module: "Gerenciar assinatura" button → Stripe Customer Portal
- Plan-gating: Radar module + Enterprise API features gated via subscription check

### 6.8 — Testing
- Unit: RLS policies with Supabase test client
- Integration: signup → checkout → dashboard flow (Playwright if worth the setup)
- Migration test: ensure localStorage state carries over to Supabase on first login (one-time data migration)

## Non-goals for Phase 6

- Email marketing automation
- Complex subscription dunning / trial extensions
- Multi-org support (each user = one loja for now — multi-loja is Enterprise tier but can fake via one account with multiple CNPJs logged separately)
- Admin impersonation tooling
- SOC 2 / LGPD compliance artifacts (needed eventually, not this phase)

## Dependencies

- Phase 5 (v3 pivot) demo signed off by Felipe 2026-04-24
- User creates Supabase + Stripe accounts
- User provides API keys

## When to formally plan this phase

Run `/gsd-plan-phase 6` on Monday 2026-04-27 (or immediately after Friday demo sign-off). At that point this seed expands into a full PLAN.md with task-level breakdown.
