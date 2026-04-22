# Roadmap: AutoAgent — B2B Seminovos Marketplace

## Overview

AutoAgent é um marketplace transacional B2B para lojistas de seminovos. O agente IA monitora WebMotors 24/7, identifica anúncios compatíveis com as wishlists dos lojistas, aborda autonomamente o PF vendedor via form interno do WebMotors, negocia -20 a -30% vs FIPE, e entrega oportunidades pré-fechadas pro lojista "assumir".

Histórico:
- **Phases 1-4** (2026-04-18 → 2026-04-21): playground técnico pra validar o motor de negociação. ✅ Phase 1 shipped, 2-4 deferred.
- **Phase 5** (2026-04-21 → 2026-04-22): pivot 1 — v3 product shell + Backstage autoplay + Apify on-demand URL-paste. Shell dashboard shipado como prova visual. ✅ shipped com shortcuts (localStorage, URL-paste em vez de matching automático, sem agente real fazendo outreach).
- **Phases 6-13** (2026-04-22 →): pivot 2 — produto real WebMotors-only, full-auto agent outreach, DB Supabase, elimina URL-paste.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, ..., 13): Planned phase work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

### Legacy (shipped or deferred)

- [x] **Phase 1: Chat Manual Funcional** ✅ (7/8 plans done) — Setup + FIPE + chat streaming + system prompt v1. Motor reaproveitado como núcleo do agent loop de Phase 11.
- [ ] **Phase 2: Inteligência do Agente** — DEFERRED até pós-PMF. Scoring de motivação, comparáveis, painel de config.
- [ ] **Phase 3: PF Simulado e Batch** — DEFERRED. Partially absorvido em Phase 5 (AutoplayBackstage + /api/simulate-pf).
- [ ] **Phase 4: Análise, Export e A/B** — DEFERRED.
- [x] **Phase 5: v3 Product Shell (pivot 1)** ✅ (8/8 waves shipped) — Dashboard 7 módulos + Backstage autoplay + Apify on-demand + dark mode + onboarding + mobile drawer + autoagente.ai deploy. Substituído em parte pelos módulos reais (Wishlist replaces Marketplace-import, Inbox replaces Backstage-live) em Phases 7-12.

### Active direction (2026-04-22 →)

- [ ] **Phase 6: Supabase foundation** 🔜 NEXT
- [ ] **Phase 7: Wishlist UI** (seeded)
- [ ] **Phase 8: Scraping pipeline WebMotors** (seeded)
- [ ] **Phase 9: Matching engine** (seeded)
- [ ] **Phase 10: Outreach sender** (seeded)
- [ ] **Phase 11: Inbound + agent loop** (seeded)
- [ ] **Phase 12: Inbox dashboard** (seeded)
- [ ] **Phase 13: Contracts + escrow + Stripe** (seeded)

## Phase Details

### Phase 6: Supabase foundation

**Goal:** Multi-tenant real com auth + DB Postgres + RLS. Elimina localStorage single-tenant. Schema cobre todas as tabelas dos phases 7-12 upfront pra não precisar migrations quebradas depois.
**Depends on:** nothing (foundational)
**Estimated duration:** 5-7 dias solo dev
**Key deliverables:**
- Projeto Supabase ativo (sa-east-1 preferido)
- Migrations SQL em `supabase/migrations/` (init + RLS + seed data dev)
- Auth: email magic-link + Google OAuth
- Clients: `src/lib/supabase/{client,server,middleware}.ts`
- Migration Zustand persist → Supabase hooks preservando API dos stores
- Middleware Next.js pra route protection `/app/*`
- Auth UI: `/login`, `/signup`, `/reset-password`
- Seed script pra dev data

**Tables:** `users`, `wishlists`, `listings`, `opportunities`, `deals`, `agent_threads`, `agent_messages`, `bot_accounts`, `pending_outbox`, `scrape_runs`
**Plans:** TBD — scope em `.planning/phases/06-supabase-integration/06-PHASE-SEED.md`
**UI hint:** yes (auth screens)

### Phase 7: Wishlist UI

