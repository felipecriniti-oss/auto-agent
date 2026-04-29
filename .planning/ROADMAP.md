# Roadmap: AutoAgent — B2B Seminovos Marketplace

## Overview

AutoAgent é um marketplace transacional B2B para lojistas de seminovos.

**Direção atual (pivot 3, 2026-04-22 noite):** Foundation-first. Backend/DB/auth/access-control/billing/contratos ANTES de qualquer trabalho em agente. Phase 10 (outreach) e Phase 11 (agent loop) estão **DEFERRED** até algoritmo de negociação ser desenhado em papel junto com pai.

Produto vendável ao fim de Phase 13b: lojista assina plano → cadastra wishlist → sistema scrapeia WebMotors → matching engine cria oportunidades → lojista paga fee pra revelar contato do PF → lojista contata sozinho e gera contrato via ZapSign. Agente de negociação é fase posterior que vira diferenciador upsell.

Histórico:
- **Phases 1-4** (2026-04-18 → 2026-04-21): playground técnico. Phase 1 shipped (motor de negociação reaproveitado no futuro Phase 10/11), 2-4 deferred.
- **Phase 5** (2026-04-21 → 2026-04-22): pivot 1 — v3 product shell. ✅ shipped.
- **Phases 6-13b** (2026-04-22 →): pivot 2 + pivot 3 — infra vendável sem agente.

## Phases

**Phase Numbering:**
- Integer phases (6, 7, 8...): Planned phase work
- Decimal phases (13a, 13b): Insertions/splits
- DEFERRED phases: pausadas aguardando gate de decisão

### Legacy (shipped or deferred)

- [x] **Phase 1: Chat Manual Funcional** ✅ (7/8 plans done) — Motor de negociação Claude. Reaproveita como núcleo em Phase 10/11 quando algoritmo estiver pronto.
- [ ] **Phase 2-4: Inteligência / Batch / Análise** — DEFERRED indefinitely.
- [x] **Phase 5: v3 Product Shell** ✅ (8/8 waves) — Dashboard 7 módulos + Backstage autoplay + Apify URL-paste + dark mode + mobile drawer.

### Active (pivot 3 — 2026-04-22 →)

Sequência de execução:

| # | Phase | Status | Depende de |
|---|---|---|---|
| 6 | Supabase foundation | 🔜 **EM EXECUÇÃO** (scaffold 50% done) | — |
| 7 | Wishlist UI (DB real) | ✅ **COMPLETE 2026-04-25** (12/12 plans, 381 tests, human UAT pending) | 6 |
| 8 | Scraping pipeline + hardening | seeded | 6 |
| 9 | Matching engine (DB integration) | seeded | 7, 8 |
| 13a | Billing + plan gating + Stripe (exec wave 1 of PRD P13) | **DECOMPOSED** | 6 |
| 13b | Digital contracts DocuSign (exec wave 2 of PRD P13) | **DECOMPOSED** | 13a |
| ~~10~~ | ~~Outreach sender~~ | ⏸️ **DEFERRED** | algoritmo em papel com pai |
| ~~11~~ | ~~Agent loop~~ | ⏸️ **DEFERRED** | algoritmo em papel com pai |
| ~~12~~ | ~~Inbox dashboard~~ | ⏸️ **DEFERRED** | depende de 10/11 (PRD flow) |
| ~~13c~~ | ~~Escrow~~ | ⏸️ **DEFERRED** | agent deals |

Referência: `.planning/PIVOT-3.md` para rationale completo da reorganização.

## Phase Details

### Phase 6: Supabase foundation 🔜 EM EXECUÇÃO

**Goal:** Multi-tenant real com auth + DB Postgres + RLS + auth UI funcional + hooks Supabase substituindo Zustand.

**Estado atual (audit 2026-04-22 noite):**
- ✅ Projeto Supabase criado, migrations aplicadas, seed data inserido
- ✅ Clients `src/lib/supabase/{client,server,env}.ts` prontos (real quando env presente)
- ✅ Types `src/types/database.ts` alinhado com schema
- ✅ Middleware.ts com logic de session refresh + route protection (no-op sem env)
- ❌ `/login`, `/signup`, `/auth/callback` routes NÃO EXISTEM
- ❌ `useWishlists()`, `useOpportunities()`, `useDeals()` hooks NÃO EXISTEM
- ❌ SignupView ainda é fake persona-picker (Zustand)
- ❌ Stores ainda persistem em localStorage

