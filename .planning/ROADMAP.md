# Roadmap: AutoAgent Negotiation Playground

## Overview

O playground parte do zero e entrega, em quatro fases, uma ferramenta completa de validação: primeiro um chat manual funcional onde Felipe pode demonstrar negociações ao vivo; depois um agente mais inteligente com configuração na UI; depois um simulador de PF com batch automático para gerar evidência quantitativa; e por fim ferramentas de análise, export e comparação A/B de prompts para guiar o próximo pivô de produto.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Chat Manual Funcional** - Setup completo + integração FIPE + chat com streaming SSE + resumo de negociação + persistência (7/8 plans done; 01-08 CI/deploy superseded by Phase 5 demo)
- [ ] **Phase 2: Inteligência do Agente** — DEFERRED — Scoring de motivação, comparáveis, few-shot canônico, painel de config e AgentThinking
- [ ] **Phase 3: PF Simulado e Batch** — DEFERRED (partially superseded by /api/simulate-pf + AutoplayBackstage in Phase 5)
- [ ] **Phase 4: Análise, Export e A/B** — DEFERRED — Export JSON/CSV, versionamento de prompts, comparação side-by-side e anotações manuais
- [ ] **Phase 5: v3 Product Shell (pivot)** - Dashboard lojista com 7 módulos + Backstage autoplay (agente ↔ PF sim) + Apify on-demand + deploy autoagente.ai (EXECUTING, deadline 2026-04-24)
- [ ] **Phase 6: Supabase + Stripe** — SEEDED 2026-04-21 — Real auth + Postgres + RLS + Stripe Checkout; trigger: após Felipe assinar Phase 5 na sexta

## Phase Details

### Phase 1: Chat Manual Funcional
**Goal**: Felipe consegue abrir a URL pública, preencher um anúncio real, negociar rodadas com o agente via streaming e ver um resumo claro ao final
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, FIPE-01, FIPE-02, NEG-01, NEG-02, NEG-03, NEG-04, NEG-05, STATE-01, STATE-02
**Success Criteria** (what must be TRUE):
  1. Usuário pode preencher o formulário de anúncio (marca, modelo, ano, km, preço pedido, cidade, dias online, reduções), buscar o preço FIPE via Parallelum e ver o preço-alvo calculado automaticamente
  2. O chat exibe a resposta do agente em streaming char-by-char com bubbles por turno, autoscroll e indicador de "agente digitando"
  3. Usuário pode encerrar a negociação e ver resumo com rodadas percorridas, preço inicial/final, percentual de redução vs preço pedido e vs FIPE, e argumentos usados
  4. Histórico da sessão persiste entre reloads do browser (localStorage), sem banco de dados ou autenticação
  5. A URL pública na Vercel carrega o app em menos de 2 segundos
**Plans**: 8 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold (Next 15 + Tailwind v4 + shadcn New York + Biome + pnpm + Vitest + deny-list) [INFRA-01]
- [x] 01-02-PLAN.md — Zod schemas (listing, fipe cascade, negotiate) + parseFipeValor + Session/Message types [NEG-01, FIPE-01, NEG-02]
- [x] 01-03-PLAN.md — Zustand store with persist middleware + derived prices + arg extraction [STATE-01, STATE-02, NEG-02, NEG-05, FIPE-02]
- [x] 01-04-PLAN.md — /api/fipe route (Parallelum cascade + Zod + fuzzy match + rate limit) + shared rate-limit module [FIPE-01, FIPE-02, INFRA-03]
- [x] 01-05-PLAN.md — System prompt v1 builder (verbatim + injection defense + <arg> tags) + kill-switch helper [NEG-03, INFRA-03]
- [x] 01-06-PLAN.md — /api/negotiate SSE route handler (Anthropic stream + rate limit + kill switch + AbortController) [NEG-03, INFRA-03]
- [x] 01-07-PLAN.md — UI components (AdListingForm, ChatView, MessageBubble, TypingIndicator, ContextPanel, SummaryPanel, NegotiationStatusBar, KillSwitchBanner, page wiring) [NEG-01, NEG-02, NEG-04, NEG-05, FIPE-02, STATE-02]
- [~] 01-08-PLAN.md — CI workflow + Vercel deploy + human smoke test [INFRA-02] — partially done (Vercel live at auto-agent-chi.vercel.app since 2026-04-19, autoagente.ai DNS pending); CI workflow deferred, superseded by Phase 5 demo push
**UI hint**: yes