**Goal:** Lojista cadastra "wishlist" descrevendo o carro-alvo (modelo, ano-range, km-max, preço-max, região, combustível, câmbio, blindagem). Substitui completamente o fluxo "colar URL do WebMotors" da Phase 5.
**Depends on:** Phase 6
**Estimated duration:** 2-3 dias
**Key deliverables:**
- Módulo `WishlistModule` substituindo `MarketplaceModule` URL-import CTA
- Form com `react-hook-form` + `zod` + shadcn/ui
- Fuzzy search de modelos via FIPE (cascade marca → modelo)
- Múltiplas wishlists por lojista (cada carro = uma wishlist)
- Edição / pausar / deletar wishlist
- Preview read-only: "Esta semana acharíamos X anúncios compatíveis" (roda matching engine contra listings já no banco)

**UI hint:** yes

### Phase 8: Scraping pipeline WebMotors

**Goal:** Apify scheduled actor WebMotors roda a cada N horas (configurável), normaliza, deduplica e insere em `listings`. FIPE enrichment automático. Log de `scrape_runs`.
**Depends on:** Phase 6 (tabela listings precisa existir)
**Estimated duration:** 3-4 dias
**Key deliverables:**
- Wrapper `src/lib/apify/webmotors.ts` (atualiza o client existente de Phase 5)
- Edge Function ou cron worker disparando Apify run
- Normalização: preço, km, ano, localização, fotos, motivation signals → canonical shape
- Dedup fingerprint (hash anunciante_id + modelo + ano + km + preço atual)
- Upsert logic: listing existente → update price + reductions + days_online
- FIPE enrichment no insert (chamada automática ao motor existente)
- Tabela `scrape_runs` (start, end, cost_apify, listings_new, listings_updated, listings_error)

**UI hint:** no (admin view eventually)

### Phase 9: Matching engine

**Goal:** Listing novo/atualizado → matching contra wishlists ativas → oportunidades criadas automaticamente. Score do match define priority.
**Depends on:** Phase 7 + Phase 8
**Estimated duration:** 2-3 dias
**Key deliverables:**
- Edge Function ou DB trigger on `listings` insert/update
- Algoritmo de matching em `src/lib/matching/engine.ts` (pure function)
- Rules: modelo fuzzy, ano range, km threshold, preço vs FIPE, região heuristics
- Score threshold de criação (ex: ≥0.7 vira opportunity)
- Dedup: 1 opportunity por (wishlist_id, listing_id)
- Notificação realtime Supabase pro lojista (sub to opportunities)
- Testes unitários exaustivos (matching sem DB)

**UI hint:** no (notificação chega pelo dashboard)

### Phase 10: Outreach sender

**Goal:** Oportunidade criada → agente compõe mensagem inicial via Claude → enfileira em pending_outbox → Apify sender actor submete form no WebMotors via conta bot.
**Depends on:** Phase 9
**Estimated duration:** 4-5 dias
**Key deliverables:**
- Tabela `bot_accounts` (cred encrypted via Supabase Vault)
- Tabela `pending_outbox` (job queue)
- Apify sender actor (Playwright): login bot → navigate listing → submit form
- Throttling: max 15-25 msg/dia por conta, randomized delays, account warming schedule
- Prompt composer: opener message com context da wishlist + listing + FIPE
- LGPD compliance: policy page + opt-out honrando "SAIR" em inbound
- Retry logic + dead letter queue pra falhas

**UI hint:** admin view only (lojista não vê)

### Phase 11: Inbound + agent loop

**Goal:** PF respondeu no WebMotors → receiver detecta → Claude gera reply autonomamente → outbox → sender envia. Loop até convergência ou recusa.
**Depends on:** Phase 10
**Estimated duration:** 4-5 dias
**Key deliverables:**
- Apify receiver actor: roda a cada 5-10min, loga em cada bot_account, scrapa inbox, diff vs snapshot, insere novas mensagens em `agent_messages`
- Edge Function trigger on new inbound message
- Agent reply pipeline: reúne thread history + opportunity + wishlist + FIPE → Claude → reply → outbox
- Escalation rules: Claude detecta pedido de dado ausente (doc específico, CRLV, etc.) → marca thread `status=escalated`
- Guardrails no prompt: não passa contato, não oferece abaixo de hard floor, não discute AutoAgent
- Convergence detection: Claude identifica "PF aceitou" ou "PF recusou" → muda thread.status
- Testes de prompt com conversas mock

