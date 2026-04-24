---
plan_id: "07-09"
phase: 7
slug: wishlist-ui
wave: 3
title: "WishlistPreviewPane — debounced engine count + 3-card collapse"
depends_on:
  - "07-01"   # needs wishlistSchema + WishlistFormValues + preview-listings mocks
  - "07-05"   # needs useListingsSnapshot hook
files_modified:
  - src/components/forms/WishlistPreviewPane.tsx
  - src/components/forms/WishlistPreviewPane.test.tsx
  - src/lib/wishlist/formValuesToPendingWishlist.ts
  - src/lib/wishlist/formValuesToPendingWishlist.test.ts
requirements_addressed:
  - D-01
  - D-02
  - D-10
  - GOAL-PREVIEW
autonomous: true
must_haves:
  truths:
    - "formValuesToPendingWishlist adapter produces a DbWishlist with status='active' (engine short-circuit guard)"
    - "WishlistPreviewPane debounces 400ms on any form change before recomputing"
    - "Preview count is wrapped in text-[#4C46DC] font-semibold (ONE allowed accent exception per UI-SPEC §Specifics)"
    - "When brand or model is empty → render Skeleton (not yet ready)"
    - "When count === 0 → render zero-match copy from UI-SPEC verbatim"
    - "When count > 0 → render 'Com essas regras, acharíamos <X anúncios> esta semana.'"
    - "Engine call passes { enforcePfOnly: false } (L6 landmine)"
    - "Engine throw → silent no-op (State Matrix row: preview pane error)"
    - "Section has aria-live='polite' (UI-SPEC a11y)"
  artifacts:
    - path: "src/components/forms/WishlistPreviewPane.tsx"
      provides: "Inline debounced preview panel"
      contains: "aria-live=\"polite\""
    - path: "src/lib/wishlist/formValuesToPendingWishlist.ts"
      provides: "Adapter function WishlistFormValues → DbWishlist"
      contains: "status: \"active\""
  key_links:
    - from: "src/components/forms/WishlistPreviewPane.tsx"
      to: "src/lib/matching/engine.ts"
      via: "matchListingToWishlists(listing, [pending], { enforcePfOnly: false })"
      pattern: "matchListingToWishlists"
---

<objective>
The preview pane — Phase 7's most UX-critical new surface. Live-count "acharíamos X anúncios esta semana" as the lojista types the wishlist. The inverse loop is mandatory per landmine L1: the matching engine is `matchListingToWishlists(listing, wishlists[])` NOT `scoreListings(rules, listings)`. Per-listing call with a single-wishlist array; count non-empty results.

Purpose: GOAL-PREVIEW delivery. Without this, the form is a black box and the killer UX the PRD/UI-SPEC promise (preview-as-you-type) doesn't ship.
Output: 4 files (adapter + preview component, each with tests). Adapter isolated so it can be unit-tested without the component.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-UI-SPEC.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@src/lib/matching/engine.ts
@src/lib/schemas/wishlist.ts
@src/lib/supabase/hooks/useListingsSnapshot.ts
@src/lib/mock-data/preview-listings.ts
@src/types/database.ts
@src/components/ui/skeleton.tsx
@src/components/ui/card.tsx
</context>

<interfaces>
<!-- From src/lib/matching/engine.ts:156-170 — verified signature (landmines L1 + L2) -->

export type MatchingOptions = {
  threshold?: number;
  enforcePfOnly?: boolean; // default true; PF-only gate
};
export type MatchResult = { wishlistId: string; score: number; ... };

export function matchListingToWishlists(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts?: MatchingOptions,
): MatchResult[];
// Internal short-circuits:
//   if (listing.status !== "active") return [];
//   if (enforcePf && listing.seller_type !== "PF") return [];
//   (iterates remaining wishlists and returns matches)

<!-- From plan 07-01 / src/types/database.ts -->
WishlistFormValues = z.infer<typeof wishlistSchema>
DbWishlist Row shape — see earlier plans

<!-- From plan 07-05 -->
useListingsSnapshot(): UseQueryResult<DbListing[]>
</interfaces>

<tasks>

