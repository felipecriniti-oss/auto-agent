---
phase: 08-scraping-pipeline
status: locked
created: 2026-04-25T10:30:00Z
prior_context_used:
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
  - .planning/phases/08-scraping-pipeline/08-PHASE-SEED.md
  - src/types/database.ts (listings + scrape_runs schema)
  - src/app/api/scrape/webmotors/route.ts (existing on-demand route + actor schema)
discuss_session: 2026-04-25
---

# Phase 8 — Scraping pipeline WebMotors: Context

## Phase Boundary

Apify scheduled actor (ribtools/webmotors-scraper) roda continuamente, normaliza resultados e mantém a tabela `listings` populada com inventário fresco. O pipeline é a fonte de dados que o matching engine (Phase 9) consome contra wishlists.

**Goal (verbatim from ROADMAP):** "Apify scheduled actor (ribtools WebMotors) roda continuamente, normaliza resultados e mantém a tabela listings atualizada."

## Locked Pre-Requisites (already done)

- DB schema `listings` + `scrape_runs` existe em `src/types/database.ts` (Phase 6) — não inventar campos.
- Endpoint on-demand `/api/scrape/webmotors` (POST) existe da Phase 5; Phase 8 §8.7 manda preservar como **admin-only debug**, não substituir.
- Actor escolhido: `ribtools/webmotors-scraper`. Schema do actor já tipado em `src/app/api/scrape/webmotors/route.ts:WebMotorsScraped`.
- `APIFY_API_TOKEN` env var já configurado.
- Schedule criado **na Apify dashboard** (não em Vercel Cron).

## Canonical Refs (downstream agents MUST read these)

| Ref | Path | Purpose |
|-----|------|---------|
| **Spec Técnico v1** | `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgente_Spec_Tecnico_v1.docx` | **CRÍTICO.** Algoritmo de scraping + definição de carro. Contém decisões deferidas (cadence, FIPE failure mode, etc). Formato `.docx` — researcher/planner devem converter (mammoth/pandoc) antes de citar. **Ler com cautela e atenção** — usuário enfatizou. |
| PRD v3 | `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` | Source of truth do produto. B2B lojista, NÃO PF. |
| Phase Seed | `.planning/phases/08-scraping-pipeline/08-PHASE-SEED.md` | Ponto de partida — sub-seções 8.1 a 8.7. |
| DB schema | `src/types/database.ts` | Campos exatos de `listings` + `scrape_runs`. Não inventar. |
| Actor schema | `src/app/api/scrape/webmotors/route.ts` (linhas 38-90 `WebMotorsScraped`) | Forma do payload Apify ribtools. Reutilizar tipo. |
| Project pivot | `CLAUDE.md` | B2B guardrails. |

## Decisions

### D-01 — Webhook auth: HMAC signature
**Decision:** Validar `Apify-Webhook-Signature` header (HMAC-SHA256 do request body usando `APIFY_WEBHOOK_SECRET`).
**Why:** Cripto tamper-proof, suportado nativamente pela Apify, não vaza em logs.
**How to apply:** Endpoint `POST /api/scrape/webmotors/webhook` rejeita 401 se header faltar ou HMAC não bater. Secret armazenado em `APIFY_WEBHOOK_SECRET` env var; valor colado no Apify dashboard ao criar o webhook.

### D-02 — Cost handling: hard-kill em $50/dia agregado
**Decision:** Endpoint webhook **rejeita** próximas requests com 429 quando soma de `scrape_runs.cost_usd` do dia (UTC) >= $50 USD.
**Why:** Floor de segurança contra runaway billing. Apify continua tentando webhooks (registra como falha lá), mas a gente não ingere nada.
**How to apply:** Antes de processar cada webhook, query `SELECT SUM(cost_usd) FROM scrape_runs WHERE date(started_at) = current_date_utc`. Se >= 50, retorna 429 + console.error com payload do alerta. Cap configurável via env var `MAX_DAILY_SCRAPE_COST_USD` (default 50).

### D-03 — Run cadence: DEFERRED → Spec Técnico v1
**Status:** Open. Lock no `/gsd-plan-phase 8` depois do planner ler o doc.
**Hint inicial (seed):** "1x/dia dev, 4x/dia prod" — mas o spec técnico pode reescrever.

### D-04 — FIPE failure mode: DEFERRED → Spec Técnico v1
**Status:** Open. Provavelmente coberto no algoritmo de definição de carro do doc.
**Hint inicial (seed §8.5):** "Se FIPE falha, ainda insere com fipe=null e flag pra retry."

