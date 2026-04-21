# AutoAgent — v3 Product Shell

## Pivot Notice (2026-04-21)

Repo pivotou da "playground de validação técnica" para o **produto v3 completo** após review do deploy Phase 1 com o usuário. Direção autoritativa: `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` + UX Prototype v3. Deadline duro: sexta 2026-04-24 (demo Felipe).

**Antes do pivô:** playground unidirecional (PF simulado dialogando com agente) = **errado**. Usuário corrigiu: AutoAgent é B2B, lojista-facing, PF é lead via WhatsApp.

**Phase 1 status:** 7/8 plans deployados, chat engine funcional — será reaproveitado como módulo Backstage no shell v3. Plans 02-00..02-06 (Inteligência do Agente) ficam deferred até o pivô v3 estabilizar.

## What This Is (v3)

AutoAgent é um marketplace transacional B2B para lojistas de seminovos. Lojistas pagam assinatura dual-tier (Starter R$197 / Premium R$499 / Enterprise R$1.997) + success fee (6%/3%/2% sobre economia vs FIPE). Agente IA monitora marketplaces (WebMotors/OLX/Mercado Livre), aborda PFs motivados, negocia -20 a -30% da FIPE, e entrega oportunidades pré-negociadas no dashboard do lojista. Lojista "Assume Deal", paga fee, recebe contato + documentação. AutoAgent intermedeia laudo/contrato/transferência/escrow.

**Este repo entrega (até sexta 24/04):** shell completo do dashboard lojista com 7 módulos (Marketplace, Meus Deals, Backstage, Dashboard, Radar, Settings/Plans, Admin), chat Phase 1 embutido como Backstage live, Apify scraping on-demand por URL, deploy em autoagente.ai.

## Core Value

A presença do dashboard convincente + o núcleo de negociação funcional já validam que o modelo v3 é implementável — sem isso o Felipe não fecha as entrevistas de validação com lojistas que viriam a seguir. O chat contra Claude é a prova técnica; o resto do shell é a credibilidade visual.

## Requirements

### Validated

(None yet — ship to validate)

### Active

<!-- Fase 1 — Chat manual funcional -->
- [ ] Setup do projeto (Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + Biome + pnpm)
- [ ] Route handler `/api/fipe` que consulta Parallelum (marca, modelo, ano) e retorna preço FIPE
- [ ] Formulário de anúncio: marca, modelo, ano, km, preço pedido, cidade, dias online, número de reduções
- [ ] Cálculo do preço-alvo: `fipe * (1 - targetDiscount)`, default 25%
- [ ] Route handler `/api/negotiate/stream` com streaming SSE via Anthropic SDK (Claude Sonnet 4.6)
- [ ] System prompt v1 com táticas de negociação, hard stops e formato de resposta (ver seção 9.1 do brief)
- [ ] Chat UI: bubbles de mensagem, streaming char-by-char, autoscroll
- [ ] Botão "encerrar negociação" → gera resumo final (rodadas, preço inicial/final, % redução vs anúncio e vs FIPE, argumentos usados)
- [ ] Persistência em localStorage (histórico da sessão)
- [ ] Deploy na Vercel (URL pública, preview branches)

<!-- Fase 2 — Inteligência do agente -->
- [ ] Scoring de motivação do PF a partir de sinais do anúncio (dias online, nº reduções, motivo declarado)
- [ ] Injeção de comparáveis sintéticos no prompt (hardcoded inicial)
- [ ] Few-shot canônico da negociação Audi Q5 (mockChatHistories[1] do protótipo JSX)
- [ ] Painel de configuração na UI: targetDiscount, maxRounds (default 6), tone, initialAnchorStrategy
- [ ] Parâmetros salvos em localStorage e editáveis sem reload
- [ ] Componente `<AgentThinking>` opcional para exibir rationale do agente

<!-- Fase 3 — PF simulado e batch -->
- [ ] Route handler `/api/simulate-pf` — Claude agindo como PF com persona configurável (resistente, ansioso, bem-informado, desesperado)
- [ ] Runner de batch: página `/batch` com input CSV/JSON de anúncios + seleção de persona
- [ ] Loop agente–PF-sim sem intervenção humana, com limite de rodadas e timeout
- [ ] Dashboard de métricas agregadas: taxa de fechamento, % redução média, rodadas médias, fee teórico (6% da economia)

<!-- Fase 4 — Análise, export e A/B -->
- [ ] Export de conversa individual em JSON (com metadata completa)
- [ ] Export de batch em CSV
- [ ] Versionamento de prompts por negociação
- [ ] Comparação side-by-side entre 2 versões de prompt no mesmo lote
- [ ] Anotações manuais nas conversas (marcação "boa negociação", "agente agressivo demais", etc.)

