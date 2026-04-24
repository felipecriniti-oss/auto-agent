---
phase: 07-wishlist-ui
doc_type: decisions-and-context
created: 2026-04-23
last_updated: 2026-04-23
status: ready-for-planning
---

# Phase 7 — Wishlist UI — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Lojista descreve o carro-alvo via form (uma wishlist = uma regra ativa). Substitui o URL-paste do Phase 5. CRUD persistido em `public.wishlists` via os hooks Supabase já entregues pelo Phase 6 (`useWishlists`, `useCreateWishlist`, `useUpdateWishlist`, `useDeleteWishlist`). Preview de matches inline no form via o matching engine puro já existente (`src/lib/matching/engine.ts`, 23 testes passando).

Módulo `WishlistModule` é o módulo principal do dashboard (sidebar rotula "Minhas Wishlists"). Onboarding passa a ter um step 3 que reutiliza o mesmo form inline. Fora de escopo: oportunidades/marketplace (P12), outreach do agente (P10/P11 deferred), billing/plan gating (P13a), contratos (P13b), URL-paste legado (código fica no repo mas some da sidebar; deleção é cleanup de P12).

</domain>

<decisions>
## Implementation Decisions

### Preview Pane com DB Vazio

- **D-01:** `useListingsSnapshot()` faz fallback automático para mocks curados quando a query Supabase retorna `[]`. Sem env flag, sem gating de dev/prod — o mesmo código serve demo de sexta, Vercel preview e produção até Phase 8 popular o DB real. Transparente pro componente consumidor: o hook só retorna `DbListing[]`.
- **D-02:** Mocks ficam em `src/lib/mock-data/preview-listings.ts` — 20 listings realistas (top 20 modelos BR do seed WebMotors: Civic, Corolla, Onix, HB20, Compass, etc.) com price/km/ano/UF/city/photos plausíveis. Matching engine roda contra eles exatamente como rodaria contra listings reais; se a wishlist for muito restrita, o preview mostra count=0 honesto com a copy zero-match do UI-SPEC.

### FIPE Cascade Resilience

- **D-03:** Snapshot JSON estático em `src/lib/brasil/fipe-brands-snapshot.json` com ~60 marcas top (gerado 1× via script `scripts/sync-fipe-brands.ts` hitting `/api/fipe`) garante render instantâneo do combobox de marca. Script versionado no repo pra re-run manual conforme FIPE atualizar; não roda em build/CI.
- **D-04:** Modelos são fetched on-demand via SWR quando brand muda. Cache client-side infinito por (`brand`) key — segundo open da cascade da mesma marca na sessão é instantâneo.
- **D-05:** Fallback degradado quando `/api/fipe` erra (status≥500 ou timeout ≥5s): `FipeBrandCombobox` e `FipeModelCombobox` trocam silenciosamente para `Input` free-text com toast discreto `sonner` info: `"FIPE indisponível — digite manualmente"`. Zod aceita string simples. User não fica preso.

### Storage Units & Schema

- **D-06:** `price_max` e `km_max` armazenados como integer em reais/km (ex: `130000` = R$ 130.000 / 60000 km). Zero conversão necessária com `matching-engine` existente que já assume integer reais. Type alias documentativo `type Reais = number` em `src/lib/schemas/wishlist.ts` pra intenção ficar explícita no call-site. `BrlCurrencyInput` recebe/emite integer reais, renderiza como `R$ 130.000`.
- **D-07:** Schema do Phase 6 fica inalterado. Sem novas migrations em Phase 7. `accepts_trade` fica fora da tabela `wishlists`.

### Auto-name da Wishlist

- **D-08:** Helper `summarize(wishlist)` (já existe do scaffold Phase 5 em `WishlistModule.tsx`) é extraído/extendido para produzir o nome auto-gerado: `{brand} {model} {year_min}+ {region_uf[0] ?? ""}`.trim() — ex: `"Honda Civic 2018+ SP"`. Sem UF → `"Honda Civic 2018+"`. Sem year_min → `"Honda Civic SP"`. Fallback `"Wishlist sem nome"` quando brand E model vazios (só dispara se user submeter sem passar zod, que é impossível — brand+model são required). Field `name` no form continua opcional com hint "opcional — geramos automaticamente".

### Realtime Sync