### D-05 — Stale listing cleanup mechanism (Claude's Discretion)
**Decision:** Job separado, scheduled via Vercel Cron (não dentro do actor Apify).
**Why:** Apify actor tem responsabilidade única (scrape + ingest); cleanup é um query SQL pequeno (`UPDATE listings SET status='removed' WHERE last_scraped_at < now() - 72h AND status != 'removed'`). Vercel Cron já existe pro projeto, custo negligível.
**How to apply:** `POST /api/cron/listings-cleanup` (cron auth via Vercel `CRON_SECRET`). Roda 1x/dia. TTL: 72h sem aparecer em scrape (per seed Key questions #3).

### D-06 — Top 20 model targeting source (Claude's Discretion)
**Decision:** Lista hardcoded em `src/lib/apify/target-models.ts`, JSON simples `[{brand, model}]`. NÃO derivar de FIPE snapshot nem de tabela DB.
**Why:** Phase 8 não precisa de admin UI pra editar; lista muda raramente; commit faz parte do PR. Quando crescer, virar tabela DB (Phase 13+).
**How to apply:** Lista inicial = top 20 modelos brasileiros pop (Civic, Corolla, HRV, Onix, Compass, etc). Confirmar no spec técnico antes de planejar — se o doc tiver lista própria, usa ela.

### D-07 — Listing photos storage (locked from existing schema)
**Decision:** Apenas URL (`listings.photo_url`). NÃO baixar pra Supabase Storage.
**Why:** Schema atual já é só URL; download adiciona custo+latência+espaço sem necessidade pro MVP. Imagens WebMotors são públicas e CDN-served.

### D-08 — listing_price_history table: DEFERRED → Phase 13
**Decision:** Phase 8 só faz upsert no `listings` (price changes update mesma row). Não cria tabela de histórico.
**Why:** Per seed §8.4: "opcional, Phase 13".

### D-09 — Observability mínima: scrape_runs + Vercel logs
**Decision:** No admin UI nesta phase. Cada webhook escreve linha em `scrape_runs` (start/end/status/cost/counts). Erros via `console.error` (Vercel logs). Sem dashboard.
**Why:** Phase 8 entrega pipeline; UI vem em Phase 12 (opportunities dashboard).
**How to apply:** Cada run cria `scrape_runs.status='running'` no início, atualiza `status='ok'|'error'|'partial'` + `ended_at` + counts no fim. Falhas críticas (HMAC inválido, cost cap) também loggam linha com `status='error'`.

## Reusable Assets (from scout)

- `src/app/api/scrape/webmotors/route.ts:WebMotorsScraped` — tipo do payload. **Mover** para `src/lib/apify/types.ts` e reusar.
- `src/lib/server/rate-limit.ts:checkRateLimit` — bucket pattern já existe (Phase 5). Webhook pode usar bucket separado `"scrape_webhook"`.
- `src/types/database.ts:DbListing/DbScrapeRun` — tipos prontos.
- `src/app/api/fipe/route.ts` GET — Phase 7 entregou; pipeline chama via fetch interno pra enrichment.
- Padrão de Supabase server client: `src/lib/supabase/server.ts`.

## Anti-patterns to avoid

- **NÃO** rodar Apify SDK como dependência — usar `fetch` direto contra Apify REST API (padrão Phase 5).
- **NÃO** processar dataset inteiro em memória — stream pelo dataset URL.
- **NÃO** vazar `APIFY_API_TOKEN` ou `APIFY_WEBHOOK_SECRET` em response bodies, headers, ou logs.
- **NÃO** criar `/api/admin/*` UI nesta phase (scope creep — vem em Phase 12).
- **NÃO** confiar na obscuridade da URL do webhook como única defesa (D-01 obriga HMAC).

## Deferred Ideas (parking lot)

- **Per-wishlist dynamic targeting** (vs queries amplas) — surfaced no seed Key questions #1; "amplas primeiro, otimizar com lojistas reais". Reabrir quando >100 wishlists ativas.
- **Listing price history table** — Phase 13 (D-08).
- **Admin UI scrape_runs** — Phase 12 dashboard.
- **Anunciante phone dedup** — seed §8.4 menciona "out of scope for MVP".
- **listings storage de fotos** — eventualmente em Supabase Storage se WebMotors mudar política CDN.

## Open questions (locked at /gsd-plan-phase 8)

- D-03 cadence final
- D-04 FIPE failure mode
- D-06 lista exata dos top 20 models (confirmar contra doc técnico)