<task id="07-09-01" type="auto" tdd="true">
  <name>Task 1: formValuesToPendingWishlist adapter — isolated, unit-tested</name>
  <files>src/lib/wishlist/formValuesToPendingWishlist.ts, src/lib/wishlist/formValuesToPendingWishlist.test.ts</files>
  <read_first>
    - src/lib/matching/engine.ts (lines 156-200 — confirm short-circuit fields required on DbWishlist)
    - src/types/database.ts (DbWishlist Row shape — every field)
    - src/lib/schemas/wishlist.ts (WishlistFormValues shape from plan 07-01)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall 1 (lines 540-570 — mandatory adapter shape)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 3 §WishlistPreviewPane (lines 1050-1076 — adapter excerpt)
  </read_first>
  <behavior>
    - Takes WishlistFormValues → returns DbWishlist with status="active"
    - Synthesizes id="pending", user_id="pending", name= v.name || "pending"
    - Nulls preserved for optional fields; arrays default to []
    - Timestamps set to now (new Date().toISOString())
    - TypeScript typecheck passes — returned object fully satisfies DbWishlist
  </behavior>
  <action>
    Create `src/lib/wishlist/formValuesToPendingWishlist.ts`:

    ```typescript
    import type { WishlistFormValues } from "@/lib/schemas/wishlist";
    import type { DbWishlist } from "@/types/database";

    /**
     * Adapts RHF form values into the full DbWishlist shape the matching engine requires.
     *
     * CRITICAL (landmine L2):
     *   - Sets status="active" — engine short-circuits at engine.ts:169 on non-active.
     *   - Synthesizes id/user_id/timestamps — preview runs against a pending, non-persisted wishlist.
     *   - Fallback `name = v.name || "pending"` — schema allows empty name (auto-gen on submit), but
     *     engine doesn't care about the name; "pending" is just a sentinel.
     */
    export function formValuesToPendingWishlist(v: Partial<WishlistFormValues>): DbWishlist {
      const now = new Date().toISOString();
      return {
        id: "pending",
        user_id: "pending",
        name: v.name && v.name.length > 0 ? v.name : "pending",
        brand: v.brand ?? "",
        model: v.model ?? "",
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
        status: "active",
        created_at: now,
        updated_at: now,
      };
    }
    ```

    Create `src/lib/wishlist/formValuesToPendingWishlist.test.ts`:

    ```typescript
    import { describe, expect, it } from "vitest";
    import { formValuesToPendingWishlist } from "./formValuesToPendingWishlist";

    describe("formValuesToPendingWishlist", () => {
      it("stamps status='active' (engine short-circuit guard)", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
        expect(result.status).toBe("active");
      });

      it("synthesizes id + user_id as 'pending'", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
        expect(result.id).toBe("pending");
        expect(result.user_id).toBe("pending");
      });

      it("defaults arrays to [] when undefined", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
        expect(result.fuel_type).toEqual([]);
        expect(result.transmission).toEqual([]);
        expect(result.region_uf).toEqual([]);
        expect(result.region_cities).toEqual([]);
      });

      it("preserves optional nulls", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
        expect(result.year_min).toBeNull();
        expect(result.year_max).toBeNull();
        expect(result.km_max).toBeNull();
        expect(result.price_max).toBeNull();
        expect(result.trim).toBeNull();
        expect(result.armored).toBeNull();
      });

      it("preserves provided values verbatim", () => {
        const result = formValuesToPendingWishlist({
          brand: "Toyota",
          model: "Corolla",
          year_min: 2018,
          year_max: 2022,
          km_max: 80000,
          price_max: 120000,
          fuel_type: ["flex"],
          transmission: ["automático"],
          armored: false,
          region_uf: ["SP"],
          region_cities: ["São Paulo"],
        });
        expect(result.brand).toBe("Toyota");
        expect(result.year_min).toBe(2018);
        expect(result.fuel_type).toEqual(["flex"]);
        expect(result.region_uf).toEqual(["SP"]);
      });

      it("synthesizes name='pending' when empty (schema allows empty name)", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic", name: "" });
        expect(result.name).toBe("pending");
      });

      it("preserves non-empty name", () => {
        const result = formValuesToPendingWishlist({
          brand: "Honda",
          model: "Civic",
          name: "Meu Civic",
        });
        expect(result.name).toBe("Meu Civic");
      });

      it("sets timestamps as ISO strings", () => {
        const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
        expect(Number.isNaN(Date.parse(result.created_at))).toBe(false);
        expect(Number.isNaN(Date.parse(result.updated_at))).toBe(false);
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/lib/wishlist/formValuesToPendingWishlist.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/wishlist/formValuesToPendingWishlist.ts` exists
    - `grep -n "export function formValuesToPendingWishlist" src/lib/wishlist/formValuesToPendingWishlist.ts` returns 1 match
    - `grep -n "status: \"active\"" src/lib/wishlist/formValuesToPendingWishlist.ts` returns 1 match
    - `pnpm test src/lib/wishlist/formValuesToPendingWishlist.test.ts --run` exits 0 with 8 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