- **D-09:** Sem Supabase realtime subscription no hook. React Query cobre: `staleTime: 30s`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. Lojista operando single-session é o caso comum; dois dispositivos simultâneos vê update ao dar foco. Zero código novo no `useWishlists()`. Anotado como polish deferred (ver `<deferred>`).

### Scope — "Aceita Troca"

- **D-10:** "Aceita troca" (seed Q3) **NÃO entra em P7**. Sem coluna `accepts_trade`, sem novo field, sem migration. O matching engine (`src/lib/matching/engine.ts:244`) já trata "aceita troca" como **motivation signal** boost no score da oportunidade — comportamento preservado e suficiente. Retorno do tópico fica para Phase 9 (matching refinement) caso se prove necessário como filtro duro.

### Form Library (já locked pelo UI-SPEC — registrado aqui para visibilidade do planner)

- **D-11:** `react-hook-form` + `@hookform/resolvers/zod` + shadcn `form` primitives. Zod schema em `src/lib/schemas/wishlist.ts` (NEW) compartilhado com `WishlistInsertInput` de Phase 6.

### Layout & Chrome (já locked pelo UI-SPEC — registrado para visibilidade)

- **D-12:** Form abre em Sheet lateral 560px (desktop ≥md) / `Dialog` full-screen (mobile). Nunca full-page route. Onboarding é a única variante full-page (step 3 do wizard existente em `/app/onboarding`).
- **D-13:** Delete usa shadcn `AlertDialog` — `window.confirm()` nativo do scaffold Phase 5 é substituído integralmente.
- **D-14:** Soft delete via `status="archived"` (enum já no schema). Hook `useWishlists` filtra archived out.
- **D-15:** Sidebar: label "Marketplace" → **"Minhas Wishlists"** no slot atual. `MarketplaceModule` legado de Phase 5 fica no código mas perde a entrada na sidebar (deleção = cleanup de Phase 12).

### Claude's Discretion

- Cor exata do BRL mask (formato pt-BR com ponto de milhar e sem centavos — `toLocaleString("pt-BR")` suficiente).
- Debounce exato do preview pane para **400ms** (locked pelo UI-SPEC), mas implementação (`useDebounce` custom vs lodash vs useMemo + setTimeout) fica a critério do executor — não mexer em dep nova se `useDebounce` já existir.
- Estrutura interna do `LocalidadeMultiPicker` wrapper — contanto que o `LocalidadePicker` existente não seja forked e a UX de chips removíveis bata com o State Matrix.
- Se Zod erros do form array (region tuples) usam `react-hook-form` `useFieldArray` vs estado interno do wrapper.
- Estrutura de arquivos dos novos forms (`src/components/forms/FipeBrandCombobox.tsx`, `FipeModelCombobox.tsx`, `BrlCurrencyInput.tsx`, `KmInput.tsx`, `YearRangeField.tsx`, `WishlistPreviewPane.tsx`) está locked pelo UI-SPEC; split entre esses componentes e possíveis helpers internos fica a critério do planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 artifacts (MUST READ)
- `.planning/phases/07-wishlist-ui/07-UI-SPEC.md` — Design contract approved 2026-04-23, 6/6 dimensions passed. Tokens, copy, component inventory, state matrix, interaction contracts, registry safety. Source of truth for look/feel.
- `.planning/phases/07-wishlist-ui/07-PHASE-SEED.md` — Original scope, user story, key questions. Context for "why this shape".

### Phase 6 hook contract (MUST READ)
- `src/lib/supabase/hooks/useWishlists.ts` — `useWishlists`, `useCreateWishlist`, `useUpdateWishlist`, `useDeleteWishlist`. Types: `WishlistInsertInput`, `WishlistUpdateInput`, `DbWishlist`. RLS stamps `user_id` automatically from session.
- `.planning/phases/06-supabase-integration/VERIFICATION.md` — API surface confirmed for P6 completion.
- `src/types/database.ts` §wishlists — Row/Insert/Update shape, `WishlistStatus` enum.

### Matching engine (reused pure fn)
- `src/lib/matching/engine.ts` — `scoreListings(wishlistRules, listings)`. Pure function, 23 tests in `engine.test.ts`. Runs inside the browser in `WishlistPreviewPane` — no API round-trip.

