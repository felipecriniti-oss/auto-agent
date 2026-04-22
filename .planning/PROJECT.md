# AutoAgent — B2B Seminovos Marketplace

## Pivot Notice (2026-04-22)

**Direction lock (2026-04-22):** pivot total para produto real, sem foco em demo Felipe. Sexta 2026-04-24 pode mostrar o shell v3 shipado como "UI final, motor vem nas próximas semanas". Trabalho efetivo passa a ser **Phases 6-13 na ordem**.

**Decisões travadas:**
- **WebMotors only** (sem OLX, sem Mercado Livre na MVP — simplifica scraping + pool de contas bot)
- **Full automation, sem human-in-the-loop** — agente gera mensagem, submete pelo form interno do WebMotors, lê respostas do inbox bot, responde autonomamente via Claude. Lojista só vê threads read-only e assume deal quando converger.
- **Lojista descreve wishlist em vez de colar URL** — resolve o paradoxo econômico "se ele achou o anúncio ele não paga fee"
- **Supabase para DB + auth + realtime** — localStorage single-tenant morre na Phase 6

**Anterior (2026-04-21):** foco Phase 5 v3 shell com Backstage autoplay (shipped). Foi o MVP visual pra validar direção. Objetivo cumprido.

## What This Is

AutoAgent é um marketplace transacional B2B para lojistas de seminovos. Lojistas pagam assinatura dual-tier (Starter R$197 / Premium R$499 / Enterprise R$1.997) + success fee (6%/3%/2% sobre economia vs FIPE).

**Operação real (produto-alvo):**

1. Lojista cadastra **wishlist** — "quero Honda Civic 2018+, até 80k, máx 60k km, Grande SP"
2. Scraping contínuo do WebMotors identifica anúncios matching
3. Matching engine cria **oportunidades** automáticas
4. Agente Claude compõe mensagem de outreach e submete via form interno do WebMotors (conta bot nossa)
5. Agente negocia autonomamente com PF via thread do WebMotors até preço-alvo ou recusa
6. Quando converge (PF aceitou), oportunidade vira "Assumir Deal" no dashboard do lojista
7. Lojista paga fee → recebe contato PF + docs
8. AutoAgent intermedeia laudo, contrato, transferência, escrow

**PF nunca é cliente.** Non-Goal NG4 do PRD: "Atender vendedor PF como cliente B2C". PF é lead capturado via scraping + abordado autonomamente.

## Core Value

A proposta de valor é **volume + preço** que o lojista sozinho não consegue: lojista cadastra wishlist uma vez, sistema trabalha 24/7 achando e negociando, lojista só assume deals já pré-fechados abaixo de FIPE. Fee só faz sentido porque lojista **não conhecia o anúncio** nem fez a negociação.

## Roadmap Atual (2026-04-22)

| # | Phase | Status | Entrega |
|---|---|---|---|
| 1 | Chat Manual Funcional | ✅ shipped (reaproveitado) | Motor de negociação Claude, FIPE, streaming |
| 2-4 | Inteligência / Batch / Análise | ⏸️ deferred | Merge parcial em Phase 3 (autoplay) |
| 5 | v3 Product Shell (pivot 1) | ✅ shipped w/ shortcuts | Dashboard shell, Backstage autoplay, Apify on-demand URL-paste |
| **6** | **Supabase foundation** | **🔜 NEXT** | Auth + DB + RLS + client migration |
| 7 | Wishlist UI | seeded | Lojista cadastra carro alvo em vez de colar URL |
| 8 | Scraping pipeline WebMotors | seeded | Apify schedule + listings table + dedup |
| 9 | Matching engine | seeded | Listings → wishlists → opportunities |
| 10 | Outreach sender | seeded | Bot accounts + sender actor + pending_outbox |
| 11 | Inbound + agent loop | seeded | Receiver actor + Claude reply loop |
| 12 | Inbox dashboard | seeded | Lojista vê threads realtime read-only |
| 13 | Contracts + escrow + Stripe | seeded | PDF gen, ZapSign, escrow, billing |

Estimativa: **~28-37 dias de dev** para produto vendável no fim da Phase 12. Phase 13 é closing completo.

## Requirements

### Validated (Phase 1 + 5)

- Motor de negociação Claude consegue negociar multi-rodada com streaming
- Apify ribtools actor extrai dados estruturados de anúncios WebMotors
- FIPE Parallelum cascade funciona com fuzzy match e chunked parallel (10-at-a-time)
- Dashboard lojista shell é compreensível (7 módulos, Backstage, autoplay)
- Dark mode funciona com fallback CSS para bg-*/text-*/border-* patterns