### Phase 2: Inteligência do Agente
**Goal**: O agente toma decisões visivelmente melhores baseadas em sinais do anúncio, e Felipe/Lucas podem ajustar parâmetros na UI sem fazer novo deploy
**Depends on**: Phase 1
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04, INTEL-05, INTEL-06
**Success Criteria** (what must be TRUE):
  1. O sistema calcula automaticamente um scoring de motivação do PF a partir de dias online, número de reduções e motivo declarado, e o injeta no prompt da negociação
  2. Comparáveis sintéticos e o few-shot canônico da negociação Audi Q5 estão presentes no system prompt e produzem argumentações mais precisas do agente
  3. Usuário pode editar targetDiscount, maxRounds, tone e initialAnchorStrategy no painel de configuração da UI, sem reload, e os parâmetros persistem em localStorage
  4. O componente AgentThinking pode ser ativado via toggle e exibe o rationale do agente durante a negociação
  5. Benchmark manual de N negociações gera scorecard com redução média %, rodadas médias e qualidade subjetiva 1–5 — resultado positivo é gate de conclusão da fase
**Plans**: 7 plans
Plans:
- [ ] 02-00-PLAN.md � Wave 0 scaffolds: shadcn components + 13 test stubs [INTEL-01..06]
- [ ] 02-01-PLAN.md � Wave 1 foundations: types + schemas + motivation + comparables + tone + few-shot [INTEL-01..04]
- [ ] 02-02-PLAN.md � Wave 2 composition: system-v2 prompt + migrations + anthropic adapter extension [INTEL-01..05]
- [ ] 02-03-PLAN.md � Wave 3 integration: Zustand store extension + route handler promptVersion branching [INTEL-01..06]
- [ ] 02-04-PLAN.md � Wave 4 UI: AgentConfigForm + LeftColumnPanel + AgentThinking + ContextPanel motivation [INTEL-01, INTEL-04, INTEL-05]
- [ ] 02-05-PLAN.md � Wave 5 benchmark: /benchmark route + StarRating + Nav + layout [INTEL-06]
- [ ] 02-06-PLAN.md � Wave 6 integration: token measurement + canonical replay + Felipe smoke test checkpoint [INTEL-01..06]
**UI hint**: yes

### Phase 3: PF Simulado e Batch
**Goal**: Lucas pode rodar 20+ negociações automáticas agente–PF-sim e obter métricas agregadas sem nenhuma intervenção manual
**Depends on**: Phase 2
**Requirements**: BATCH-01, BATCH-02, BATCH-03, BATCH-04
**Success Criteria** (what must be TRUE):
  1. A rota `/api/simulate-pf` retorna respostas de um segundo Claude atuando como PF com a persona selecionada (resistente, ansioso, bem-informado, desesperado)
  2. A página `/batch` aceita uma lista de anúncios em CSV ou JSON, executa o loop agente–PF-sim até o limite de rodadas ou timeout, sem intervenção humana
  3. O dashboard de batch exibe taxa de fechamento, percentual de redução médio vs FIPE, rodadas médias e fee teórico médio (6% da economia) para o lote executado
  4. Estimativa de custo é exibida antes de iniciar o batch; execução para automaticamente se o cap configurável for ultrapassado
**Plans**: TBD