### Prior phase decisions that apply
- `.planning/phases/05-v3-pivot/05-CONTEXT.md` — D-07 dark mode fallback layer in `globals.css` (no per-component `dark:` for chrome); D-06 listing mapper shape; Apify on-demand only.
- `.planning/PROJECT.md` — Stack constraints (Next.js 15 + TS strict + Tailwind v4 + shadcn + pnpm + Biome + Zustand), LLM Claude Sonnet 4.6, WebMotors only MVP, full automation without HITL (matters for copy tone: no "você negocia").
- `.planning/REQUIREMENTS.md` §Phase 7 — bullet list of acceptance items.

### Product truth
- `.planning/PIVOT-3.md` — Foundation-first order: 6 → 7+8 → 9 → 13a → 13b. Phase 10/11/12 deferred (agent loop awaits algorithm design with pai).
- `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` §NG4 — "Atender vendedor PF como cliente B2C" é non-goal; copy em P7 jamais sugere PF self-service.

### Existing code to reuse (do NOT re-create)
- `src/components/forms/LocalidadePicker.tsx` — single-value UF+cidade picker. `LocalidadeMultiPicker` wraps, não forka.
- `src/components/v3/modules/WishlistModule.tsx` — scaffold de Phase 5 com `summarize()`, `StatusBadge`, `ChoiceChip`, `WishlistCard` interno. Rewrite preserva visuais e extrai helpers.
- `src/app/app/onboarding/page.tsx` — 2-step wizard atual. Phase 7 adiciona step 3.
- `src/lib/brasil/localidades.ts` — `cidadeExisteNoUf` e lista de UF/cidades (referência para o LocalidadeMultiPicker).
- `src/components/ui/*` — button, input, label, card, badge, dialog, alert-dialog, popover, command, form, skeleton, sonner (todos já presentes; sem `shadcn add` extra em P7).

### FIPE
- `src/app/api/fipe/route.ts` (Phase 1) — `/api/fipe?type=brands|models&brand=X`. Wrapper de Parallelum. Reaproveitado via SWR.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 6 hooks (`useWishlists` + siblings):** CRUD completo, otimista, RLS-safe. Não reescrever.
- **`matching/engine.ts`:** Pure function pronta; chama direto no componente client, sem API route. 23 tests garantem contract.
- **`LocalidadePicker`:** Já acessível, já tem cascade UF→cidade, já i18n pt-BR, já keyboard-nav. Wrapper `LocalidadeMultiPicker` só orquestra array de tuples.
- **`WishlistModule.tsx` scaffold atual:** `summarize(wishlist)` helper, `ChoiceChip`, `StatusBadge`, `WishlistCard`, `WishlistFormDrawer` (rename → `WishlistFormSheet`). Visual language de Phase 5 preservado.
- **`src/components/ui/*`:** Todos os primitives do UI-SPEC já instalados. Zero `npx shadcn add` novos em P7.
- **`globals.css` dark fallback layer:** Dispensa `dark:` em chrome (card, border, text slate). Badges coloridos (emerald/amber/red) ainda precisam de `dark:*` explícito — já presente no scaffold.

### Established Patterns
- **React Query keys:** `["supabase", "wishlists", userId]` — seguir o shape para `useListingsSnapshot` também (`["supabase", "listings-snapshot", userId]`).
- **Form validation:** Não há padrão de RHF+Zod estabelecido no repo ainda (Phase 6 onboarding usa form nativo). Phase 7 **estabelece** esse padrão — escolhas aqui viram referência para P13a billing form, P12 opportunity actions etc.
- **Toasts:** `sonner` via `<Toaster />` já montado em layout. Convenção: success sem variant, errors com `toast.error()`.
- **Optimistic UI:** `useUpdateWishlist` e `useDeleteWishlist` já fazem optimistic via `onMutate`/`onError`/`onSettled`. Reaproveitado pros toggles de pause/resume e delete.

### Integration Points
- **Sidebar:** `src/components/v3/Sidebar.tsx` (ou equivalente do AppShell do Phase 5) — rotina de rename do label "Marketplace" → "Minhas Wishlists".
- **Rota `/app`:** Hoje renderiza o AppShell; módulo default deve passar a ser `WishlistModule` (empty state quando `data.length === 0`).
- **Onboarding:** `src/app/app/onboarding/page.tsx` acrescenta step 3. Single-transaction save no done handler flipa `users.onboarding_complete=true` + `insert wishlist`.