### Out of Scope

- WhatsApp Business API — requer aprovação Meta + CNPJ ativo; desnecessário para validação
- Scraping OLX/WebMotors/MercadoLivre — risco legal real (ToS agressivo); input manual usado no lugar
- Autenticação / contas de usuário — é um playground, não um produto B2C
- Banco de dados relacional persistente — localStorage suficiente para v0–v1
- Escrow, DocuSign, integração DETRAN, due diligence — pertencem ao projeto AutoAgent maior
- Marketplace, dashboard do lojista, admin console, onboarding — já existem em mockup no JSX do Felipe
- Mobile app / PWA — desktop-first, uso em laptop durante entrevistas
- Internacionalização — pt-BR hardcoded
- Testes E2E pesados (Playwright/Cypress) — unit + integration em rotas de API bastam
- Observabilidade avançada (Sentry, DataDog) — console.log + Vercel logs por ora

## Context

**Projeto maior:** AutoAgent é um marketplace B2B transacional (produto dos pais de Lucas). Este playground é o componente técnico de validação — 100% reaproveitável para o MVP real depois (mesmo código de negociação vai direto para o pipeline de produção).

**Usuários:**
- **Felipe (pai)** — opera a demo na frente de lojistas entrevistados; ajusta parâmetros entre sessões
- **Lucas (filho)** — implementa, ajusta prompts, calibra táticas, roda batches, analisa resultados
- **"Vendedor PF" ao vivo** — Felipe ou entrevistado respondendo como PF durante a demo
- **"Vendedor PF" simulado** — outro Claude com persona configurável no batch mode

**Hipóteses sendo testadas:**
- H: Agente de IA consegue negociar 20–30% abaixo da FIPE de forma convincente e consistente
- H: Canal de abordagem funciona em volume (validado via batch)
- H: PFs reais (simulados por humanos durante entrevistas) aceitam a lógica da oferta

**Design system (do protótipo v2 do Felipe):**
- Primary: `#2563EB` (blue-600), Success: `#059669` (emerald-600), Warning: `#D97706` (amber-600)
- Danger: `#DC2626` (red-600), Accent: `#7C3AED` (violet-600)
- Tipografia: `font-sans` (Tailwind default), Radius: `rounded-lg` para cards, `rounded-full` para badges

**Referências disponíveis em `./reference/`:**
- `PRD_AutoAgent_v2.md` — contexto do produto final
- `Validacao_Modelo_AutoAgent_v2.md` — as 8 hipóteses críticas (H1–H8)
- `AutoAgent_UX_Prototype_v2.jsx` — protótipo visual; linhas 74–85 têm o few-shot canônico

## Constraints

- **Stack:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand — não negociável (seção 10 do brief)
- **LLM:** Anthropic Claude Sonnet 4.6 exclusivamente — alinhamento com stack do projeto maior
- **Deploy:** Vercel — preview branches + production
- **Sem banco:** localStorage suficiente até v1; evitar introdução de DB
- **Sem auth:** nenhuma fase deste playground usa autenticação
- **Budget de batch:** cap de R$ 50 por rodada de batch (custo de API)
- **Performance:** carrega em <2s, streaming visível, latência percebida baixa no Brasil → Vercel Edge runtime

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router (não Pages Router) | Alinhamento com futuro do framework; Server Components para SSE | — Pending |
| Tailwind v4 + shadcn/ui New York style | Reaproveitar design system do protótipo JSX do Felipe | — Pending |
| Zustand para estado (não Redux/Jotai) | Simples, sem boilerplate; estado de negociação é local e não compartilhado | — Pending |
| Biome (não ESLint + Prettier) | Mais rápido, um único config; sem custo de setup duplo | — Pending |
| localStorage sem banco relacional | v0–v1 não precisam de persistência cross-device; evita complexidade e custo | — Pending |
| Input manual de anúncio (sem scraping) | Elimina risco legal (ToS OLX/WebMotors); suficiente para validação | — Pending |
| SSE via route handler (não WebSockets) | Compatível com Vercel Edge; streaming unidirecional é suficiente para o chat | — Pending |
| Few-shot canônico da negociação Audi Q5 | Negociação exemplar já documentada no protótipo JSX; referência compartilhada com Felipe | — Pending |

## Evolution

Este documento evolui nas transições de fase e marcos de milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência de fase
3. Novos requirements emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se houver drift

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditoria do Out of Scope — os motivos ainda valem?
4. Atualizar Context com estado atual

---
*Last updated: 2026-04-18 after initialization*
