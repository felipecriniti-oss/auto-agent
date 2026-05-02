# AutoAgente — Handoff para Claude Code

> **Data:** 2026-05-02
> **Branch ativa:** `feat/agent-company-v3.2`
> **Repo:** `github.com/felipecriniti-oss/auto-agent`
> **Stack:** Next.js 15 + TypeScript strict + Tailwind v4 + Supabase + Apify + @anthropic-ai/sdk

---

## 1. O que e o AutoAgente

Marketplace transacional B2B para lojistas de seminovos. Agentes de IA monitoram plataformas de anuncios (WebMotors, OLX, etc), encontram veiculos abaixo da FIPE, abordam vendedores PF via WhatsApp, negociam preco, e entregam oportunidades prontas para lojistas no dashboard.

**Modelo de receita:** Assinatura tier (Starter R$197, Premium R$499, Enterprise R$1997) + success fee sobre economia vs FIPE (6%/3%/2%).

**PF nunca e cliente.** PF e lead abordado via WhatsApp. Lojista (PJ) e o cliente pagante.

---

## 2. O que ja foi construido

### 2.1 Produto base (branch `main`)

O produto ja tem um frontend funcional com:

- Dashboard lojista com modulos (Marketplace, Meus Deals, Backstage de Negociacoes, KPIs, Radar, Settings)
- Chat de negociacao live contra Claude Sonnet (streaming via /api/negotiate/stream)
- Integracao Apify para scraping WebMotors on-demand
- FIPE autofetch funcionando
- Supabase com 13+ tabelas (users, wishlists, listings, opportunities, agent_threads, agent_messages, bot_accounts, pending_outbox, scrape_runs, deals, subscriptions, kyc_documents, opt_out_list)
- Deploy Vercel em autoagente.ai
- 20 target models (top sellers Brasil - Fenabrave)

### 2.2 Sistema de agentes (branch `feat/agent-company-v3.2`)

Dois commits adicionais sobre main:

#### Commit 1: autoagente-company (Paperclip org chart)

Estrutura completa de uma "empresa de agentes" com 14 agentes IA:

```
autoagente-company/
  .paperclip.yaml          # Org chart Paperclip com adapters, secrets, rotinas cron
  COMPANY.md               # Descricao da empresa
  teams/operations/TEAM.md # Estrutura de times
  agents/                  # 14 agentes, cada um com AGENTS.md
    ceo/        # CEO - estrategia, KPIs, decisoes          (Opus)
    cto/        # CTO - infra, deploys, monitoring          (Sonnet)
    cmo/        # CMO - growth, conteudo, metricas          (Sonnet)
    cfo/        # CFO - financeiro, P&L, budget             (Sonnet)
    clo/        # CLO - juridico, LGPD, compliance          (Sonnet)
    scraper/    # Scraper - monitora anuncios               (Haiku)
    analista/   # Analista - scoring, FIPE, mercado         (Sonnet)
    negociador/ # Negociador - WhatsApp com PFs             (Opus)
    captacao/   # Captacao - lead gen lojistas              (Sonnet)
    conteudo/   # Conteudo - copy, templates, A/B           (Sonnet)
    custos/     # Custos - P&L por deal, APIs               (Haiku)
    pricing/    # Pricing - faixas go/no-go, margem         (Sonnet)
    contratos/  # Contratos - C&V, ATPV-e, assinaturas     (Sonnet)
    compliance/ # Compliance - KYC, DETRAN, audit           (Sonnet)
  skills/                  # 11 SKILL.md detalhados
    paperclip/             # Hub-and-spoke, message schema, governance
    search-scraping/       # Plataformas, dedup, anti-bot, listing schema
    negotiation/           # 7 rounds WhatsApp, gatilhos psicologicos
    market-analysis/       # FIPE, scoring 0-100, learning engine
    whatsapp-messaging/    # BSP, routing, templates, compliance
    lead-generation/       # Funil lojista, KYC, metricas
    content-copy/          # Brand voice, objections, A/B testing
    cost-control/          # Budget per agent, P&L per deal
    deal-pricing/          # Go/no-go thresholds, bandas de preco
    contracts/             # C&V, ATPV-e, digital signatures
    compliance/            # KYC, LGPD, verificacao veicular
```

