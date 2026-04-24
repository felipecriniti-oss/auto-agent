---
phase: 07-wishlist-ui
doc_type: research
created: 2026-04-23
confidence: HIGH
domain: "forms, search cascades, preview UIs, integration glue"
---

# Phase 7 — Wishlist UI — Research

**Researched:** 2026-04-23
**Domain:** React Hook Form + Zod form architecture, FIPE cascade UX, preview pane integration, Supabase hooks wiring
**Confidence:** HIGH — verified against CONTEXT.md (locked decisions), UI-SPEC (approved 6/6), Phase 6 hook contract (`src/lib/supabase/hooks/useWishlists.ts`), matching engine (23 tests), and the live Phase 5 scaffold (`src/components/v3/modules/WishlistModule.tsx`).

## Summary

Phase 7 rewrites `WishlistModule` in-place to replace the Zustand store and hand-rolled `useState` form with **(a)** the Phase 6 `useWishlists()` hook family, **(b)** a `react-hook-form` + `zod` form split across 7 new composable field components, and **(c)** an inline debounced preview pane running the pure `matching-engine` against a Supabase `listings` snapshot with automatic fallback to curated mocks.

Three **critical adapter / contract gaps** were discovered during research that the planner MUST address explicitly in the plan, not treat as implementation details:

1. **There is no `GET /api/fipe?type=brands|models` endpoint.** The existing `/api/fipe` is a **POST-only** price-lookup for `{marca, modelo, ano}` (see `src/app/api/fipe/route.ts:96-201`). CONTEXT.md D-03, D-04, D-05 and UI-SPEC:109 assume `GET` variants exist. The plan must **either** (a) add a new `GET` endpoint wrapping Parallelum `/marcas` and `/marcas/:id/modelos`, **or** (b) make the sync script hit Parallelum directly and skip `/api/fipe` entirely, serving brands/models always from the static snapshot + free-text fallback. Option (a) is the one written into `scripts/sync-fipe-brands.ts` per D-03; model fetch (D-04) unavoidably needs a live endpoint.
2. **The matching engine is `matchListingToWishlists(listing, wishlists[])`, not `scoreListings(wishlistRules, listings[])`.** Arguments are flipped and the input is a full `DbWishlist` row (not a "rules" shape). See `src/lib/matching/engine.ts:161`. The preview pane wiring in UI-SPEC uses the latter (imaginary) signature; the plan MUST invert the loop: for each listing in snapshot → run `matchListingToWishlists(listing, [pendingWishlist])` → count listings with a non-empty result array.
3. **`useDeleteWishlist` currently hard-deletes (DELETE FROM wishlists).** See `src/lib/supabase/hooks/useWishlists.ts:125-134`. D-14 locks **soft delete via `status="archived"`**. The plan must modify this hook to `update({status:"archived"})` and filter `status!=="archived"` in `fetchWishlists` (line 28-37). This is **not a net-new file — it's a mutation of the Phase 6 hook** and needs a separate task so Phase 6's 3 passing tests in `useWishlists.test.tsx` get updated alongside.

Outside these three gaps the phase is a clean composition job — Phase 6 hooks are stable, matching engine is a pure function, all shadcn primitives are installed (no `shadcn add` needed), and dependencies (`react-hook-form 7.72`, `@hookform/resolvers 3.10`, `zod 3.25`, `@tanstack/react-query 5.99`, `cmdk 1.1`, `vitest 2.1`) are all present in `package.json`.

**Primary recommendation:** treat Phase 7 as a **pipeline of 4 dependency layers** the planner can fan out across waves: (1) schema + mocks + fipe snapshot infra → (2) field primitives (combobox/currency/km/year/region) → (3) `WishlistFormSheet` composed from primitives + `WishlistPreviewPane` → (4) `WishlistModule` rewrite + Sidebar rename + Onboarding step 3 + soft-delete hook patch. Layer 1 has zero dependencies; layers 2/3/4 each depend only on the prior layer — parallel execution within a layer is safe.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Listings snapshot with silent mock fallback.** `useListingsSnapshot()` returns mocks when Supabase returns `[]`. No env flag, no dev/prod gating. Transparent to consumer.

**D-02 — Mock listings at `src/lib/mock-data/preview-listings.ts`.** 20 realistic listings (top 20 BR models: Civic, Corolla, Onix, HB20, Compass, Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta, Argo, Mobi, Virtus, Nivus, Kwid). Prices 60k-120k, UFs diverse (SP/RJ/MG/PR/RS). Photos can be Unsplash CDN.

**D-03 — FIPE brands static snapshot at `src/lib/brasil/fipe-brands-snapshot.json`.** ~60 top marcas. Generated once by `scripts/sync-fipe-brands.ts` (manual re-run; not in build/CI).

**D-04 — FIPE models fetched on-demand via React Query.** Cached by `brand` key with infinite staleTime — second open of same brand in the session is instant.

**D-05 — FIPE degraded fallback.** On status≥500 or 5s timeout, both combobox components silently switch to `<Input>` free-text with a discrete `sonner` info toast: `"FIPE indisponível — digite manualmente"`. Zod accepts the string. User never gets stuck.

**D-06 — `price_max` and `km_max` as integer reais / integer km.** No cents. `type Reais = number` alias in `src/lib/schemas/wishlist.ts`. `BrlCurrencyInput` emits integer reais, renders as `R$ 130.000`.

**D-07 — No schema changes in P7.** No new migrations. `accepts_trade` column NOT added.

**D-08 — Auto-name via extracted `summarize(wishlist)`.** `{brand} {model} {year_min}+ {region_uf[0] ?? ""}`.trim(). Fallback `"Wishlist sem nome"` only if brand+model both empty (unreachable due to Zod requires). Field `name` optional with hint "opcional — geramos automaticamente".

**D-09 — No realtime subscription.** React Query settings: `staleTime: 30s`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. Realtime deferred to post-MVP (see Deferred).

**D-10 — "Aceita troca" OUT of Phase 7.** No column, no field, no migration. Matching engine already treats it as a motivation signal boost (`src/lib/matching/engine.ts:242-245`). Returns in Phase 9 if needed.

**D-11 — Form library locked: `react-hook-form` + `@hookform/resolvers/zod` + shadcn `form` primitives.** Zod schema in `src/lib/schemas/wishlist.ts` (NEW), shared with `WishlistInsertInput` of Phase 6.

**D-12 — Form in right-side Sheet (w-[560px] on md+) / Dialog full-screen on mobile.** Never a dedicated page route. Only full-page variant is onboarding step 3.

**D-13 — Delete uses shadcn `AlertDialog`.** Native `window.confirm` in scaffold (line 181) is fully replaced.

