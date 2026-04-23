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
| 7 | Wishlist UI (DB real) | seeded | 6 |
| 8 | Scraping pipeline + hardening | seeded | 6 |
| 9 | Matching engine (DB integration) | seeded | 7, 8 |
| 13a | Billing + plan gating + Stripe | **NEW** (promoted) | 6 |
| 13b | Digital contracts (DocuSign/ZapSign) | **NEW** (promoted) | 13a |
| 12 | Opportunities dashboard (manual contact mode) | seeded (reframe) | 9, 13a |
| ~~10~~ | ~~Outreach sender~~ | ⏸️ **DEFERRED** | algoritmo |
| ~~11~~ | ~~Agent loop~~ | ⏸️ **DEFERRED** | algoritmo |
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

### Phase 7: Wishlist UI

**Goal:** Lojista cadastra wishlist descrevendo carro-alvo. Substitui URL-paste do Phase 5.
**Depends on:** Phase 6 (hooks + DB)
**Estimate:** 2-3 days
**Key deliverables:**
- Módulo `WishlistModule` contra Supabase (hook existe após Phase 6)
- Form `react-hook-form` + `zod` + shadcn/ui
- Fuzzy search FIPE (cascade marca → modelo)
- Preview: "Esta semana acharíamos X anúncios compatíveis"

**UI hint:** yes (drawer form + grid)

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

**Goal:** Pure function `src/lib/matching/engine.ts` (já existe, 23 testes passando) plug-in no DB trigger/Edge Function.
**Depends on:** Phase 7 + Phase 8
**Estimate:** 2-3 days
**Key deliverables:**
- Edge Function ou pg trigger on `listings` insert/update
- Call matching engine contra wishlists ativas do user
- Score ≥ 0.7 cria opportunity
- Dedup por (wishlist_id, listing_id)
- Realtime notification sub
- Computa `fee_amount` = savings × fee_rate(plan) no insert da opportunity

**UI hint:** no (notif + dashboard atualiza)

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
- `deal_fees` infra (testável sem agente — Phase 12 paga fee pra revelar contato PF)

**Open question blocker:** pricing canônico — PRD v3 (R$197/499/1997) ou landing autoagente.ai (R$0+8% / R$1490+4% / R$5900+2.5%)? Decidir ANTES de codar Checkout.

**UI hint:** yes (pricing + billing pages)

### Phase 13b: Digital contracts (DocuSign/ZapSign) 🆕 PROMOVIDO

**Goal:** Infra de geração e assinatura digital de contratos (exclusividade 7 dias + compra/venda).
**Depends on:** Phase 13a (fee paga destrava contrato)
**Estimate:** 3-4 days
**Key deliverables:**
- Template system (`docs/templates/exclusivity-v1.html`, `purchase-sale-v1.html`)
- Provider abstraction (ZapSign primary, DocuSign fallback)
- Tables: `contract_templates`, `contracts`, `contract_events` (migration 0003)
- Endpoints: `/api/contracts/exclusivity`, `/api/contracts/purchase-sale`, `/api/contracts/webhook`
- Supabase Storage bucket `contracts/` (private)
- UI integration em Phase 12

**UI hint:** no (PDF generation server-side), yes (status timeline in opportunities)

### Phase 12: Opportunities dashboard (manual contact mode) 🔄 REFRAMED

**Goal (novo pós-pivot-3):** Lojista vê oportunidades matching reais do DB. Clica em uma → vê detalhes listing + valida o match. Botão "Pagar fee e ver contato" destrava dados do PF (telefone do scrape). Lojista contata PF sozinho via WhatsApp. SEM agente negociando.

**Depends on:** Phase 9 (opportunities existem) + Phase 13a (fee checkout)
**Estimate:** 3-4 days (reduzido — sem thread UI realtime)
**Key deliverables:**
- `OpportunitiesModule` (substitui Marketplace URL-paste de Phase 5)
- Filtros: status, wishlist, região, match_score
- Detail drawer: listing info completa + FIPE + savings + motivation signals
- Fee CTA: "Pagar R$ X e ver contato do vendedor" → Stripe Checkout one-time
- Pós-pagamento: revela phone + name + city
- "Gerar contrato de exclusividade" button (Phase 13b)
- `DashboardModule` metrics reais (opportunities, deals, fee paid total)

**Agent mode (futuro):** quando Phase 10/11 desbloqueia, adiciona thread UI realtime + status progressivo. Estrutura do Opportunities module preparada pra aceitar esse upgrade.

**UI hint:** yes (grid + drawer + payment CTA)

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
| 7. Wishlist UI | seeded | next após 6 |
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