**Comunicacao hub-and-spoke:** Agentes operacionais NUNCA se comunicam diretamente. Tudo passa pelo C-level (CEO, CTO, CMO, CFO, CLO).

**Deal pipeline:** Scraper -> Analista -> Compliance -> Pricing -> Negociador -> Contratos -> CEO

#### Commit 2: Agent runtime + Scraper agent

Sistema funcional para rodar agentes via API:

```
src/lib/agents/
  types.ts           # AgentModel, AgentSlug, AgentConfig, AgentTool, AgentRunResult
  runtime.ts         # runAgent() - agentic loop com tool_use
  logger.ts          # logAgentRun() + logAgentMessage() -> Supabase
  index.ts           # Re-exports
  configs/
    scraper.ts       # SCRAPER_AGENT_CONFIG (Haiku, 30 turns, system prompt PT-BR)
  tools/
    scraper-tools.ts # 6 tools: get_target_models, search_webmotors, check_listing_filters,
                     #          save_listings, get_active_listings_count, report_run_summary

src/app/api/agents/scraper/route.ts  # GET (cron) + POST (admin), 120s max, CRON_SECRET auth
supabase/migrations/0010_agent_runs.sql  # agent_runs + agent_messages tables
```

---

## 3. Arquitetura do Agent Runtime

### 3.1 Core loop (`runtime.ts`)

```
runAgent(config, task, context?) -> AgentRunResult
  1. Envia system prompt + task para Claude
  2. Se Claude responde com tool_use blocks -> executa tools -> envia resultados
  3. Repete ate Claude responder so com texto OU max turns
  4. Retorna resultado estruturado com metricas
```

- Usa `@anthropic-ai/sdk` diretamente (nao Vercel AI SDK)
- Client singleton com ANTHROPIC_API_KEY
- Cada tool call e logada com timing
- Tokens input/output acumulados

### 3.2 AgentTool interface

```typescript
interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}
```

Tools sao funcoes puras. O runtime converte para o formato Anthropic automaticamente.

### 3.3 Model tiering

| Tier | Model | Agentes | Budget/mes |
|------|-------|---------|------------|
| Alto | claude-opus-4-6 | CEO, Negociador | 5M tokens |
| Medio | claude-sonnet-4-6 | CTO, CMO, CFO, CLO, Analista, Captacao, Conteudo, Pricing, Contratos, Compliance | 3M tokens |
| Baixo | claude-haiku-4-5-20251001 | Scraper, Custos | 3M tokens |

### 3.4 Cron schedule (vercel.json)

```json
{
  "crons": [
    { "path": "/api/cron/listings-cleanup", "schedule": "0 4 * * *" },
    { "path": "/api/cron/fipe-retry", "schedule": "0 5 * * *" },
    { "path": "/api/agents/scraper", "schedule": "0 */4 * * *" }
  ]
}
```

---

## 4. Scraper Agent em detalhe

### 4.1 Tools disponiveis

| Tool | Descricao |
|------|-----------|
| `get_target_models` | Retorna 20 modelos alvo (brand, model, WebMotors URL) |
| `search_webmotors` | Chama Apify actor `ribtools~webmotors-scraper`, retorna listings normalizados |
| `check_listing_filters` | Verifica se listing e leilao/sinistro via `detectBlockingFilter()` |
| `save_listings` | Upsert no Supabase `listings` table, dedup por source_listing_id |
| `get_active_listings_count` | Count de listings ativos, filtro opcional por brand/model |
| `report_run_summary` | Loga resumo no `scrape_runs` table |

### 4.2 Workflow do agente

1. Obtem lista de modelos target
2. Escolhe ate 3 modelos por rodada (distribui ao longo do dia)
3. Para cada: busca no WebMotors -> filtra bloqueados -> salva limpos
4. Loga resumo consolidado

### 4.3 Como executar