**Remaining work (~1.5-2 days solo dev):**
1. Auth routes (3-4h): `/login`, `/signup`, `/auth/callback` + magic-link flow
2. Supabase hooks (2-3h): `useWishlists`, `useOpportunities`, `useDeals` com React Query + realtime
3. SignupView → Onboarding (2h): persona picker vira post-login step
4. Seed npm script (30min)
5. Matching integration (1-2h): wire matching engine no ingest endpoint

**Dependencies (external):** Nenhuma — user já criou Supabase projeto.

**UI hint:** yes

### Phase 7: Wishlist UI ✅ COMPLETE 2026-04-25

**Goal:** Lojista cadastra wishlist descrevendo carro-alvo. Substitui URL-paste do Phase 5.
**Depends on:** Phase 6 (hooks + DB)
**Estimate:** 2-3 days
**Plans:** 12 plans in 4 waves
**Key deliverables:**
- Módulo `WishlistModule` contra Supabase (hook existe após Phase 6)
- Form `react-hook-form` + `zod` + shadcn/ui
- Fuzzy search FIPE (cascade marca → modelo)
- Preview: "Esta semana acharíamos X anúncios compatíveis"

**UI hint:** yes (drawer form + grid)

**Plans:**
- [x] 07-01-PLAN.md — Wishlist schema + mock listings + FIPE brands snapshot foundation (wave 1)
- [x] 07-02-PLAN.md — useWishlists soft-delete migration + archived filter + test updates (wave 1)
- [x] 07-03-PLAN.md — /api/fipe GET branch — brands + models endpoints (wave 1)
- [x] 07-04-PLAN.md — scripts/sync-fipe-brands.ts — manual snapshot generator (wave 1)
- [x] 07-05-PLAN.md — useListingsSnapshot hook — Supabase select + silent mock fallback (wave 2)
- [x] 07-06-PLAN.md — Field primitives — BrlCurrencyInput + KmInput + YearRangeField (wave 2)
- [x] 07-07-PLAN.md — FIPE comboboxes — brand (snapshot) + model (React Query + fallback) (wave 3)
- [x] 07-08-PLAN.md — LocalidadeMultiPicker — array wrapper over existing LocalidadePicker (wave 3)
- [x] 07-09-PLAN.md — WishlistPreviewPane — debounced engine count + 3-card collapse (wave 3)
- [x] 07-10-PLAN.md — WishlistFormSheet — RHF composition of all primitives + submit flow (wave 3)
- [x] 07-11-PLAN.md — WishlistModule in-place rewrite — Supabase hooks + AlertDialog + summarize (wave 4)
- [x] 07-12-PLAN.md — Sidebar rename (D-15) + Onboarding step 3 integration + final phase gate (wave 4)

### Phase 8: Scraping pipeline WebMotors + hardening

**Goal:** Apify scheduled actor roda continuamente + normalização + dedup + FIPE enrichment. **Hardening sub-phase** adicionado pivot 3: anti-bot resilience, retry/backoff, dead-letter queue, cost caps, monitoring alerts.

**Depends on:** Phase 6 (listings table)
**Estimate:** 3-4 days (was 3-4, mantido)
**Key deliverables:**
- Apify scheduled run (queries amplas top 20 modelos BR)
- Webhook endpoint `/api/scrape/webmotors/webhook` valida signature + upsert
- Normalização canônica
- Fingerprint dedup
- FIPE enrichment auto no insert
- `scrape_runs` log
- **Anti-bot hardening:** rotating user agents, residential proxies (via Apify), request interval jitter, failure pattern detection, Apify cost alert cap $50/dia
- **Health monitoring:** 3 runs sem new listings = Slack/email alert; error_rate > 20% = block next run

**UI hint:** no (admin view eventually)

### Phase 9: Matching engine (DB integration)

