---
phase: 07-wishlist-ui
doc_type: patterns-map
created: 2026-04-23
status: ready-for-planning
---

# Phase 7 — Wishlist UI — Patterns Map

**Mapped:** 2026-04-23
**Files analyzed:** 12 new source + 13 new test + 4 modified source + 2 modified test = **31 files**
**Analogs found:** 29 / 31 (two test files — `fipe-brands-snapshot.test.ts` and `preview-listings.test.ts` — have no in-repo analog and follow a simple "parse + assert shape" skeleton)

## Overview

Phase 7 executes in **4 dependency layers**:

1. **Schemas + mocks + FIPE snapshot infra** (schema, mock listings, brands JSON, sync script) — zero coupling, fully parallel.
2. **Field primitives** (FipeBrandCombobox, FipeModelCombobox, BrlCurrencyInput, KmInput, YearRangeField, LocalidadeMultiPicker, useListingsSnapshot hook) — depend only on Layer 1.
3. **Composition** (WishlistPreviewPane, WishlistFormSheet) — consume Layer 2 primitives.
4. **Integration** (WishlistModule rewrite, Sidebar rename, Onboarding step 3, `useWishlists` soft-delete patch, `/api/fipe` GET branches) — closes the loop.

**Landmines carried from RESEARCH.md (every excerpt below respects these):**

- **[L1]** `matchListingToWishlists(listing, wishlists[])` is the real signature, not `scoreListings(rules, listings)`. Preview pane inverts loop: per-listing → single-wishlist array → count truthy results. See `src/lib/matching/engine.ts:161-165`.
- **[L2]** Engine short-circuits at `engine.ts:169-170` on `listing.status !== "active"` and `seller_type !== "PF"` when `enforcePfOnly` is true. Preview call passes `enforcePfOnly: false`.
- **[L3]** `useDeleteWishlist` at `useWishlists.ts:125-134` currently hard-deletes — must become `update({status:"archived"})`. Hook test at `useWishlists.test.tsx:18` has `delete: vi.fn()` in mockFrom — update to test `update` call.
- **[L4]** `/api/fipe/route.ts` is POST-only. `scripts/sync-fipe-brands.ts` and `FipeModelCombobox` need a NEW `GET` branch on the same route, branching on `searchParams.type`.
- **[L5]** CONTEXT.md says "SWR" (D-04) — IGNORE; repo uses `@tanstack/react-query` exclusively.
- **[L6]** No `shadcn/ui/sheet.tsx` exists. `npx shadcn add` is banned (UI-SPEC line 121). Reuse scaffold's custom `<aside fixed inset-y-0 right-0>` at `WishlistModule.tsx:419-421`.
- **[L7]** `useCreateWishlist` is NOT optimistic despite CONTEXT.md claim — it's `onSuccess: invalidateQueries` (`useWishlists.ts:67-69`). Accept 200-500ms gap; drawer-close + toast is primary feedback.

---

## Layer 1 — Schemas + Mocks + FIPE Snapshot Infra

### `src/lib/schemas/wishlist.ts` (NEW)

- **Analog:** `src/lib/schemas/listing.ts:1-43` (canonical repo Zod pattern)
- **Role in data flow:** authoritative Zod schema — consumed by RHF `zodResolver` in WishlistFormSheet AND by the `formValuesToPendingWishlist` adapter in WishlistPreviewPane.

**Excerpt from analog (`listing.ts:1-18,43`):**

```typescript
import { z } from "zod";

const SAFE_TEXT = /^[^<>{}]*$/;

export const listingSchema = z.object({
  marca: z
    .string()
    .min(1, "Marca é obrigatória")
    .max(100, "Marca: máximo 100 caracteres")
    .regex(SAFE_TEXT, "Marca: contém caracteres inválidos")
    .refine((s) => !s.includes("\n\n"), "Marca: contém caracteres inválidos"),
  // ...
  ano: z.number().int().min(1900, "Ano deve ser >= 1900").max(2100, "Ano deve ser <= 2100"),
  km: z.number().int().min(0, "KM não pode ser negativo").max(2_000_000, "KM muito alto"),
});

export type Listing = z.infer<typeof listingSchema>;
```

**Replicate:**
- `import { z } from "zod"` — exact import style.
- `SAFE_TEXT` regex + `.refine((s) => !s.includes("\n\n"))` double-newline guard on every user-free-text string field (`name`, `brand`, `model`, `trim`).
- `z.number().int().min().max()` chain on numeric fields.
- `export type X = z.infer<typeof xSchema>` at the end.

**Diverge:**
- Add `export type Reais = number;` documentative alias above the schema (D-06).
- Use `z.enum([...])` for `fuel_type` + `transmission` (per anti-pattern L4 RESEARCH.md:503). Enums MUST mirror `FuelType` / `Transmission` from `src/types/database.ts:43-44`.
- All numeric fields are `.nullable().optional().default(null)` — form must accept empty.
- `name` is `.string().max(120).optional().default("")` — auto-generated on submit.
- Cross-field `.refine((v) => v.year_min == null || v.year_max == null || v.year_min <= v.year_max, { message: "Ano mínimo não pode ser maior que o máximo", path: ["year_min"] })`.
- Arrays `region_uf`/`region_cities` as `.array(z.string()).default([])`.

**Canonical schema shape (from RESEARCH.md:291-321):**

```typescript
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

---

### `src/lib/schemas/wishlist.test.ts` (NEW)

- **Analog:** `src/lib/schemas/listing.test.ts:1-89`
- **Role in data flow:** pure unit coverage of schema branches (D-11).

**Excerpt (`listing.test.ts:1-43`):**

```typescript
import { describe, expect, it } from "vitest";
import { listingSchema } from "./listing";

const validListing = {
  marca: "Volkswagen",
  modelo: "Gol 1.6",
  ano: 2020,
  km: 45000,
  precoPedido: 52000,
  cidade: "São Paulo",
  diasOnline: 30,
  reducoes: 2,
};

describe("listingSchema", () => {
  it("accepts a valid listing", () => {
    expect(listingSchema.safeParse(validListing).success).toBe(true);
  });

  it("rejects marca containing <", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "VW <script>" });
    expect(r.success).toBe(false);
  });

  it("rejects empty marca", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "" });
    expect(r.success).toBe(false);
  });
  // ... repeats for every edge
});
```

**Replicate:**
- `import { describe, expect, it } from "vitest"`.
- Top-level `validWishlist` constant with all fields filled (name + brand + model + years + km + price + arrays).
- One `describe` block with one `it(...)` per edge case. No RTL/jsdom — pure parse tests.

**Diverge:**
- Cover: (a) full valid object; (b) valid with all optionals null/empty; (c) brand empty → fail; (d) model empty → fail; (e) `year_min > year_max` → fail with message containing "não pode ser maior"; (f) invalid fuel enum like `"etanol"` → fail; (g) negative km → fail; (h) BRL over 5_000_000 → fail; (i) double-newline injection in `name` → fail.

---

### `src/lib/mock-data/preview-listings.ts` (NEW)

- **Analog:** `src/lib/mock-data/v3.ts:1-80` (existing Phase 5 mocks — **structurally only**; v3.ts types are `Opportunity` not `DbListing`, so mocks are new in type).
- **Role in data flow:** hardcoded `DbListing[]` array (20 entries) served by `useListingsSnapshot` when Supabase returns `[]`. Consumed by `WishlistPreviewPane` for the matching engine.

**Excerpt from analog (`v3.ts:1-6` — doc header pattern):**

```typescript
/**
 * v3 Product Shell mock data — extracted verbatim from AutoAgent_UX_Prototype_v3.jsx.
 * Types are inferred/declared strict; this file is the single source for Wave 0/1/2
 * screen fixtures until real APIs land (Apify, FIPE persistence, etc.).
 */