### Active (Phase 6-13)

**Phase 6 — Supabase foundation**
- [ ] Projeto Supabase criado (região sa-east-1 ou us-east-1)
- [ ] Auth: email magic-link + Google OAuth
- [ ] Schema: users, wishlists, listings, opportunities, deals, agent_threads, agent_messages, bot_accounts, pending_outbox
- [ ] RLS policies (multi-tenant hard isolation via auth.uid())
- [ ] Migration do Zustand persist → Supabase queries preservando API dos hooks
- [ ] Middleware Next.js pra session refresh + route protection

**Phase 7 — Wishlist UI**
- [ ] Form "Cadastrar carro-alvo": modelo (fuzzy search FIPE), ano range, km max, preço max, região, combustível, câmbio, blindagem opcional
- [ ] Múltiplas wishlists por lojista (cada carro = uma wishlist independente)
- [ ] Edição/pausa/delete de wishlist
- [ ] Preview: "Esta semana o sistema achou X anúncios compatíveis" (prova direção pro lojista antes de ativar)

**Phase 8 — Scraping pipeline WebMotors**
- [ ] Apify scheduled actor ribtools rodando a cada X horas
- [ ] Normalização: preço, km, ano, localização, fotos → formato canônico
- [ ] Dedup por fingerprint (hash de anunciante+modelo+ano+km+preço)
- [ ] FIPE enrichment automático no insert
- [ ] Upsert logic: listing já existe? Só atualiza preço + reduções + dias_online
- [ ] Log de `scrape_runs` (schedule, cost, new vs updated vs errored)

**Phase 9 — Matching engine**
- [ ] Edge Function trigger on listing insert/update
- [ ] Matching algorithm: wishlist rules → listing score
- [ ] Threshold de criação de oportunidade (ex: score ≥ 0.7)
- [ ] Dedup de oportunidade (não criar 2x para mesmo lojista+listing)
- [ ] Notificação realtime pro lojista quando nova oportunidade criada

**Phase 10 — Outreach sender**
- [ ] Tabela bot_accounts (credenciais WebMotors, encrypted via Supabase Vault)
- [ ] pending_outbox queue
- [ ] Apify sender actor: pick job → login bot → navigate listing → submit form "Enviar mensagem"
- [ ] Throttling: max N msg/dia por conta, randomized delays
- [ ] Account warming schedule para contas novas
- [ ] LGPD opt-out: honrar "SAIR" em thread, adicionar a blacklist
- [ ] Prompt do opener message (Claude + context da wishlist + listing)

**Phase 11 — Inbound + agent loop**
- [ ] Apify receiver actor: polla inbox de cada bot_account a cada 5-10min
- [ ] Diff contra snapshot → detecta novas mensagens do PF
- [ ] Insert em agent_messages (direction=inbound)
- [ ] Edge Function trigger: novo inbound → Claude reply com contexto completo da thread + wishlist + FIPE
- [ ] Escalation rules: Claude marca thread "needs_human" em casos específicos
- [ ] Pricing guardrails no prompt (não oferece abaixo de X, não passa contato, etc.)

**Phase 12 — Inbox dashboard**
- [ ] Lista de threads ativas por opportunity (realtime via Supabase subscriptions)
- [ ] Thread view: ver conversa agent ↔ PF, não pode intervir (read-only)
- [ ] Status badges (initiating / negotiating / converged / lost / escalated)
- [ ] "Assumir Deal" aparece quando thread.status=converged
- [ ] Notificações quando thread muda status (email + in-app)

**Phase 13 — Contracts + escrow + Stripe**
- [ ] PDF exclusividade digital de 7 dias (ZapSign integration)
- [ ] Geração de contrato de compra e venda
- [ ] Stripe Checkout: success fee cobrado no "Assumir Deal"
- [ ] Subscriptions: tier Starter/Premium/Enterprise
- [ ] Webhook Stripe para sync de subscriptions
- [ ] Escrow: conta bancária segregada (fase 13b, talvez adiado)

### Out of Scope (MVP)

- **OLX / Mercado Livre** — pós validação WebMotors com lojistas pagantes
- **WhatsApp Business oficial** — em paralelo com Phase 11 (Meta approval 1-4 semanas), canal secundário quando aprovado
- **Voice AI (Vapi/Bland)** — pós product-market fit
- **Multi-loja enterprise** — um lojista = uma conta, multi-CNPJ pode usar contas separadas no MVP
- **API pública** — tier Enterprise tem na promessa, MVP só UI
- **Mobile app nativo** — PWA + web responsivo suficiente
- **i18n** — pt-BR hardcoded
- **Email marketing automation** — basic transactional emails only via Supabase Auth

