---
phase: 08-scraping-pipeline
status: seeded
created: 2026-04-22
depends_on: [06-supabase-integration]
estimated_duration: 3-4 days
---

# Phase 8 — Scraping pipeline WebMotors

## Goal

Apify scheduled actor (ribtools WebMotors) roda continuamente, normaliza resultados e mantém a tabela `listings` atualizada. Esta é a fonte de dados que o matching engine (Phase 9) consome.

## Scope

### 8.1 — Apify schedule configuration

- Apify Scheduled Run: actor ribtools WebMotors, rodando a cada **6 horas** (configurável)
- Targeting: pode rodar inicialmente por queries amplas ("Honda Civic", "Toyota Corolla", etc — top 20 modelos brasileiros) e filtrar downstream, OU por wishlists reais (dynamic target list). Recomendo **queries amplas** no início pra construir inventory antes de ter muitos lojistas.
- Output: Apify dataset + webhook call pro nosso endpoint

### 8.2 — Ingestion endpoint

`POST /api/scrape/webmotors/webhook`
- Valida assinatura Apify
- Lê dataset URL → stream processing
- Pra cada item: normaliza → compute fingerprint → upsert em `listings`
- Conta new vs updated vs errored
- Log em `scrape_runs`

### 8.3 — Normalização canônica

`src/lib/apify/webmotors-normalize.ts`:
- Input: raw Apify item (schema do actor ribtools)
- Output: `ListingInsert` (tipo gerado da tabela)
- Transforms:
  - Preço: parse "R$ 85.900" → `85900.00`
  - KM: parse "42.000 km" → `42000`
  - UF + cidade: split "São Paulo - SP" → `('SP', 'São Paulo')`
  - Motivation signals: compute from publish_date, reductions, "aceita troca"
  - Photo URL: first from photos[]
  - Seller type: "Particular" → 'PF', "Loja" → 'PJ'

### 8.4 — Dedup via fingerprint

Fingerprint = SHA-256 of `{source_listing_id}` (WebMotors ID único). Price changes → update same row (não cria duplicata). Track price history via trigger in a `listing_price_history` table (opcional, Phase 13).

Edge cases:
- Listing removed from WebMotors → mark `status=removed` when actor no longer finds it (do in a periodic cleanup job)
- Listing re-posted with new WebMotors ID → novo registro (mas dedup logic via anunciante_phone could catch? out of scope for MVP)

### 8.5 — FIPE enrichment on insert

Quando insert: chama `/api/fipe` com `{brand, model, year}` e popula `fipe`, `savings_vs_fipe`, `savings_pct`. Se FIPE falha, ainda insere com fipe=null e flag pra retry.

### 8.6 — Scheduling + monitoring

- `scrape_runs` log (start, end, cost estimate, counts, errors)
- Admin view simples: "últimos 30 runs" com stats
- Alertas (via console.log+Vercel logs por ora): se `listings_error / listings_total > 20%` ou `listings_new == 0` por 3 runs consecutivos

### 8.7 — Reuse do existing /api/scrape/webmotors

Phase 5 tem `/api/scrape/webmotors` (on-demand URL-paste). Fica preservado mas vira **admin-only** (debug). Pipeline principal é o scheduled run.

## Cost estimate

- ribtools actor: ~$0.10/100 listings
- 20 modelos populares × 500 listings each × 4 runs/day = 40k scrapes/day = $40/day?
- Likely way too aggressive; realistic MVP: 1 run/day of top 20 brands = ~10k listings = ~$10/day = $300/mo
- Revisita após ter lojistas reais e saber quais modelos realmente matter

**First week:** dry-run cost alert at $50 threshold; shutdown script.

## Key questions

1. Queries amplas vs per-wishlist? Queries amplas primeiro; otimizar depois com lojistas reais.
2. Apify Edge Function dispatcher ou direct webhook? Direct webhook da Apify pro nosso endpoint Next.js.
3. Listing TTL: quando marcar stale? 72h sem aparecer em scrape → status=removed.

## Dependencies

- Phase 6 (tabela listings)
- APIFY_API_TOKEN env var (já configurado)
- Apify dashboard access pra agendar scheduled runs

## Success criteria

- [ ] Apify schedule ativa rodando 1x/dia em dev, 4x/dia em produção
- [ ] listings table populando com ~thousands of rows reais
- [ ] FIPE enrichment funcionando (savings_pct populado)
- [ ] Dedup correto (mesmo source_listing_id só uma row)
- [ ] `scrape_runs` log com stats por execução
- [ ] Custo diário <$15 inicialmente

## Plans

TBD.
