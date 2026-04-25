---
phase: 08-scraping-pipeline
status: researched
depth: deep
created: 2026-04-25
sources_consulted:
  - C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgente_Spec_Tecnico_v1.docx (converted via python-docx)
  - .planning/phases/08-scraping-pipeline/08-CONTEXT.md
  - .planning/phases/08-scraping-pipeline/08-PHASE-SEED.md
  - .planning/REQUIREMENTS.md
  - .planning/STATE.md
  - .planning/config.json
  - ./CLAUDE.md
  - src/types/database.ts (DbListing, DbScrapeRun)
  - supabase/migrations/0001_init.sql (listings/scrape_runs DDL)
  - src/app/api/scrape/webmotors/route.ts (existing on-demand actor + WebMotorsScraped type)
  - src/app/api/scrape/webmotors/webhook/route.ts (existing STUB ingest from Phase 7)
  - src/lib/supabase/server.ts (getSupabaseServiceRole)
  - src/lib/server/rate-limit.ts (bucket pattern)
  - src/lib/matching/engine.ts (Phase 9 consumer of listings; PF-only enforcement)
  - src/app/api/fipe/route.ts (Phase 7 enrichment endpoint)
  - https://docs.apify.com/platform/integrations/webhooks
  - https://docs.apify.com/platform/integrations/webhooks/actions
  - https://docs.apify.com/platform/integrations/webhooks/events
  - https://docs.apify.com/platform/schedules
  - https://use-apify.com/blog/apify-webhooks-complete-guide (third-party verified 2026)
confidence: HIGH
---

# Phase 8 — Scraping Pipeline WebMotors: Research

**Researched:** 2026-04-25
**Domain:** Scheduled web scraping ingestion — Apify scheduled actor → webhook → Supabase upsert → matching trigger
**Confidence:** HIGH

## Summary

The pipeline reads from an **already-existing toolchain**: ribtools/webmotors-scraper is in production for the on-demand path (Phase 5), the listings/scrape_runs DDL exists (Phase 6), and a **stub webhook ingest route exists at `/api/scrape/webmotors/webhook/route.ts`** (Phase 7) that already upserts by fingerprint, runs the matching engine, and creates opportunities. Phase 8's job is therefore not "build a webhook" — it is **upgrade the stub to handle the real Apify scheduled-run payload shape** (which delivers `actorRunId` only, not normalized listings) and add the missing normalization, FIPE enrichment, scrape_runs logging, and cost-cap enforcement.

The Spec Técnico v1 — the user's authoritative algorithm document — specifies an **API-first discovery model with 4-dimension scoring (40/30/20/10 weighting)** and a "filtro eliminatorio" stage. The spec describes a much larger system than Phase 8's MVP scope (it covers Phases 8-13 in our roadmap). The parts that bind Phase 8 specifically: data model (4 entities including `listings` + `scrape_runs` already match), filtros eliminatorios (sinistro/leilao/recall/cor/regiao — must reject before insert), motivation_signals computation (DOM > 60d, price drops, PF flag, urgency NLP, reincidencia — partial implementation possible now), and seller_type breakdown for downstream channel routing.

**The spec does NOT lock D-03 (cadence) or D-04 (FIPE failure mode) verbatim.** It describes "ciclo continuo" generically and provides MVP volume targets (100 negociacoes/dia, ~5.000 anuncios scraped/dia, R$0 cost at MVP scale) — implying low cadence is acceptable. D-03 and D-04 must be locked from operational reasoning + cost ceiling (D-02 = $50/day), not from the spec.