### Files Novos Esperados (do UI-SPEC)
- `src/lib/schemas/wishlist.ts` — Zod schema + `Reais` type alias.
- `src/lib/mock-data/preview-listings.ts` — 20 listings mock curados (D-02).
- `src/lib/brasil/fipe-brands-snapshot.json` — ~60 marcas geradas via script (D-03).
- `scripts/sync-fipe-brands.ts` — gerador manual do snapshot (re-run quando FIPE atualizar).
- `src/lib/supabase/hooks/useListingsSnapshot.ts` — NOVO hook com fallback pros mocks.
- `src/components/forms/FipeBrandCombobox.tsx`
- `src/components/forms/FipeModelCombobox.tsx`
- `src/components/forms/LocalidadeMultiPicker.tsx`
- `src/components/forms/BrlCurrencyInput.tsx`
- `src/components/forms/KmInput.tsx`
- `src/components/forms/YearRangeField.tsx`
- `src/components/forms/WishlistPreviewPane.tsx`

</code_context>

<specifics>
## Specific Ideas

- **Preview count highlight em acento:** UI-SPEC permite **uma** exceção de body copy em accent — o número X em "acharíamos **X anúncios** esta semana" é `text-[#4C46DC] font-semibold`. Nenhum outro body text ganha accent.
- **Auto-name exemplo canônico:** `"Honda Civic 2018+ SP"` (seed user story). Regra composicional confirmada em D-08. Colocar 3-4 exemplos no JSDoc do `summarize()` pra não reinventar roda no code review.
- **Mocks do preview devem sentir reais:** Usar modelos top 20 BR (Civic, Corolla, Onix, HB20, Compass, Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta, Argo, Mobi, Virtus, Nivus, Kwid). Preços realistas 2026 (60k–120k). UFs variados (SP, RJ, MG, PR, RS) para o preview variar contra diferentes wishlists. Photos podem ser placeholder Unsplash CDN links.
- **Destructive dialog NÃO auto-foca Confirm:** UI-SPEC §a11y explícito. Cancel recebe foco.
- **ChoiceChip no selected state usa accent:** `bg-[#4C46DC] text-white ring-[#4C46DC]` — só aí. Chips não-selecionados NUNCA usam accent.
- **Onboarding integration não duplica form:** step 3 re-renderiza `WishlistFormSheet` inline (flat, sem sheet chrome) — mesmo schema, mesmos fields, hero Fraunces em cima.

</specifics>

<deferred>
## Deferred Ideas

### Para Phase 9 (Matching refinement)
- **"Aceita troca" como filtro duro** — hoje é motivation signal boost no score; upgradar para toggle "só aceitam troca" na wishlist se lojistas pedirem em feedback pós-launch.
- **Tunagem de threshold de match** — Phase 9 decide cutoff do score pra criar oportunidade; preview pane usa o mesmo threshold.

### Para Phase 12 (Inbox dashboard) ou posterior
- **Cleanup do `MarketplaceModule` legado** — código fica no repo em P7, só sem entrada na sidebar. Deleção real quando Phase 12 entrega `OpportunitiesModule`.
- **Realtime subscription em wishlists** — React Query refetchOnWindowFocus cobre o caso comum (D-09). Se analytics mostrar multi-device usage significativo, adicionar `supabase.channel('wishlists')` no hook. Lift estimado: ~15 linhas.
- **Realtime no status badge** — variant híbrida do acima; mesma postura de deferir.

### Para Phase 13a (Billing/access control)
- **Max wishlists por tier** — UI-SPEC explícito: P7 não gate. Starter=3, Premium=10, Enterprise=unlimited fica com o middleware/hook gate de P13a.

### Para post-MVP
- **Bulk operations** (pause/delete múltiplas wishlists) — UI-SPEC §Out of Scope. Power-user feature.
- **Import de wishlist via template CSV** — não pedido, não discutido. Note caso lojistas Enterprise peçam.
- **FIPE brands snapshot auto-refresh em CI** — hoje o script roda manual. Se snapshot ficar stale frequente, agendar GitHub Action mensal.

</deferred>

---

*Phase: 07-wishlist-ui*
*Context gathered: 2026-04-23*