export type PlanKey = "starter" | "premium" | "enterprise";
```

**Target shape (`DbListing` row from `src/types/database.ts:121-150`):**

```typescript
Row: {
  id: string;
  source: string;                      // "WebMotors" | "OLX" | ...
  source_listing_id: string;
  fingerprint: string;
  brand: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  km: number | null;
  price: number | null;                // integer reais
  fipe: number | null;
  savings_vs_fipe: number | null;
  savings_pct: number | null;
  seller_type: SellerType | null;      // "PF" | "PJ"
  seller_location: string | null;
  seller_uf: string | null;
  seller_city: string | null;
  listing_url: string | null;
  photo_url: string | null;
  days_online: number | null;
  reductions: number | null;
  attributes: Record<string, unknown>; // includes { armored?, accept_trade?, transmission?, fuel? }
  motivation_signals: Record<string, unknown>;
  first_seen_at: string;
  last_scraped_at: string;
  status: ListingStatus;               // "active" — required by engine short-circuit L2
  created_at: string;
  updated_at: string;
};
```

**Replicate:**
- File-top JSDoc header explaining purpose + non-production lineage.
- Export as `export const PREVIEW_LISTINGS: DbListing[] = [ ... ]`.
- Every entry has `status: "active"` AND `seller_type: "PF"` (landmine L2 — even though preview passes `enforcePfOnly: false`, keep PF for consistency with future prod enforcement).

**Diverge:**
- Curate 20 entries from the top BR model list in CONTEXT.md:156 → `Civic, Corolla, Onix, HB20, Compass, Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta, Argo, Mobi, Virtus, Nivus, Kwid`.
- `brand` uses canonical spelling: `Honda`, `Toyota`, `Chevrolet`, `Hyundai`, `Jeep`, `Ford`, `Volkswagen`, `Fiat`, `Renault` (landmine engine fuzzy threshold 0.85 — landmine L6 research).
- `price`: 60_000-120_000 integer reais. `km`: 15_000-90_000. `year`: 2018-2023.
- `seller_uf` varied across `["SP","RJ","MG","PR","RS"]`; `seller_city` matches UF.
- `photo_url`: Unsplash CDN URLs OR `null` (card has placeholder).
- `attributes` may contain `{ transmission: "automático", fuel: "flex", armored: false, accept_trade: true|false }` — engine reads these.

---

### `src/lib/mock-data/preview-listings.test.ts` (NEW)

- **Analog:** *none in repo.* New pattern — shape verification.
- **Role in data flow:** guard rail: ensures the array parses as `DbListing[]`, has ≥20 entries, covers ≥3 UFs, and every entry has `status: "active"`.

**Skeleton:**

```typescript
import { describe, expect, it } from "vitest";
import { PREVIEW_LISTINGS } from "./preview-listings";

describe("PREVIEW_LISTINGS", () => {
  it("has at least 20 entries", () => {
    expect(PREVIEW_LISTINGS.length).toBeGreaterThanOrEqual(20);
  });
  it("every entry has status='active' (engine short-circuit guard)", () => {
    for (const l of PREVIEW_LISTINGS) expect(l.status).toBe("active");
  });
  it("every entry has seller_type='PF'", () => {
    for (const l of PREVIEW_LISTINGS) expect(l.seller_type).toBe("PF");
  });
  it("covers at least 3 distinct UFs", () => {
    const ufs = new Set(PREVIEW_LISTINGS.map((l) => l.seller_uf).filter(Boolean));
    expect(ufs.size).toBeGreaterThanOrEqual(3);
  });
  it("prices fall within 30k–250k reais", () => {
    for (const l of PREVIEW_LISTINGS) {
      if (l.price != null) {
        expect(l.price).toBeGreaterThanOrEqual(30_000);
        expect(l.price).toBeLessThanOrEqual(250_000);
      }
    }
  });
});
```

---

### `src/lib/brasil/fipe-brands-snapshot.json` (NEW)

- **Analog:** *none in repo.* JSON asset generated by script.
- **Role in data flow:** static import in `FipeBrandCombobox` → instant paint (D-03).

**Target shape:**

```json
{
  "generated_at": "2026-04-23T12:34:56.000Z",
  "source": "parallelum.com.br/fipe/api/v1/carros/marcas",
  "brands": [
    { "codigo": "21", "nome": "Chevrolet" },
    { "codigo": "59", "nome": "VW - VolksWagen" },
    { "codigo": "23", "nome": "Fiat" }
  ]
}
```

**Diverge:** 50-60 entries after the sync script filters Parallelum's ~90 entries to top BR market-share. Raw Parallelum `{codigo, nome}` shape matches `marcaSchema` at `src/lib/schemas/fipe.ts`.

---

### `src/lib/brasil/fipe-brands-snapshot.test.ts` (NEW)

- **Analog:** *none in repo.* Static JSON shape verification.
- **Role in data flow:** CI guard — fails if snapshot file is malformed or empty.

**Skeleton:**

```typescript
import { describe, expect, it } from "vitest";
import snapshot from "./fipe-brands-snapshot.json";

