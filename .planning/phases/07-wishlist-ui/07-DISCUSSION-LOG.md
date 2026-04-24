---
phase: 07-wishlist-ui
doc_type: discussion-log
created: 2026-04-23
---

# Phase 7: Wishlist UI — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `07-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 07-wishlist-ui
**Mode:** discuss (interactive)
**Areas discussed:** Preview + DB vazio, FIPE resilience, Aceita troca, Realtime grid, Mock gating, BRL storage, Auto-name

---

## Preview Pane + DB Vazio

| Option | Description | Selected |
|--------|-------------|----------|
| Seed curado de 20 mock listings (Recommended) | Hook fallback silencioso pros mocks quando Supabase retorna []. Engine roda contra mocks. | ✓ |
| Copy zero-match honesta, sem mocks | Sempre cai na copy 'Ainda não achamos anúncios compatíveis' do UI-SPEC. | |
| Esconder o preview pane se snapshot vazio | Colapsa o bloco de preview enquanto DB vazio. | |

**User's choice:** Seed curado de 20 mock listings
**Notes:** Demo de sexta precisa de sensação de produto vivo; produção fica honesta assim que Phase 8 popular listings reais.

---

## FIPE Cascade Resilience

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot JSON estático + SWR revalidate (Recommended) | `fipe-brands-snapshot.json` commitado + SWR pra modelos + fallback free-text em erro. | ✓ |
| Só SWR, sem snapshot, bloqueia form até responder | Skeleton até API responder; erro inline bloqueia submit. | |
| Free-text puro (sem cascade FIPE) | Marca/Modelo como Input texto livre. | |

**User's choice:** Snapshot JSON estático + SWR revalidate
**Notes:** Alinha com seed Q1. Fallback free-text garante form usável se FIPE cair.

---

## Aceita Troca (seed Q3)

| Option | Description | Selected |
|--------|-------------|----------|
| Deferir pro Phase 9 matching refinement (Recommended) | Sem schema change; matching engine já usa como motivation signal. | ✓ |
| Incluir como boolean opcional em P7 | Nova migration + novo radio chip + novo field. | |
| Skippar completamente | Não entra nem como signal. | |

**User's choice:** Deferir pro Phase 9 matching refinement
**Notes:** Scope tight. `engine.ts:244` já trata como signal.

---

## Realtime Grid Sync

| Option | Description | Selected |
|--------|-------------|----------|
| Sem realtime — React Query refetchOnWindowFocus só (Recommended) | Zero código novo; refocus cobre casos comuns. | ✓ |
| Wire Supabase realtime subscription em `useWishlists()` | ~15 linhas; WebSocket persistente. | |
| Realtime só pro status badge (pause/resume) | Subscribe estreito pra status column. | |

**User's choice:** Sem realtime — React Query refetchOnWindowFocus só
**Notes:** Lojista multi-device é caso raro em MVP; polish fica pra pós-PMF.

---

## Mock Gating (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback automático sempre que DB retorna [] (Recommended) | Hook detecta vazio e injeta mocks transparente; zero env setup. | ✓ |
| Flag env `NEXT_PUBLIC_USE_MOCK_LISTINGS` | Controle explícito por ambiente. | |
| Flag de dev só (`NODE_ENV === 'development'`) | Preview/prod sempre honestos. | |

**User's choice:** Fallback automático
**Notes:** Simplicidade vence; mocks somem naturalmente quando P8 popular DB.

---

## BRL/KM Storage Units (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Integer em reais (e.g. 130000 = R$ 130.000) (Recommended) | Bate com matching-engine; zero conversão. | ✓ |
| Integer em centavos (Stripe convention) | Consistente com P13a futuro; exige conversion layer. | |

**User's choice:** Integer em reais
**Notes:** Type alias `Reais = number` documenta intenção. Stripe já lida com amounts próprios em P13a.

---

## Auto-name Format (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| `{brand} {model} {year_min}+ {region_uf[0]}` — ex: 'Honda Civic 2018+ SP' (Recommended) | Bate com seed example; extende `summarize()`. | ✓ |
| Só `{brand} {model}` | Mais curto, menos informativo. | |
| Obrigar nome no form (sem auto-gen) | Field required; exigiria emenda ao UI-SPEC. | |

**User's choice:** Formato composto com year_min + UF
**Notes:** Fallbacks: sem UF → omite; sem year_min → omite; sem brand+model → "Wishlist sem nome" (só teórico).

---

## Claude's Discretion

Áreas onde o executor tem flexibilidade — registradas em CONTEXT.md §Claude's Discretion:
- Formato exato do BRL mask (`toLocaleString("pt-BR")` vs custom)
- Implementação do debounce 400ms (hook custom vs lodash vs primitive)
- Estrutura interna do `LocalidadeMultiPicker` wrapper
- Decisão entre `useFieldArray` vs estado interno pro array de region tuples

## Deferred Ideas

Capturadas em CONTEXT.md §Deferred — principais:
- "Aceita troca" como filtro duro (Phase 9)
- Supabase realtime em wishlists (pós-PMF se analytics pedir)
- Cleanup do `MarketplaceModule` legado (Phase 12)
- Max wishlists por tier (Phase 13a)
- Bulk operations (post-MVP)
- FIPE snapshot auto-refresh em CI (se snapshot ficar stale)