**D-14 — Soft delete via `status="archived"`.** Hook `useWishlists` must filter archived rows. Implies hook mutation (see finding #3 in Summary).

**D-15 — Sidebar label: rename "Marketplace" nav slot.** The current `wishlists` slot keeps label "Wishlists" → rename to "Minhas Wishlists"; the legacy `marketplace` slot in the sidebar GROUPS array is REMOVED from the sidebar (code in `MarketplaceModule` stays in repo, unlinked). See `src/components/v3/Sidebar.tsx:41-52`.

### Claude's Discretion

- Exact BRL formatting: `toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })` confirmed sufficient.
- Debounce implementation: 400ms is locked by UI-SPEC; whether to use custom `useDebounce` hook vs inline `useEffect + setTimeout` is executor's call — recommendation below is inline because no `useDebounce` exists in the repo today (`src/lib/hooks/` does not exist) and adding one file for a single 400ms call is over-engineering.
- `LocalidadeMultiPicker` internal state: RHF `useFieldArray` vs wrapper-internal `useState` — recommendation below is `useFieldArray` (see Technical Approach §8).
- Form file split between the 7 new form components and possible helpers is planner's call; the 7 names in CONTEXT.md §Files Novos Esperados are locked.

### Deferred Ideas (OUT OF SCOPE)

**Phase 9 (Matching refinement):**
- "Aceita troca" as a hard filter (stays a signal boost).
- Match threshold tuning (preview uses same threshold).

**Phase 12 (Inbox dashboard) or later:**
- Cleanup of `MarketplaceModule` legacy code — stays in repo for P7, unlinked from sidebar.
- Realtime subscription in `useWishlists` / status badges — React Query `refetchOnWindowFocus` covers common case.

**Phase 13a (Billing/access control):**
- Max wishlists per tier (Starter=3, Premium=10, Enterprise=∞). P7 does NOT gate.

**Post-MVP:**
- Bulk operations (pause/delete multiple wishlists).
- CSV template import.
- FIPE snapshot auto-refresh in CI (manual script sufficient for now).

## Project Constraints (from CLAUDE.md)

CLAUDE.md top block (project instructions at the beginning of conversation) locks:

- **Stack (non-negotiable):** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand (Zustand reserved for legacy and non-server state ONLY — Phase 7 must NOT introduce Zustand for wishlist state; Phase 6 hooks are mandatory).
- **LLM:** Claude Sonnet 4.6 exclusively (not relevant to P7 — no LLM calls).
- **Deploy:** Vercel primary (autoagente.ai); DO secondary.
- **GSD workflow enforcement:** file edits require a GSD command entry point. The plan must assume execution through `/gsd-execute-phase`.

Phase 7 does not add any new stack dep. The `shadcn add` gate from UI-SPEC line 121 is absolute: zero `npx shadcn add` invocations allowed.

## Phase Requirements

> REQUIREMENTS.md is stale (only tracks Phases 1-4 of the old playground; `Wishlist UI` is not mapped to REQ-IDs). The de facto requirements for Phase 7 are **CONTEXT.md decisions D-01..D-15**, **UI-SPEC state matrix + copy contract**, and **ROADMAP Phase 7 "Key deliverables"**. The planner treats those as the input spec.

| Requirement source | Description | Research Support |
|---|---|---|
| ROADMAP §Phase 7 #1 | `WishlistModule` against Supabase | Phase 6 hooks already stable; matching engine confirmed pure |
| ROADMAP §Phase 7 #2 | react-hook-form + zod + shadcn/ui form | All deps present in `package.json` |
| ROADMAP §Phase 7 #3 | Fuzzy search FIPE cascade brand → model | `/api/fipe` POST exists for price lookup; GET endpoint + snapshot need to be built |
| ROADMAP §Phase 7 #4 | Preview: "Esta semana acharíamos X anúncios compatíveis" | `matchListingToWishlists` is the pure engine; listings snapshot hook is new; mocks cover empty-DB state |
| UI-SPEC Copy Contract | pt-BR, B2B voice, no PF mentions | Copy fully specified in UI-SPEC §Copywriting Contract |
| UI-SPEC State Matrix | 8-state coverage per component | Enumerated in State Matrix table |
| CONTEXT.md D-01..D-15 | 15 locked decisions | Each decision mapped to an implementation approach below |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Wishlist CRUD (insert/update/soft-delete) | API / Backend (Supabase Postgres + RLS via `useWishlists` hooks) | — | Multi-tenant isolation requires RLS; client never bypasses auth.uid() |
| Form validation (Zod schema) | Browser / Client | API (defense-in-depth: Supabase CHECK constraints + RLS) | UX needs per-keystroke validation; server schema already constrains in migration 0001 |
| FIPE brands snapshot | CDN / Static (committed JSON in bundle) | API (`scripts/sync-fipe-brands.ts` → Parallelum, manually) | Instant paint; Parallelum is flaky — static is reliable |
| FIPE models on-demand | Frontend Server → API / external (Parallelum via `GET /api/fipe?type=models&brand=X`) | Browser (React Query cache) | Combined brand×model list would be >1MB; on-demand keeps bundle small |
| Matching preview count | Browser / Client (pure fn runs locally) | — | Engine is synchronous, DB is already cached by React Query, no round-trip needed |
| Listings snapshot | API / Backend (Supabase `.select` limit 500) | Browser (React Query + mock fallback) | Single query per user session, cached 60s |
| Onboarding step 3 transaction | API / Backend (Supabase — atomic `user.update + wishlist.insert` via two sequential calls in submit handler) | — | Single transaction not available in Postgres-via-REST; sequence-ok-if-idempotent is acceptable per D-07 |

## Standard Stack

### Core (all already in `package.json`)

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `react-hook-form` | 7.72.1 | Uncontrolled form state + validation | Industry standard for React forms; pairs natively with shadcn `form` primitives |
| `@hookform/resolvers` | 3.10.0 | Zod resolver adapter | `zodResolver(schema)` is the canonical bridge from Zod to RHF |
| `zod` | 3.25.76 | Runtime schema + TypeScript type inference | Already used elsewhere (`src/lib/schemas/*`); `z.infer<>` keeps form types in sync with schema |
| `@tanstack/react-query` | 5.99.2 | Server state caching for listings snapshot + FIPE models | Already used by Phase 6 hooks — consistent query-key pattern `["supabase", entity, userId]` |
| `cmdk` | 1.1.1 | Command palette primitive behind shadcn `command` | Used by `LocalidadePicker` already; same pattern extends to FIPE comboboxes |
| `sonner` | 2.0.7 | Toast notifications | `<Toaster />` already mounted in layout; `toast.success` / `toast.error` / `toast.info` usage pattern is established |
| `lucide-react` | 0.468.0 | Icons | `components.json` locks this as `iconLibrary: "lucide"` |

**Source:** `package.json` [VERIFIED: file read 2026-04-23]

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `@tanstack/react-query` `useQuery` with `staleTime: Infinity` | 5.99.2 | FIPE models cache per brand | Models list never stale inside a session — instant re-open of same brand |
| `tsx` | 4.21.0 | Run TS scripts without build step | `scripts/sync-fipe-brands.ts` invocation: `pnpm tsx scripts/sync-fipe-brands.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| `react-hook-form` | `useState` + hand-rolled validation | Scaffold uses this today — but CONTEXT D-11 locks RHF. Plus this phase **establishes the form pattern for P13a billing + P12 opportunities** (CONTEXT §Established Patterns), so investing in RHF pays forward. |
| React Query for FIPE models | SWR | CONTEXT.md mentions SWR by name (D-04), but the repo's established pattern is React Query (Phase 6 + `useSupabaseUser`). Using SWR would introduce a second server-state lib with no benefit. **Use React Query despite the CONTEXT language** — same semantics, consistent with repo. |
| `shadcn/ui sheet` | Custom `<aside fixed inset-y-0 right-0>` (scaffold pattern) | No `sheet.tsx` exists in `src/components/ui/` and UI-SPEC line 121 bans `shadcn add`. Reuse the scaffold's proven pattern at `WishlistModule.tsx:421-650`. |
| `lodash.debounce` | Inline `useEffect + setTimeout + clearTimeout` | No debounce helper in the repo; adding lodash for one use is wasteful. Inline pattern is 4 lines. |

**Installation:** nothing to install. All deps already in `package.json`.

**Version verification (HIGH confidence, verified against `package.json`):**
- `react-hook-form: 7.72.1` [VERIFIED: package.json line read]
- `@hookform/resolvers: 3.10.0` [VERIFIED]
- `zod: 3.25.76` [VERIFIED]
- `@tanstack/react-query: 5.99.2` [VERIFIED]

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                       /app (AppShell)                                 │
│                                                                       │
│  Sidebar  ──nav──>  WishlistModule (rewritten)                        │
│                       │                                               │
│                       ├── useWishlists()  ──RLS query──>  Supabase    │
│                       │      (filter status!="archived")              │
│                       │                                               │
│                       ├── Grid of WishlistCards                       │
│                       │      │                                        │
│                       │      ├── Edit ──opens──>  WishlistFormSheet   │
│                       │      ├── Pause/Resume ──useUpdateWishlist     │
│                       │      └── Delete ──AlertDialog──>              │
│                       │             useDeleteWishlist                 │
│                       │             (soft: update status="archived")  │
│                       │                                               │
│                       └── "+ Nova Wishlist" ──opens──>                │
│                              WishlistFormSheet                        │
│                                                                       │
│  WishlistFormSheet (right-side on md+, Dialog full-screen on mobile)  │
│    │                                                                  │
│    ├── useForm<WishlistFormValues> + zodResolver(wishlistSchema)      │
│    │                                                                  │
│    ├── Identification section                                         │
│    │     ├── <Input> name (optional, auto-gen on submit)              │
│    │     ├── <FipeBrandCombobox>  ──React Query──>                    │
│    │     │       fipe-brands-snapshot.json   (D-03)                   │
│    │     │       + free-text fallback on /api/fipe 5xx/timeout        │
│    │     ├── <FipeModelCombobox>  ──React Query──>                    │
│    │     │       GET /api/fipe?type=models&brand=...  (D-04)          │
│    │     │       cached infinite by brand                             │
│    │     └── <Input> trim (optional, free text)                       │
│    │                                                                  │
│    ├── <YearRangeField>   (min/max pair + cross-validation)           │
│    ├── <KmInput>          (pt-BR thousand separator)                  │
│    ├── <BrlCurrencyInput> (R$ prefix + pt-BR thousand, integer reais) │
│    ├── <ChoiceChip>[]     fuel_type (multi-select)                    │
│    ├── <ChoiceChip>[]     transmission (multi-select)                 │
│    ├── <ChoiceChip>[]     armored (radio-like)                        │
│    ├── <LocalidadeMultiPicker>                                        │
│    │     └── useFieldArray<{uf, cidade}[]>                            │
│    │            └── composes existing <LocalidadePicker> (NO FORK)    │
│    │                                                                  │
│    ├── <WishlistPreviewPane>                                          │
│    │     ├── debounce 400ms on form.watch()                           │
│    │     ├── useListingsSnapshot() (NEW hook)                         │
│    │     │     └── Supabase .select().limit(500) OR                   │
│    │     │            mock fallback when result is []  (D-01)         │
│    │     └── matchListingToWishlists(listing, [pendingWishlist])      │
│    │            for each listing → count non-empty results            │
│    │            (pure; no round-trip; runs in useMemo)                │
│    │                                                                  │
│    └── Footer: Cancel / Salvar wishlist                               │
│          └──submit──> useCreateWishlist() OR useUpdateWishlist()      │
│                        ├── optimistic UI (sheet closes immediately)   │
│                        ├── sonner toast success                       │
│                        └── sonner toast.error + sheet stays on fail   │
│                                                                       │
│                                                                       │
│  /app/onboarding (existing 2-step wizard, extended)                   │
│    Step 1: name + company + LocalidadePicker       (existing)         │
│    Step 2: CNPJ                                    (existing)         │
│    Step 3: Primeira wishlist ──renders inline──>   (NEW)              │
│              same zod schema, same fields, full-page flat layout      │
│              on submit: supabase.users.update({onboarding_complete:   │
│                           true}) THEN useCreateWishlist.mutateAsync() │
│              skip button: users.update only, route to /app            │
└───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── fipe/
│   │       └── route.ts                          # extend to handle GET ?type=brands|models
│   └── app/
│       └── onboarding/
│           └── page.tsx                          # modified: add step 3
├── components/
│   ├── forms/                                    # existing folder
│   │   ├── LocalidadePicker.tsx                  # unchanged — reused
│   │   ├── LocalidadeMultiPicker.tsx             # NEW (wraps above)
│   │   ├── FipeBrandCombobox.tsx                 # NEW
│   │   ├── FipeModelCombobox.tsx                 # NEW
│   │   ├── BrlCurrencyInput.tsx                  # NEW
│   │   ├── KmInput.tsx                           # NEW
│   │   ├── YearRangeField.tsx                    # NEW
│   │   └── WishlistPreviewPane.tsx               # NEW
│   └── v3/
│       ├── Sidebar.tsx                           # modified: rename + remove marketplace slot
│       └── modules/
│           └── WishlistModule.tsx                # in-place rewrite
├── lib/
│   ├── brasil/
│   │   ├── localidades.ts                        # unchanged
│   │   └── fipe-brands-snapshot.json             # NEW (generated by script)
│   ├── mock-data/
│   │   └── preview-listings.ts                   # NEW (20 curated listings)
│   ├── schemas/
│   │   └── wishlist.ts                           # NEW (zod schema + Reais alias)
│   └── supabase/
│       └── hooks/
│           ├── useWishlists.ts                   # modified: soft delete + filter archived
│           ├── useWishlists.test.tsx             # modified: update 3 tests
│           └── useListingsSnapshot.ts            # NEW
└── scripts/
    └── sync-fipe-brands.ts                       # NEW (manual, one-off)
```

### Pattern 1: react-hook-form + zod + shadcn form primitives

**What:** Establish the repo's canonical RHF form pattern that future phases (P13a billing, P12 opportunity actions) will copy.

**When to use:** Any non-trivial form with ≥3 fields or cross-field validation.

**Example — co-located schema + types + form wiring:**

```typescript
// src/lib/schemas/wishlist.ts
import { z } from "zod";

/** Integer reais (no cents). Documentation alias to make the unit explicit at call-sites. */
export type Reais = number;

const CURRENT_YEAR = new Date().getFullYear();

export const wishlistSchema = z
  .object({
    name: z.string().max(120).optional().default(""),
    brand: z.string().min(1, "Informe a marca").max(60),
    model: z.string().min(1, "Informe o modelo").max(60),
    trim: z.string().max(60).nullable().optional().default(null),
    year_min: z.number().int().min(1990).max(CURRENT_YEAR + 1).nullable().optional().default(null),
    year_max: z.number().int().min(1990).max(CURRENT_YEAR + 1).nullable().optional().default(null),
    km_max: z.number().int().min(0).max(1_000_000).nullable().optional().default(null),
    price_max: z.number().int().min(0).max(5_000_000).nullable().optional().default(null),
    fuel_type: z.array(z.enum(["flex", "gasolina", "diesel", "híbrido", "elétrico"])).default([]),
    transmission: z.array(z.enum(["automático", "manual", "CVT"])).default([]),
    armored: z.boolean().nullable().default(null),
    region_uf: z.array(z.string()).default([]),
    region_cities: z.array(z.string()).default([]),
  })
  .refine(
    (v) => v.year_min == null || v.year_max == null || v.year_min <= v.year_max,
    { message: "Ano mínimo não pode ser maior que o máximo", path: ["year_min"] },
  );

export type WishlistFormValues = z.infer<typeof wishlistSchema>;
```

```typescript
// In WishlistFormSheet.tsx — usage pattern
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { wishlistSchema, type WishlistFormValues } from "@/lib/schemas/wishlist";

const form = useForm<WishlistFormValues>({
  resolver: zodResolver(wishlistSchema),
  defaultValues: initial ?? {
    name: "", brand: "", model: "", trim: null,
    year_min: null, year_max: null, km_max: null, price_max: null,
    fuel_type: [], transmission: [], armored: null,
    region_uf: [], region_cities: [],
  },
  mode: "onBlur",  // first error appears on blur, not first keystroke — calmer UX
});
```

**Source:** [CITED: https://ui.shadcn.com/docs/components/form — shadcn form patterns, matches `src/components/ui/form.tsx` already in repo]

### Pattern 2: FIPE cascade with snapshot + on-demand + fallback

**What:** Marca combobox paints instantly from static JSON; modelo combobox fetches on brand change, cached forever within session; both silently degrade to free-text `<Input>` when API fails.

**When to use:** Any external dependency where the API could be slow or flaky AND instant paint matters.

**Brand combobox pattern:**

```typescript
// FipeBrandCombobox.tsx — simplified shape
import brandsSnapshot from "@/lib/brasil/fipe-brands-snapshot.json";

const [fallbackToText, setFallbackToText] = useState(false);

if (fallbackToText) {
  return <Input placeholder="Digite a marca" {...register("brand")} />;
}

return (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" role="combobox">
        {field.value || "Selecione a marca"}
      </Button>
    </PopoverTrigger>
    <PopoverContent>
      <Command filter={(v, q) => norm(v).includes(norm(q)) ? 1 : 0}>
        <CommandInput placeholder="Digite pra filtrar..." />
        <CommandList>
          <CommandEmpty>Nenhuma marca encontrada</CommandEmpty>
          {brandsSnapshot.brands.map((b) => (
            <CommandItem key={b.codigo} value={b.nome} onSelect={field.onChange}>
              {b.nome}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
);
```

**Model combobox pattern (with React Query + fallback):**

```typescript
// FipeModelCombobox.tsx — simplified shape
const { data, isError, isLoading } = useQuery({
  queryKey: ["fipe", "models", brand],
  queryFn: async ({ signal }) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);   // D-05: 5s timeout
    try {
      const res = await fetch(`/api/fipe?type=models&brand=${encodeURIComponent(brand)}`, {
        signal: ctrl.signal,
      });
      if (res.status >= 500 || !res.ok) throw new Error("fipe_upstream");
      return await res.json() as { models: Array<{ codigo: string; nome: string }> };
    } finally {
      clearTimeout(t);
    }
  },
  enabled: !!brand && !fallbackToText,
  staleTime: Infinity,        // D-04: infinite cache per brand
  retry: false,               // D-05: fail fast; don't retry then fallback
  gcTime: 30 * 60 * 1000,     // keep across brand toggles in same session
});

useEffect(() => {
  if (isError) {
    toast.info("FIPE indisponível — digite manualmente");
    setFallbackToText(true);
  }
}, [isError]);
```

**Source:** [VERIFIED: React Query docs, staleTime: Infinity pattern — tanstack.com/query/latest/docs/framework/react/guides/caching]

### Pattern 3: Debounced preview pane via RHF watch() + useMemo

**What:** Form state changes → debounce 400ms → rerun matching engine against listings snapshot → show count.

**When to use:** Any live preview computed from form values where per-keystroke compute would flicker.

**Example:**

```typescript
// WishlistPreviewPane.tsx — core shape
function WishlistPreviewPane({ control }: { control: Control<WishlistFormValues> }) {
  const values = useWatch({ control });  // rerenders on any change, not once per field
  const [debounced, setDebounced] = useState(values);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(values), 400);
    return () => clearTimeout(t);
  }, [values]);

  const { data: snapshot = [] } = useListingsSnapshot();

  const count = useMemo(() => {
    // Adapter: WishlistFormValues → DbWishlist shape expected by engine
    const pending: DbWishlist = formValuesToPendingWishlist(debounced);
    if (!pending.brand || !pending.model) return null;  // not enough info yet

    try {
      return snapshot.reduce((acc, listing) => {
        const results = matchListingToWishlists(listing, [pending], { enforcePfOnly: false });
        return acc + (results.length > 0 ? 1 : 0);
      }, 0);
    } catch {
      return null;  // engine threw — fall silent (State Matrix: Silent no-op)
    }
  }, [debounced, snapshot]);

  return (
    <section aria-live="polite" className="...">
      <h3>Prévia de resultados</h3>
      {count == null ? (
        <Skeleton />
      ) : count === 0 ? (
        <p>Ainda não achamos anúncios compatíveis. Você pode salvar a wishlist mesmo assim — novos anúncios aparecem todo dia.</p>
      ) : (
        <p>Com essas regras, acharíamos <span className="text-[#4C46DC] font-semibold">{count} anúncios</span> esta semana.</p>
      )}
    </section>
  );
}
```

**Note on `enforcePfOnly: false`:** mock listings may not have `seller_type: "PF"` set; the engine default is `true` which would zero out the preview. For P7 preview, disable the PF gate — the production DB trigger will still enforce it when real opportunities are created in P9.

### Pattern 4: Soft delete wrapper on `useDeleteWishlist`

**What:** Change the existing `useDeleteWishlist` from hard `DELETE` to `UPDATE ... SET status='archived'`; filter `status != 'archived'` in `fetchWishlists`.

**When to use:** Always for P7 — D-14 is locked.

```typescript
// src/lib/supabase/hooks/useWishlists.ts — mutation
mutationFn: async (id: string): Promise<string> => {
  if (!user) throw new Error("not_authenticated");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from("wishlists")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return id;
},
// fetchWishlists — filter
.from("wishlists").select("*").eq("user_id", userId).neq("status", "archived")
```

**Test impact:** `src/lib/supabase/hooks/useWishlists.test.tsx` has 3 tests per Phase 6 VERIFICATION.md (line 34) that mock `mockFrom(...).delete()`. After the change the delete mock becomes an update mock. The plan MUST include a test update task co-located with the hook change.

### Anti-Patterns to Avoid

- **Forking `LocalidadePicker` to make it multi.** CONTEXT.md explicitly bans this. Compose a wrapper that renders N chips (removable) + one inline `<LocalidadePicker>` as the "add row" UI, pushing onto a RHF `useFieldArray`.
- **Adding a `useDebounce` helper file for a single 400ms call-site.** Inline `useEffect + setTimeout`. One file of abstraction for a 4-line pattern is waste.
- **Per-component `dark:bg-*` on chrome.** Phase 5 set up a CSS fallback layer in `globals.css` so chrome (card, border, text slate) auto-dark-modes. Only colored accents (emerald/amber/red/indigo) need explicit `dark:` variants — already present in the scaffold.
- **Passing `flex` / `gasolina` etc. as raw strings to Zod.** Use `z.enum([...])` — constrains at type level AND runtime AND matches `FuelType` / `Transmission` types in `src/types/database.ts:43-44`.
- **Leaving any `useAppStore` or `LocalWishlist` imports in `WishlistModule.tsx` post-rewrite.** The scaffold uses `useAppStore((s) => s.wishlists)` (line 107) and `wishlistToInput(LocalWishlist)` (line 63) — those types live in `src/lib/stores/app.ts` and must be replaced with `DbWishlist` + `WishlistInsertInput` from Phase 6.
- **Wrapping the form in a `<form>` that triggers native browser validation.** shadcn `<Form>` (`FormProvider`) + RHF's `form.handleSubmit` is the path; set `noValidate` on the `<form>` element to disable browser's red bubble.
- **Writing a new `/api/fipe` route.** The existing POST endpoint handles price lookups; extend the same `route.ts` to handle `GET ?type=brands|models` with a union-shaped request parser (branch by HTTP method).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Form state + validation orchestration | `useState` per field + hand-rolled `validate()` | `react-hook-form` + `zodResolver` | Scaffold already proves the trap: `validate(form)` at line 657 runs on every render; RHF does it once per relevant field change |
| Schema + runtime validation + TS types | Three separate definitions | Single Zod schema + `z.infer<>` | `src/lib/schemas/listing.ts` is the in-repo reference pattern |
| Combobox with keyboard nav | Custom popover + filter + arrow-key handling | shadcn `command` + `popover` (already installed) | `LocalidadePicker.tsx` demonstrates the full pattern including accent-insensitive filter function |
| Debounce | `lodash.debounce` | Inline `useEffect + setTimeout + clearTimeout` | Repo has no lodash; single call-site |
| Toast notifications | Custom toast primitive | `sonner` (already wired in layout) | `toast.success`, `toast.error`, `toast.info` are the 3 variants P7 needs |
| Currency mask | Regex onChange + manual formatting | `toLocaleString("pt-BR", { minimumFractionDigits: 0 })` on display; strip non-digits on input | Scaffold's `formatBrl` at line 82 is good enough |
| CNPJ-style mask (not P7 but template) | Custom regex chain | Pattern in `onboarding/page.tsx:34-42` — copyable template if any mask emerges |
| Destructive confirm | `window.confirm()` | shadcn `AlertDialog` | Already installed; scaffold line 181 is the exact replacement point |
| Table/grid pagination | N/A in P7 | N/A | P7 does not have pagination in scope |

**Key insight:** Every item above is already solved in the repo. Phase 7 is orchestration of existing primitives, not invention. The only non-trivial new piece is the preview pane adapter (form values → `DbWishlist` shape for the engine).

## Runtime State Inventory

> Phase 7 is a UI + hook-mutation phase. It is NOT a rename/refactor/migration in the OS/filesystem/external-services sense. The only "runtime state" it touches:

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `public.wishlists` rows — existing rows with `status = "active"` or `"paused"` unaffected; hard-deleted rows are already gone (no migration needed). Future soft-deletes land as `status = "archived"`. | None — new rows go through the updated mutation from the first execution onward. If any row already exists with `status = "archived"` (unlikely — P6 didn't use it), the filter already excludes them. |
| Live service config | None — this is a frontend + client-hook change | None |
| OS-registered state | None | None |
| Secrets/env vars | None added, none removed. `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` already wired by Phase 6. Parallelum has no key. | None |
| Build artifacts / installed packages | `fipe-brands-snapshot.json` is a committed JSON that ships in the bundle. Re-run of `scripts/sync-fipe-brands.ts` regenerates in-place. No package rename. | None — first run populates the file; subsequent runs overwrite |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* Answer for P7: none. The hook change applies to new calls; the sidebar label change is client-rendered; the form is a fresh widget. No caches, no OS registrations, no secrets.

## Common Pitfalls

### Pitfall 1: Matching engine expects a full `DbWishlist`, not partial form values

**What goes wrong:** Passing a `WishlistFormValues` directly to `matchListingToWishlists` — engine reads `wishlist.status` (line 175) and `wishlist.id` and fields like `region_cities` which the form schema might omit if nullable defaults are undefined.

**Why it happens:** Form values are a subset (Insert shape); DB row shape has server-stamped columns (`id`, `created_at`, `user_id`, `status`, `updated_at`). Engine was written for the latter.

**How to avoid:** Build an explicit adapter:

```typescript
function formValuesToPendingWishlist(v: WishlistFormValues): DbWishlist {
  return {
    id: "pending",
    user_id: "pending",
    name: v.name || "pending",
    brand: v.brand,
    model: v.model,
    trim: v.trim ?? null,
    year_min: v.year_min ?? null,
    year_max: v.year_max ?? null,
    km_max: v.km_max ?? null,
    price_max: v.price_max ?? null,
    fuel_type: v.fuel_type ?? [],
    transmission: v.transmission ?? [],
    armored: v.armored ?? null,
    region_uf: v.region_uf ?? [],
    region_cities: v.region_cities ?? [],
    status: "active",           // critical — engine skips non-active
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
```

**Warning signs:** Preview pane always shows 0 → check `status` is `"active"` on the synthetic wishlist. Preview pane crashes on brand.toLowerCase() → check `brand` / `model` are required in schema (they are — `.min(1)`).

### Pitfall 2: React Query key collision between real users vs "anon" user

**What goes wrong:** When user signs out between tabs, one tab's listingsSnapshot cached under `["supabase", "listings-snapshot", "user-abc"]` doesn't invalidate the other tab's `["supabase", "listings-snapshot", "anon"]` — stale data flashes.

**Why it happens:** `useListingsSnapshot` should key by user id like `useWishlists` does (see `useWishlists.ts:44`).

**How to avoid:** Mirror the exact key shape — `["supabase", "listings-snapshot", user?.id ?? "anon"]` — and rely on React Query's tab-level cache. Global cross-tab sync is not in P7 scope (deferred per D-09).

**Warning signs:** Preview pane renders numbers that don't match the current user's listings → inspect React Query devtools for key shape mismatch.

### Pitfall 3: Sheet full-screen on mobile conflicts with the custom `<aside fixed>` pattern

**What goes wrong:** The scaffold's `<aside fixed inset-y-0 right-0>` pattern takes `w-full md:w-[560px]` which LOOKS responsive but renders a right-edge-aligned drawer on mobile — not full-screen with a mobile header.

**Why it happens:** The scaffold uses one DOM structure for both breakpoints; UI-SPEC wants a different chrome on mobile (close button in header, footer stickied to bottom, no backdrop).

**How to avoid:** Two options; pick one:

- **(a) Two DOM variants** — render `<aside>` inside a `md:block hidden` and a `<Dialog>` inside a `md:hidden block`, each controlled by the same `open` state. Simple, a bit of duplication.
- **(b) Single DOM with responsive class cascade** — keep the `<aside>` but on `<md` make it `w-screen h-screen left-0 top-0 inset-auto` with its own header+footer. Less duplication, more Tailwind-fu.

Recommend **(a)** for clarity — the two experiences are different enough that splitting the DOM is more readable than a single responsive monster.

**Warning signs:** Mobile test shows content overflow under a bottom tab bar, or backdrop visible behind full-screen form.

### Pitfall 4: `useCreateWishlist` is NOT optimistic (contrary to CONTEXT.md claim)

**What goes wrong:** CONTEXT.md line 118 says "CRUD completo, **otimista**, RLS-safe". Actually `useCreateWishlist` at `useWishlists.ts:51-71` uses `onSuccess: invalidateQueries` — it's NOT optimistic. Only `useUpdateWishlist` and `useDeleteWishlist` have `onMutate`/`onError`/`onSettled`.

**Why it happens:** CONTEXT.md overstated the contract. The actual behavior: create → wait for server response → invalidate → grid refetches → new card appears. There's a ~200-500ms gap where the sheet has already closed but the grid doesn't show the new card yet.

**How to avoid:** Either (a) accept the gap (plan marks this as acceptable latency; show a toast `"Wishlist criada"` immediately so user has feedback), or (b) add `onMutate` optimistic insert with a client-generated uuid. Recommendation: **(a)** — P6 shipped this way and nobody complained; adding optimism adds code without meaningful UX gain for a create flow where the drawer close is the primary feedback.

**Warning signs:** Test user clicks "Salvar" → sheet closes → they scroll the grid looking for the new card → momentary confusion.

### Pitfall 5: Free-text fallback values flowing into matching engine

**What goes wrong:** User types "Honda" and then FIPE times out for models → user types "Civic EXR-17" as free text → form submits → engine `modelMatches` requires `similarity >= 0.85`. Mock listings have `model: "Civic"` — similarity to "Civic EXR-17" is ~0.65 — no match → preview shows 0.

**Why it happens:** Engine fuzzy match has a threshold designed for canonical FIPE names; free-text user entries will be sloppier.

**How to avoid:** Accept as a known limitation — preview count may be pessimistic after a fallback; actual matching in production (P9) operates on listings that went through FIPE normalization, so real matches stay fine. Document the tradeoff in JSDoc on the fallback toggle. Don't try to lower the similarity threshold just for preview — that would mask real matching logic issues in tests.

**Warning signs:** User enters valid-looking data after a FIPE outage, sees "0 anúncios" preview, thinks their wishlist is bad. Mitigation: the copy in UI-SPEC already says "Você pode salvar a wishlist mesmo assim — novos anúncios aparecem todo dia" which covers this.

### Pitfall 6: CONTEXT.md says "SWR", repo uses React Query

**What goes wrong:** Literal reading of CONTEXT.md D-04 says "SWR" — executor installs `swr` package.

**Why it happens:** CONTEXT.md was drafted using generic language; the repo standard is React Query (confirmed `package.json` + Phase 6 hooks).

**How to avoid:** Plan must call out: "use `@tanstack/react-query` despite CONTEXT saying 'SWR' — same semantics, consistent with repo". Do not install `swr`.

**Warning signs:** New `swr` import in `package.json` diff.

## Code Examples

Verified patterns from official and in-repo sources:

### Example 1 — Zod schema + `z.infer` (repo pattern)

```typescript
// Source: src/lib/schemas/listing.ts (lines 1-43) — in-repo canonical pattern
import { z } from "zod";

const SAFE_TEXT = /^[^<>{}]*$/;

export const listingSchema = z.object({
  marca: z.string().min(1, "Marca é obrigatória").max(100).regex(SAFE_TEXT),
  // ...
});

export type Listing = z.infer<typeof listingSchema>;
```

Apply the same structure in `src/lib/schemas/wishlist.ts`.

### Example 2 — shadcn `Command` filter with accent-insensitive normalization (repo pattern)

```typescript
// Source: src/components/forms/LocalidadePicker.tsx (lines 40-46, 113)
function norm(s: string): string {
  return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

<Command filter={(value, search) => (norm(value).includes(norm(search)) ? 1 : 0)}>
```

Reuse this `norm` in FIPE comboboxes — "Chevrolet" matches "chev" and "chavrolet" (typo tolerance), "Peugeot" matches "peugeot" even if the query has no accents.

### Example 3 — React Query hook scaffold (repo pattern)

```typescript
// Source: src/lib/supabase/hooks/useWishlists.ts (lines 27-48) — in-repo pattern
async function fetchWishlists(userId: string): Promise<DbWishlist[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("wishlists")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useWishlists() {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;
  return useQuery({
    queryKey: ["supabase", "wishlists", user?.id ?? "anon"],
    queryFn: () => fetchWishlists(user?.id ?? ""),
    enabled,
    initialData: enabled ? undefined : [],
  });
}
```

Mirror exactly for `useListingsSnapshot`: same key shape, same `enabled` gate, same `initialData` degradation when user isn't authed.

### Example 4 — shadcn `AlertDialog` with focus on Cancel (for delete)

```typescript
// Source: https://ui.shadcn.com/docs/components/alert-dialog (pattern) +
//         UI-SPEC §a11y directive "Focus Cancel — NOT auto-focus confirm"
<AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Apagar wishlist?</AlertDialogTitle>
      <AlertDialogDescription>
        A wishlist "{deleting?.name}" será removida. Oportunidades já abertas
        continuam no marketplace, mas nenhuma nova será criada. Essa ação não
        pode ser desfeita.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel autoFocus>Manter</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => deleteMut.mutate(deleting!.id)}
      >
        Apagar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Key detail: `autoFocus` is on `AlertDialogCancel`, not on the destructive action. Radix's default `AlertDialog` focuses the **first focusable** element in the footer — putting Cancel first + `autoFocus` doubly ensures correct behavior.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Zustand-persisted client state for wishlists | Supabase via React Query hooks | Phase 6 (2026-04-22) | P7 must use `useWishlists` family; `LocalWishlist` + `useAppStore` are legacy |
| `window.confirm()` for destructive actions | shadcn `AlertDialog` | P7 locks via D-13 | More accessible; consistent with design system; focus management explicit |
| `useState + hand-rolled validate()` for forms | `react-hook-form` + `zodResolver` | P7 establishes pattern (D-11) | Less re-renders, less code, cross-field validation via `.refine` |
| Hard delete rows | Soft delete via `status="archived"` | P7 locks via D-14 | Auditability, ability to restore, opportunities from deleted wishlists not cascade-killed |

**Deprecated/outdated:**
- `WishlistModule.tsx`'s `LocalWishlist` + `useAppStore` path — stays in `src/lib/stores/app.ts` for backward compat during migration, but P7 must NOT import it.
- `confirm(...)` — direct ban.
- `validate(input)` hand-rolled helper at scaffold line 657 — replaced by Zod `.refine`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `parallelum.com.br/fipe/api/v1/carros/marcas` returns a parseable list within 5s when called from a dev machine | D-03 snapshot generation | Script fails on first run; mitigation: retry manually, or use a cached brands list from another FIPE mirror. [ASSUMED — Parallelum has been flaky historically; engine in Phase 1 has chunked Promise.all workaround at `route.ts:146-176`] |
| A2 | Phase 6's `useWishlists.test.tsx` has exactly 3 tests (per Phase 6 VERIFICATION.md line 34) | Soft delete hook change | If more tests exist, update plan scope grows slightly; low impact — tests are co-located and readable [VERIFIED — VERIFICATION.md line 34 and test file first 60 lines read] |
| A3 | `components.json` is stable across P7 — no one will run `shadcn init` again | Registry safety | If components.json changes mid-phase, styles drift. Low risk — no P7 task touches it. [VERIFIED — components.json read] |
| A4 | Onboarding step 3 save can be two sequential Supabase calls (users.update THEN wishlist.insert) rather than a single transaction | Onboarding integration | If the second call fails after the first succeeds, user is marked `onboarding_complete: true` but has no wishlist → lands in empty state. Acceptable per UI-SPEC (Skip flow lands them there anyway). [ASSUMED — Supabase REST doesn't expose transactions; only Postgres fn would. Plan should call out this degradation-is-OK.] |
| A5 | `enforcePfOnly: false` on the preview pane's engine call will not cause production-relevant false positives | Preview pane adapter | Preview shows listings the real pipeline (P9) would filter out. Acceptable for preview (shows potential universe); production enforces PF via DB trigger [ASSUMED — engine option default is `true`] |
| A6 | The 20 mock listings in `preview-listings.ts` can match at least 80% of "reasonable" wishlist shapes a lojista would type (Honda Civic, Toyota Corolla, VW Gol, etc.) | D-02 mock listings shape | If mocks are too narrow, every preview shows 0 → broken-feeling UX. Risk mitigated by curating diverse prices/km/regions [ASSUMED — a proper sanity check is to run the matching engine against each mock × a canonical wishlist list and verify coverage] |

## Open Questions

None. CONTEXT.md is locked at 15 decisions. UI-SPEC approved 6/6. Three technical discoveries above (FIPE GET endpoint missing, matching engine signature, hard-delete hook) are not open questions — they are facts of the codebase that the plan must address via specific tasks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js runtime | Next.js dev/build | ✓ | 22 (assumed; `@types/node: ^22.0.0` in package.json) | — |
| pnpm | Package manager | ✓ (required by project per CLAUDE.md) | — | npm would work but not per spec |
| `tsx` | Run `scripts/sync-fipe-brands.ts` | ✓ | 4.21.0 | `node --loader ts-node/esm` if tsx removed (unlikely) |
| Supabase project + RLS | Phase 6 hooks connecting to DB | ✓ (Phase 6 shipped) | — | Mock listings fallback per D-01 covers the empty-DB case |
| Parallelum FIPE API | `scripts/sync-fipe-brands.ts` + runtime GET models | ✓ (public, no key) | — | Free-text fallback per D-05 |
| Unsplash CDN | Mock listing photos in `preview-listings.ts` | ✓ (free, no key) | — | Photos can also be `null` — card has a placeholder state already |
| vitest + jsdom | Running unit tests | ✓ | 2.1.9 + 25.0.1 | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none — fallbacks are design decisions (D-01, D-05), not degradation paths for missing tools.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest 2.1.9 + @testing-library/react 16.3.2 + jsdom 25.0.1 |
| Config file | `vitest.config.mts` (already set up; `@` alias → `./src`, jsdom env, setup file) |
| Setup file | `vitest.setup.ts` (matchMedia shim, randomUUID shim, jest-dom matchers) |
| Quick run command | `pnpm test` (vitest run) |
| Full suite command | `pnpm test && pnpm lint && pnpm typecheck && pnpm build` |
| Watch mode | `pnpm test:watch` |

### Phase Requirements → Test Map

| Req ID (de facto) | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-01 | `useListingsSnapshot` falls back to mocks when Supabase returns `[]` | unit | `pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx` | ❌ Wave 0 |
| D-02 | `preview-listings.ts` mocks parse as valid `DbListing[]` | unit | `pnpm test src/lib/mock-data/preview-listings.test.ts` | ❌ Wave 0 |
| D-03 | `fipe-brands-snapshot.json` parses, contains ≥50 brands | unit | `pnpm test src/lib/brasil/fipe-brands-snapshot.test.ts` | ❌ Wave 0 |
| D-05 | FipeModelCombobox falls back to `<Input>` on /api/fipe 500/timeout (integration, mock fetch) | integration | `pnpm test src/components/forms/FipeModelCombobox.test.tsx` | ❌ Wave 0 |
| D-06 | `BrlCurrencyInput` round-trips integer reais: "130000" → display "R$ 130.000" → onChange emits 130000 | unit | `pnpm test src/components/forms/BrlCurrencyInput.test.tsx` | ❌ Wave 0 |
| D-08 | `summarize(wishlist)` branches: full, no UF, no year, no brand (fallback) | unit | `pnpm test src/components/v3/modules/WishlistModule.test.tsx` (new) or `src/lib/wishlist/summarize.test.ts` if extracted | ❌ Wave 0 |
| D-11 | `wishlistSchema` valid/invalid/edge cases (year_min > year_max rejected, empty optionals OK, fuel enum rejects typos) | unit | `pnpm test src/lib/schemas/wishlist.test.ts` | ❌ Wave 0 |
| D-13 | Delete action triggers AlertDialog; cancel closes, confirm calls mutation | integration | `pnpm test src/components/v3/modules/WishlistModule.test.tsx` | ❌ Wave 0 |
| D-14 | `useDeleteWishlist` issues UPDATE `{status:"archived"}` not DELETE | unit | `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx` (modify existing) | ✓ modify |
| D-14 | `useWishlists` filters `status="archived"` rows | unit | same file | ✓ modify |
| D-15 | Sidebar renders "Minhas Wishlists" label and no "Marketplace" item | unit | `pnpm test src/components/v3/Sidebar.test.tsx` (NEW optional — can also be smoke via e2e) | ❌ Wave 0 |
| UI-SPEC preview pane | Preview shows count>0 with valid wishlist + matching mocks; 0 with over-restrictive wishlist | integration | `pnpm test src/components/forms/WishlistPreviewPane.test.tsx` | ❌ Wave 0 |
| UI-SPEC adapter | `formValuesToPendingWishlist` produces a `status="active"` DbWishlist shape | unit | co-located in `WishlistPreviewPane.test.tsx` | ❌ Wave 0 |
| UI-SPEC a11y | Preview pane has `aria-live="polite"`; AlertDialog focuses Cancel | integration | covered in the respective integration tests | ❌ Wave 0 |
| UI-SPEC form flow | Submit calls `useCreateWishlist.mutateAsync` on valid; toast on success | integration | `pnpm test src/components/v3/modules/WishlistFormSheet.test.tsx` | ❌ Wave 0 |
| UI-SPEC form flow | Submit blocked on invalid (brand empty); error message inline | integration | same file | ❌ Wave 0 |
| UI-SPEC form flow | Save error → toast.error + sheet stays open | integration | same file | ❌ Wave 0 |
| Onboarding step 3 | Skip flow flips `onboarding_complete: true` without creating wishlist | integration | `pnpm test src/app/app/onboarding/page.test.tsx` (NEW) — consider DEFERRED if time-boxed | ❌ Wave 0 (defer OK) |

### Sampling Rate

- **Per task commit:** `pnpm test <relevant file(s)>` — single-test-file run, typically <5s
- **Per wave merge:** `pnpm test` — full vitest run
- **Phase gate:** `pnpm test && pnpm lint && pnpm typecheck && pnpm build` all green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/schemas/wishlist.test.ts` — covers D-11 (schema validation)
- [ ] `src/lib/mock-data/preview-listings.test.ts` — covers D-02 (mocks shape)
- [ ] `src/lib/brasil/fipe-brands-snapshot.test.ts` — covers D-03 (snapshot shape)
- [ ] `src/lib/supabase/hooks/useListingsSnapshot.test.tsx` — covers D-01 (mock fallback)
- [ ] `src/components/forms/BrlCurrencyInput.test.tsx` — covers D-06 (round-trip)
- [ ] `src/components/forms/FipeBrandCombobox.test.tsx` — covers combobox + fallback
- [ ] `src/components/forms/FipeModelCombobox.test.tsx` — covers D-05 (fallback)
- [ ] `src/components/forms/KmInput.test.tsx` — covers pt-BR km formatting
- [ ] `src/components/forms/YearRangeField.test.tsx` — covers cross-field validation
- [ ] `src/components/forms/LocalidadeMultiPicker.test.tsx` — covers add/remove tuples
- [ ] `src/components/forms/WishlistPreviewPane.test.tsx` — covers debounce + engine adapter + zero/non-zero branches
- [ ] `src/components/v3/modules/WishlistModule.test.tsx` — covers `summarize` branches + Delete AlertDialog + list/empty/error render
- [ ] `src/components/v3/modules/WishlistFormSheet.test.tsx` — covers submit success/failure/validation paths
- [ ] Framework install: nothing — vitest + RTL + jsdom all already present

**No new test infrastructure needed.** vitest.setup.ts already shims matchMedia (important for sonner/next-themes) and randomUUID (important for any `crypto.randomUUID()` calls in form defaults).

**Not in P7 test scope (explicitly):**
- Playwright / e2e — out per UI-SPEC conventions and project preference
- Visual regression — out
- Sidebar nav click → module switch (already covered by P5 tests; D-15 only renames a label, no behavior change)
- `/api/fipe` route tests — only if the GET branch is added; extend existing `src/app/api/fipe/route.test.ts`

## New File Plan

| File path | Closest analog | Purpose | LOC estimate |
|---|---|---|---|
| `src/lib/schemas/wishlist.ts` | `src/lib/schemas/listing.ts` (43 LOC) | Zod schema + `Reais` type + `WishlistFormValues` type | ~70 |
| `src/lib/schemas/wishlist.test.ts` | `src/lib/schemas/listing.test.ts` | Schema valid/invalid/cross-field tests (~10 cases) | ~120 |
| `src/lib/mock-data/preview-listings.ts` | `src/lib/mock-data/v3.ts` (existing Phase 5 mock opportunities) | 20 curated `DbListing[]`, realistic BR prices/km/UF/photos | ~200 |
| `src/lib/mock-data/preview-listings.test.ts` | — (new pattern; test parses & validates shape) | Assert each entry is a valid `DbListing`; assert diverse UFs/prices | ~40 |
| `src/lib/brasil/fipe-brands-snapshot.json` | — | ~60 marcas `{codigo, nome}[]` + metadata `{generated_at}` | ~250 (JSON) |
| `src/lib/brasil/fipe-brands-snapshot.test.ts` | — | Parse snapshot, assert ≥50 brands, assert stable ordering | ~30 |
| `scripts/sync-fipe-brands.ts` | `scripts/seed-dev.ts` (tsx, reads .env, calls Supabase) | tsx script: hit `parallelum.com.br/.../marcas`, filter top ~60, write JSON | ~80 |
| `src/lib/supabase/hooks/useListingsSnapshot.ts` | `src/lib/supabase/hooks/useWishlists.ts` §useWishlists | React Query hook: Supabase select limit 500 → mock fallback when `[]` | ~60 |
| `src/lib/supabase/hooks/useListingsSnapshot.test.tsx` | `src/lib/supabase/hooks/useWishlists.test.tsx` | Mock Supabase `from(..).select(..)` — test empty-result fallback | ~100 |
| `src/components/forms/FipeBrandCombobox.tsx` | `src/components/forms/LocalidadePicker.tsx` (combobox + Command + fallback-like pattern) | shadcn popover+command over static snapshot + RHF integration + free-text toggle | ~130 |
| `src/components/forms/FipeBrandCombobox.test.tsx` | — | Render, search, select, fallback when prop trips | ~80 |
| `src/components/forms/FipeModelCombobox.tsx` | FipeBrandCombobox (above) | Same pattern but React Query fetch + 5s timeout + auto-fallback on error | ~150 |
| `src/components/forms/FipeModelCombobox.test.tsx` | — | Mock fetch: success path, 500 path, timeout path, retry disabled | ~120 |
| `src/components/forms/LocalidadeMultiPicker.tsx` | `src/components/forms/LocalidadePicker.tsx` + `useFieldArray` docs | Wraps LocalidadePicker for RHF array; chip per tuple + inline "add row" | ~120 |
| `src/components/forms/LocalidadeMultiPicker.test.tsx` | — | Add tuple, remove tuple, prevent dupes, field array integration | ~100 |
| `src/components/forms/BrlCurrencyInput.tsx` | `Input` + `onboarding/page.tsx:34-42` mask pattern | Controlled: strips non-digits, emits integer reais, displays "R$ 130.000" | ~70 |
| `src/components/forms/BrlCurrencyInput.test.tsx` | — | Round-trip: type → onChange numeric; paste non-digits stripped | ~60 |
| `src/components/forms/KmInput.tsx` | `BrlCurrencyInput.tsx` (no `R$` prefix, "km" suffix) | Same pattern, simpler | ~60 |
| `src/components/forms/KmInput.test.tsx` | — | Similar to BRL test | ~50 |
| `src/components/forms/YearRangeField.tsx` | `WishlistFormDrawer` year section (scaffold lines 483-514) | `<Input type="number">` pair in `grid-cols-2` + cross-field error display | ~80 |
| `src/components/forms/YearRangeField.test.tsx` | — | min > max shows error; clearing either clears error | ~60 |
| `src/components/forms/WishlistPreviewPane.tsx` | Scaffold has no preview; new component | Debounced useWatch → useMemo engine call → aria-live count + collapsible 3-card preview | ~180 |
| `src/components/forms/WishlistPreviewPane.test.tsx` | — | Debounce triggers; count = 0 vs count > 0 paths; adapter produces status:active; engine throw = silent | ~150 |
| `src/components/v3/modules/WishlistFormSheet.tsx` | Scaffold's `WishlistFormDrawer` | Rewritten: RHF wrapper, composes all form primitives, desktop sheet + mobile dialog variants, footer with submit | ~280 |
| `src/components/v3/modules/WishlistFormSheet.test.tsx` | — | Submit happy path, validation failure, save error toast, cancel closes | ~200 |
| `src/components/v3/modules/WishlistModule.test.tsx` | — | summarize branches, list/empty/error render, delete AlertDialog, edit flow | ~250 |
| `src/components/v3/Sidebar.test.tsx` *(optional)* | — | Render, assert "Minhas Wishlists" label, assert no "Marketplace" item | ~40 |

**Summary:**
- **Net-new source files:** 12 (`.ts`/`.tsx`)
- **Net-new test files:** 13
- **Modified source files:** 4 (`WishlistModule.tsx`, `Sidebar.tsx`, `onboarding/page.tsx`, `useWishlists.ts`, `api/fipe/route.ts`)
- **Modified test files:** 2 (`useWishlists.test.tsx`, `api/fipe/route.test.ts`)
- **Total LOC estimate:** ~2,800 source + ~1,500 test ≈ **4,300 LOC** (spread across 4 dependency layers, executable in 8-12 parallelizable tasks per the planner's model)

## Files Modified In-Place

| File path | What changes | Why |
|---|---|---|
| `src/components/v3/modules/WishlistModule.tsx` | Full rewrite: swap `useAppStore` → `useWishlists/useUpdate/useDelete`; swap scaffold `WishlistFormDrawer` → new `WishlistFormSheet`; swap `window.confirm` → AlertDialog; extract `summarize` helper (keep exported). Preserve EmptyState, WishlistCard, Row, Chip, ChoiceChip visual code exactly. | Phase 6 hooks are the canonical source of truth; scaffold is legacy. D-13, D-14 enforce dialog + soft delete. |
| `src/components/v3/Sidebar.tsx` | Line 43 `label: "Wishlists"` → `label: "Minhas Wishlists"`; lines 47-52 entire `marketplace` sidebar item removed from GROUPS array. Keep `AppModule` type in `stores/app.ts` intact (type still used elsewhere). | D-15 locks the rename; cleanup of the legacy module itself is deferred to P12 |
| `src/app/app/onboarding/page.tsx` | Add `type Step = 1 \| 2 \| 3` union; add step 3 render branch using `WishlistFormSheet` inline (flat, no sheet chrome — pass prop `layout: "inline"`); move the `onboarding_complete: true` update from step 2 handler to step 3 handler; add "Pular e fazer depois" button that does onboarding_complete update and routes `/app`. | UI-SPEC §Onboarding wizard integration + D-08/D-11 reuse of the same schema |
| `src/lib/supabase/hooks/useWishlists.ts` | (1) `fetchWishlists`: append `.neq("status", "archived")` after the `.eq("user_id", userId)`. (2) `useDeleteWishlist.mutationFn`: change `supabase.from("wishlists").delete()` to `.update({ status: "archived" })`. Optimistic `onMutate` stays identical (filter-out still filters; optimistic card disappears). | D-14 soft delete; hook behavior change is silent to consumers |
| `src/lib/supabase/hooks/useWishlists.test.tsx` | Update the delete test to expect `update({status: "archived"})` instead of `delete()`; update mock chain accordingly. Ensure list query test includes an archived row in fake data and asserts it's filtered out. | Tests co-located with the change |
| `src/app/api/fipe/route.ts` | Add `export async function GET(request: Request)` branching on `searchParams.type`. `type=brands` → hit Parallelum `/marcas`, return `{ brands: [...] }`. `type=models&brand=X` → resolve brand codigo via fuzzyMatch, hit `/marcas/:codigo/modelos`, return `{ models: [...] }`. Reuse `fetchJson`, `fuzzyMatch`, `fuzzyMatchAll`, `checkRateLimit` already in the file. | Critical gap #1 from Summary — D-03/D-04 cannot be implemented without a GET endpoint |
| `src/app/api/fipe/route.test.ts` | Add test cases for `GET ?type=brands` (success + 502 upstream fail) and `GET ?type=models&brand=Honda` (success + 404 unknown brand + 502 upstream). | New endpoint needs test coverage |

## Landmines

- **[HIGH]** **`/api/fipe` GET endpoint does NOT exist today.** CONTEXT and UI-SPEC assume it. Plan MUST include a task to add it. If skipped, D-03 snapshot script has no source for brands (could bypass by hitting Parallelum directly in the script — this is Option (b) in the Summary), but D-04 on-demand models fetch has no other path than a new route.
- **[HIGH]** **Matching engine signature is NOT `scoreListings(rules, listings)`.** The preview pane wiring in UI-SPEC describes a function that does not exist. Real signature is `matchListingToWishlists(listing, wishlists[])`. Plan MUST include the adapter function `formValuesToPendingWishlist` and the snapshot-loop pattern (per listing → call with single-wishlist array → count non-empty).
- **[HIGH]** **`useDeleteWishlist` hard-deletes today.** D-14 mandates soft delete. Plan MUST explicitly include the hook mutation + test file update as one task (not "detail of WishlistModule rewrite" — it's a separate concern). Missing this means either (a) hook edit happens covertly and Phase 6 tests break silently, or (b) WishlistModule calls the hook that still hard-deletes, violating D-14.
- **[HIGH]** **CONTEXT.md language says "SWR" but repo uses React Query.** Executor following CONTEXT literally will install `swr`. Plan MUST explicitly say "use @tanstack/react-query despite D-04 saying SWR".
- **[MEDIUM]** **Mock listings must have `status: "active"` and `seller_type: "PF"` OR preview must pass `enforcePfOnly: false`.** Engine short-circuits at `engine.ts:169-170` otherwise. Recommendation: set `status: "active"` on all 20 mocks (it's the default anyway) AND pass `enforcePfOnly: false` in the preview call (preview is a different semantic than production opportunity creation).
- **[MEDIUM]** **Mock listings for top BR models must have `brand` + `model` fields that pass the engine's 0.85 fuzzy similarity threshold** against what users will plausibly type. `brand: "Honda"` matches `brand: "honda"` (case-insensitive via engine's `normalize`) — but typos won't. Curate canonical spellings.
- **[MEDIUM]** **Scaffold uses Zustand (`useAppStore`) — every import of `LocalWishlist` / `WishlistInput` from `@/lib/stores/app` must go.** Grep after rewrite: `grep -rn "useAppStore\|LocalWishlist\|from \"@/lib/stores/app\"" src/components/v3/modules/WishlistModule.tsx` must return empty.
- **[MEDIUM]** **No shadcn `sheet` primitive exists.** UI-SPEC §Component Inventory calls it "Sheet"; actually the scaffold uses a custom `<aside fixed inset-y-0 right-0>`. Don't run `npx shadcn add sheet` (banned by UI-SPEC line 121). Reuse the scaffold's div structure.
- **[MEDIUM]** **Dark mode accents.** UI-SPEC: no `dark:bg-*` on chrome (card/border/body); YES `dark:` on emerald/amber/red/indigo. Scaffold lines 264-267, 303, 319-321 show the correct pattern — preserve it in the rewrite.
- **[MEDIUM]** **Onboarding step 3 save cannot be atomic.** Supabase REST doesn't expose transactions. If `users.update` succeeds then `wishlist.insert` fails, user is marked onboarded with no wishlist → empty state. Acceptable per UI-SPEC skip flow (user could have skipped anyway). Plan must not promise "atomic single transaction" — CONTEXT.md Code Insights §Integration Points mentions "Single-transaction save" — this is aspirational, not achievable. Use sequential + toast the wishlist error without rolling back the onboarding update.
- **[LOW]** **`components.json` uses `new-york` style.** Future `shadcn add` (banned in P7 but may happen in P8+) must use that preset.
- **[LOW]** **Biome strict mode will flag unused imports from the scaffold rewrite.** Run `pnpm lint --apply` after rewrite.
- **[LOW]** **React Query `refetchOnWindowFocus` is off by default in some React Query configs.** Check `src/app/providers.tsx` or equivalent — ensure it's ON per D-09 (30s staleTime + refocus refetch). If default config not present, set it as hook-level option in `useWishlists` and `useListingsSnapshot`.

## Open Questions

None. All 15 CONTEXT decisions are locked; UI-SPEC is approved; the three critical adapter findings (FIPE GET, engine signature, soft delete) are facts — resolved by explicit tasks in the plan, not open questions.

## Sources

### Primary (HIGH confidence)

- `C:\Users\pc\auto-agent\CLAUDE.md` — project stack constraints + pivot notice — [VERIFIED: file read]
- `C:\Users\pc\auto-agent\.planning\phases\07-wishlist-ui\07-CONTEXT.md` — 15 locked decisions — [VERIFIED: file read]
- `C:\Users\pc\auto-agent\.planning\phases\07-wishlist-ui\07-UI-SPEC.md` — approved design contract 6/6 — [VERIFIED: file read]
- `C:\Users\pc\auto-agent\.planning\phases\07-wishlist-ui\07-PHASE-SEED.md` — original scope — [VERIFIED: file read]
- `C:\Users\pc\auto-agent\.planning\phases\07-wishlist-ui\07-DISCUSSION-LOG.md` — audit trail of alternatives — [VERIFIED: file read]
- `src/components/v3/modules/WishlistModule.tsx` — Phase 5 scaffold being rewritten — [VERIFIED: all 722 lines read]
- `src/lib/supabase/hooks/useWishlists.ts` — Phase 6 hook contract — [VERIFIED: all 155 lines read]
- `src/types/database.ts` — `DbWishlist`, `DbListing`, `WishlistStatus`, `FuelType`, `Transmission` types — [VERIFIED: file read, §wishlists lines 78-118 confirmed; `status` enum confirms `"archived"` is a valid value]
- `src/lib/matching/engine.ts` — actual signature `matchListingToWishlists(listing, wishlists[])` — [VERIFIED: file read, critical finding on signature mismatch]
- `src/lib/matching/engine.test.ts` — 23 tests, fixtures shape — [VERIFIED: first 100 lines read]
- `src/app/api/fipe/route.ts` — POST-only route, NO GET endpoint — [VERIFIED: all 201 lines read, critical gap]
- `src/components/forms/LocalidadePicker.tsx` — composition pattern for wrapper — [VERIFIED: file read]
- `src/app/app/onboarding/page.tsx` — 2-step wizard, step 3 integration point at handleStep2 line 76 — [VERIFIED: file read]
- `src/components/v3/Sidebar.tsx` — exact D-15 change locations lines 41-52 — [VERIFIED: file read]
- `src/components/ui/form.tsx` — shadcn form primitives available — [VERIFIED: file read]
- `src/lib/schemas/listing.ts` — canonical Zod schema pattern in this repo — [VERIFIED: file read]
- `src/lib/brasil/localidades.ts` — `UFS`, `cidadesDoUf`, `cidadeExisteNoUf` — [VERIFIED: file read]
- `src/lib/stores/app.ts` — `LocalWishlist` + `WishlistInput` types to be removed — [VERIFIED: file head read]
- `vitest.config.mts` + `vitest.setup.ts` — test infra already present — [VERIFIED: both read]
- `package.json` — all dependencies present — [VERIFIED: file read]
- `components.json` — `new-york` preset, slate, cssVariables, lucide — [VERIFIED: file read]
- `scripts/seed-dev.ts` — tsx script + env pattern (canonical for `sync-fipe-brands.ts`) — [VERIFIED: head read]
- `.planning/phases/06-supabase-integration/VERIFICATION.md` — Phase 6 deliverables + test counts — [CITED via grep matches]
- `.planning/PROJECT.md` — stack, pivot context — [VERIFIED: file read]
- `.planning/ROADMAP.md` §Phase 7 — goal + key deliverables — [VERIFIED: file read]
- `.planning/STATE.md` — current project state — [VERIFIED: file read]
- `.planning/PIVOT-3.md` — foundation-first order — [VERIFIED: file read]
- `.planning/config.json` — `nyquist_validation: true` confirmed — [VERIFIED: file read]

### Secondary (MEDIUM confidence)

- [CITED: https://ui.shadcn.com/docs/components/form] — shadcn form + RHF + zod canonical pattern
- [CITED: https://ui.shadcn.com/docs/components/alert-dialog] — destructive dialog pattern
- [CITED: https://tanstack.com/query/latest/docs/framework/react/guides/caching] — staleTime: Infinity for session-stable server state

### Tertiary (LOW confidence)

- [ASSUMED: Node 22 runtime based on `@types/node: ^22.0.0`] — exact Node version not verified against CI config
- [ASSUMED: Parallelum `/marcas` returns ~300 brands; top 60 by name frequency is sufficient] — need manual sanity check when script runs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep version confirmed against `package.json`
- Architecture: HIGH — all integration points verified at file:line level; 3 critical gaps flagged
- Pitfalls: HIGH — gaps were found during research (not inferred); matching engine signature verified by reading file; hard-delete verified by reading hook; missing GET endpoint verified by grep
- Validation architecture: HIGH — test infra already exists and works (23 tests passing in matching engine confirms vitest+jsdom stack is functional)

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days for stable constraints); CONTEXT decisions locked — revalidate only if UI-SPEC amended

---

## RESEARCH COMPLETE