describe("fipe-brands-snapshot", () => {
  it("has a generated_at timestamp", () => {
    expect(typeof snapshot.generated_at).toBe("string");
    expect(Number.isNaN(Date.parse(snapshot.generated_at))).toBe(false);
  });
  it("contains at least 50 brands", () => {
    expect(snapshot.brands.length).toBeGreaterThanOrEqual(50);
  });
  it("every entry has codigo + nome as strings", () => {
    for (const b of snapshot.brands) {
      expect(typeof b.codigo).toBe("string");
      expect(typeof b.nome).toBe("string");
      expect(b.nome.length).toBeGreaterThan(0);
    }
  });
});
```

---

### `scripts/sync-fipe-brands.ts` (NEW)

- **Analog:** `scripts/seed-dev.ts:1-95` (tsx script + dotenv loader + main IIFE)
- **Role in data flow:** manual one-off — hits Parallelum `/marcas`, writes snapshot JSON. Not invoked in build/CI.

**Excerpt from analog (`seed-dev.ts:1-52`):**

```typescript
#!/usr/bin/env tsx
/**
 * seed-dev.ts — idempotent seed for local Supabase.
 *
 * Usage:
 *   pnpm seed
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY — required (service role bypasses RLS)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lightweight .env.local loader — avoids pulling dotenv just for a script.
function loadDotEnv(): void {
  try {
    const path = resolve(process.cwd(), ".env.local");
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const valRaw = line.slice(eq + 1).trim();
      const val = valRaw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local not found — fall back to pre-set env vars
  }
}

loadDotEnv();
```

**Replicate:**
- `#!/usr/bin/env tsx` shebang.
- Top JSDoc block: Usage + Env requirements.
- `loadDotEnv()` helper copied verbatim (**not** needed for public Parallelum but kept to stay consistent with other scripts).
- Use `writeFileSync` from `node:fs` + `resolve(process.cwd(), "src/lib/brasil/fipe-brands-snapshot.json")` to write.

**Diverge:**
- No `@supabase/supabase-js` import.
- `fetch` (native in Node 22) to `https://parallelum.com.br/fipe/api/v1/carros/marcas`.
- Filter to top ~60 brands (curated list by market share — or keep all ~90 and let combobox limit display).
- Write `{ generated_at, source, brands: [...] }` shape.
- `pnpm tsx scripts/sync-fipe-brands.ts` invocation (add to `package.json` scripts as `"sync:fipe": "tsx scripts/sync-fipe-brands.ts"` — optional).

---

## Layer 2 — Field Primitives + Hook

### `src/lib/supabase/hooks/useListingsSnapshot.ts` (NEW)

- **Analog:** `src/lib/supabase/hooks/useWishlists.ts:23-49` (canonical React Query hook pattern).
- **Role in data flow:** pure React Query hook — `DbListing[]` from Supabase, falls back to `PREVIEW_LISTINGS` when result is `[]` (D-01).

**Excerpt from analog (`useWishlists.ts:17-49`):**

```typescript
"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbWishlist, Tables } from "@/types/database";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

const WISHLISTS_KEY = ["supabase", "wishlists"] as const;

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
    queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"],
    queryFn: () => fetchWishlists(user?.id ?? ""),
    enabled,
    initialData: enabled ? undefined : [],
  });
}
```

**Replicate:**
- `"use client"` at top.
- Tuple-const key `const LISTINGS_SNAPSHOT_KEY = ["supabase", "listings-snapshot"] as const;`
- Key shape `[...LISTINGS_SNAPSHOT_KEY, user?.id ?? "anon"]` (landmine Pitfall 2, RESEARCH.md:576-583).
- `useSupabaseUser` + `isSupabaseConfigured` gate.
- `initialData: enabled ? undefined : []` degradation.
- Exact `getSupabaseBrowser()` + error throw pattern.

**Diverge:**
- Query: `.from("listings").select("*").limit(500).order("created_at", { ascending: false })`. No `eq("user_id")` — listings are global (not user-scoped).
- After the query, inside `queryFn`: `return data && data.length > 0 ? data : PREVIEW_LISTINGS;` — silent mock fallback (D-01).
- `staleTime: 60_000` (60s — per UI-SPEC §Component Inventory line 185).
- Return type annotation `UseQueryResult<DbListing[]>`.
- Filter `.neq("status", "archived")` NOT needed — listings have `ListingStatus`, not archived semantics.

---

### `src/lib/supabase/hooks/useListingsSnapshot.test.tsx` (NEW)

- **Analog:** `src/lib/supabase/hooks/useWishlists.test.tsx:1-102` (canonical harness).
- **Role in data flow:** unit coverage of hook — mock Supabase chain, assert fallback behavior.

**Excerpt from analog — the full mock chain pattern (`useWishlists.test.tsx:1-48`):**

```typescript
import type { DbWishlist } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────

const mockOrder = vi.fn();
const mockEq2 = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ order: mockOrder, eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1, order: mockOrder }));
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    from: mockFrom,
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "u@x" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

import { useWishlists } from "./useWishlists";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}
```

**Replicate:**
- Full mock chain — `mockOrder`/`mockEq`/`mockSelect`/`mockInsert`/`mockFrom` exactly.
- `vi.mock("@/lib/supabase/client", ...)` with `getUser` + `onAuthStateChange`.
- `vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }))`.
- `makeWrapper()` returning QueryClientProvider with `retry: false, staleTime: 0, gcTime: 0` defaults.
- `beforeEach(() => vi.clearAllMocks())`.
- `mockOrder.mockResolvedValue({ data: [...], error: null })` to simulate DB state.

**Diverge:**
- Import `PREVIEW_LISTINGS` from mock data to assert fallback equals mocks.
- Chain shape differs: `useListingsSnapshot` calls `.select().limit(500).order(...)` not `.eq().order(...)`. Update mock wiring: `const mockLimit = vi.fn(() => ({ order: mockOrder })); const mockSelect = vi.fn(() => ({ limit: mockLimit }));`.
- **Three key tests:**
  1. DB returns data → hook returns that data (not mocks).
  2. DB returns `[]` → hook returns `PREVIEW_LISTINGS` (D-01 fallback).
  3. DB errors → hook enters error state.

---

### `src/components/forms/FipeBrandCombobox.tsx` (NEW)

- **Analog:** `src/components/forms/LocalidadePicker.tsx:1-154` (popover+command combobox pattern).
- **Role in data flow:** form primitive emitting canonical brand string to RHF `Controller`/`FormField`; reads from static snapshot JSON.

**Excerpt from analog (`LocalidadePicker.tsx:94-137`):**

```typescript
<Popover open={open} onOpenChange={(next) => !cidadeDisabled && setOpen(next)}>
  <PopoverTrigger asChild>
    <Button
      type="button"
      variant="outline"
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={cidadeDisabled}
      className="mt-1.5 h-11 w-full justify-between bg-white font-normal disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
    >
      <span className={cn(!cidade && "text-slate-400")}>
        {cidade || (uf ? "Selecione ou digite a cidade" : "Selecione a UF primeiro")}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
    <Command filter={(value, search) => (norm(value).includes(norm(search)) ? 1 : 0)}>
      <CommandInput placeholder="Digite pra filtrar..." className="h-10" />
      <CommandList>
        <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
        <CommandGroup>
          {cidades.map((c) => (
            <CommandItem
              key={c}
              value={c}
              onSelect={(v) => {
                onCidadeChange(v);
                setOpen(false);
              }}
            >
              <Check className={cn("mr-2 h-4 w-4", cidade === c ? "opacity-100" : "opacity-0")} />
              {c}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

**Accent-insensitive filter (`LocalidadePicker.tsx:40-46,113`):**

```typescript
function norm(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

<Command filter={(value, search) => (norm(value).includes(norm(search)) ? 1 : 0)}>
```

**Replicate:**
- `"use client"` + same imports (`Command`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList` from `@/components/ui/command`; `Popover*` from `@/components/ui/popover`).
- `norm()` helper — copy verbatim.
- Trigger is a `Button variant="outline"` with `ChevronsUpDown` icon, `h-11`, `w-full`, `justify-between`.
- `<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">` — locks width to trigger.
- `CommandItem` with `value`, `onSelect`, and `Check` icon with conditional opacity.
- `ChoiceChip`-like visual: text slate-400 when placeholder, slate-900 when value.

**Diverge:**
- Props: `{ value: string; onChange: (next: string) => void; disabled?: boolean; }` — RHF controller-compatible.
- Data source: `import brandsSnapshot from "@/lib/brasil/fipe-brands-snapshot.json"` — static.
- **Fallback toggle:** internal `const [fallbackToText, setFallbackToText] = useState(false);` — when `true`, render `<Input>` free-text instead of combobox (D-05, RESEARCH.md:357-360). NOTE: for the **brand** combobox, fallback is triggered by a prop from the parent (the sync script failure lives elsewhere); for now brand always uses static snapshot — fallback is rare but included as prop `fallbackToText?: boolean` for symmetry.
- Placeholder: `"Selecione a marca"`. Empty: `"Nenhuma marca encontrada"`.
- When user selects, call `onChange(brand.nome)` (store canonical name, not codigo).

---

### `src/components/forms/FipeBrandCombobox.test.tsx` (NEW)

- **Analog:** *none directly* — extends combobox test idiom; no existing LocalidadePicker test file.
- **Role in data flow:** integration tests for popover+command+RHF integration.

**Skeleton — testing shadcn `popover`+`command` + RHF:**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { FipeBrandCombobox } from "./FipeBrandCombobox";

// Harness: wraps combobox in RHF like production does
function Harness({ onSubmit }: { onSubmit: (v: { brand: string }) => void }) {
  const form = useForm({ defaultValues: { brand: "" } });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Controller
          control={form.control}
          name="brand"
          render={({ field }) => (
            <FipeBrandCombobox value={field.value} onChange={field.onChange} />
          )}
        />
        <button type="submit">save</button>
      </form>
    </FormProvider>
  );
}

describe("FipeBrandCombobox", () => {
  it("opens popover on trigger click and lists brands", async () => { /* ... */ });
  it("filters accent-insensitively (chev → Chevrolet)", async () => { /* ... */ });
  it("emits selected brand name via onChange", async () => { /* ... */ });
  it("renders <Input> free-text when fallbackToText prop is true", async () => { /* ... */ });
});
```

**Replicate:**
- Vitest + RTL import shape (see Cross-Cutting §Test Harness).
- `renderHook`/`render` pattern from `useWishlists.test.tsx:44-48`.

---

### `src/components/forms/FipeModelCombobox.tsx` (NEW)

- **Analog:** `FipeBrandCombobox` (same combobox shape) + `useWishlists.ts:39-49` for the React Query usage.
- **Role in data flow:** combobox backed by React Query → `GET /api/fipe?type=models&brand=X` (new route, landmine L4). Infinite cache by brand (D-04). Silent free-text fallback on 5xx/timeout (D-05).

**React Query fetch pattern (from RESEARCH.md:389-416):**

```typescript
const [fallbackToText, setFallbackToText] = useState(false);

