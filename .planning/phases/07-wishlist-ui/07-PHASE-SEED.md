---
phase: 07-wishlist-ui
status: seeded
created: 2026-04-22
depends_on: [06-supabase-integration]
estimated_duration: 2-3 days
---

# Phase 7 — Wishlist UI

## Goal

Lojista cadastra "wishlist" descrevendo o carro-alvo. Elimina completamente o fluxo de colar URL do Phase 5. Cada wishlist é uma regra ativa que o matching engine (Phase 9) usa contra os listings.

## User story

> Como lojista, quero cadastrar "Honda Civic 2018+, até 80k, máx 60k km, Grande SP e Campinas, combustível flex" uma vez, e que o sistema automaticamente monitore, negocie e me entregue oportunidades compatíveis sem eu precisar olhar anúncios.

## Scope

### 7.1 — `WishlistModule` component

Substitui `MarketplaceModule` como módulo principal (sidebar renomeia "Marketplace" → "Minhas Wishlists"). O antigo `MarketplaceModule` de Phase 5 vira `OpportunitiesModule` em Phase 12 (onde as oportunidades do agente aparecem).

Layout:
- Header: "Minhas Wishlists" + botão "+ Nova Wishlist"
- Grid de cards de wishlist (nome, resumo das regras, status ativa/pausada, contagem "X anúncios compatíveis hoje")
- Estado vazio com CTA claro

### 7.2 — Form de criação/edição

Campos (em ordem de prioridade):
- **Nome** (auto-gerado tipo "Honda Civic 2018+ SP")
- **Marca** (autocomplete FIPE cascade: brands list)
- **Modelo** (autocomplete condicional por marca, via FIPE)
- **Versão/Trim** opcional (texto livre: "EXL", "Touring")
- **Ano** — slider duplo min/max
- **KM máximo** — input numérico com slider
- **Preço máximo** — input com máscara BRL
- **Combustível** — checkboxes múltiplos (flex, gasolina, diesel, híbrido, elétrico)
- **Câmbio** — checkboxes (automático, manual, CVT)
- **Blindagem** — radio (qualquer / só blindado / só não blindado)
- **Região** — multi-select UF + cities opcional
- **Status** ativa/pausada (toggle no card)

Validação zod + react-hook-form. Erros inline. Submit desabilitado enquanto inválido.

### 7.3 — Preview "quantos anúncios acharíamos?"

Antes de salvar, roda o matching engine (Phase 9 — já exportável como pure function mesmo sem scraping ativo) contra a snapshot atual de `listings` no DB. Mostra:

> Com essas regras, acharíamos **X anúncios** esta semana. Ver exemplos ↓
> [preview de 3 listings mock matching]

Isso dá confiança ao lojista antes de ativar.

### 7.4 — CRUD operations

- Create: form → insert supabase wishlists → invalidate query → volta pro grid
- Update: edit button abre mesmo form pré-preenchido
- Pause/Resume: toggle status=active/paused
- Delete: confirmação → soft delete (status=archived)
- Realtime: grid atualiza se wishlists mudarem em outro dispositivo

### 7.5 — Onboarding integration

Novo user após signup → redirect `/app/onboarding` → wizard de 1 passo "Cadastre sua primeira wishlist" com o mesmo form acima (layout maior, amigável). Marca `users.onboarding_complete=true` no save.

## Key questions

1. FIPE cascade em tempo real ou cacheado client-side? Recomendo cache client + SWR sobre `/api/fipe` já existente.
2. Múltiplas regiões é OR ou AND? OR (carro em qualquer uma delas).
3. "Aceita troca" como filtro? Provavelmente sim — motivation signal forte.
4. Max wishlists por tier (Starter=3, Premium=10, Enterprise=unlim)? Gate in Phase 13 billing, not here.

## Dependencies

- Phase 6 (tabela wishlists + hooks)
- FIPE `/api/fipe` route existente (Phase 1) reaproveitada

## Success criteria

- [ ] Lojista cria wishlist → vê nos cards → edita → pausa
- [ ] Preview roda sem listings reais (mock data) e com listings reais
- [ ] Onboarding wizard completa com primeira wishlist salva
- [ ] Biome + typecheck + vitest pass
- [ ] Dark mode funciona no form

## Plans

TBD — gerados via `/gsd-plan-phase 07`.
