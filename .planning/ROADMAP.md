# Roadmap: AutoAgent Negotiation Playground

## Overview

O playground parte do zero e entrega, em quatro fases, uma ferramenta completa de validação: primeiro um chat manual funcional onde Felipe pode demonstrar negociações ao vivo; depois um agente mais inteligente com configuração na UI; depois um simulador de PF com batch automático para gerar evidência quantitativa; e por fim ferramentas de análise, export e comparação A/B de prompts para guiar o próximo pivô de produto.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Chat Manual Funcional** - Setup completo + integração FIPE + chat com streaming SSE + resumo de negociação + persistência
- [ ] **Phase 2: Inteligência do Agente** - Scoring de motivação, comparáveis, few-shot canônico, painel de config e AgentThinking
- [ ] **Phase 3: PF Simulado e Batch** - Segundo Claude como PF, runner de batch sem intervenção humana e dashboard de métricas
- [ ] **Phase 4: Análise, Export e A/B** - Export JSON/CSV, versionamento de prompts, comparação side-by-side e anotações manuais

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
- [ ] 01-05-PLAN.md — System prompt v1 builder (verbatim + injection defense + <arg> tags) + kill-switch helper [NEG-03, INFRA-03]
- [ ] 01-06-PLAN.md — /api/negotiate SSE route handler (Anthropic stream + rate limit + kill switch + AbortController) [NEG-03, INFRA-03]
- [ ] 01-07-PLAN.md — UI components (AdListingForm, ChatView, MessageBubble, TypingIndicator, ContextPanel, SummaryPanel, NegotiationStatusBar, KillSwitchBanner, page wiring) [NEG-01, NEG-02, NEG-04, NEG-05, FIPE-02, STATE-02]
- [ ] 01-08-PLAN.md — CI workflow + Vercel deploy + human smoke test [INFRA-02]
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
**Plans**: TBD
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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Chat Manual Funcional | 0/8 | Planned | - |
| 2. Inteligência do Agente | 0/TBD | Not started | - |
| 3. PF Simulado e Batch | 0/TBD | Not started | - |
| 4. Análise, Export e A/B | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-18*
*Last updated: 2026-04-18 after Phase 1 planning (8 plans across 6 waves)*