const { data, isError, isLoading } = useQuery({
  queryKey: ["fipe", "models", brand],
  queryFn: async ({ signal: rqSignal }) => {
    const ctrl = new AbortController();
    // combine react-query's abort with our 5s timeout
    const onRqAbort = () => ctrl.abort();
    rqSignal.addEventListener("abort", onRqAbort);
    const t = setTimeout(() => ctrl.abort(), 5000);   // D-05: 5s timeout
    try {
      const res = await fetch(`/api/fipe?type=models&brand=${encodeURIComponent(brand)}`, {
        signal: ctrl.signal,
      });
      if (res.status >= 500 || !res.ok) throw new Error("fipe_upstream");
      return await res.json() as { models: Array<{ codigo: string; nome: string }> };
    } finally {
      clearTimeout(t);
      rqSignal.removeEventListener("abort", onRqAbort);
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

**Replicate:**
- Exact `useQuery` config (key, enabled, staleTime: Infinity, retry: false, gcTime).
- The `useEffect` triggering `toast.info` + `setFallbackToText(true)` on `isError`.
- `sonner` `toast.info` import from `sonner`.
- Combobox shell same as FipeBrandCombobox.

**Diverge from FipeBrandCombobox:**
- Loading state inside Command: `"Carregando modelos..."` (State Matrix:281).
- Empty state: `"Nenhum modelo encontrado"`.
- Trigger disabled when `!brand` — placeholder: `"Selecione a marca primeiro"`.
- When brand changes, React Query automatically switches key → old data scope-gone; form field reset handled by parent (WishlistFormSheet clears `model` on brand change).

---

### `src/components/forms/FipeModelCombobox.test.tsx` (NEW)

- **Analog:** `useWishlists.test.tsx` (fetch mocking + QueryClient wrapper) + `src/app/api/fipe/route.test.ts:14-26` (vi.stubGlobal("fetch", ...) pattern).
- **Role in data flow:** integration test covering D-05 fallback paths.

**Excerpt — `vi.stubGlobal` fetch mock (`route.test.ts:14-26`):**

```typescript
function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  resetRateLimitForTest();
  vi.unstubAllGlobals();
});

// Usage in test:
const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([...]));
vi.stubGlobal("fetch", fetchMock);
```

**Replicate:**
- `jsonResponse(body, init)` helper verbatim.
- `beforeEach(() => vi.unstubAllGlobals())`.
- Render harness with QueryClientProvider (from `useWishlists.test.tsx:44-48`).

**Diverge — three key tests:**
- 200 response: models render in CommandList.
- 500 response: fallback to `<Input>`, `toast.info` spy asserted.
- Timeout (mock `fetchMock.mockImplementation(() => new Promise(() => {}))` + `vi.useFakeTimers()` + `vi.advanceTimersByTime(5001)`): same fallback assertion.

---

### `src/components/forms/LocalidadeMultiPicker.tsx` (NEW)

- **Analog:** `src/components/forms/LocalidadePicker.tsx:48-154` (WRAP, NEVER FORK — per CONTEXT.md line 102) + RHF `useFieldArray` docs.
- **Role in data flow:** form primitive that reads/writes an array of `{uf: string; cidade: string}` tuples to RHF `useFieldArray`. Composes existing `LocalidadePicker` for the add-row input.

**Skeleton:**

```typescript
"use client";

import { LocalidadePicker } from "@/components/forms/LocalidadePicker";
import { Button } from "@/components/ui/button";
import { useFieldArray, useFormContext } from "react-hook-form";
import { X } from "lucide-react";
import { useState } from "react";

export function LocalidadeMultiPicker({ name }: { name: string }) {
  const { control } = useFormContext();
  // Note: form uses two separate arrays region_uf[] and region_cities[];
  // this picker maintains a parallel { uf, cidade }[] internal model but
  // synchronizes to the two RHF arrays on every change.
  const ufFieldArray = useFieldArray({ control, name: "region_uf" });
  const cityFieldArray = useFieldArray({ control, name: "region_cities" });
  const [draftUf, setDraftUf] = useState("");
  const [draftCidade, setDraftCidade] = useState("");

  const add = () => {
    if (!draftUf || !draftCidade) return;
    // Dedup check
    const idx = ufFieldArray.fields.findIndex(
      (_, i) => ufFieldArray.fields[i] === draftUf && cityFieldArray.fields[i] === draftCidade
    );
    if (idx >= 0) return;
    ufFieldArray.append(draftUf);
    cityFieldArray.append(draftCidade);
    setDraftUf("");
    setDraftCidade("");
  };

  const remove = (i: number) => {
    ufFieldArray.remove(i);
    cityFieldArray.remove(i);
  };

  return (
    <div className="space-y-3">
      {/* Chips for added tuples */}
      <div className="flex flex-wrap gap-2">
        {ufFieldArray.fields.map((_, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
          >
            {/* cityFieldArray.fields[i] / ufFieldArray.fields[i] */}
            <button type="button" onClick={() => remove(i)} aria-label="Remover">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      {/* Add row */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <LocalidadePicker
            uf={draftUf}
            cidade={draftCidade}
            onUfChange={setDraftUf}
            onCidadeChange={setDraftCidade}
          />
        </div>
        <Button type="button" onClick={add} disabled={!draftUf || !draftCidade}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}
```

**Replicate:**
- `import { LocalidadePicker } from "@/components/forms/LocalidadePicker"` — NEVER fork, always compose.
- Chip visual style from `WishlistModule.tsx:359-366` (`Chip` internal component): `rounded-md px-1.5 py-0.5 text-[11px] capitalize ring-1 ring-inset bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700`.

**Diverge:**
- Two parallel RHF field arrays (`region_uf` + `region_cities`) to match schema + hook shape — OR use a single internal state `[{uf, cidade}][]` synced on change (Claude's Discretion in CONTEXT.md:68-70). Planner picks — `useFieldArray` is recommended (RESEARCH.md:67).
- Empty state copy: `"Nenhuma região — aceita qualquer"` (State Matrix:282).
- Dedup rule: don't append if `{draftUf, draftCidade}` already exists.

---

### `src/components/forms/LocalidadeMultiPicker.test.tsx` (NEW)

- **Analog:** `useWishlists.test.tsx` harness + custom.
- **Role in data flow:** add/remove tuple flow, dedup, field-array integration.

**Key tests:**
1. Initial render → empty state copy visible.
2. Select UF+cidade → click Adicionar → chip appears.
3. Click X on chip → chip removed.
4. Attempt duplicate → no-op (fields array length unchanged).

Harness wraps in `FormProvider` with `useForm({ defaultValues: { region_uf: [], region_cities: [] } })`.

---

### `src/components/forms/BrlCurrencyInput.tsx` (NEW)

- **Analog:** `src/app/app/onboarding/page.tsx:34-42` (`maskCnpj` mask pattern) + `src/components/v3/modules/WishlistModule.tsx:82-85` (`formatBrl` display formatter).
- **Role in data flow:** form primitive emitting **integer reais** (D-06) to RHF controller; displays `R$ 130.000`. Core test surface for D-06.

**Excerpt from analog — CNPJ mask pattern (`onboarding/page.tsx:34-42`):**

```typescript
function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

<Input
  id="cnpj"
  type="text"
  inputMode="numeric"
  value={cnpj}
  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
  placeholder="00.000.000/0000-00"
  className="mt-1.5 h-11 bg-white dark:bg-slate-950"
  maxLength={18}
/>
```

**Excerpt from analog — BRL formatter (`WishlistModule.tsx:82-85`):**

```typescript
function formatBrl(v: number | null): string {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
```

**Replicate:**
- `inputMode="numeric"` prop on `<Input>`.
- `.replace(/\D/g, "")` to strip non-digits from user input.
- `.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })` for display.
- `h-11 bg-white dark:bg-slate-950` classes.

**Diverge:**
- Props: `{ value: number | null; onChange: (next: number | null) => void; placeholder?: string; disabled?: boolean; }`.
- Display: if `value == null` → show empty; else `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`.
- Parse: strip `/\D/g` → if length 0 → `onChange(null)`; else `onChange(parseInt(digits, 10))`.
- Internal display state is derived, not stored.

---

### `src/components/forms/BrlCurrencyInput.test.tsx` (NEW)

- **Analog:** none direct — pure controlled input tests.
- **Role in data flow:** covers D-06 round-trip.

**Key tests:**
1. Type "130000" → `onChange` called with `130000` (integer). Display shows `R$ 130.000`.
2. Paste `"abc130.000"` → non-digits stripped → `onChange(130000)`.
3. Clear input (delete all) → `onChange(null)`.
4. Receives `value={130000}` prop → display shows `R$ 130.000`.
5. `value={null}` → display empty.

---

### `src/components/forms/KmInput.tsx` (NEW)

- **Analog:** `BrlCurrencyInput.tsx` (just built) — simpler twin.
- **Role in data flow:** form primitive emitting integer km to RHF; displays `80.000 km` (pt-BR thousands, no R$ prefix).

**Diverge from BrlCurrencyInput:**
- No `R$` prefix.
- Suffix "km" inside the Label or as a right-aligned icon/text (State Matrix:279).
- Otherwise identical (strip `\D`, `toLocaleString("pt-BR")`, integer, emit `null` on empty).

---

### `src/components/forms/KmInput.test.tsx` (NEW)

Same structure as `BrlCurrencyInput.test.tsx`, with `km` framing. Tests: type `"80000"` → `80000`; display shows `80.000`; empty → `null`.

---

### `src/components/forms/YearRangeField.tsx` (NEW)

- **Analog:** Scaffold `WishlistModule.tsx:487-514` (year min/max pair pattern).
- **Role in data flow:** two `<Input type="number">` in `grid-cols-2` wired to `year_min` + `year_max`; cross-field Zod `.refine` from schema surfaces error via FormMessage.

**Excerpt from analog (`WishlistModule.tsx:487-514`):**

```typescript
<div className="grid grid-cols-2 gap-3">
  <Field label="Ano mínimo" htmlFor="wl-ymin">
    <Input
      id="wl-ymin"
      type="number"
      min={1990}
      max={CURRENT_YEAR}
      placeholder="2018"
      value={form.year_min ?? ""}
      onChange={(e) =>
        setForm({ ...form, year_min: e.target.value ? Number(e.target.value) : null })
      }
    />
  </Field>
  <Field label="Ano máximo" htmlFor="wl-ymax">
    <Input
      id="wl-ymax"
      type="number"
      min={1990}
      max={CURRENT_YEAR}
      placeholder={String(CURRENT_YEAR)}
      value={form.year_max ?? ""}
      onChange={(e) =>
        setForm({ ...form, year_max: e.target.value ? Number(e.target.value) : null })
      }
    />
  </Field>
</div>
```

**Replicate:**
- `grid grid-cols-2 gap-3` wrapper.
- `type="number"`, `min={1990}`, `max={CURRENT_YEAR}`.
- Empty-string ↔ null conversion logic: `e.target.value ? Number(e.target.value) : null`.

**Diverge:**
- Wire via RHF `Controller` or `useController` (see Cross-Cutting §RHF FormField template).
- Shared FormLabel "Ano" above the grid, not per-input.
- Cross-field error uses Zod `.refine` (in wishlist.ts) — displayed once via `FormMessage` for path `["year_min"]` (schema's refine path).
- Hint below: `"Deixe vazio para qualquer ano"` (UI-SPEC Copy §Field hint — year range).

---

### `src/components/forms/YearRangeField.test.tsx` (NEW)

Tests: enter min > max → Zod error "Ano mínimo não pode ser maior que o máximo" appears; clear either → error clears; leave both empty → valid.

---

### `src/components/forms/WishlistPreviewPane.tsx` (NEW)

- **Analog:** Scaffold has NO preview pane. This is a net-new component. Pattern comes from RESEARCH.md:420-471 + `matching/engine.ts:161-165` (signature).
- **Role in data flow:** reads RHF form state via `useWatch` → debounces 400ms → adapts via `formValuesToPendingWishlist` → runs pure `matchListingToWishlists` per listing → counts matches. Renders aria-live polite count + collapsible 3-card preview.

**Full excerpt from RESEARCH.md:430-468 (canonical shape):**

```typescript
function WishlistPreviewPane({ control }: { control: Control<WishlistFormValues> }) {
  const values = useWatch({ control });  // rerenders on any change, not once per field
  const [debounced, setDebounced] = useState(values);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(values), 400);
    return () => clearTimeout(t);
  }, [values]);

  const { data: snapshot = [] } = useListingsSnapshot();

  const count = useMemo(() => {
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

**Matching engine signature (`engine.ts:156-170` — LANDMINE L1 + L2):**

```typescript
export type MatchingOptions = {
  threshold?: number;
  enforcePfOnly?: boolean; // default true; skip PJ listings
};

export function matchListingToWishlists(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts: MatchingOptions = {},
): MatchResult[] {
  const enforcePf = opts.enforcePfOnly ?? true;

  // Short-circuit gates that kill the listing for every wishlist
  if (listing.status !== "active") return [];
  if (enforcePf && listing.seller_type !== "PF") return [];
  // ...
}
```

**Adapter (from RESEARCH.md:549-570 — mandatory):**

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

**Replicate:**
- `useWatch({ control })` — rerenders on any field change.
- Inline `useEffect + setTimeout` debounce (no `useDebounce` helper file — RESEARCH.md:500-502 anti-pattern).
- `useMemo` wraps the engine call with deps `[debounced, snapshot]`.
- Try/catch → return `null` on engine throw (State Matrix row "Preview pane" → Error: "Silent no-op if matchingEngine throws").
- `aria-live="polite"` on the root (UI-SPEC §a11y line 266).

**Diverge (from UI-SPEC):**
- Accent `text-[#4C46DC] font-semibold` ONLY on the count number (UI-SPEC §Color accent allowlist item 4 + §Specifics line 154).
- Collapsible "Ver exemplos ↓" button expanding to 3 mini cards (photo + title + price + km + UF, no CTAs).
- Loading state (count null + brand+model present): shadcn `Skeleton` 2 lines.

---

### `src/components/forms/WishlistPreviewPane.test.tsx` (NEW)

**Key tests:**
1. Valid wishlist (brand+model match mock data) → count > 0 renders.
2. Empty brand+model → count null → Skeleton shows.
3. Over-restrictive wishlist (e.g. `price_max: 1000`) → count === 0 → zero-match copy.
4. Debounce: rapid typing fires engine only once after 400ms (use `vi.useFakeTimers()`).
5. Engine throw → silent, renders zero-match fallback.
6. Adapter: `formValuesToPendingWishlist(empty)` returns `status: "active"` on the synthetic shape.

---

## Layer 3 — Composition

### `src/components/v3/modules/WishlistFormSheet.tsx` (NEW — rewrite of scaffold's internal `WishlistFormDrawer`)

- **Analog:** `src/components/v3/modules/WishlistModule.tsx:369-653` (`WishlistFormDrawer` internal component — the visual shell to preserve).
- **Role in data flow:** RHF `FormProvider` root — composes every Layer 2 primitive + WishlistPreviewPane + submit. Two DOM variants (desktop aside + mobile Dialog) per Pitfall 3 (RESEARCH.md:585-597).

**Excerpt from analog — sheet chrome (`WishlistModule.tsx:413-427, 638-651`):**

```typescript
return (
  <>
    <button
      type="button"
      aria-label="Fechar"
      onClick={onCancel}
      className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
    />
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 md:w-[560px]">
      <header className="flex items-center justify-between border-slate-200 border-b px-6 py-4 dark:border-slate-800">
        <h2 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* sections */}
      </div>
      <footer className="flex items-center justify-between gap-3 border-slate-200 border-t bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={handleSubmit}
          disabled={touched && !isValid}
          className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
        >
          Salvar wishlist
        </Button>
      </footer>
    </aside>
  </>
);
```

**Replicate — the chrome exactly:**
- `<aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 md:w-[560px]">`.
- Backdrop button with `aria-label="Fechar"`.
- Header + scrollable content + footer three-row layout.
- Footer button: `bg-[#4C46DC] text-white hover:bg-[#3f39c1]` — do NOT change these hex codes.
- Section headers (UI-SPEC Copy line 152-155): `Qual carro você quer?`, `Faixas aceitas`, `Combustível e câmbio`, `Blindagem e região`.

**Replicate — ChoiceChip primitive (`WishlistModule.tsx:699-720`):**

```typescript
function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1 font-medium text-xs ring-1 transition ${
        selected
          ? "bg-[#4C46DC] text-white ring-[#4C46DC]"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}
```

Extract to module scope (shared between WishlistModule + WishlistFormSheet). Add `aria-pressed={selected}` (UI-SPEC §a11y line 262).

**Diverge:**
- Replace local `useState<WishlistInput>` + `validate()` with `useForm<WishlistFormValues>({ resolver: zodResolver(wishlistSchema), mode: "onBlur" })` (RESEARCH.md:329-339).
- Wrap content in `<Form {...form}>` (`FormProvider`) + `<form onSubmit={form.handleSubmit(onSubmit)} noValidate>` (anti-pattern at RESEARCH.md:505-506).
- Each field: `<FormField control={form.control} name="brand" render={...} />` (see Cross-Cutting §RHF FormField template).
- On submit: if `name.trim() === ""`, call `summarize()` helper (extracted — see WishlistModule) to auto-fill `name`. Then `useCreateWishlist().mutateAsync(input)` or `useUpdateWishlist().mutateAsync({id, patch})`.
- Two DOM variants: `<div className="hidden md:block">{asideShell}</div>` + `<div className="md:hidden">{dialogShell}</div>`. Dialog uses shadcn `Dialog` primitive (already installed per UI-SPEC line 32).
- Include `WishlistPreviewPane` between form body and footer.
- Replace `UF_OPTIONS` chip group with `<LocalidadeMultiPicker name="region_uf" />`.

---

### `src/components/v3/modules/WishlistFormSheet.test.tsx` (NEW)

**Key tests (UI-SPEC form flow contracts):**
1. Submit happy path: fill brand+model → click Salvar → `useCreateWishlist.mutateAsync` called with correct input; sheet closes; toast.success fires.
2. Validation failure: brand empty → Salvar click → error message `"Informe a marca"` renders under field; mutation NOT called.
3. Save error: mutateAsync rejects → `toast.error` fires with `"Não foi possível salvar a wishlist. Verifique sua conexão e tente de novo."`; sheet stays open.
4. Cancel → onCancel called, sheet closes.
5. Edit mode: `initial` prop hydrates all fields.

Harness: QueryClientProvider + RHF. Mock `useCreateWishlist` and `useUpdateWishlist` hooks via `vi.mock`.

---

## Layer 4 — Integration

### `src/components/v3/modules/WishlistModule.tsx` (MODIFIED — full in-place rewrite)

- **Analog:** the existing file itself. Rewrite keeps the visual shell + helpers, swaps the data layer.
- **Role in data flow:** module root — renders module page + grid + empty state + AlertDialog; composes `WishlistFormSheet`.

**Lines to preserve verbatim:**
- `EmptyState` component (`WishlistModule.tsx:205-228`) — only change `"Sem wishlists ainda"` → `"Ainda sem wishlists"` (UI-SPEC Copy).
- `WishlistCard` (`230-329`) — unchanged.
- `Row` helper (`331-349`) — unchanged.
- `Chip` helper (`351-367`) — unchanged.
- `ChoiceChip` (`699-721`) — EXTRACT to shared module or keep internal + import from WishlistFormSheet.
- `formatBrl` (`82-85`) — keep, maybe export.
- `summarize` (`87-102`) — EXTRACT and extend per D-08. New signature: `export function summarize(w: DbWishlist): string` — returns `"{brand} {model} {year_min}+ {region_uf[0]}"` etc.

**Lines to replace:**

Line 6 (imports):
```typescript
// BEFORE
import { type LocalWishlist, type WishlistInput, useAppStore } from "@/lib/stores/app";
// AFTER
import {
  useWishlists,
  useCreateWishlist,
  useUpdateWishlist,
  useDeleteWishlist,
} from "@/lib/supabase/hooks/useWishlists";
import type { DbWishlist } from "@/types/database";
```

Lines 107-111 (hook usage):
```typescript
// BEFORE
const wishlists = useAppStore((s) => s.wishlists);
const createWishlist = useAppStore((s) => s.createWishlist);
// AFTER
const { data: wishlists = [], isLoading, isError } = useWishlists();
const createMut = useCreateWishlist();
const updateMut = useUpdateWishlist();
const deleteMut = useDeleteWishlist();
```

Lines 180-185 (delete handler — D-13, landmine L3):
```typescript
// BEFORE
onDelete={() => {
  if (confirm(`Apagar wishlist "${wl.name}"?`)) {
    deleteWishlist(wl.id);
    toast.success("Wishlist removida");
  }
}}
// AFTER — opens AlertDialog via state
onDelete={() => setDeleting(wl)}
```

Add `const [deleting, setDeleting] = useState<DbWishlist | null>(null);` + AlertDialog (see Cross-Cutting §AlertDialog template).

Grep-after guard (RESEARCH.md:895 landmine): after rewrite, running `grep -rn "useAppStore\|LocalWishlist\|from \"@/lib/stores/app\"" src/components/v3/modules/WishlistModule.tsx` MUST return empty.

---

### `src/components/v3/modules/WishlistModule.test.tsx` (NEW)

**Key tests:**
1. `summarize()`: full wishlist → `"Honda Civic 2018+ SP"`; no UF → `"Honda Civic 2018+"`; no year → `"Honda Civic SP"`; both empty → `"Wishlist sem nome"` (D-08 branches).
2. List render: 2 wishlists → 2 cards; sorted active-first (preserves scaffold line 119-125 logic).
3. Empty state: `wishlists=[]` → renders `"Ainda sem wishlists"` heading.
4. Error state: `isError=true` → renders alert card `"Não carregou suas wishlists..."`.
5. Delete flow: click Trash → AlertDialog opens with `"Apagar wishlist?"` title + `"wishlist \"{name}\""` in description; Cancel has focus; Cancel click closes dialog no-op; Confirm click → `deleteMut.mutate(id)` called → toast.success.

Mock `useWishlists`/`useCreateWishlist`/`useUpdateWishlist`/`useDeleteWishlist` via `vi.mock`.

---

### `src/components/v3/Sidebar.tsx` (MODIFIED)

- **Target lines:** `Sidebar.tsx:41-52` (GROUPS array).

**Before (lines 41-52):**

```typescript
items: [
  {
    key: "wishlists",
    label: "Wishlists",
    icon: ListChecks,
    description: "Carros que você quer",
  },
  {
    key: "marketplace",
    label: "Marketplace",
    icon: Handshake,
    description: "Oportunidades pré-negociadas",
  },
```

**After (D-15):**

```typescript
items: [
  {
    key: "wishlists",
    label: "Minhas Wishlists",
    icon: ListChecks,
    description: "Carros que você quer",
  },
  // marketplace slot removed — cleanup deferred to Phase 12
```

**Also remove** the `Handshake` import if it's unused elsewhere in the file.

Keep `AppModule` type in `stores/app.ts` intact (still used by other modules).

---

### `src/components/v3/Sidebar.test.tsx` (NEW, optional per RESEARCH.md:866)

**Key tests:**
1. Renders text `"Minhas Wishlists"` somewhere in the tree.
2. Does NOT render text `"Marketplace"` (D-15).

Can skip if e2e covers but low cost to include.

---

### `src/app/app/onboarding/page.tsx` (MODIFIED)

- **Target lines:** `onboarding/page.tsx:32` (Step type), `76-108` (handleStep2).

**Lines to change:**

Line 32 — expand Step union:

```typescript
// BEFORE
type Step = 1 | 2;
// AFTER
type Step = 1 | 2 | 3;
```

Line 151 — progress badge:

```typescript
// BEFORE
Passo {step} de 2
// AFTER
Passo {step} de 3
```

Lines 76-108 (handleStep2) — relocate `onboarding_complete: true`:

```typescript
// BEFORE — handleStep2 updates onboarding_complete + routes /app
// AFTER — handleStep2 only updates profile, advances to step 3:
const handleStep2 = async (e: FormEvent) => {
  e.preventDefault();
  if (!user || submitting) return;
  setSubmitting(true);
  try {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from("users")
      .update({
        name: name.trim(),
        company_name: companyName.trim(),
        cnpj: cnpj.trim() || null,
        city: city.trim(),
        uf,
        // onboarding_complete moved to step 3 handler
      })
      .eq("id", user.id);
    if (error) { toast.error("Falha ao salvar", { description: error.message }); return; }
    setStep(3);
  } finally {
    setSubmitting(false);
  }
};
```

**New step 3 render branch** (after the step 2 `<form>`):

```typescript
{step === 3 && (
  <div className="mt-8">
    <h1 style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
        className="text-3xl font-semibold leading-[1.05] tracking-tight md:text-4xl">
      Cadastre seu primeiro carro-alvo
    </h1>
    <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      Isso configura o sistema pra começar a buscar. Você pode cadastrar mais depois.
    </p>
    {/* Render WishlistFormSheet inline (no chrome) with a `layout="inline"` prop */}
    <WishlistFormSheet
      layout="inline"
      onSaved={async () => {
        await getSupabaseBrowser()
          .from("users")
          .update({ onboarding_complete: true })
          .eq("id", user.id);
        router.replace("/app");
      }}
    />
    <Button
      variant="ghost"
      onClick={async () => {
        await getSupabaseBrowser()
          .from("users")
          .update({ onboarding_complete: true })
          .eq("id", user.id);
        router.replace("/app");
      }}
    >
      Pular e fazer depois
    </Button>
  </div>
)}
```

**Landmine acknowledgment (RESEARCH.md:898):** two sequential Supabase calls (users.update + wishlist.insert) are NOT atomic. If wishlist insert fails after onboarding_complete update, user lands in empty state — acceptable per skip flow.

---

### `src/lib/supabase/hooks/useWishlists.ts` (MODIFIED — two surgical edits per landmine L3)

**Edit 1 — line 33 (filter archived):**

```typescript
// BEFORE (lines 28-37)
async function fetchWishlists(userId: string): Promise<DbWishlist[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("wishlists")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
// AFTER
async function fetchWishlists(userId: string): Promise<DbWishlist[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("wishlists")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived")            // D-14 soft-delete filter
    .order("created_at", { ascending: false });
```

**Edit 2 — lines 125-135 (`useDeleteWishlist` soft delete):**

```typescript
// BEFORE
mutationFn: async (id: string): Promise<string> => {
  if (!user) throw new Error("not_authenticated");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from("wishlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return id;
},
// AFTER
mutationFn: async (id: string): Promise<string> => {
  if (!user) throw new Error("not_authenticated");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from("wishlists")
    .update({ status: "archived" })      // D-14 soft delete
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return id;
},
```

**Preserve verbatim:** `onMutate`/`onError`/`onSettled` (lines 137-154) — optimistic filter-out still correct.

---

### `src/lib/supabase/hooks/useWishlists.test.tsx` (MODIFIED)

**Updates (landmine L3):**

Lines 9-19 — update mock chain to reflect new `.neq` chain:

```typescript
// BEFORE
const mockEq2 = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ order: mockOrder, eq: mockEq2 }));
// AFTER — add .neq after .eq("user_id")
const mockNeq = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ order: mockOrder, eq: vi.fn(() => ({ order: mockOrder })), neq: mockNeq }));
```

**Add a test for filter-archived behavior:**
```typescript
it("applies .neq('status', 'archived') on list query", async () => {
  mockOrder.mockResolvedValue({ data: [sampleWishlist], error: null });
  const { Wrapper } = makeWrapper();
  renderHook(() => useWishlists(), { wrapper: Wrapper });
  await waitFor(() => expect(mockNeq).toHaveBeenCalledWith("status", "archived"));
});
```

**Add a test for soft-delete** (new — `useDeleteWishlist` currently has no test but landmine L3 demands one):
```typescript
it("useDeleteWishlist issues update({status:'archived'}) not delete()", async () => {
  const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }));
  mockFrom.mockImplementation(() => ({ update: mockUpdate, select: mockSelect, insert: mockInsert, delete: vi.fn() }));
  const { Wrapper } = makeWrapper();
  const { result } = renderHook(() => useDeleteWishlist(), { wrapper: Wrapper });
  await act(async () => { await result.current.mutateAsync("w1"); });
  expect(mockUpdate).toHaveBeenCalledWith({ status: "archived" });
});
```

---

### `src/app/api/fipe/route.ts` (MODIFIED — critical finding #1)

**Current shape:** POST-only handler (lines 96-201). Helpers `fetchJson`, `fuzzyMatch`, `fuzzyMatchAll`, `checkRateLimit` already present.

**Add a new `GET` export branching on `searchParams.type`:**

```typescript
export async function GET(request: Request): Promise<Response> {
  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "fipe", max: 30, windowMs: 60_000 });
  if (!rl.ok) return genericError(429, { error: "rate_limited", retryAfter: rl.retryAfter });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  if (type === "brands") {
    const res = await fetchJson(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
    if (isUpstreamFail(res)) return genericError(502, { error: "upstream_failed" });
    return Response.json({ brands: res }, { status: 200 });
  }

  if (type === "models") {
    const brand = url.searchParams.get("brand");
    if (!brand) return genericError(400, { error: "missing_brand" });
    const marcas = await fetchJson(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
    if (isUpstreamFail(marcas)) return genericError(502, { error: "upstream_failed" });
    const marcaMatch = fuzzyMatch(marcas, brand);
    if (!marcaMatch) return genericError(404, { error: "not_found" });
    const modelosRes = await fetchJson(
      `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos`,
      modelosResponseSchema,
      signal,
    );
    if (isUpstreamFail(modelosRes)) return genericError(502, { error: "upstream_failed" });
    return Response.json({ models: modelosRes.modelos }, { status: 200 });
  }

  return genericError(400, { error: "invalid_type" });
}
```

**Replicate from POST (lines 96-201):** `extractIp`, `checkRateLimit`, `AbortSignal.timeout`, `fetchJson`, `fuzzyMatch`, `isUpstreamFail`, `genericError` — all re-used.

**Diverge from POST:** no request body; shorter cascade; no year/valor lookups.

---

### `src/app/api/fipe/route.test.ts` (MODIFIED)

Following the existing POST test pattern (lines 1-60):

**Add `describe("GET /api/fipe — brands", () => {...})` block:**
1. `GET ?type=brands` success → 200 with `{ brands: [...] }`.
2. Parallelum 500 → 502 `upstream_failed`.

**Add `describe("GET /api/fipe — models", () => {...})` block:**
1. `GET ?type=models&brand=Honda` success → 200 with `{ models: [...] }`.
2. Missing brand param → 400 `missing_brand`.
3. Unknown brand → 404 `not_found`.
4. Parallelum 500 on modelos → 502 `upstream_failed`.

Reuse `jsonResponse` helper and `vi.stubGlobal("fetch", fetchMock)` pattern.

---

## Cross-Cutting Patterns

### RHF `FormField` Template — apply to every new field primitive

From `src/components/ui/form.tsx:32-43` (`FormField` wraps RHF's `Controller`):

```typescript
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";

<FormField
  control={form.control}
  name="brand"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Marca</FormLabel>
      <FormControl>
        <FipeBrandCombobox value={field.value} onChange={field.onChange} />
      </FormControl>
      <FormDescription>opcional — geramos automaticamente</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Every Layer 2 primitive** (FipeBrandCombobox, FipeModelCombobox, BrlCurrencyInput, KmInput, YearRangeField, LocalidadeMultiPicker) takes `{ value, onChange, disabled? }` props — RHF-agnostic. Wiring happens in `WishlistFormSheet` via `FormField render={({ field }) => <Primitive value={field.value} onChange={field.onChange} />}`.

---

### Test Harness — apply to every new test file

From `useWishlists.test.tsx:40-48`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

beforeEach(() => {
  vi.clearAllMocks();
});
```

For RHF forms, add `FormProvider` wrapper:

```typescript
function FormHarness({ children, defaults }: { children: ReactNode; defaults?: Partial<WishlistFormValues> }) {
  const form = useForm<WishlistFormValues>({ defaultValues: { ...makeEmptyDefaults(), ...defaults } });
  return <FormProvider {...form}>{children}</FormProvider>;
}
```

Infrastructure already set up per `vitest.config.mts:1-23` (jsdom + `@` alias) + `vitest.setup.ts:1-40` (matchMedia shim + randomUUID shim + cleanup). No new test infra.

---

### Supabase Mock Chain — apply to every hook test

From `useWishlists.test.tsx:9-32` (full verbatim):

```typescript
const mockOrder = vi.fn();
const mockEq2 = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ order: mockOrder, eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1, order: mockOrder }));
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    from: mockFrom,
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "u@x" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));
```

**Per-hook customization:** after `.select()` the chain differs (some add `.limit`, some add `.neq`). Extend the mockSelect return shape as needed.

---

### shadcn popover+command Combobox Template

Combine `popover.tsx:1-89` + `command.tsx:1-184` (both already in repo):

```typescript
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" aria-expanded={open}
            className="h-11 w-full justify-between bg-white font-normal dark:bg-slate-950">
      {value || placeholder}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
    <Command filter={(v, q) => (norm(v).includes(norm(q)) ? 1 : 0)}>
      <CommandInput placeholder="Digite pra filtrar..." className="h-10" />
      <CommandList>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        <CommandGroup>
          {items.map((item) => (
            <CommandItem key={item.codigo} value={item.nome}
                         onSelect={(v) => { onChange(v); setOpen(false); }}>
              <Check className={cn("mr-2 h-4 w-4", value === item.nome ? "opacity-100" : "opacity-0")} />
              {item.nome}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

`norm` function from `LocalidadePicker.tsx:40-46` — copy verbatim.

---

### AlertDialog Template (D-13 destructive)

From `alert-dialog.tsx:1-187` (already installed, based on `@base-ui/react/alert-dialog`):

```typescript
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

<AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Apagar wishlist?</AlertDialogTitle>
      <AlertDialogDescription>
        A wishlist "{deleting?.name}" será removida. Oportunidades já abertas continuam
        no marketplace, mas nenhuma nova será criada. Essa ação não pode ser desfeita.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel autoFocus>Manter</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => {
          deleteMut.mutate(deleting!.id);
          setDeleting(null);
          toast.success("Wishlist removida.");
        }}
      >
        Apagar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Focus rule (UI-SPEC §a11y line 263):** `autoFocus` MUST be on `AlertDialogCancel`, NOT on `AlertDialogAction` — destructive dialogs do not auto-focus destructive buttons.

---

### Optimistic Update Pattern (from `useUpdateWishlist`)

From `useWishlists.ts:98-117`:

```typescript
onMutate: async ({ id, patch }) => {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<DbWishlist[]>(key);
  if (previous) {
    queryClient.setQueryData<DbWishlist[]>(
      key,
      previous.map((w) =>
        w.id === id ? { ...w, ...patch, updated_at: new Date().toISOString() } : w,
      ),
    );
  }
  return { previous };
},
onError: (_err, _vars, ctx) => {
  if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
},
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: key });
},
```

Pause/Resume toggle in WishlistModule reuses `useUpdateWishlist().mutate({ id, patch: { status: "paused" | "active" } })` — already optimistic.

---

### pt-BR Formatting Helpers

From `WishlistModule.tsx:82-85`:

```typescript
function formatBrl(v: number | null): string {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
```

Apply verbatim in BrlCurrencyInput display + WishlistCard price row. For KM: same helper minus `R$` prefix.

---

### Accent Insensitive Normalize

From `LocalidadePicker.tsx:40-46`:

```typescript
function norm(s: string): string {
  return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
```

Copy into EACH combobox file — do not extract to a shared utility (rule of three not yet met; already duplicated once, extract on third occurrence).

---

## No Analog Found

| File | Reason | Mitigation |
|------|--------|------------|
| `src/lib/brasil/fipe-brands-snapshot.test.ts` | First JSON-asset snapshot test in repo | Pattern derived from listing.test.ts + plain `import json from "..."`. Shape-assert skeleton above is sufficient. |
| `src/lib/mock-data/preview-listings.test.ts` | No existing "mock-shape verification" test | Same pattern — shape-assert skeleton above. |

Both files use the canonical vitest shape (describe/it/expect) documented in §Test Harness. No new infra.

---

## Metadata

**Analog search scope:** `src/lib/schemas/`, `src/lib/supabase/hooks/`, `src/components/forms/`, `src/components/ui/`, `src/components/v3/modules/`, `src/app/app/onboarding/`, `src/app/api/fipe/`, `src/lib/matching/`, `scripts/`, `vitest.config.mts`, `vitest.setup.ts`.

**Files scanned in full or in targeted ranges:**
- `src/lib/schemas/listing.ts` (full, 43 LOC)
- `src/lib/schemas/listing.test.ts` (full, 89 LOC)
- `src/lib/supabase/hooks/useWishlists.ts` (full, 155 LOC)
- `src/lib/supabase/hooks/useWishlists.test.tsx` (full, 102 LOC)
- `src/components/forms/LocalidadePicker.tsx` (full, 154 LOC)
- `src/components/v3/modules/WishlistModule.tsx` (lines 1-250, 250-450, 450-721)
- `src/components/v3/Sidebar.tsx` (lines 1-30, 30-110)
- `src/app/app/onboarding/page.tsx` (full, 306 LOC)
- `src/app/api/fipe/route.ts` (full, 201 LOC)
- `src/app/api/fipe/route.test.ts` (lines 1-80)
- `src/lib/matching/engine.ts` (lines 150-278 — covering matchListingToWishlists signature)
- `src/components/ui/form.tsx` (full, 167 LOC)
- `src/components/ui/popover.tsx` (full, 89 LOC)
- `src/components/ui/command.tsx` (lines 1-120)
- `src/components/ui/alert-dialog.tsx` (full, 187 LOC)
- `scripts/seed-dev.ts` (lines 1-120)
- `vitest.config.mts` (full, 23 LOC)
- `vitest.setup.ts` (full, 40 LOC)
- `src/lib/mock-data/v3.ts` (lines 1-80 — header pattern only)
- `src/types/database.ts` (lines 120-160 listings row + 380-417 type aliases)

**Pattern extraction date:** 2026-04-23

---

*Phase 7 patterns mapped. All 31 files have concrete excerpts or skeletons. Downstream planner references this file for Wave-level task specifications.*

## PATTERN MAPPING COMPLETE