### Risks Accepted

- **Violação de ToS WebMotors** — automação de contato é gray area; mitigação: pool de 5-10 contas rotativas, warming, rate-limiting randomizado. Perda esperada: ~1 conta/mês em regime.
- **LGPD** — scraping de dados públicos + contato automatizado. Mitigação: política de privacidade publicada, opt-out honrado em toda thread (responda SAIR), registro legal CNPJ + DPO designado antes de scale.
- **Apify cost at scale** — ~$50-300/mês escalando com volume. Revisita quando passar de $200 ou quando ator público WebMotors falhar.

## Context

**Agentes do produto:**
- **Lojistas (clientes B2B)** — cadastram wishlist, recebem oportunidades, pagam fee
- **PF vendedor (lead)** — nunca é cliente, é alvo de outreach automatizado via WebMotors
- **Agente Claude (núcleo)** — compõe mensagens, negocia autonomamente, gera resumos
- **Bot accounts WebMotors (nosso)** — 5-10 contas rotativas submetendo forms

**Especificações fonte:**
- `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` (2026-04-18) — canônico
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` — referência visual
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_Business_Plan_v3.docx`
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_Financial_Model_v3.xlsx`

## Constraints

- **Stack:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand — não negociável
- **LLM:** Anthropic Claude Sonnet 4.6 exclusivamente (ID `claude-sonnet-4-6`)
- **DB:** Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)
- **Scraping:** Apify managed actors (ribtools para WebMotors)
- **Payments:** Stripe (Phase 13)
- **Contract signing:** ZapSign (Phase 13)
- **Deploy:** Vercel primary (autoagente.ai / workspace.autoagente.ai para app)
- **Performance:** <2s first render no Edge, realtime subs mantém UI fresca

## Key Decisions

| Decision | Date | Rationale | Outcome |
|----------|------|-----------|---------|
| Next.js App Router + TypeScript strict | 2026-04-18 | Alinhamento com futuro do framework; SSR + Server Components | ✅ in production |
| Tailwind v4 + shadcn/ui | 2026-04-18 | Reaproveita UX Prototype do Felipe | ✅ in production |
| Zustand pra estado local | 2026-04-18 | Simples, sem boilerplate | ✅ in production; será migrado pra Supabase hooks em Phase 6 |
| Biome em vez de ESLint+Prettier | 2026-04-18 | Mais rápido, config única | ✅ in production |
| Claude Sonnet 4.6 (não GPT-4) | 2026-04-18 | Alinhamento com stack escolhido pelo projeto pai | ✅ in production |
| Phase 5 como pivot v3 shell | 2026-04-21 | Validar direção B2B marketplace antes de investir em DB/scraping | ✅ shipped |
| Supabase (não self-hosted Postgres) | 2026-04-21 | Auth + Realtime + RLS built-in; Edge Functions pro matching/agent loop; free tier suficiente pra dev | 🔜 Phase 6 |
| Apify para scraping (não self-hosted Playwright) | 2026-04-21 | Actor WebMotors já existe (ribtools); proxies + anti-bot inclusos; $50-300/mo MVP | ✅ on-demand in production; 🔜 schedule em Phase 8 |
| WebMotors only MVP | 2026-04-22 | Simplifica scraping + pool bot accounts; valida com menos surface; expande pós-PMF | 🔜 Phase 8 |
| Full automation outreach (sem HITL) | 2026-04-22 | Lojista não pode ter acesso ao contato do PF antes de pagar fee; HITL permitiria bypass | 🔜 Phase 10-11 |
| Dark mode via CSS fallback layer | 2026-04-21 | Evita anotar dark: em cada componente; remapeia slate-* / bg-white em `.dark` scope | ✅ shipped |
| Root `/` renders AppShell (não PlaygroundModule) | 2026-04-22 | workspace.autoagente.ai aponta pra raiz; dashboard v3 direto | ✅ shipped |

## Evolution

Este documento evolui nas transições de fase e marcos de milestone. Próxima revisão grande: ao fim de Phase 6 (Supabase em produção) ou se direção mudar outra vez.

---
*Last updated: 2026-04-22 — pivot pra produto real full-auto WebMotors; roadmap expandido 6→13 phases; Phase 5 marcado como shipped-with-shortcuts*