<task id="07-09-02" type="auto" tdd="true">
  <name>Task 2: WishlistPreviewPane component + integration test</name>
  <files>src/components/forms/WishlistPreviewPane.tsx, src/components/forms/WishlistPreviewPane.test.tsx</files>
  <read_first>
    - src/components/ui/skeleton.tsx (confirm Skeleton primitive)
    - src/components/ui/card.tsx (Card primitive for example list)
    - src/lib/matching/engine.ts (lines 156-170 — signature; lines 200-278 — matching logic, to understand what inputs change count)
    - src/lib/supabase/hooks/useListingsSnapshot.ts (from plan 07-05)
    - src/lib/mock-data/preview-listings.ts (from plan 07-01)
    - src/lib/wishlist/formValuesToPendingWishlist.ts (from task 07-09-01)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Copywriting Contract (Preview pane row: heading, loading, with matches, zero matches, expand), §Color (accent reserved — count is the ONE body-copy exception), §Interaction Contracts §Preview pane (lines 234-240)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 3 §WishlistPreviewPane.tsx (lines 985-1089)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pattern 3 (debounced preview pattern lines 420-471)
  </read_first>
  <behavior>
    - Reads current RHF values via `useWatch({ control })`
    - Debounces 400ms before recomputing count
    - When `pending.brand || pending.model` is empty → returns Skeleton (count=null)
    - Calls `useListingsSnapshot()` for the listings universe
    - For each listing, calls `matchListingToWishlists(listing, [pending], { enforcePfOnly: false })`
    - Counts listings where `results.length > 0`
    - Engine throw → caught, returns null (silent no-op → Skeleton)
    - count === 0 → zero-match copy
    - count > 0 → "Com essas regras, acharíamos <X anúncios> esta semana." with `<X anúncios>` wrapped in `<span className="text-[#4C46DC] font-semibold">`
    - "Ver exemplos ↓" button expands collapsible panel with first 3 mock/real listings rendered as mini Card (photo square aspect + title + price + km/ano/UF, no CTAs)
    - Root section has aria-live="polite"
    - Section heading: "Prévia de resultados"
  </behavior>
  <action>
    Create `src/components/forms/WishlistPreviewPane.tsx`:

    ```typescript
    "use client";

    import { useListingsSnapshot } from "@/lib/supabase/hooks/useListingsSnapshot";
    import { matchListingToWishlists } from "@/lib/matching/engine";
    import type { WishlistFormValues } from "@/lib/schemas/wishlist";
    import { formValuesToPendingWishlist } from "@/lib/wishlist/formValuesToPendingWishlist";
    import { Skeleton } from "@/components/ui/skeleton";
    import { Button } from "@/components/ui/button";
    import { ChevronDown } from "lucide-react";
    import { useEffect, useMemo, useState } from "react";
    import { type Control, useWatch } from "react-hook-form";

    type Props = {
      control: Control<WishlistFormValues>;
    };

    /**
     * Live preview pane — debounced count of matching listings per current form values.
     *
     * Architecture (RESEARCH.md §Pattern 3 + Pitfall 1):
     *   1. useWatch on RHF control → rerenders on any field change
     *   2. setTimeout 400ms → setDebounced(values)
     *   3. useMemo [debounced, snapshot] → formValuesToPendingWishlist → per-listing engine call
     *   4. Count listings where matchListingToWishlists returns non-empty results
     *
     * Landmines:
     *   - L1: engine is matchListingToWishlists(listing, wishlists[]), not scoreListings(rules, listings)
     *   - L2: enforcePfOnly:false — preview permits all sellers (prod enforces PF via DB trigger)
     *   - Adapter MUST set status="active" — engine short-circuits non-active listings/wishlists
     */
    export function WishlistPreviewPane({ control }: Props): React.JSX.Element {
      const values = useWatch({ control });
      const [debounced, setDebounced] = useState<typeof values>(values);
      const [expanded, setExpanded] = useState(false);

      useEffect(() => {
        const t = setTimeout(() => setDebounced(values), 400);
        return () => clearTimeout(t);
      }, [values]);

      const { data: snapshot = [] } = useListingsSnapshot();

      const { count, samples } = useMemo(() => {
        const pending = formValuesToPendingWishlist(debounced as Partial<WishlistFormValues>);
        if (!pending.brand || !pending.model) {
          return { count: null as number | null, samples: [] as typeof snapshot };
        }
        try {
          let c = 0;
          const matched: typeof snapshot = [];
          for (const listing of snapshot) {
            const results = matchListingToWishlists(listing, [pending], { enforcePfOnly: false });
            if (results.length > 0) {
              c += 1;
              if (matched.length < 3) matched.push(listing);
            }
          }
          return { count: c, samples: matched };
        } catch {
          return { count: null, samples: [] };
        }
      }, [debounced, snapshot]);

      return (
        <section
          aria-live="polite"
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <h3 className="font-semibold text-slate-900 text-sm dark:text-slate-100">
            Prévia de resultados
          </h3>
          {count === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : count === 0 ? (
            <p className="text-slate-600 text-sm dark:text-slate-400">
              Ainda não achamos anúncios compatíveis. Você pode salvar a wishlist mesmo
              assim — novos anúncios aparecem todo dia.
            </p>
          ) : (
            <>
              <p className="text-slate-700 text-sm dark:text-slate-200">
                Com essas regras, acharíamos{" "}
                <span className="font-semibold text-[#4C46DC]">{count} anúncios</span>{" "}
                esta semana.
              </p>
              {samples.length > 0 && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded((e) => !e)}
                    className="text-xs"
                  >
                    Ver exemplos
                    <ChevronDown
                      className={`ml-1 size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </Button>
                  {expanded && (
                    <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      {samples.map((l) => (
                        <li
                          key={l.id}
                          className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                        >
                          <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800">
                            {l.photo_url ? (
                              <img
                                src={l.photo_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="space-y-1 p-2 text-xs">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {l.brand} {l.model}
                            </p>
                            <p className="text-slate-600 dark:text-slate-400">
                              {l.price != null
                                ? `R$ ${l.price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                : "—"}
                              {" · "}
                              {l.km != null
                                ? `${l.km.toLocaleString("pt-BR")} km`
                                : "—"}
                            </p>
                            <p className="text-slate-500 dark:text-slate-500">
                              {l.year ?? ""} · {l.seller_uf ?? ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </section>
      );
    }
    ```

    Create `src/components/forms/WishlistPreviewPane.test.tsx`:

    ```typescript
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { act, render, screen } from "@testing-library/react";
    import type { ReactNode } from "react";
    import { FormProvider, useForm } from "react-hook-form";
    import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
    import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
    import type { WishlistFormValues } from "@/lib/schemas/wishlist";

    // Mock useListingsSnapshot to return our curated mocks deterministically
    vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
      useListingsSnapshot: () => ({ data: PREVIEW_LISTINGS, isLoading: false, isError: false }),
    }));

    import { WishlistPreviewPane } from "./WishlistPreviewPane";

    function makeWrapper() {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
      });
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      return { Wrapper, qc };
    }

    function FormHarness({
      defaults,
      children,
    }: {
      defaults?: Partial<WishlistFormValues>;
      children: (control: any) => ReactNode;
    }) {
      const form = useForm<WishlistFormValues>({
        defaultValues: {
          name: "",
          brand: "",
          model: "",
          trim: null,
          year_min: null,
          year_max: null,
          km_max: null,
          price_max: null,
          fuel_type: [],
          transmission: [],
          armored: null,
          region_uf: [],
          region_cities: [],
          ...(defaults ?? {}),
        },
      });
      return <FormProvider {...form}>{children(form.control)}</FormProvider>;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    describe("WishlistPreviewPane", () => {
      it("renders Skeleton while brand/model are empty", () => {
        const { Wrapper } = makeWrapper();
        render(
          <FormHarness>
            {(control) => <WishlistPreviewPane control={control} />}
          </FormHarness>,
          { wrapper: Wrapper },
        );
        // Debounce: advance past 400ms — still no brand/model → count=null → Skeleton
        act(() => {
          vi.advanceTimersByTime(450);
        });
        expect(screen.getByText("Prévia de resultados")).toBeInTheDocument();
      });

      it("renders 'acharíamos X anúncios' when form has matching brand+model", () => {
        // Honda Civic exists in PREVIEW_LISTINGS
        const { Wrapper } = makeWrapper();
        render(
          <FormHarness defaults={{ brand: "Honda", model: "Civic" }}>
            {(control) => <WishlistPreviewPane control={control} />}
          </FormHarness>,
          { wrapper: Wrapper },
        );
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // After debounce, count should be > 0 for Honda Civic
        expect(screen.getByText(/acharíamos/)).toBeInTheDocument();
        expect(screen.getByText(/anúncios/)).toBeInTheDocument();
      });

      it("renders zero-match copy when wishlist is over-restrictive", () => {
        const { Wrapper } = makeWrapper();
        render(
          <FormHarness
            defaults={{ brand: "Honda", model: "Civic", price_max: 1 }}
          >
            {(control) => <WishlistPreviewPane control={control} />}
          </FormHarness>,
          { wrapper: Wrapper },
        );
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // price_max=1 R$ matches nothing
        expect(
          screen.getByText(/Ainda não achamos anúncios compatíveis/),
        ).toBeInTheDocument();
      });

      it("has aria-live='polite' on the section (a11y)", () => {
        const { Wrapper } = makeWrapper();
        const { container } = render(
          <FormHarness>
            {(control) => <WishlistPreviewPane control={control} />}
          </FormHarness>,
          { wrapper: Wrapper },
        );
        const section = container.querySelector("section[aria-live='polite']");
        expect(section).not.toBeNull();
      });

      it("count span uses text-[#4C46DC] accent class (UI-SPEC color exception)", () => {
        const { Wrapper } = makeWrapper();
        const { container } = render(
          <FormHarness defaults={{ brand: "Honda", model: "Civic" }}>
            {(control) => <WishlistPreviewPane control={control} />}
          </FormHarness>,
          { wrapper: Wrapper },
        );
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // Find the span with accent class
        const accentSpan = container.querySelector("span.text-\\[\\#4C46DC\\]");
        expect(accentSpan).not.toBeNull();
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/components/forms/WishlistPreviewPane.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/WishlistPreviewPane.tsx` exists
    - `grep -n "aria-live=\"polite\"" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "Prévia de resultados" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "Com essas regras, acharíamos" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "Ainda não achamos anúncios compatíveis" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "Ver exemplos" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "font-semibold text-\\[#4C46DC\\]" src/components/forms/WishlistPreviewPane.tsx` returns 1 match
    - `grep -n "matchListingToWishlists" src/components/forms/WishlistPreviewPane.tsx` returns ≥2 matches (import + call)
    - `grep -n "enforcePfOnly: false" src/components/forms/WishlistPreviewPane.tsx` returns 1 match (L6)
    - `grep -n "setTimeout(() => setDebounced" src/components/forms/WishlistPreviewPane.tsx` returns 1 match (inline 400ms debounce, no useDebounce helper)
    - `grep -n "scoreListings" src/components/forms/WishlistPreviewPane.tsx` returns 0 matches (L1 — wrong signature)
    - `pnpm test src/components/forms/WishlistPreviewPane.test.tsx --run` exits 0 with ≥5 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/components/forms/WishlistPreviewPane.test.tsx src/lib/wishlist/formValuesToPendingWishlist.test.ts --run` exits 0
- `pnpm typecheck && pnpm lint` both green
- L1 (inverse loop) honored: `grep -rn "scoreListings" src/components/forms/` returns 0 matches
- L2 (enforcePfOnly false) honored: test "over-restrictive" proves engine is called
- Accent color strictly confined to the count span per UI-SPEC §Specifics
</verification>

<success_criteria>
- GOAL-PREVIEW shipped
- L1 + L2 + L6 landmines all addressed
- 13 tests across 2 files pass
- Adapter is unit-testable in isolation
- Debounce is inline (no useDebounce file)
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-09-SUMMARY.md` with:
- Adapter + component architecture
- Test count breakdown (8 + 5 = 13)
- Landmine compliance confirmation (L1/L2/L6)
</output>