**Goal:** Complete the matching loop end-to-end — engine PF-only as hard rule (drop `enforcePfOnly` flag), backfill on wishlist insert via `POST /api/match/backfill` (sync, 30d window), realtime opportunity toast + sidebar badge, all wired against existing engine + webhook handler.
**Depends on:** Phase 7 + Phase 8
**Estimate:** 2-3 days
**Plans:** 5 plans in 3 waves
**Key deliverables:**
- Engine: `seller_type === 'PF'` becomes a hard rule (alongside model/year/km/price/region); `MatchingOptions.enforcePfOnly` removed
- Caller: `WishlistPreviewPane` updated to use the flag-free engine API; mock listings already PF-stamped (verified 20/20)
- Backfill endpoint: new `POST /api/match/backfill` mirrors webhook inner loop, iterates one wishlist × last-30d active listings, dedup via `(user_id, wishlist_id, listing_id)` unique constraint, fee computed via `calcFee(plan, savings)`
- Hook integration: `useCreateWishlist` `onSuccess` POSTs to backfill + sonner toast "Encontramos N oportunidades" when n>0 (silent on n=0)
- Realtime: dedicated `useOpportunityRealtime` hook mounted at AppShell, INSERT-only filter on `opportunities`, sonner toast with D-12 wording + "Ver" CTA, 5-events/2s burst debounce
- Sidebar: new `Marketplace` nav item with Zustand-driven numeric badge that increments on realtime events and resets on marketplace mount

**UI hint:** yes (Marketplace nav badge + toasts; no new full views)

**Plans:**
- [x] 09-01-PLAN.md — Matching engine: drop enforcePfOnly, PF as hard rule + tests (wave 1) ✓ 2026-04-29
- [x] 09-02-PLAN.md — WishlistPreviewPane caller fix + mock dataset PF sanity check (wave 2) ✓ 2026-04-29
- [ ] 09-03-PLAN.md — POST /api/match/backfill endpoint + tests (dedup, 30d window, PJ inheritance, fee tier) (wave 2)
- [ ] 09-04-PLAN.md — useCreateWishlist onSuccess: backfill + selective toast + tests (wave 3)
- [ ] 09-05-PLAN.md — useOpportunityRealtime hook + Zustand badge counter + Marketplace sidebar item + AppShell mount (wave 3)

### Phase 13a: Billing + access control + Stripe 🆕 PROMOVIDO

**Goal:** Lojista assina plano via Stripe Checkout; middleware + hooks fazem enforce de quotas e feature gating.

**Depends on:** Phase 6
**Estimate:** 4-5 days
**Critical path:** SIM — sem billing ativo, produto não monetiza.

**Key deliverables:**
- Stripe BR account + 3 subscription products (Starter R$197 / Premium R$499 / Enterprise R$1997)
- `/pricing` public page
- Checkout flow (`/api/billing/checkout`)
- Webhook handler com idempotency (`stripe_events` table)
- Plan gating middleware (`requireEnterprise()`, quota enforcement)
- `usage_counters` table (DD queries: 10/50/∞)
- Billing dashboard tab em `/app/settings`
- `deal_fees` infra (construída; trigger real fica oculto até Phase 10/11/12 retornarem — PRD flow preservado)

**Open question blocker:** pricing canônico — PRD v3 (R$197/499/1997) ou landing autoagente.ai (R$0+8% / R$1490+4% / R$5900+2.5%)? Decidir ANTES de codar Checkout.

**UI hint:** yes (pricing + billing pages)

### Phase 13b: Digital contracts (DocuSign) 🆕 DECOMPOSED

**Goal:** Infra de geração e assinatura digital (exclusividade 7 dias + compra/venda) via DocuSign, conforme PRD v3.
**Depends on:** Phase 13a
**Estimate:** 3-4 days
**Key deliverables:**
- Template system (`docs/templates/exclusivity-v1.html`, `purchase-sale-v1.html`)
- DocuSign eSignature client (JWT OAuth, envelope API)
- Tables: `contract_templates`, `contracts`, `contract_events` (migration 0003)
- Endpoints: `/api/contracts/exclusivity`, `/api/contracts/purchase-sale`, `/api/contracts/webhook` (DocuSign Connect)
- Supabase Storage bucket `contracts/` (private)
- UI integration stub — botões só aparecem quando Phase 10/11/12 retornarem com convergência do agente (PRD flow)

**UI hint:** infra only (PDF gen server-side); user-visible buttons gated until agent phases return

### Phase 12: Inbox dashboard ⏸️ DEFERRED

**Spec preservada conforme PRD v3:** Lojista vê threads do agente em realtime read-only, "Assumir Deal" aparece quando convergir.

**Depends on:** Phase 11 (agent loop fornece threads)
**Status:** DEFERRED — depende de Phase 10/11 que estão deferred aguardando algoritmo ser desenhado em papel com pai. Spec original em `.planning/phases/12-inbox-dashboard/12-PHASE-SEED.md` intocada.

Não tentar caminhar em Phase 12 sem agente funcionando — PRD flow preserva "Assumir Deal" pós-convergência, não admite variante manual.