**UI hint:** no (agente autônomo)

### Phase 12: Inbox dashboard

**Goal:** Lojista no dashboard vê threads ativas do agente em tempo real, pode ler mas não intervir. Status claro. "Assumir Deal" aparece quando converge.
**Depends on:** Phase 11
**Estimated duration:** 2-3 dias
**Key deliverables:**
- `OpportunitiesModule` revisitado (substitui MarketplaceModule de Phase 5)
- Lista de opportunities filtráveis por status (initiating/negotiating/converged/lost/escalated)
- Detail drawer mostrando thread messages realtime (Supabase subs)
- Read-only (lojista não pode mandar mensagem)
- Escalation inbox: threads com status=escalated aparecem separadas, lojista pode adicionar info via prompt adicional
- "Assumir Deal" button quando converged → Phase 13 flow
- Notificações: email + in-app quando nova opportunity ou status muda

**UI hint:** yes

### Phase 13: Contracts + escrow + Stripe

**Goal:** Closing completo. Lojista clicou "Assumir Deal" → Stripe Checkout → PDF exclusividade + contrato → liberação do contato PF.
**Depends on:** Phase 12
**Estimated duration:** 5-7 dias
**Key deliverables:**
- Stripe Customer portal + subscription (Starter R$197 / Premium R$499 / Enterprise R$1.997)
- Stripe Checkout pra success fee (% variável por tier)
- Webhook Stripe → sync subscriptions table
- ZapSign integration: PDF exclusividade digital 7 dias assinado pelo PF
- Contrato compra e venda gerado + campos preenchidos
- Revelação do contato PF (telefone + nome + endereço) só após fee pago
- Escrow: conta bancária segregada (talvez Phase 13b, avaliar provider: Transfeera / PagHiper / etc.)

**UI hint:** yes (checkout + contract flows)

## Progress

### Execution Order

Phases agora executam na ordem numérica 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13. Phases 7/8 podem paralelizar após Phase 6 (não têm dep entre si). Phases 10/11 têm dependência hard de 9.

### Status

| Phase | Plans | Status | Started | Completed |
|-------|-------|--------|---------|-----------|
| 1. Chat Manual Funcional | 7/8 | ✅ shipped (01-08 superseded) | 2026-04-18 | 2026-04-20 |
| 2. Inteligência do Agente | 0/7 | ⏸️ deferred | - | - |
| 3. PF Simulado e Batch | 0/0 | ⏸️ deferred (partial in P5) | - | - |
| 4. Análise, Export e A/B | 0/0 | ⏸️ deferred | - | - |
| 5. v3 Product Shell | 8/8 | ✅ shipped w/ shortcuts | 2026-04-21 | 2026-04-22 |
| **6. Supabase foundation** | **0/TBD** | **🔜 next** | - | - |
| 7. Wishlist UI | 0/TBD | seeded | - | - |
| 8. Scraping pipeline | 0/TBD | seeded | - | - |
| 9. Matching engine | 0/TBD | seeded | - | - |
| 10. Outreach sender | 0/TBD | seeded | - | - |
| 11. Inbound + agent loop | 0/TBD | seeded | - | - |
| 12. Inbox dashboard | 0/TBD | seeded | - | - |
| 13. Contracts + escrow + Stripe | 0/TBD | seeded | - | - |

### Parallel work (user blockers)

Coisas que dependem do usuário e devem começar em paralelo ao dev:

- [ ] Criar projeto Supabase (us-east-1 ou sa-east-1) → passar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Criar 5-10 contas bot WebMotors (emails leads.sp+01@ … +10@ autoagente.ai)
- [ ] Abrir CNPJ AutoAgente (1-2 semanas) — pré-req Meta Business + ZapSign + Stripe Brasil
- [ ] Iniciar processo Meta Business WhatsApp API (1-4 semanas após CNPJ)
- [ ] Política de Privacidade + Termos publicados em autoagente.ai/privacidade e /termos (pré-req LGPD antes de Phase 10 ir vivo)

---
*Roadmap created: 2026-04-18*
*Major pivot 1: 2026-04-21 — Phase 5 v3 shell*
*Major pivot 2: 2026-04-22 — Phases 6-13 pra produto real WebMotors full-auto*
*Last updated: 2026-04-22*