```bash
# Local (dev mode - sem auth)
curl http://localhost:3000/api/agents/scraper

# Producao (com CRON_SECRET)
curl -H "Authorization: Bearer $CRON_SECRET" https://autoagente.ai/api/agents/scraper

# Custom task via POST
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"task": "Scrapeie apenas Volkswagen Polo e T-Cross"}' \
  https://autoagente.ai/api/agents/scraper
```

---

## 5. Database (Supabase)

### 5.1 Tabelas do sistema de agentes (migration 0010)

**agent_runs** — Uma row por execucao de agente:
- run_id, agent, status (running/completed/failed/timeout)
- turns, input_tokens, output_tokens, tool_calls
- tool_call_details (JSONB), final_response, error
- duration_ms, started_at, ended_at

**agent_messages** — Log de comunicacao inter-agente:
- from_agent, to_agent, message_type, priority, deal_id, summary

> **NOTA IMPORTANTE:** No SQL a tabela chama `agent_messages`, mas no TypeScript (`src/types/database.ts`) o tipo chama `agent_comms` para evitar conflito com a tabela `agent_messages` pre-existente (que e de mensagens WhatsApp/chat). O logger usa `agent_comms` como chave. **Isso precisa ser reconciliado** — ou renomear a migration SQL para `agent_comms`, ou ajustar o TypeScript.

### 5.2 Tabelas principais pre-existentes

- `users` — Lojistas (KYC, plano, CNPJ)
- `wishlists` — Busca salva (brand, model, faixas de preco/ano/km)
- `listings` — Anuncios scrapeados (source, preco, FIPE, savings, seller)
- `opportunities` — Match listing<->wishlist (score, status, thread)
- `agent_threads` — Thread de negociacao com PF (status, rounds, precos)
- `agent_messages` — Mensagens da negociacao WhatsApp (direction, body)
- `bot_accounts` — Contas bot para envio de mensagens
- `pending_outbox` — Fila de mensagens para envio
- `scrape_runs` — Log de execucoes de scraping
- `deals` — Deals fechados (contrato, pagamento, transferencia)
- `subscriptions` — Assinaturas Stripe
- `kyc_documents` — Documentos KYC do lojista

---

## 6. Env vars necessarias

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (para agentes)
ANTHROPIC_API_KEY=

# Apify (para scraping)
APIFY_API_TOKEN=

# Seguranca
CRON_SECRET=          # Protege endpoints de cron

# Futuro (nao necessario agora)
WHATSAPP_TOKEN=       # Meta Business API
WHATSAPP_PHONE_ID=    # Numero WhatsApp Business
FIPE_API_KEY=         # API FIPE (atual usa endpoint publico)
```

---

## 7. Bugs e debt conhecidos

### 7.1 Criticos

1. **Nome de tabela SQL vs TypeScript:** Migration 0010 cria `agent_messages` mas TypeScript usa `agent_comms`. O logger faz `.from("agent_comms")` que vai dar erro no Supabase. **Fix:** ou renomear a migration para `agent_comms` ou ajustar o TypeScript.

### 7.2 Menores

2. **save_listings nao pega todos os campos:** O tool de save listings nao persiste `year_manufacture` vs `year_model` separadamente — usa so `year`. Pode perder granularidade.

3. **Timeout 120s pode ser curto:** Se o agente precisa scrappear 3 modelos e cada chamada Apify leva ~45s, pode estourar. Considerar queue-based approach.

4. **Fingerprint de dedup simplificado:** Usa `brand|model|year|km_rounded|city` — pode ter falsos positivos para carros muito similares.

---

## 8. Proximos passos sugeridos

### Fase imediata (proximo sprint)

1. **Fix do bug de tabela agent_comms vs agent_messages** (5 min)
2. **Rodar migration 0010 no Supabase** — Criar as tabelas agent_runs e agent_messages
3. **Testar Scraper agent end-to-end** — Precisa de ANTHROPIC_API_KEY e APIFY_API_TOKEN configurados
4. **Deploy da branch** — Merge para main ou deploy da feature branch

### Fase seguinte

5. **Agente Analista** — Scoring de listings (FIPE ratio, dias online, tipo vendedor). Tools: query listings, calcular score, atualizar match_score
6. **Agente CEO** — Orquestrador. Recebe reports dos operacionais, toma decisoes de go/no-go, despacha tarefas
7. **Agente Pricing** — Define faixas de preco para negociacao baseado em FIPE e historico
8. **Inter-agent messaging** — Implementar o bus de comunicacao hub-and-spoke entre agentes

### Fase avancada

9. **Agente Negociador** — Integracao WhatsApp Business API real
10. **Agente Contratos** — ZapSign para assinatura digital
11. **Agente Compliance** — DETRAN API, verificacao veicular
12. **Dashboard de observabilidade** — UI para ver agent_runs, custos, performance

---

## 9. Comandos uteis

```bash
# Instalar deps
pnpm install