### Phase 10: Outreach sender ⏸️ DEFERRED

Pausado pivot 3. Retoma quando algoritmo de abordagem for desenhado em papel com pai. Referência preservada em `.planning/phases/10-outreach-sender/10-PHASE-SEED.md`.

### Phase 11: Inbound + agent loop ⏸️ DEFERRED

Pausado pivot 3. Retoma quando algoritmo de negociação for desenhado em papel com pai. Referência preservada em `.planning/phases/11-inbound-agent-loop/11-PHASE-SEED.md`.

### Phase 13c: Escrow ⏸️ DEFERRED

Escrow depende de deals fechados via agente. Pausado até Phase 10/11 executarem. Referência preservada em `.planning/phases/13-contracts-escrow-stripe/13-PHASE-SEED.md` (original monolítico).

## Progress

### Execution Order (pivot 3)

Caminho crítico:
```
6 (finishing) → 7 + 8 (parallel after 6) → 9 → 12
                         ↓
                       13a → 13b
```

Phase 13a pode iniciar em paralelo a Phase 7/8 após Phase 6 (depende só de users table).
Phase 12 tem dep hard de Phase 9 (opportunities) + Phase 13a (fee checkout).

### Status (pós pivot 3)

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Chat Manual | ✅ shipped | Motor preservado pra Phase 10 futuro |
| 2-4 | ⏸️ deferred | — |
| 5. v3 Shell | ✅ shipped | — |
| **6. Supabase foundation** | 🔜 **em execução** | Scaffold 50% — auth UI + hooks faltando |
| 7. Wishlist UI | ✅ **complete** 2026-04-25 | 12/12 plans, 381 tests; HUMAN-UAT pending; 1 high finding (form sheet portal) |
| 8. Scraping + hardening | seeded | parallel com 7 |
| 9. Matching engine | seeded | after 7+8 |
| 13a. Billing + access | seeded 🆕 | after 6 (parallel OK) |
| 13b. Digital contracts | seeded 🆕 | after 13a |
| 12. Opportunities dashboard | seeded (reframed) | after 9+13a |
| 10. Outreach sender | ⏸️ DEFERRED | aguarda algoritmo |
| 11. Agent loop | ⏸️ DEFERRED | aguarda algoritmo |
| 13c. Escrow | ⏸️ DEFERRED | aguarda agent deals |

### Parallel work (user blockers — 2026-04-22 noite)

- [ ] Decisão: pricing canônico (PRD vs landing) — bloqueia Phase 13a Checkout
- [ ] CNPJ AutoAgente (1-2 semanas) — pré-req Stripe BR + ZapSign + DocuSign
- [ ] Conta Stripe BR verified — depois do CNPJ
- [ ] Conta ZapSign ou DocuSign — depois do CNPJ
- [ ] Política de Privacidade + Termos publicados em autoagente.ai/privacidade e /termos (pré-req Phase 13a live)
- [ ] Algoritmo de negociação em papel com pai (desbloqueia Phase 10/11)
- [ ] DPA Supabase (email suporte@supabase.com) — LGPD coverage
- [ ] Quarterly PCI ASV scanner (Trustwave/SecurityMetrics, ~$150/yr) — antes de Phase 13a live

### Security & scale (from `.planning/research/supabase-scale-2026-04-22.md`)

- ✅ Supabase é suficiente para 10k-100k req/mês indefinidamente (2-23 req/sec tranquilo)
- ✅ SOC2 + ISO27001 + ISO27701 audited
- ✅ LGPD via DPA signing (email simples)
- ✅ sa-east-1 (São Paulo) GA e estável
- ✅ PCI SAQ-A via Stripe Checkout (mais simples)
- ⚠️ Usar Supavisor transaction mode (port 6543, pgbouncer=true) pra Vercel Edge
- 💰 Free tier (agora) → Pro $25/mo (primeiro lojista pagante) → +PITR $100/mo (antes de dinheiro real) → Team $599/mo (50+ lojistas)
- 🔄 Sem lock-in: Postgres puro, migra pra AWS RDS em weekend se precisar

---
*Roadmap created: 2026-04-18*
*Pivot 1 (2026-04-21): Phase 5 v3 shell*
*Pivot 2 (2026-04-22 manhã): Phases 6-13 full-auto WebMotors agent*
*Pivot 3 (2026-04-22 noite): foundation-first, agent DEFERRED*
*Last updated: 2026-04-22 noite*