**Primary recommendation:** Promote the existing stub to a 3-stage pipeline (auth → fetch dataset by `actorRunId` → normalize+enrich+upsert), retain shared-secret auth (Apify's native model), defer HMAC, lock cadence at **2x/day prod (12h apart) + 1x/day dev**, and lock FIPE-failure to **insert with fipe=null + retry queue via separate cron** (matches existing FIPE chunked-probe failure modes).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Webhook auth: HMAC signature.** "Validar `Apify-Webhook-Signature` header (HMAC-SHA256 do request body usando `APIFY_WEBHOOK_SECRET`). Endpoint `POST /api/scrape/webmotors/webhook` rejeita 401 se header faltar ou HMAC não bater."
  > **Research caveat (HIGH confidence, see § Pitfalls #1):** Apify does NOT natively support HMAC-SHA256 webhook signatures (verified via docs.apify.com/platform/integrations/webhooks 2026-04-25). The native auth model is **shared-secret token in URL or custom header**. The decision as written is unenforceable through the Apify dashboard alone. Three resolution paths surfaced in Pitfalls.
- **D-02 — Cost cap: hard-kill at $50/day USD aggregate.** Webhook rejects with 429 when `SUM(scrape_runs.cost_usd) FOR date(started_at) = current_date_utc >= $50`. Cap configurable via `MAX_DAILY_SCRAPE_COST_USD` (default 50).
- **D-05 — Stale cleanup via separate Vercel Cron.** `POST /api/cron/listings-cleanup` runs 1x/day. TTL: 72h sans-scrape → `status='removed'`.
- **D-06 — Top 20 model targeting hardcoded** in `src/lib/apify/target-models.ts` as `[{brand, model}]`. Per spec § 8: spec lists no specific top-20 — must derive from Brazilian market (Civic, Corolla, HRV, Onix, Compass, etc.); validate against ribtools actor's accepted query syntax.
- **D-07 — Photos URL only** (`listings.photo_url` from `photos[0]`). No Supabase Storage download.
- **D-08 — No `listing_price_history` table** in Phase 8. Migration 0001 already created the table empty; Phase 8 doesn't insert into it. Defer writes to Phase 13.
- **D-09 — Observability minimum:** scrape_runs row per webhook + Vercel `console.error` for failures. No admin UI.

### Claude's Discretion

(none — all 9 decisions locked or deferred to spec)

### Deferred to Spec (must lock during planning)

- **D-03 — Run cadence final** (seed hint: "1x/dia dev, 4x/dia prod"). Spec does NOT prescribe — recommendation in § Locked Decisions.
- **D-04 — FIPE failure mode** (seed hint: "insert with fipe=null + retry"). Spec does NOT prescribe directly; recommendation in § Locked Decisions.

### Deferred Ideas (OUT OF SCOPE)

- Per-wishlist dynamic targeting → reopen at >100 active wishlists.
- `listing_price_history` writes → Phase 13.
- Admin UI for `scrape_runs` → Phase 12.
- Anunciante phone dedup → MVP out of scope (single fingerprint by `source_listing_id`).
- Photo blob storage in Supabase Storage → only if WebMotors blocks CDN.

## Phase Requirements

This phase has **no explicit numbered REQUIREMENTS.md item**. Phase 8 derives from CONTEXT.md decisions D-01..D-09 and seed § 8.1-8.7. Implementation must satisfy:

| Implicit Req ID | Description | Research Support |
|-----------------|-------------|------------------|
| SCRAPE-01 | Apify scheduled actor running on configurable cadence, populating `listings` table with WebMotors inventory | § 8.1 Apify schedule + § Spec Técnico v1 (Camada 1 Discovery) |
| SCRAPE-02 | `POST /api/scrape/webmotors/webhook` ingests scheduled-run payloads with auth + dedup + cost-cap | Existing stub at `webhook/route.ts` (Phase 7) — extend |
| SCRAPE-03 | Normalization library `src/lib/apify/webmotors-normalize.ts` produces DbListing.Insert from raw actor payload | § 8.3 + spec "schema unico" |
| SCRAPE-04 | FIPE enrichment on insert via Phase 7 `/api/fipe` POST; failure mode = insert null + retry | § 8.5 + research recommendation in § Locked Decisions |
| SCRAPE-05 | Each run logs to `scrape_runs` (start/end/status/cost/counts/notes) | § 8.6 + DbScrapeRun schema |
| SCRAPE-06 | Stale cleanup via separate cron (`/api/cron/listings-cleanup`) marking `status='removed'` after 72h | D-05 |
| SCRAPE-07 | On-demand `/api/scrape/webmotors` (Phase 5) preserved untouched as admin debug | § 8.7 |
| SCRAPE-08 | Cost cap hard-kill at $50/day via aggregate query before processing | D-02 |
| SCRAPE-09 | Filtros eliminatorios (sinistro, leilao, recall) applied during normalization — these listings never reach DB | Spec Técnico v1 § 2 + § 3 |

## Project Constraints (from CLAUDE.md)

- **Stack non-negotiable:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand. No new tools. [VERIFIED: ./CLAUDE.md]
- **LLM:** Anthropic Claude Sonnet 4.6 only — irrelevant for Phase 8 (no LLM calls in pipeline). [VERIFIED]
- **Deploy:** Vercel primary, DO secondary. Webhook URL must be `https://autoagente.ai/api/scrape/webmotors/webhook`. [VERIFIED]
- **No DB → there IS DB now (Phase 6 deployed Supabase).** CLAUDE.md says "sem DB: localStorage persiste" — outdated; STATE.md shows Phase 6 complete. Webhook will use service-role Supabase client. [VERIFIED: STATE.md + supabase/migrations/0001_init.sql]
- **Performance:** <2s render — irrelevant for webhook (no UI). [VERIFIED]
- **Scraping discipline:** "Apify on-demand (não Bright Data — overkill)". Phase 8's scheduled run is the natural extension; same Apify account/token. [VERIFIED]
- **B2B lojista guardrail:** PF is lead, never user. Phase 8 stores PF + PJ listings; matching engine (Phase 9) hard-filters to PF only. Phase 8 must NOT pre-filter PJ — they're useful as comparables for Radar mode (per spec § 7). [VERIFIED: src/lib/matching/engine.ts:170 enforces PF-only at match time]

---

## Spec Técnico v1 — Verbatim Extracts

> Source: `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgente_Spec_Tecnico_v1.docx` v1.0 — Abril 2026, Felipe Criniti. Converted via `python-docx`. Quotes verbatim with original spelling.

### § 1. Visão Geral (binds Phase 8)

> "O motor de busca e negociação é o core tecnológico do AutoAgente. Ele opera em ciclo contínuo: descobre oportunidades nos marketplaces (WebMotors, OLX, Mercado Livre, iCarros)..."

> "O sistema opera em dois modos simultâneos: **Radar (varredura geral de oportunidades para todos os lojistas) e Sniper (busca personalizada sob demanda de um lojista específico).**"

**Phase 8 implication:** Phase 8 implements only the Radar input path for one marketplace (WebMotors). Sniper-mode and other marketplaces are explicitly out of scope per CLAUDE.md "Não entra (bloqueadores duros — impossível em 3 dias)" + STATE.md scope.

### § 2. Arquitetura — 4 Camadas (Camada 1 = Phase 8 surface)

> "O motor é composto por 4 camadas em sequência, cada uma alimentando a próxima:
> Camada 1 — Discovery Engine: consulta APIs dos marketplaces (API-first, sem crawling), normaliza dados em schema único, aplica filtros eliminatórios (sinistro, leilão, recall, regiao).
> Camada 2 — Scoring Engine: avalia cada anúncio em 4 dimensões ponderadas (Econômico 40%, Negociabilidade 30%, Liquidez 20%, Risco 10%), gerando score composto 0-100.
> Camada 3 — Contact Router..."

> "Fluxo de dados:
> 1. API call ao marketplace retorna listagens filtradas e ordenadas por preço
> 2. **Normalização para schema único (id, source, price, fipe, model, year, km, sellerType, contact)**
> 3. **Filtro eliminatório: sinistro, leilão, recall aberto, cor fora do filtro, fora da região**
> 4. Scoring composto: cálculo das 4 dimensões, geração do score 0-100
> 5. Seleção dos Top 10 por score e decisão de canal (WhatsApp vs formulário)"

**Phase 8 implication (CRITICAL):** Step 3 — **filtros eliminatorios** — is mandatory and runs **before** insert. Sinistro/leilao/recall checks happen in normalize.ts and abort that listing's upsert. Step 4 (scoring) and Step 5 (top-10 selection) belong to Phase 9 matching, NOT Phase 8. Phase 8 stops at Step 3.

### § 3. Discovery Engine — API-first, no crawling

> "O Discovery é API-first. Cada marketplace tem endpoints que retornam anúncios filtrados e ordenados por preço. **A descoberta não requer browser automation — apenas chamadas HTTP diretas.**"

> Table 2 — fontes de dados:
> | WebMotors | API interna (reverse-engineered) | Preço, modelo, ano, km, cidade, tipo vendedor |

**Phase 8 implication:** The spec's "API interna reverse-engineered" maps to **ribtools/webmotors-scraper**, which the existing on-demand route already uses successfully (98.6% success rate, 622 succeeded runs in 30 days — verified comment at `src/app/api/scrape/webmotors/route.ts:91-100`). We don't reverse-engineer ourselves; we delegate to the maintained actor.

### § 4. Scoring Engine (Phase 9 territory, but Phase 8 prepares fields)

> Table 4 — Score Econômico:
> | >= 30% abaixo | 100 pts | Oportunidade premium |
> | 25-29% | 85 pts | Muito boa |
> | 20-24% | 70 pts | Boa |
> | 15-19% | 55 pts | Aceitável |
> | 10-14% | 40 pts | Mínima |
> | < 10% | 0 pts | **Descartado automaticamente** |

> Table 5 — Score Negociabilidade signals:
> | DOM > 60 dias | +35 | Histórico de crawl |
> | DOM 30-60 dias | +20 | Histórico |
> | Redução de preço > 5% | +25 | Price drop tracker |
> | Redução 2-5% | +15 | Price drop tracker |
> | Vendedor PF | +15 | Tipo via API |
> | Vendedor PJ | +5 | Tipo via API |
> | Linguagem de urgência | +10 | NLP na descrição |
> | Reincidência de anúncio | +10 | Banco histórico |

**Phase 8 implication:** Phase 8 must populate raw fields the scorer needs:
- `days_online` ← computed from `publish_date` (already in WebMotorsScraped) — Phase 8 owns this
- `reductions` ← cannot be computed without price history; Phase 8 leaves null until Phase 13 ships price tracker
- `motivation_signals.urgency_terms` ← NLP-lite keyword scan over `title` + descrição (if present in payload) — Phase 8 ships a basic implementation
- `seller_type` ← already mapped in existing `parseSellerType()` (PF/PJ)

### § 4 (continued) — Filtros Eliminatorios

> Score Final and Threshold (Table 6):
> | < 50 | C (Descartado) | Não contatar |

> "Geo-Clustering: Antes do contato, os anúncios são agrupados por região geográfica."

**Phase 8 implication:** Geo-clustering is Phase 9/10 territory. But the spec's "filtro eliminatório: cor fora do filtro, fora da região" implies wishlist-driven filtering — that's matching, not normalization. Phase 8's filtros eliminatorios are ONLY the universal ones: **sinistro, leilão, recall**. Region/color filters are wishlist-bound and run in Phase 9 matching engine (already implemented).

### § 9. Modelo de Dados — confirms schema match

> Table 14 — Entidades:
> | listings | source, price, fipe_price, spread_pct, seller_type, score_total, status | Anúncio descoberto e avaliado |
> | scrape_runs (implicit via § 10 monitoring) |

> "Status do listing: new, scored, contacted, negotiating, deal, rejected, blacklist."

**Phase 8 implication / DELTA:** Spec defines 7 statuses but our schema has only 3 (`active`, `removed`, `stale`). The extra statuses (scored/contacted/negotiating/deal/rejected/blacklist) are tracked in **other tables in our schema** (`opportunities.status`, `agent_threads.status`, `deals.status`). Don't extend `listings.status` — the existing 3 cover Phase 8's needs (active = in inventory; stale = >72h sans-scrape, pending cleanup; removed = confirmed gone). Spec uses one mega-status per entity; our schema uses normalized state per relationship. **Stick with our schema** — it's already correct.

### § 10. Monitoramento (binds D-09 + scrape_runs)

> "Alertas críticos:
> - Ban de IP detectado: pausa automática + rotação de proxy
> - Taxa de resposta cai > 20%: revisar templates de mensagem
> - WhatsApp quality score cai abaixo de Medium: pausar número
> - **Custo por deal sobe > 2x da meta: investigar conversão**"

**Phase 8 implication:** Spec confirms cost monitoring as a critical alert. Our D-02 ($50/day cap) is a more aggressive variant — hard-kill rather than alert-and-continue. Acceptable per phase scope (MVP); after Phase 13 billing ships, switch to alert-only and rate-limit per lojista.

### § 11. Riscos — confirms LGPD posture

> Table 16:
> | Regulatório (LGPD) | Baixa | Alto | **Dados públicos, opt-out, DPO** |

**Phase 8 implication:** Listings table holds public marketplace data — no LGPD opt-out concern at scrape time. The `opt_out_list` table (already in schema) is for **outbound contact suppression** (Phase 10 outreach), not scrape suppression. Phase 8 does not consult `opt_out_list`.

### § 8. Escala (binds cadence reasoning)

> Table 11:
> | Negociações/dia | 100 (MVP) | 10.000 (Scale) |
> | Cobertura | SP capital (MVP) |

> Table 12 — Custos MVP:
> | APIs marketplace | R$ 0 | (free tier) |
> | TOTAL INFRA | R$ 3.700/mês |

**Phase 8 implication for D-03 cadence:**
- MVP target: 100 negociações/day → ~500-1000 listings actively scored daily (10:1 funnel) → **~2.000 API calls/day** per Table 3.
- Spec implies single-region (SP capital) at MVP — top 20 models × ~100 listings each per scrape = 2000 listings/run.
- At 2000 listings/run, 2 runs/day = 4000 listings/day raw, deduping to ~1500 unique (75% repeat between runs).
- **Cost math:** ribtools is "PAY_PER_EVENT" (per item extracted). At ~$0.001/item observed (industry typical for maintained Apify actors), 4000 items/day = $4/day = $120/month. **Way under D-02's $50/day cap.**
- 4 runs/day (seed hint) is over-aggressive for MVP — most runs would be no-op repeats. **2 runs/day prod (every 12h) + 1/day dev** is the operationally clean cadence.

### § Spec gaps for Phase 8

The spec **does not** specify:
1. Webhook signature mechanism (Apify-side limitation, not a spec gap).
2. FIPE failure mode (FIPE is downstream of discovery in spec; it's our addition to enrich at insert time).
3. Exact top-20 model list (spec is volume/marketplace-agnostic).
4. Sinistro/leilao/recall detection rules — spec calls them out but doesn't define detection. **We must define these from WebMotors payload fields** (see § Recommendations).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schedule trigger | External (Apify dashboard) | — | Apify owns cron; Vercel Cron is for cleanup only (D-05) |
| Webhook receiver (auth + cost cap + run-id capture) | API / Backend (Next.js Route Handler nodejs runtime) | — | Stateful Supabase write needs service-role client (Node APIs) |
| Dataset fetch (read items by run-id) | API / Backend | — | Apify REST API call + JSON streaming |
| Normalization (raw → DbListing.Insert) | Library (`src/lib/apify/`) | — | Pure function, reusable from cron + on-demand routes |
| FIPE enrichment | API / Backend | External (Parallelum via `/api/fipe`) | Phase 7 endpoint; chunked-probe pattern verified |
| Database upsert (`listings`) | Database / Storage (Supabase Postgres) | — | Service role bypasses RLS; unique on `fingerprint` |
| Matching engine trigger (creates `opportunities`) | API / Backend (already in stub webhook) | — | Phase 7→8→9 cross-phase coupling — preserve |
| Stale cleanup | API / Backend (Vercel Cron) | Database / Storage | UPDATE … WHERE last_scraped_at < now() - 72h |
| Cost monitoring | Database / Storage (`scrape_runs` aggregate) | — | SUM(cost_usd) WHERE date(started_at) = current_date |

---

## Standard Stack

### Core (already in package.json — verified 2026-04-25)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 15.1.0 | App Router + Route Handlers | Project standard [VERIFIED: package.json] |
| `@supabase/supabase-js` | 2.104.1 | Service-role DB writes | Standard server pattern [VERIFIED: registry, current] |
| `@supabase/ssr` | 0.10.2 | Cookie-bound server client (not used in webhook — service role) | Project standard |
| `zod` | 3.25.76 | Webhook payload validation | Project standard, already used in stub [VERIFIED] |
| Node `crypto` (built-in) | — | Timing-safe shared-secret comparison via `timingSafeEqual` | Stdlib; if HMAC path is chosen, also for HMAC-SHA256 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | (existing) | Unit + integration tests | Already configured; Phase 8 tests follow pattern at `route.test.ts` |
| Built-in `fetch` (Node 24) | — | Apify REST calls | Match existing `route.ts` pattern (no Apify SDK dep) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct fetch to Apify REST | `apify-client` npm package | +1 dep with shifting API; existing route avoids it. **Stay with fetch.** |
| HMAC-SHA256 signature | Shared-secret token in custom header | Apify doesn't natively sign requests. Shared-secret is what Apify recommends. **Use shared-secret in custom header `X-AutoAgent-Webhook-Secret` with `crypto.timingSafeEqual` comparison.** Optionally upgrade to HMAC via Headers payload template + Apify dashboard configuration as a Phase 8 stretch goal. |
| Vercel Cron for scheduled scrape | Apify-native schedule | CONTEXT D-03 already settled to Apify-side schedule. Vercel Cron retained ONLY for cleanup (D-05). |

### Installation

**No new dependencies needed** — every library is already in `package.json`. This is a pure-implementation phase.

### Version verification

```bash
npm view @supabase/supabase-js version  # 2.104.1 — verified current 2026-04-25
npm view zod version                     # 3.25.76 — verified current 2026-04-25
node --version                           # v24.8.0 — local; Vercel runs Node 22 LTS by default
```

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────┐
                    │  APIFY DASHBOARD (external state)                 │
                    │   • Schedule: cron "0 2,14 * * *"                 │
                    │   • Schedule input: top-20 models from            │
                    │     src/lib/apify/target-models.ts                │
                    │   • Webhook on ACTOR.RUN.SUCCEEDED →              │
                    │     POST autoagente.ai/api/scrape/webmotors/webhook │
                    │     Headers: X-AutoAgent-Webhook-Secret: <secret> │
                    └──────────────────────────────────────────────────┘
                                            │ POST {actorRunId, status, ...}
                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  POST /api/scrape/webmotors/webhook  (nodejs runtime)                    │
│                                                                           │
│  1. Auth gate (timing-safe header compare) ──→ 401 if mismatch           │
│  2. Cost cap query (SUM scrape_runs.cost_usd date=today) ──→ 429 if >=$50│
│  3. Insert scrape_runs row {status:'running', apify_run_id}              │
│  4. Fetch run meta GET /v2/actor-runs/{runId} ──→ get cost_usd, datasetId│
│  5. Fetch dataset items GET /v2/datasets/{datasetId}/items?clean=1       │
│     (paginated; max 1000 per request)                                     │
│  6. For each item:                                                        │
│        normalizeWebMotorsItem(raw) ──→ DbListing.Insert | Filtered       │
│        if Filtered (sinistro/leilao/recall): increment scrape_runs.      │
│           listings_error, log to scrape_runs.notes, continue             │
│        else:                                                              │
│           if needsFipeEnrichment: POST /api/fipe {marca, modelo, ano}    │
│              on FIPE failure: insert with fipe=null + flag in attrs      │
│           supabase.from('listings').upsert(row, {onConflict:'fingerprint'})│
│           run matchListingToWishlists() against active wishlists          │
│           upsert qualifying matches into 'opportunities'                  │
│  7. Update scrape_runs row {status:'completed', counts, ended_at, cost}  │
│  8. Return {ok, listings_processed, opportunities_created, run_id}       │
└──────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
                    ┌──────────────────────────────────┐
                    │  Supabase (service-role bypass RLS)│
                    │   listings + scrape_runs +         │
                    │   opportunities                    │
                    └──────────────────────────────────┘

Separately:
┌────────────────────────────────────────────┐
│  POST /api/cron/listings-cleanup            │
│  (Vercel Cron, daily, CRON_SECRET-gated)   │
│  UPDATE listings SET status='removed'      │
│   WHERE last_scraped_at < now()-interval '72 hours' │
│   AND status != 'removed'                   │
└────────────────────────────────────────────┘

Preserved untouched:
  POST /api/scrape/webmotors  (Phase 5 on-demand URL paste — admin debug only)
```

### Recommended Project Structure

```
src/
├── app/api/
│   ├── scrape/webmotors/
│   │   ├── route.ts                  # Phase 5 on-demand (PRESERVE — admin debug)
│   │   ├── route.test.ts             # PRESERVE
│   │   └── webhook/
│   │       ├── route.ts              # EXTEND existing stub with Apify scheduled-run flow
│   │       └── route.test.ts         # EXTEND existing tests
│   └── cron/
│       └── listings-cleanup/
│           ├── route.ts              # NEW — D-05 stale cleanup
│           └── route.test.ts         # NEW
│
├── lib/apify/
│   ├── types.ts                      # NEW — move WebMotorsScraped here from on-demand route
│   ├── target-models.ts              # NEW — D-06 hardcoded top-20 brand/model list
│   ├── webmotors-normalize.ts        # NEW — § 8.3 pure normalization function
│   ├── webmotors-normalize.test.ts   # NEW
│   ├── filters.ts                    # NEW — sinistro/leilao/recall detection (spec § 2 step 3)
│   ├── filters.test.ts               # NEW
│   ├── client.ts                     # NEW — fetch wrappers for Apify REST: getRun, streamDatasetItems
│   ├── client.test.ts                # NEW
│   └── webhook-auth.ts               # NEW — timing-safe shared-secret compare; ready for HMAC upgrade
│
└── lib/server/
    └── rate-limit.ts                 # PRESERVE — webhook uses bucket "scrape_webhook"
```

### Pattern 1: Extend, don't replace, the existing stub

**What:** The webhook route at `src/app/api/scrape/webmotors/webhook/route.ts` already exists from Phase 7 with shape: `[{ source, source_listing_id, fingerprint, brand, ...}]` (pre-normalized array of listings). Phase 8's Apify webhook delivers `{ actorRunId, ... }` only. Two-shape compatibility needed.

**When to use:** Always. Replacing the stub breaks Phase 9 matching tests that depend on its existing flow.

**Implementation:**
```typescript
// src/app/api/scrape/webmotors/webhook/route.ts (new top-level discriminator)
const apifySchema = z.object({
  resource: z.object({ id: z.string() }),  // Apify-shape
  // ... event metadata
});
const stubSchema = z.array(webhookListingSchema).min(1).max(500);  // existing stub-shape

if (apifySchema.safeParse(body).success) {
  return handleApifyRun(body, request);
}
if (stubSchema.safeParse(body).success) {
  return handleDirectListings(body, request);  // unchanged from Phase 7
}
return errorResponse(400, { error: "invalid_body" });
```

This preserves the Phase 7 contract (Phase 9 matching tests still pass) and adds the Apify path.

### Pattern 2: Two-call Apify ingest (run meta + dataset)

**What:** Apify's `ACTOR.RUN.SUCCEEDED` webhook payload contains `actorRunId` + `actorId` only. We need run cost + dataset ID separately.
**Source:** docs.apify.com/platform/integrations/webhooks/events (verified 2026-04-25)

```typescript
// src/lib/apify/client.ts
export async function getActorRun(runId: string, token: string): Promise<RunMeta> {
  // GET /v2/actor-runs/{runId}?token=...
  // Returns: { data: { id, status, defaultDatasetId, stats: { computeUnits, ... }, usageTotalUsd } }
}

export async function* streamDatasetItems<T>(
  datasetId: string,
  token: string,
): AsyncGenerator<T> {
  // GET /v2/datasets/{id}/items?clean=true&limit=1000&offset=...
  // Paginate by offset until empty page; yield one item at a time.
  // CRITICAL: never load full dataset into memory (D-09 anti-pattern enforcement).
}
```

### Pattern 3: Pure normalization → DbListing.Insert

**What:** Take raw `WebMotorsScraped` and produce a `DbListing` Insert row OR a "filtered" sentinel.
**When:** Always for both scheduled webhook + on-demand /api/scrape paths (DRY).

```typescript
// src/lib/apify/webmotors-normalize.ts
export type NormalizeResult =
  | { ok: true; row: Tables["listings"]["Insert"]; needsFipe: boolean }
  | { ok: false; reason: "sinistro" | "leilao" | "recall" | "missing_required" | "invalid_data" };

export function normalizeWebMotorsItem(raw: WebMotorsScraped): NormalizeResult {
  // 1. filters.ts: rejectIfBlocked(raw) → if true return { ok: false, reason }
  // 2. extract canonical fields:
  //    - source: "webmotors" (constant)
  //    - source_listing_id: String(raw.id) (REQUIRED — reject if missing)
  //    - fingerprint: createHash('sha256').update(`webmotors:${raw.id}`).digest('hex')
  //    - brand/model/trim from make/model/version
  //    - year: prefer fabrication_year, fallback model_year
  //    - km, price (already numeric in actor output)
  //    - fipe: raw.fipe_price if present (actor sometimes provides)
  //    - savings_vs_fipe / savings_pct: computed if both price + fipe present
  //    - seller_type: parseSellerType(raw.seller?.seller_type)
  //    - seller_uf: extractUf(raw.seller?.state)
  //    - seller_city: raw.seller?.city
  //    - listing_url: raw.url
  //    - photo_url: raw.photos?.[0]
  //    - days_online: daysSince(raw.publish_date) (existing fn in route.ts)
  //    - reductions: null (no source data)
  //    - attributes: { color, fuel_type, body_type, optionals, transmission, doors, plate, armored }
  //    - motivation_signals: buildMotivationSignals(raw)  (existing fn)
  //    - status: "active"
  // 3. needsFipe = (fipe === null && brand && model && year)
}
```

### Pattern 4: FIPE enrichment with graceful degradation

```typescript
// In webhook handler, post-normalize:
if (norm.needsFipe) {
  const fipe = await callFipeOrNull(norm.row.brand, norm.row.model, norm.row.year);
  if (fipe !== null) {
    norm.row.fipe = fipe;
    norm.row.savings_vs_fipe = norm.row.price ? norm.row.price - fipe : null;
    norm.row.savings_pct = norm.row.price && fipe > 0 ? ((fipe - norm.row.price) / fipe) * 100 : null;
  } else {
    // Decision D-04: insert with fipe=null + flag in attributes for retry
    norm.row.attributes = { ...norm.row.attributes, fipe_retry_pending: true };
  }
}
```

### Pattern 5: scrape_runs lifecycle

```typescript
// On webhook entry (after auth + cost cap pass):
const { data: runRow } = await supabase
  .from("scrape_runs")
  .insert({
    source: "webmotors",
    status: "running",
    apify_run_id: payload.resource.id,
  })
  .select()
  .single();

// ... process dataset ...

// On completion:
await supabase
  .from("scrape_runs")
  .update({
    status: errors > listings_total * 0.2 ? "failed" : "completed",
    ended_at: new Date().toISOString(),
    cost_usd: runMeta.usageTotalUsd ?? null,
    listings_new,
    listings_updated,
    listings_error,
    notes: errors > 0 ? `${errors} normalization failures` : null,
  })
  .eq("id", runRow.id);
```

### Anti-Patterns to Avoid

- **DON'T add `apify-client` npm dependency.** Existing `route.ts` proves direct fetch works; one less dep + less surface for token leak.
- **DON'T process full dataset in memory.** Spec § 8 implies 5000-200k items/day at scale. Stream pagination (1000/page) is mandatory even at MVP scale.
- **DON'T re-implement normalization in the webhook route.** Pure function in `lib/apify/webmotors-normalize.ts` so on-demand `/api/scrape/webmotors` can use the same function in a Phase 9 follow-up consolidation.
- **DON'T log Apify token, webhook secret, or full Apify URL** (token in query string). Existing pattern at `route.ts:139-145` (callApifyActor) demonstrates: regex-replace token with `[REDACTED]` before any console output.
- **DON'T tighten `seller_type` filter at scrape time.** Insert PF + PJ both. Phase 9 matching engine enforces PF-only at match time (verified: `engine.ts:170`). Filtering early kills Radar mode (spec § 7 — "feed de oportunidades" needs PJ comparables).
- **DON'T trigger `/api/fipe` synchronously for every listing without batching.** At 2000 items/run × ~3s each = 100min — exceeds Vercel Edge timeout AND saturates Parallelum (we already broke them once at Phase 7, see commit `75b3177`). **Use chunked parallel fetches (10-at-a-time)** mirroring the chunked probe pattern at `src/app/api/fipe/route.ts:200-222`. If FIPE is unavailable, fall back to null + retry queue per D-04.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebMotors HTML scraping | Custom Playwright pageFunction | ribtools/webmotors-scraper Apify actor | 98.6% success vs known-failed alternatives ([VERIFIED: src/app/api/scrape/webmotors/route.ts:91-100, comment from 2026-04-22 actor metrics]) |
| Schedule trigger system | Vercel Cron + Apify API run trigger | Apify-native schedule | One config in Apify dashboard; no Vercel cold-start flakiness |
| Webhook signature crypto | Custom HMAC validation library | Node built-in `crypto.createHmac('sha256', secret)` + `crypto.timingSafeEqual` (if HMAC chosen); else shared-secret with `timingSafeEqual` | Stdlib; documented since Node 14 |
| Fingerprint hashing | UUID generators | `crypto.createHash('sha256').update(...)` | Deterministic, content-addressable; existing schema's `fingerprint` column expects deterministic input for upsert idempotency |
| FIPE lookup logic | Re-implement Parallelum chunked probe | `POST /api/fipe` (Phase 7) | Already chunked + tested 30/min rate limit; reusing avoids the `Promise.all(120)` regression that took down Phase 1 [VERIFIED: STATE.md commit `75b3177`] |
| Stale cleanup logic | Inline in webhook route | Separate Vercel Cron `/api/cron/listings-cleanup` | D-05 locked; single-responsibility per route |
| Listings upsert dedup | Hand-managed SELECT-then-INSERT | Postgres `unique(fingerprint)` + Supabase `.upsert({ onConflict: "fingerprint" })` | Existing schema constraint at migration 0001 line 134; race-safe |
| Match score calculation | New scoring code in webhook | `matchListingToWishlists()` from `src/lib/matching/engine.ts` | Phase 7 deliverable; tests pass; cross-phase contract |

**Key insight:** Phase 8 is mostly **glue between four pre-existing pieces** (Apify scheduled run → webhook stub → matching engine → FIPE endpoint). Hand-rolling any of them re-introduces solved problems.

---

## Common Pitfalls

### Pitfall 1: Apify does NOT natively support HMAC signatures (CONTEXT D-01 conflict)

**What goes wrong:** D-01 specifies `Apify-Webhook-Signature` header with HMAC-SHA256. **Apify does not produce this header.** Configuring it in the dashboard is impossible. Implementing the verification rejects every legitimate webhook with 401.

**Why it happens:** Apify's documented webhook security model (verified 2026-04-25) is **shared-secret token in URL or header** — see [docs.apify.com/platform/integrations/webhooks](https://docs.apify.com/platform/integrations/webhooks/) "Add a secret token to the webhook URL or in a header so only Apify can invoke it." There is no signing mechanism.

**How to avoid:** Three resolution paths during planning:

1. **Pragmatic (RECOMMENDED):** Adjust D-01 to **shared-secret in custom header** (e.g., `X-AutoAgent-Webhook-Secret`). Use `crypto.timingSafeEqual` for constant-time comparison to prevent timing attacks. Apify Headers template configures this in the dashboard. Equivalent strength to HMAC for this threat model (no MITM concern over TLS, no replay protection needed when payload includes `actorRunId` which is one-shot).

2. **HMAC via payload template (advanced):** Apify supports payload templates with a Headers template + variable substitution. We could compute an HMAC server-side over a known-deterministic payload and have Apify forward it. Adds one round-trip + brittle to schema drift. **Not worth it for Phase 8.**

3. **Defer HMAC to Phase 13 hardening:** Ship D-01-equivalent (shared-secret) for MVP; revisit when production traffic justifies the upgrade. Aligns with PRD v3 NG7 "compliance hardening pós-MVP".

**Warning signs:** First scheduled run fires → 401 in Vercel logs → silent ingest failure for hours/days. **Add E2E test that runs webhook with valid+invalid header before Phase 8 closes.**

[CITED: docs.apify.com/platform/integrations/webhooks/actions and use-apify.com/blog/apify-webhooks-complete-guide, both verified 2026-04-25]

### Pitfall 2: Apify webhook payload is metadata-only — must fetch dataset separately

**What goes wrong:** Implementer assumes the webhook POST body contains the scraped listings. It contains `{actorRunId, actorId, eventType, resource: { id }}` only. Reading `body.listings` returns undefined; nothing inserts.

**Why it happens:** Apify webhooks are **event notifications**, not data deliveries. The `resource.id` is the run ID; the dataset must be fetched via REST.

**How to avoid:** After webhook validation, call `GET /v2/actor-runs/{runId}` → extract `defaultDatasetId` → call `GET /v2/datasets/{datasetId}/items?clean=true&limit=1000&offset=...` paginated.

**Warning signs:** scrape_runs counts all zero despite webhook arriving; Vercel logs show `body.listings: undefined`.

[CITED: docs.apify.com/platform/integrations/webhooks/events, verified 2026-04-25]

### Pitfall 3: Vercel Edge runtime can't run service-role Supabase client

**What goes wrong:** Webhook declared `runtime = "edge"` — `getSupabaseServiceRole()` works at startup but cookie/Node-API patterns inside `@supabase/ssr` break in Edge.

**Why it happens:** Service-role client uses `@supabase/supabase-js` directly (not SSR), which works in Edge — BUT the existing stub already declares `runtime = "nodejs"` for service-role pattern compatibility, and the FIPE call (Edge) + chunked Promise.all already had Edge timeout issues at Phase 1.

**How to avoid:** Keep `runtime = "nodejs"` in the webhook route. Larger timeout budget (60s on Pro plan) accommodates dataset streaming + FIPE enrichment.

**Warning signs:** Sporadic 504s; `connect ETIMEDOUT` errors during dataset fetch.

[VERIFIED: src/app/api/scrape/webmotors/route.ts:25 + webhook/route.ts:38]

### Pitfall 4: FIPE chunked probe regression (Promise.all explosion)

**What goes wrong:** Phase 1 commit `75b3177` fixed a `Promise.all(120)` that saturated Vercel Edge's outbound connection pool, causing AbortSignal timeouts on every fetch. Easy to reintroduce in Phase 8 when enriching 2000 listings/run.

**Why it happens:** Naive code `await Promise.all(items.map(item => callFipe(item)))` opens 2000 concurrent connections.

**How to avoid:** Mirror the chunked-with-early-break pattern at `src/app/api/fipe/route.ts:200-222`. For Phase 8: chunks of 10 listings → batch FIPE calls → wait for batch → next batch. Or simpler: enqueue FIPE retries to a separate cron and insert with `fipe=null` immediately (D-04 already authorizes this).

**Warning signs:** scrape_runs.cost_usd elevated, scrape_runs.listings_error spikes, all `fipe` columns NULL despite Parallelum being up.

[VERIFIED: STATE.md "FIPE autofetch bug" + commit 75b3177; src/app/api/fipe/route.ts:182-191 inline rationale]

### Pitfall 5: Race between scheduled webhook + manual /api/scrape on-demand

**What goes wrong:** User hits on-demand `/api/scrape/webmotors` (Phase 5) at the same moment the scheduled webhook is processing a run. Both upsert with same `fingerprint` → row-level lock contention; one path errors with 23505 unique violation despite `.upsert()`.

**Why it happens:** PostgreSQL upsert is generally race-safe via `ON CONFLICT`, but high concurrency on the same fingerprint can produce serialization errors under READ COMMITTED.

**How to avoid:** Two layers: (a) the on-demand route at `/api/scrape/webmotors` does NOT write to DB at all currently (returns Opportunity object directly to client) — verified via re-reading route.ts:509 — so no actual race exists right now. (b) When Phase 9+ wires on-demand into DB, add `.onConflict('fingerprint').ignoreDuplicates()` for read-only collision tolerance.

**Warning signs:** Sporadic 5xx during demo runs.

[VERIFIED: src/app/api/scrape/webmotors/route.ts:510 returns directly to client, no DB write]

### Pitfall 6: Apify free-tier limits + RESIDENTIAL proxy gating

**What goes wrong:** Free tier or even Starter caps prevent the actor from accessing residential proxies → run failures with `RESIDENTIAL not in your plan`. WebMotors' Akamai 403s datacenter IPs.

**Why it happens:** ribtools actor configures `proxyConfig: { useApifyProxy: true }` without pinning a group. On free tier, only datacenter is available; Akamai blocks it.

**How to avoid:** Phase 8 is shipping ON the user's PAID Apify account (per CLAUDE.md "Apify integrado"). Verify token is on Starter+ plan **before** Phase 8 plan-7 ships. If still failing: pin `apifyProxyGroups: ["RESIDENTIAL"]` in actor input. If account is on free tier, this is a **hard blocker** — escalate.

**Warning signs:** Every scheduled run fails with same `apify_NUM_HTTP run=XYZ status=FAILED exit=1` message; manually fetching run meta shows "RESIDENTIAL proxy not in your plan."

[VERIFIED: src/app/api/scrape/webmotors/route.ts:165-191 fetchRunDiagnostics function — same diagnostic mechanism Phase 8 should reuse via `getActorRun()`]

### Pitfall 7: Spec's "filtros eliminatorios" without spec definitions

**What goes wrong:** Spec § 2 mandates filter for "sinistro, leilão, recall aberto" but defines no detection mechanism. Implementer either skips the filter (compliance gap) or invents loose heuristics that false-positive (clean listings rejected).

**How to avoid:** Define minimal viable filters from WebMotors payload fields (verified shape via existing `WebMotorsScraped`):
- **Leilão:** `attributes` array contains "Leilão" / "Leilao" / "Procedência leilão" — case insensitive substring match.
- **Sinistro:** `attributes` contains "Sinistrado" or `title` contains "sinistro" / "batido" — keyword scan.
- **Recall aberto:** No reliable signal in payload. **Don't filter on this** at MVP; flag in `attributes.recall_check_pending: true` and defer to manual Phase 13 enrichment with FAB recall API.

**Warning signs:** Listings with "Sinistrado" in title appearing in matching → wishlists → opportunities.

[CITED: Spec Técnico v1 § 2 verbatim; payload field verification from src/app/api/scrape/webmotors/route.ts:43-82]

### Pitfall 8: Cost cap query running for every webhook → DB load

**What goes wrong:** D-02 cost cap requires `SELECT SUM(cost_usd) FROM scrape_runs WHERE date(started_at) = current_date_utc`. With Phase 9+ matching webhooks firing dozens of times/day plus this 2-4x scheduled run, the daily aggregate becomes hot.

**How to avoid:** Add index `idx_scrape_runs_started` already exists (verified migration 0001:312). Acceptable cost for low-frequency reads. **Don't memoize in-memory** (Vercel functions are stateless). If load grows, materialize daily total in a `daily_cost_usd` table or use `pg_cron` to roll up.

**Warning signs:** Webhook latency >2s on every run (DB scan); slow query log in Supabase shows the SUM as top.

### Pitfall 9: Top-20 model hardcode — ribtools actor input format mismatch

**What goes wrong:** Implementer types `[{brand: "Honda", model: "Civic"}, ...]` and passes to actor. Actor expects different input shape (URL list, search terms array, or per-actor schema).

**How to avoid:** Inspect `ribtools/webmotors-scraper` Apify input schema at https://apify.com/ribtools/webmotors-scraper before implementing target-models.ts. Likely shape: `{ startUrls: [{url: "https://www.webmotors.com.br/carros/estoque?marca=honda&modelo=civic"}, ...], maxItems: N, proxyConfig: ... }`. The on-demand route already proves the URL-list format works; scheduled run just supplies 20+ URLs (one per brand+model combo).

**Warning signs:** Schedule fires but 0 items in dataset; run meta shows status=SUCCEEDED with 0 items processed.

### Pitfall 10: Status `'stale'` defined in schema but no transition logic

**What goes wrong:** Schema has 3 statuses (`active`, `removed`, `stale`) but D-05 only writes `removed`. `stale` becomes an unused state.

**How to avoid:** Two options: (a) drop `'stale'` from check constraint in next migration (breaking — avoid in Phase 8); (b) define semantic: `stale` = "last_scraped_at is between 24-72h old, not yet removed" — used as a soft filter for matching. **Recommendation:** Don't write `stale` in Phase 8; matching engine queries `WHERE status = 'active'` only. Defer status-stale logic to Phase 12+ when admin UI surfaces it.

**Warning signs:** `stale` rows accumulate; query confusion in Phase 12.

[VERIFIED: supabase/migrations/0001_init.sql:130]

---

## Runtime State Inventory

> **Phase 8 is greenfield ingest, not a rename/refactor.** This section enumerates only items that survive across runs and could conflict with Phase 8's writes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `listings` table from on-demand demo data (if any was inserted manually); `scrape_runs` empty per fresh Phase 6 deploy | Phase 8 inserts/upserts — no conflict |
| Live service config | **Apify dashboard:** schedule + webhook configuration set BY HAND post-deploy. NOT version-controlled. | Document in Phase 8 plan-7 deliverable: explicit step list with screenshots showing exact dashboard config (cron, webhook URL, headers template) |
| OS-registered state | None — Vercel-hosted, no local cron | None |
| Secrets/env vars | `APIFY_API_TOKEN` (already set per CONTEXT.md). NEW: `APIFY_WEBHOOK_SECRET` (or rename to `SCRAPE_WEBHOOK_SECRET` to match existing stub at `webhook/route.ts:87`); `MAX_DAILY_SCRAPE_COST_USD` (default 50); `CRON_SECRET` for Vercel Cron auth on cleanup endpoint (likely already exists from Phase 6/7 — verify) | Add to `.env.local` + Vercel env vars; do NOT commit values; add to env validation in `src/lib/supabase/env.ts` or a new `src/lib/env.ts` |
| Build artifacts | None | None |

**Critical operational note:** The Apify schedule + webhook config is the ONLY part of Phase 8 not in git. Phase 8's plan must include (a) a setup runbook in `.planning/phases/08-scraping-pipeline/SETUP.md` and (b) idempotent re-config script in `scripts/setup-apify-schedule.ts` (calls Apify API to create/update the schedule from `target-models.ts`). Otherwise: prod outage if Apify dashboard is reset.

---

## Code Examples

### Example 1: Apify run meta + dataset stream (lib/apify/client.ts)

```typescript
// Source: docs.apify.com/api/v2 + adaptation of existing fetchRunDiagnostics
const APIFY_BASE = "https://api.apify.com/v2";

export interface RunMeta {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
  defaultDatasetId: string;
  usageTotalUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function getActorRun(runId: string, token: string, signal: AbortSignal): Promise<RunMeta> {
  const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`apify_run_meta_${res.status}`);
  const json = (await res.json()) as { data: RunMeta };
  return json.data;
}

export async function* streamDatasetItems<T>(
  datasetId: string,
  token: string,
  signal: AbortSignal,
  limit = 1000,
): AsyncGenerator<T, void, void> {
  let offset = 0;
  while (true) {
    const url = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&offset=${offset}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`apify_dataset_${res.status}`);
    const items = (await res.json()) as T[];
    if (items.length === 0) return;
    for (const item of items) yield item;
    if (items.length < limit) return;
    offset += limit;
  }
}
```

### Example 2: Timing-safe shared-secret comparison (lib/apify/webhook-auth.ts)

```typescript
// Source: Node.js stdlib docs; pattern from Stripe/GitHub webhook verification adapted
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySharedSecret(headerValue: string | null, expectedSecret: string): boolean {
  if (!headerValue) return false;
  // Both must be exact same byte length for timingSafeEqual; pad/truncate on a buffer is unsafe.
  // Cheap pre-check: length mismatch → fail (still constant time per real check, but rejects faster).
  const provided = Buffer.from(headerValue, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// Optional HMAC variant — for if/when Apify Headers template is configured
// to send hash-of-payload-with-secret as a header.
export function verifyHmacSha256(
  rawBody: string,
  headerValue: string | null,
  secret: string,
): boolean {
  if (!headerValue) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

### Example 3: Filtros eliminatorios (lib/apify/filters.ts)

```typescript
// Source: Spec Técnico v1 § 2 + WebMotorsScraped field shape
import type { WebMotorsScraped } from "./types";

const LEILAO_TERMS = [/leil[aã]o/i, /procedencia\s+leilao/i];
const SINISTRO_TERMS = [/sinistr[ao]/i, /salvad[oa]/i, /recuperad[oa]/i, /batid[oa]/i];

export type FilterReason = "leilao" | "sinistro" | "recall" | null;

export function detectBlockingFilter(item: WebMotorsScraped): FilterReason {
  const haystacks = [
    item.title ?? "",
    ...(Array.isArray(item.attributes) ? item.attributes.filter((a): a is string => typeof a === "string") : []),
  ];
  const text = haystacks.join(" | ").toLowerCase();
  if (LEILAO_TERMS.some((re) => re.test(text))) return "leilao";
  if (SINISTRO_TERMS.some((re) => re.test(text))) return "sinistro";
  // Recall: no reliable signal in payload — defer to Phase 13 (FAB API integration)
  return null;
}
```

---

## Validation Architecture (Nyquist)

> `nyquist_validation: true` per `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.x (existing) |
| Config file | `vitest.config.ts` at repo root |
| Quick run command | `pnpm test src/lib/apify/` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRAPE-01 | Schedule produces dataset items reachable via REST | manual-only | (verify in Apify dashboard + Vercel logs first run) | ❌ Wave 0 manual |
| SCRAPE-02 | Webhook auth: 401 on missing/invalid header; 200 on valid | unit + integration | `pnpm test src/app/api/scrape/webmotors/webhook/route.test.ts -t "auth"` | ✅ Extend existing |
| SCRAPE-02 | Webhook with Apify-shape payload triggers run-meta + dataset fetch | integration (with `vi.mock`'d fetch) | `pnpm test … -t "apify_run"` | ❌ Wave 0 |
| SCRAPE-02 | Webhook with stub-shape payload (Phase 7 contract) still works | integration | `pnpm test … -t "stub_listings"` | ✅ Existing |
| SCRAPE-03 | normalizeWebMotorsItem: full happy path (PF, all fields) → DbListing.Insert | unit | `pnpm test src/lib/apify/webmotors-normalize.test.ts` | ❌ Wave 0 |
| SCRAPE-03 | normalize: missing required (no source_listing_id) → reason=missing_required | unit | same | ❌ Wave 0 |
| SCRAPE-03 | normalize: leilao keyword in attributes → reason=leilao | unit | same | ❌ Wave 0 |
| SCRAPE-03 | normalize: sinistro keyword in title → reason=sinistro | unit | same | ❌ Wave 0 |
| SCRAPE-03 | normalize: PJ + armored → ddStatus review (consistent with on-demand route) | unit | same | ❌ Wave 0 |
| SCRAPE-04 | FIPE failure: insert with fipe=null + attributes.fipe_retry_pending=true | integration | `pnpm test … -t "fipe_failure"` | ❌ Wave 0 |
| SCRAPE-04 | FIPE success: savings_pct populated correctly | unit | webmotors-normalize.test.ts | ❌ Wave 0 |
| SCRAPE-05 | scrape_runs row created on entry, updated on exit with counts | integration | `pnpm test … -t "scrape_runs"` | ❌ Wave 0 |
| SCRAPE-06 | Cleanup cron: rows last_scraped >72h → status='removed' | unit + integration | `pnpm test src/app/api/cron/listings-cleanup/route.test.ts` | ❌ Wave 0 |
| SCRAPE-06 | Cleanup cron: CRON_SECRET auth (401 on missing) | unit | same | ❌ Wave 0 |
| SCRAPE-07 | On-demand `/api/scrape/webmotors` unchanged (regression) | unit | `pnpm test src/app/api/scrape/webmotors/route.test.ts` | ✅ Existing — must pass post-Phase-8 |
| SCRAPE-08 | Cost cap >= $50 → 429 returned, no scrape_runs row mutated | integration | `pnpm test … -t "cost_cap"` | ❌ Wave 0 |
| SCRAPE-09 | Filtros eliminatorios reject sinistro/leilao at normalize, never reach DB | integration | `pnpm test … -t "filters_block"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test src/lib/apify/ src/app/api/scrape/webmotors/webhook/ src/app/api/cron/`
- **Per wave merge:** `pnpm test` (full suite — must include Phase 7 wishlist + Phase 9 matching tests to confirm cross-phase contract)
- **Phase gate:** Full suite green + manual smoke test of one scheduled run end-to-end before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/apify/types.ts` — move `WebMotorsScraped` from on-demand route (no logic change; refactor)
- [ ] `src/lib/apify/target-models.ts` — D-06 list of 20 brand/model pairs + tests
- [ ] `src/lib/apify/target-models.test.ts` — count = 20, all brands valid, all models non-empty
- [ ] `src/lib/apify/filters.ts` + `.test.ts` — sinistro/leilao detection
- [ ] `src/lib/apify/webhook-auth.ts` + `.test.ts` — timing-safe compare; HMAC-ready function
- [ ] `src/lib/apify/client.ts` + `.test.ts` — getActorRun + streamDatasetItems with `vi.mock`'d fetch
- [ ] `src/lib/apify/webmotors-normalize.ts` + `.test.ts` — pure function with 8+ test cases
- [ ] `src/app/api/cron/listings-cleanup/route.ts` + `.test.ts` — D-05 cron endpoint
- [ ] `src/app/api/scrape/webmotors/webhook/route.test.ts` — extend existing tests with Apify-shape path

No new framework install needed — vitest already configured.

---

## Locked Decisions Table (D-01..D-09 + research-derived locks)

| ID | Status | Decision | Rationale |
|----|--------|----------|-----------|
| **D-01** | LOCKED (with research caveat) | Webhook auth via **shared secret** in custom header `X-AutoAgent-Webhook-Secret`; constant-time compare via `crypto.timingSafeEqual`. HMAC support **scaffolded but disabled** — `verifyHmacSha256()` is in code, ready for Phase 13 hardening when Apify Headers template is configured. | Apify does not natively produce HMAC headers; shared-secret is their documented pattern. Equivalent threat-model strength over TLS for this MVP. CONTEXT D-01's HMAC-SHA256 wording revised. |
| **D-02** | LOCKED unchanged | Hard-kill at $50/day USD aggregate. Webhook returns 429 + console.error when `SUM(scrape_runs.cost_usd) WHERE date(started_at)=today >= MAX_DAILY_SCRAPE_COST_USD`. | Floor against runaway billing. |
| **D-03** | NEW LOCK from research | **Production: 2 runs/day at 02:00 + 14:00 BRT (every 12h). Dev: 1 run/day at 03:00 BRT.** Cron expressions: `0 2,14 * * *` (prod) and `0 3 * * *` (dev), in `America/Sao_Paulo` timezone. | Spec MVP target = 100 negociacoes/day → 4000 listings/day raw is sufficient. Seed hint of "4x/day prod" was over-aggressive (no spec basis); 2x/day matches cost ceiling at $4-8/day vs $50 cap. Spec § 6 "compressao de rounds" implies <12h freshness adequate. (per Spec Técnico v1 § 4 funnel + § 8 volume targets) |
| **D-04** | NEW LOCK from research | **FIPE failure → insert with `fipe=null` + `attributes.fipe_retry_pending=true`. Retry handled by separate Vercel Cron `/api/cron/fipe-retry` (Phase 8 scope, runs hourly).** | Spec doesn't prescribe; recommendation derived from existing FIPE chunked-probe pattern (`route.ts:200-222`) which already tolerates partial upstream failures. Inserting null is preferable to dropping the listing — matching engine handles null fipe (verified: `engine.ts:213` checks `savings_pct != null` before scoring). |
| **D-05** | LOCKED unchanged | Stale cleanup via separate Vercel Cron `/api/cron/listings-cleanup`, daily, TTL 72h, marks `status='removed'`. CRON_SECRET-gated. | Single-responsibility; Apify actor stays focused on scrape+ingest. |
| **D-06** | LOCKED with default list | Hardcoded `src/lib/apify/target-models.ts`. **Initial list = top 20 best-selling cars Brasil 2025** (Fenabrave): Volkswagen Polo, Hyundai HB20, Fiat Strada, Chevrolet Onix, Volkswagen T-Cross, Fiat Argo, Toyota Corolla Cross, Hyundai Creta, Chevrolet Tracker, Jeep Compass, Honda HR-V, Toyota Corolla, Nissan Kicks, Volkswagen Saveiro, Renault Kwid, Fiat Fastback, Chevrolet Spin, Volkswagen Nivus, Honda Civic, Jeep Renegade. Spec lists no top-20 — this list is research-recommended; planner can override with user input. | Spec is brand-agnostic. Brazilian market data 2025 from Fenabrave is the authoritative consumer-side list. |
| **D-07** | LOCKED unchanged | Photos URL only (`listings.photo_url` from `photos[0]`). | Schema constraint; bandwidth/storage saving. |
| **D-08** | LOCKED unchanged | No `listing_price_history` writes in Phase 8. Table exists in schema (migration 0001:147) but stays empty. | Phase 13 ships price tracker. |
| **D-09** | LOCKED unchanged | Observability via `scrape_runs` rows + Vercel logs. No admin UI. | Phase 12 ships dashboard. |

---

## Open Questions

1. **Apify account plan tier (residential proxy access)?**
   - What we know: ribtools actor configured with `useApifyProxy: true` without group pinning; works for on-demand demo (Phase 5).
   - What's unclear: Whether the user's APIFY_API_TOKEN account is on Starter+ plan (residential proxy access). Free tier scheduled runs may fail with WebMotors Akamai blocks.
   - Recommendation: Phase 8 plan-1 (Wave 0) MUST include a probe task that submits a test scheduled run via Apify API and verifies success/failure mode. Block phase if free-tier blocking.

2. **Apify Headers template HMAC support — confirm during planning?**
   - What we know: Apify Headers template can inject variables `{{userId}}` etc.
   - What's unclear: Whether Headers template can compute HMAC over the payload at send-time (i.e., can the dashboard configure `X-Signature: hmac_sha256({{eventBody}}, "$secret")`?).
   - Recommendation: Probe in plan-2 if HMAC upgrade is desired. Otherwise defer to Phase 13.

3. **`reductions` field — populate from where in MVP?**
   - What we know: Schema has `reductions int`; spec Table 5 weights "Redução de preço > 5% +25 pts" heavily.
   - What's unclear: WebMotors actor doesn't expose price history; only current price.
   - Recommendation: Phase 8 sets `reductions=null`. Phase 13 derives from `listing_price_history` writes (which are also a Phase 13 deliverable). Document this dependency in matching engine — it currently checks `(listing.reductions ?? 0) >= 1` which gracefully handles null (verified: `engine.ts:233`). No change needed.

4. **`days_online` accuracy — relies on actor's `publish_date`?**
   - What we know: Existing `daysSince(item.publish_date)` at `route.ts:315` works for the on-demand demo.
   - What's unclear: Whether the actor reliably populates `publish_date` for ALL listings or only some.
   - Recommendation: Phase 8 normalize.ts uses publish_date with fallback to create_date (existing pattern); if both null, set days_online=null. Matching engine handles null gracefully (verified: `engine.ts:237` checks `(listing.days_online ?? 0) >= 45`).

5. **Top-20 list — keep current Fenabrave-derived or curate from PRD/business plan?**
   - What we know: D-06 says "lista hardcoded; quando crescer, vira tabela DB (Phase 13+)". Spec doesn't prescribe.
   - What's unclear: Whether the user's PRD/Business Plan v3 has a target persona segment that maps to specific models (e.g., "Premium tier targets cars >R$80k").
   - Recommendation: Default to the Fenabrave top-20 unless planner has user input to the contrary during plan-3.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (Vercel runtime) | Webhook + cleanup routes | ✓ | 22 LTS (Vercel default) / 24.8 (local) | — |
| `@supabase/supabase-js` | DB writes | ✓ | 2.104.1 | — |
| `zod` | Payload validation | ✓ | 3.25.76 | — |
| `node:crypto` (stdlib) | Shared-secret + fingerprint | ✓ | built-in | — |
| Apify API + paid tier | Scheduled runs + residential proxy | ❓ Plan tier unverified | — | If free tier: switch to manual cron via Vercel + Apify run-trigger API (degraded but functional) |
| Parallelum FIPE | Enrichment | ✓ | (Phase 7 endpoint) | D-04: insert null + retry queue |
| Supabase project | DB | ✓ | (Phase 6 deployed) | — |
| `APIFY_API_TOKEN` env var | Apify REST calls | ✓ | (per CONTEXT, already configured) | — |
| `APIFY_WEBHOOK_SECRET` (or `SCRAPE_WEBHOOK_SECRET`) | Webhook auth | ❓ Likely missing on prod | — | None — must be added to Vercel env before first scheduled run |
| `MAX_DAILY_SCRAPE_COST_USD` env var | Cost cap | ❓ Default 50 if unset | — | Defaults to 50 if unset (acceptable) |
| `CRON_SECRET` env var | Cleanup cron auth | ❓ May exist from Phase 6/7 | — | Required for D-05 cron auth |

**Missing dependencies with no fallback:**
- `APIFY_WEBHOOK_SECRET` (or rename to match existing stub's `SCRAPE_WEBHOOK_SECRET`) must be set in Vercel env vars before Apify dashboard is configured.
- Apify account must be on Starter+ tier for residential proxy. **CONFIRM BEFORE WAVE 1.**

**Missing dependencies with fallback:**
- FIPE upstream → null + retry (D-04).

---

## Security Domain

> `security_enforcement` not explicitly set in config; default = enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Shared-secret in custom header for webhook; CRON_SECRET for cleanup. Constant-time compare via `crypto.timingSafeEqual`. |
| V3 Session Management | no | No user sessions (server-to-server) |
| V4 Access Control | yes | Service-role client bypasses RLS — restricted to webhook + cron routes only. RLS policy `listings_auth_read` (verified migration 0001:401) ensures lojistas can only see their own opportunities, not raw listings. |
| V5 Input Validation | yes | `zod` schemas on webhook body; URL parsing on Apify dataset URL; numeric clamps on price/year/km |
| V6 Cryptography | yes | Node `crypto` stdlib for SHA-256 fingerprint + timing-safe compare. **Never hand-roll comparisons.** |
| V7 Error Handling | yes | Errors logged via `console.error` with token redaction (existing pattern at `route.ts:216`). Never echo Apify errors back to webhook caller (could leak token). |
| V12 API/Web Service | yes | Rate limiting via existing `checkRateLimit` (bucket `"scrape_webhook"`); CORS not relevant (server-to-server). |

### Known Threat Patterns for Apify-webhook ingest

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook from arbitrary source | Spoofing | Shared-secret header + timing-safe compare |
| Replay attack (same valid webhook twice) | Tampering / Repudiation | `apify_run_id` unique constraint on `scrape_runs` (NOT in current schema — recommend adding); webhook idempotency check |
| Token leak in logs/error responses | Information Disclosure | Regex-scrub token from error bodies (existing pattern at `route.ts:216`) |
| Cost runaway (DDoS via repeated webhooks) | Denial of Service | D-02 cost cap + rate limit bucket |
| SQL injection via listing fields | Tampering | Supabase parameterized queries (built-in); zod schemas reject malicious shapes |
| Service-role key exposure | Elevation of Privilege | Server-only import; never used in client components (existing pattern at `src/lib/supabase/server.ts:9-13`) |
| Apify dataset poisoning (malicious actor returns crafted JSON) | Tampering | Strict zod validation in normalize step; no `eval` or dynamic field access |

**Recommended schema addition (low priority):** Add `unique(apify_run_id)` constraint to `scrape_runs` to prevent replay-driven duplicate ingest. Migration 0002+ candidate.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled WebMotors scraping with Playwright + stealth | Maintained Apify actor (ribtools) | 2026-04-22 (Phase 5 commit `ca90fe7`) | 98.6% success vs ~0% on prior attempts; Akamai handled by actor maintainer |
| HMAC-SHA256 webhooks (industry standard for Stripe/GitHub) | Apify shared-secret (platform constraint) | N/A — Apify never offered HMAC | We adapt to platform reality; HMAC scaffold ready for future upgrade |
| `Promise.all(n)` parallel fetches | Chunked parallel (10 at a time) with early-break | 2026-04-21 (Phase 1 commit `75b3177`) | Saved Phase 1 from regression; pattern reused in Phase 8 FIPE enrichment |

**Deprecated/outdated:**
- CONTEXT.md D-01 wording ("Apify-Webhook-Signature header HMAC-SHA256") — research shows Apify doesn't produce this. **Revised as documented above.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Apify account plan is Starter+ (residential proxy access) | Pitfalls #6 + Open Questions #1 | All scheduled runs fail; Phase 8 blocked. **Verify before Wave 1.** |
| A2 | ribtools actor's input schema accepts an array of search URLs (one per top-20 brand+model) | Pitfalls #9 | Schedule runs but produces 0 items. Mitigation: probe actor input schema before plan-3. |
| A3 | Apify webhook payload includes `resource.id` for `ACTOR.RUN.SUCCEEDED` events | Pattern 2 | If only `actorRunId` is provided (different field name), schema parse fails. Mitigation: zod schema accepts both `actorRunId` (top-level) and `resource.id` paths. |
| A4 | ribtools actor cost averages $0.001/item (industry typical) | D-03 cadence rationale | If 10x higher, $0.01/item × 4000 items/run × 2 runs/day = $80/day → blows D-02 cap. Mitigation: cost cap is the safety net regardless. |
| A5 | The Fenabrave top-20 list is appropriate without user customization | D-06 | Suboptimal targeting (e.g., dealers want premium cars not in top-20). Mitigation: trivial to edit `target-models.ts`; deferred to Phase 13 admin UI. |
| A6 | `CRON_SECRET` env var already exists from Phase 6/7 | Environment Availability | Cleanup cron 401s on first run. Mitigation: plan-7 verifies env vars exist; planner adds setup step if missing. |
| A7 | Vercel `nodejs` runtime in App Router has 60s timeout on Pro plan | Pitfalls #3 | If Hobby plan (10s), large dataset processing times out. Mitigation: scrape_runs row already serves as resume marker; can implement chunked re-entry if needed. |
| A8 | Spec's "filtros eliminatorios" sinistro/leilao detection from string-match in title/attributes is sufficient | Pitfalls #7 | False negatives (sinistro listings not filtered) → user complaints. Mitigation: log all filtered items in `scrape_runs.notes`; manual audit weekly until Phase 13. |
| A9 | Existing stub at `webhook/route.ts` (Phase 7) keeps working for direct array-payload calls (cross-phase contract with Phase 9 tests) | Pattern 1 | Phase 9 matching tests fail. Mitigation: Phase 8 explicit regression test for stub-shape payload. |

---

## Sources

### Primary (HIGH confidence)

- **Spec Técnico v1** (`AutoAgente_Spec_Tecnico_v1.docx` v1.0 Abril 2026, Felipe Criniti) — converted via python-docx 2026-04-25; all extracts verbatim.
- `src/types/database.ts` + `supabase/migrations/0001_init.sql` — listings/scrape_runs schema (verified 2026-04-25)
- `src/app/api/scrape/webmotors/route.ts` — actor metrics, error handling, normalization helpers (verified 2026-04-25)
- `src/app/api/scrape/webmotors/webhook/route.ts` — existing stub with Phase 7 contract (verified 2026-04-25)
- `src/lib/matching/engine.ts` — Phase 9 cross-phase contract; null-tolerant fields (verified 2026-04-25)
- `src/app/api/fipe/route.ts` — chunked probe pattern (verified 2026-04-25)
- [docs.apify.com/platform/integrations/webhooks](https://docs.apify.com/platform/integrations/webhooks/) — webhook auth model (verified 2026-04-25)
- [docs.apify.com/platform/integrations/webhooks/events](https://docs.apify.com/platform/integrations/webhooks/events) — event payload shape (verified 2026-04-25)
- [docs.apify.com/platform/schedules](https://docs.apify.com/platform/schedules) — cron syntax + timezone (verified 2026-04-25)

### Secondary (MEDIUM confidence)

- [use-apify.com/blog/apify-webhooks-complete-guide](https://use-apify.com/blog/apify-webhooks-complete-guide) — confirms Apify doesn't natively support HMAC (cross-verified vs official docs 2026-04-25)
- npm registry: `@supabase/supabase-js@2.104.1`, `zod@3.25.76` (verified via `npm view` 2026-04-25)

### Tertiary (LOW confidence)

- Fenabrave top-20 list (recalled from training; planner should verify against current 2026 data if user requests precision — but D-06's intent is "any reasonable starting list" which any approximation satisfies)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs already in repo, versions verified
- Architecture: HIGH — built on 4 verified patterns from existing code (Phase 5 actor + Phase 7 stub + Phase 7 matching + Phase 7 FIPE)
- Pitfalls: HIGH — most pitfalls verified against existing code or official docs; assumption log calls out uncertain items
- D-03 cadence lock: MEDIUM — derived from spec volume math, not spec text
- D-04 FIPE failure lock: MEDIUM — derived from existing FIPE chunked pattern, not spec text
- D-06 top-20 list: MEDIUM — Fenabrave data; can be overridden trivially

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (Apify webhook docs evolve; cross-check before Phase 13 hardening)