# Dev server
pnpm dev

# Type check (zero errors na branch atual)
pnpm typecheck    # ou npx tsc --noEmit

# Lint
pnpm lint

# Testes
pnpm test

# Ver branches
git branch -a

# Mudar para a branch com agentes
git checkout feat/agent-company-v3.2
```

---

## 10. Estrutura de diretorios chave

```
auto-agent/
  autoagente-company/          # Paperclip org chart (14 agentes, 11 skills)
    .paperclip.yaml            # Config de agentes, models, secrets, cron
    agents/{slug}/AGENTS.md    # System prompt de cada agente
    skills/{name}/SKILL.md     # Dominio de conhecimento detalhado
  src/
    app/
      api/
        agents/scraper/route.ts    # Cron + POST endpoint
        negotiate/stream/route.ts  # Chat streaming (produto base)
        fipe/route.ts              # FIPE lookup
        cron/                      # Cleanup + retry jobs
      (dashboard)/                 # UI lojista
    lib/
      agents/                      # *** SISTEMA DE AGENTES ***
        types.ts                   # Tipos core
        runtime.ts                 # Agentic loop engine
        logger.ts                  # Persist to Supabase
        index.ts                   # Re-exports
        configs/scraper.ts         # Config do Scraper
        tools/scraper-tools.ts     # 6 tools do Scraper
      apify/                       # WebMotors scraper
        target-models.ts           # 20 modelos alvo
        filters.ts                 # Blocking filters (leilao, sinistro)
        types.ts                   # WebMotorsScraped type
      supabase/                    # Client helpers
    types/
      database.ts                  # Hand-rolled Supabase types (all tables)
  supabase/
    migrations/                    # SQL migrations (0001 a 0010)
  vercel.json                      # Crons + function config
  CLAUDE.md                        # Context file (GSD workflow)
```

---

## 11. Git state

```
Remotes:
  origin     -> grunixx/auto-agent (upstream original)
  felipecriniti -> felipecriniti-oss/auto-agent (fork do Felipe)

Branches pushed para felipecriniti-oss:
  main                     -> Produto base completo
  feat/agent-company-v3.2  -> main + autoagente-company + agent runtime + scraper

Ultimo commit: 11adfc1 — feat: add agent runtime + Scraper agent with tools
```

---

## 12. Decisoes de design importantes

1. **Runtime proprio vs framework:** Optamos por um runtime custom simples (`runtime.ts`) em vez de usar LangChain, CrewAI, ou Vercel AI SDK. Motivo: controle total sobre o loop, sem dependencias pesadas, facil de debugar.

2. **Hub-and-spoke:** Agentes operacionais nao se comunicam entre si. Tudo passa por C-level. Motivo: evita loops infinitos e facilita audit trail.

3. **Haiku para scraper:** Alto volume de chamadas (6x/dia * 20 modelos), custo precisa ser baixo. Haiku e suficiente para o workflow mecanico do scraper.

4. **Opus para negociador:** Negociacao em linguagem natural com PFs requer o modelo mais capaz. A qualidade da negociacao impacta diretamente a margem.

5. **Tools como funcoes puras:** Cada tool e uma funcao `(input) -> Promise<output>` sem side effects alem do que faz. Facilita testing e substituicao.

6. **Dedup por source_listing_id:** Cada listing e unico por `source + source_listing_id`. Re-scrapes atualizam preco mas nao duplicam.
