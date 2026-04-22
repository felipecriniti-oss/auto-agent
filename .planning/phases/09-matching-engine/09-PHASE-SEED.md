---
phase: 09-matching-engine
status: seeded
created: 2026-04-22
depends_on: [07-wishlist-ui, 08-scraping-pipeline]
estimated_duration: 2-3 days
---

# Phase 9 — Matching engine

## Goal

Quando um listing é inserido ou atualizado, o matching engine roda contra todas as wishlists ativas e cria opportunities pras que batem. Score numérico define priority. Lojista recebe notificação realtime quando nova opportunity aparece.

## Scope

### 9.1 — Pure function matching

`src/lib/matching/engine.ts`:

```typescript
type MatchResult = { wishlist_id, listing_id, score, reasons: string[] }

function matchListingToWishlists(
  listing: Listing,
  wishlists: Wishlist[]
): MatchResult[]
```

Rules (weighted):
- **Modelo** — fuzzy match (Levenshtein <= 2 or bigram similarity >= 0.85). Hard requirement. Score component: 0 or 1.
- **Ano** — dentro do range. Hard. Score component: 0 or 1.
- **KM** — `listing.km <= wishlist.km_max`. Hard. Score component: 0 or 1.
- **Preço** — `listing.price <= wishlist.price_max`. Hard. Score component: 0 or 1.
- **Região** — UF ∩ wishlist.region_uf não vazio (e se `region_cities` preenchido, cidade deve bater). Hard. 0 or 1.
- **Combustível, câmbio, blindagem** — se preenchido na wishlist, listing deve bater; se vazio, ignora. Hard.
- **Savings vs FIPE** — bônus. `savings_pct >= 20` vale 0.3, `>=25` vale 0.5, `>=30` vale 1.0. Soft score.
- **Motivation signals** — bônus. Se listing tem `days_online >= 45` ou `reductions >= 1` ou "aceita troca" → +0.2 cada, cap em 0.5.

Hard rules são AND. Se qualquer falha → no match.
Soft components somam; normalize 0-1.

### 9.2 — Trigger integration

Options:
- **A. Supabase database trigger** on `listings` INSERT/UPDATE → calls Edge Function → matches → inserts opportunities
- **B. Ingestion endpoint** (Phase 8) chama matching directly após upsert
- **C. Postgres function** que faz matching in-query usando SQL pure

Recommend **B** — simplest, testable, debugável. Trigger only for updates that come via other paths (e.g. manual admin upserts).

### 9.3 — Opportunity creation

Pra cada MatchResult com score >= threshold (configurável, default 0.7):
- Dedup: `WHERE user_id = ? AND wishlist_id = ? AND listing_id = ?` — skip se existe
- Insert `opportunities` com status='pending', match_score
- Compute `fee_amount` = savings × plan_fee_rate (6%/3%/2%)
- (Phase 10 picks from here)

### 9.4 — Realtime notifications

Supabase realtime subscription em `opportunities` filtered by `user_id`. Client subscreve no dashboard:
- Toast "Nova oportunidade! Honda Civic 2018 por R$ 72k (economia 18% vs FIPE)"
- Sidebar badge "Marketplace (3)" incrementa
- Opcional: push notification (web push API, Phase 12)

### 9.5 — Re-matching on wishlist change

Quando lojista cria/edita wishlist → backfill match contra listings existentes (últimos 30 dias). Essa é a mágica do Preview de Phase 7 também.

## Key questions

1. Threshold score — 0.7 é chute. Calibrar com dados reais nos primeiros dias.
2. Soft fail (preço próximo do max mas levemente acima) cria oportunidade? No MVP: hard fail. Pode virar "stretch opportunity" tier depois.
3. Anúncio PJ (loja) — criar oportunidade? **Não.** Nosso modelo é negociar com PF. Adicionar `listing.seller_type = 'PF'` como hard rule.

## Dependencies

- Phase 7 (wishlists existem)
- Phase 8 (listings populando)

## Success criteria

- [ ] Pure function com testes exaustivos (happy + edge cases)
- [ ] Trigger via ingestion endpoint cria opportunities corretamente
- [ ] Dedup funciona (não cria 2x pro mesmo trio)
- [ ] Realtime sub atualiza dashboard sem refresh
- [ ] Backfill on wishlist change populate opportunities históricos matching

## Plans

TBD.