### Phase 4: Análise, Export e A/B
**Goal**: Dá para responder "a versão v3 do prompt é melhor que v2?" com dados exportáveis e comparação visual, e cada conversa pode ser anotada manualmente
**Depends on**: Phase 3
**Requirements**: EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05
**Success Criteria** (what must be TRUE):
  1. Usuário pode exportar qualquer conversa individual em JSON com metadata completa (listing, persona, versão do prompt, timestamps, resultado)
  2. Usuário pode exportar os resultados de um batch em CSV com todas as colunas de resultado
  3. Cada negociação registra automaticamente qual versão do system prompt foi usada, visível no export e na UI
  4. Usuário pode rodar o mesmo lote de anúncios com 2 versões de prompt diferentes e ver uma comparação side-by-side dos resultados
  5. Usuário pode adicionar anotações manuais em conversas individuais (ex: "boa negociação", "agente agressivo demais")
**Plans**: TBD
**UI hint**: yes

### Phase 5: v3 Product Shell (pivot)
**Goal**: Shell lojista completo + Backstage autoplay (agente ↔ PF sim) + Apify on-demand + deploy autoagente.ai — demo para Felipe sexta 2026-04-24
**Depends on**: Phase 1 (chat engine é reaproveitado via AutoplayBackstage / BackstageModule)
**Pivot context**: User reviewed Phase 1 on 2026-04-21 and flagged directional error — AutoAgente é marketplace B2B lojista, não PF-self-service. Scope: 7 dashboard modules + reuse Phase 1 chat engine as Backstage module. Details in `.planning/phases/05-v3-pivot/05-PHASE-PLAN.md`.
**Plans**: 8 (waves across 3 days)
Plans:
- [x] 05-01-PLAN (de facto) — Wave 0: AppShell + Sidebar + Zustand store + 9 module stubs
- [x] 05-02-PLAN (de facto) — Wave 0: v3 UI primitives (Badge, KPICard, ScoreRing, DealStatusBadge, SourceBadge, TrustPanel, ChatHistoryView)
- [x] 05-03-PLAN (de facto) — Wave 1: MarketplaceModule + detail drawer + filter + Assumir Deal flow
- [x] 05-04-PLAN (de facto) — Wave 1: DashboardModule (KPI hero + tier selector + charts)
- [x] 05-05-PLAN (de facto) — Wave 1: MyDeals + Settings/Plans + Radar
- [x] 05-06-PLAN (de facto) — Wave 2: BackstageModule solo-chat + AutoplayBackstage sibling + Modo Piloto theater + /api/simulate-pf
- [x] 05-07-PLAN (de facto) — Wave 2: Apify integration (ribtools actor + full field mapping + photoUrl + listingUrl)
- [ ] 05-08-PLAN — Wave 3: Dark mode ✅ shipped, onboarding polish, autoagente.ai DNS (user), APIFY_API_TOKEN on Vercel (user), end-to-end smoke test
**UI hint**: yes

### Phase 6: Supabase + Stripe (seeded)
**Goal**: Real multi-tenant auth + Postgres + RLS + Stripe Checkout — elimina localStorage single-tenant do Phase 5
**Depends on**: Phase 5 sign-off from Felipe on 2026-04-24
**Trigger**: After Phase 5 demo passes sign-off. Estimated start 2026-04-28.
**Plans**: TBD — scope and waves in `.planning/phases/06-supabase-integration/06-PHASE-SEED.md`

## Progress

**Execution Order:**
Phases now execute: 1 ✅ → 5 (pivot, active) → 6 (seeded) → 2, 3, 4 (deferred, revisit after Phase 6)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Chat Manual Funcional | 7/8 | Executing (01-08 deferred) | - |
| 2. Inteligência do Agente | 0/7 | Deferred (post-Phase 5/6) | - |
| 3. PF Simulado e Batch | 0/TBD | Deferred (spirit partially in Phase 5) | - |
| 4. Análise, Export e A/B | 0/TBD | Deferred | - |
| 5. v3 Product Shell (pivot) | 7/8 | Executing (deadline 2026-04-24) | - |
| 6. Supabase + Stripe | 0/TBD | Seeded | - |

---
*Roadmap created: 2026-04-18*
*Last updated: 2026-04-21 — added Phase 5 v3 pivot, Phase 6 Supabase seed, and reality-matched progress table after autoplay + Apify enrichment + dark mode shipped*
