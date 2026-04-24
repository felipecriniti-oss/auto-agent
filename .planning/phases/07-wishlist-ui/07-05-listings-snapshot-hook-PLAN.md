---
plan_id: "07-05"
phase: 7
slug: wishlist-ui
wave: 2
title: "useListingsSnapshot hook — Supabase select + silent mock fallback"
depends_on:
  - "07-01"   # needs PREVIEW_LISTINGS + DbListing types
files_modified:
  - src/lib/supabase/hooks/useListingsSnapshot.ts
  - src/lib/supabase/hooks/useListingsSnapshot.test.tsx
requirements_addressed:
  - D-01
  - D-09
autonomous: true
must_haves:
  truths:
    - "useListingsSnapshot returns DbListing[] from Supabase when table has rows"
    - "useListingsSnapshot silently returns PREVIEW_LISTINGS when Supabase returns []"
    - "Query key shape matches repo pattern: ['supabase', 'listings-snapshot', user_id ?? 'anon']"
    - "staleTime 60s (UI-SPEC cached ~60s for listings snapshot)"
    - "Hook gates on isSupabaseConfigured() + !!user like useWishlists"
  artifacts:
    - path: "src/lib/supabase/hooks/useListingsSnapshot.ts"
      provides: "React Query hook with mock fallback"
      contains: "useListingsSnapshot"
    - path: "src/lib/supabase/hooks/useListingsSnapshot.test.tsx"
      provides: "3 tests — DB-nonempty / DB-empty fallback / DB-error"
      contains: "PREVIEW_LISTINGS"
  key_links:
    - from: "src/components/forms/WishlistPreviewPane.tsx (plan 07-09)"
      to: "src/lib/supabase/hooks/useListingsSnapshot.ts"
      via: "useListingsSnapshot() call"
      pattern: "useListingsSnapshot\\(\\)"
---

<objective>
Layer 2 data-access hook. Mirrors `useWishlists` shape exactly but queries the `listings` table (not scoped by user — listings are global), limits to 500 rows, and silently falls back to `PREVIEW_LISTINGS` (from plan 07-01) when Supabase returns `[]`. This is the D-01 "silent fallback" contract — consumer code never sees the fallback decision.

Purpose: Without this, `WishlistPreviewPane` (plan 07-09) has no data source. The mock-fallback behavior means the preview pane works correctly in dev (empty DB) + prod-day-1 (empty DB) + prod-day-N (real DB) without any conditional code in consumers.
Output: 2 files (hook + test); tests green.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@src/lib/supabase/hooks/useWishlists.ts
@src/lib/supabase/hooks/useWishlists.test.tsx
@src/lib/supabase/hooks/useSupabaseUser.ts
@src/lib/mock-data/preview-listings.ts
</context>

<interfaces>
<!-- From useWishlists.ts:17-49 — canonical hook shape — mirror verbatim except for the query body -->

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbListing } from "@/types/database";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

<!-- useSupabaseUser returns: { user: { id: string } | null, loading: boolean } -->

<!-- PREVIEW_LISTINGS from plan 07-01: exported as DbListing[] with ≥20 entries -->
</interfaces>

<tasks>

<task id="07-05-01" type="auto" tdd="true">
  <name>Task 1: Create useListingsSnapshot hook with silent mock fallback</name>
  <files>src/lib/supabase/hooks/useListingsSnapshot.ts</files>
  <read_first>
    - src/lib/supabase/hooks/useWishlists.ts (lines 17-49 — mirror hook scaffold exactly)
    - src/lib/supabase/hooks/useSupabaseUser.ts (confirm `useSupabaseUser` return shape)
    - src/lib/mock-data/preview-listings.ts (confirm `PREVIEW_LISTINGS` export exists after plan 07-01)
    - src/types/database.ts (DbListing Row shape + ListingStatus)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-01 (silent fallback — no env flag, no dev/prod gating)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §useListingsSnapshot.ts (exact diverge rules at lines 425-438)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall 2 (query key collision — user_id scoping)
  </read_first>
  <action>
    Create `src/lib/supabase/hooks/useListingsSnapshot.ts`:

    ```typescript
    "use client";

    import { getSupabaseBrowser } from "@/lib/supabase/client";
    import { isSupabaseConfigured } from "@/lib/supabase/env";
    import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
    import type { DbListing } from "@/types/database";
    import { useQuery, type UseQueryResult } from "@tanstack/react-query";
    import { useSupabaseUser } from "./useSupabaseUser";

    const LISTINGS_SNAPSHOT_KEY = ["supabase", "listings-snapshot"] as const;

    /**
     * Fetch a snapshot of the most recent 500 listings — used by the Wishlist preview
     * pane (Phase 7) to count live match candidates as the lojista types.
     *
     * D-01: when Supabase returns [], falls back to PREVIEW_LISTINGS mocks. Transparent
     * to consumers — they never know whether they're seeing real or mock data.
     */
    async function fetchListingsSnapshot(): Promise<DbListing[]> {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .limit(500)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        return PREVIEW_LISTINGS;
      }
      return data;
    }

    export function useListingsSnapshot(): UseQueryResult<DbListing[]> {
      const { user } = useSupabaseUser();
      const enabled = isSupabaseConfigured() && !!user;

      return useQuery({
        queryKey: [...LISTINGS_SNAPSHOT_KEY, user?.id ?? "anon"],
        queryFn: fetchListingsSnapshot,
        enabled,
        initialData: enabled ? undefined : PREVIEW_LISTINGS,   // Degraded path: unauth/unconfig still shows mocks
        staleTime: 60_000,                                    // 60s — UI-SPEC §Preview pane
        refetchOnWindowFocus: true,                           // D-09 (apply to listings too)
        refetchOnReconnect: true,                             // D-09
      });
    }
    ```

    Notes:
    - `initialData: PREVIEW_LISTINGS` when hook is DISABLED (unauth / unconfig) — means preview pane works in dev even before user signs up.
    - When hook is ENABLED (configured + user) and query runs successfully, `fetchListingsSnapshot` handles empty-result fallback internally.
    - Do NOT use SWR — L4 landmine. React Query only.
    - Do NOT add `.eq("user_id", ...)` — listings are global, not user-scoped (RESEARCH.md Pitfall 2 warning is about the KEY shape, not the query scope; still key by user so stale caches don't bleed across tenants).
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/supabase/hooks/useListingsSnapshot.ts` exists
    - `grep -n "export function useListingsSnapshot" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 1 match
    - `grep -n "PREVIEW_LISTINGS" src/lib/supabase/hooks/useListingsSnapshot.ts` returns ≥2 matches (import + fallback return + initialData)
    - `grep -n "staleTime: 60_000" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 1 match
    - `grep -n "refetchOnWindowFocus: true" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 1 match
    - `grep -n "from(\"listings\")" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 1 match
    - `grep -n "limit(500)" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 1 match
    - `grep -n "swr" src/lib/supabase/hooks/useListingsSnapshot.ts` returns 0 matches (L4 — no SWR)
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
</task>

<task id="07-05-02" type="auto" tdd="true">
  <name>Task 2: Test useListingsSnapshot — 3 paths (real data / empty fallback / error)</name>
  <files>src/lib/supabase/hooks/useListingsSnapshot.test.tsx</files>
  <read_first>
    - src/lib/supabase/hooks/useWishlists.test.tsx (full file — reuse mock chain + makeWrapper harness)
    - src/lib/mock-data/preview-listings.ts (PREVIEW_LISTINGS export)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §useListingsSnapshot.test.tsx (diverge rules at lines 505-511)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall 2 (key shape requirement)
  </read_first>
  <behavior>
    - DB returns [sampleListing] → hook's data === [sampleListing] (NOT mocks)
    - DB returns [] → hook's data === PREVIEW_LISTINGS (D-01 silent fallback)
    - DB throws error → hook enters error state
  </behavior>
  <action>
    Create `src/lib/supabase/hooks/useListingsSnapshot.test.tsx`, mirroring `useWishlists.test.tsx` harness:

    ```typescript
    import type { DbListing } from "@/types/database";
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { renderHook, waitFor } from "@testing-library/react";
    import type { ReactNode } from "react";
    import { beforeEach, describe, expect, it, vi } from "vitest";

    // The hook uses .from("listings").select("*").limit(500).order(...)
    // So we need mockFrom → { select } → { limit } → { order }
    const mockOrder = vi.fn();
    const mockLimit = vi.fn(() => ({ order: mockOrder }));
    const mockSelect = vi.fn(() => ({ limit: mockLimit, order: mockOrder }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

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

    import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
    import { useListingsSnapshot } from "./useListingsSnapshot";

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

    describe("useListingsSnapshot", () => {
      it("returns real listings when Supabase has rows (NOT mocks)", async () => {
        const realListing = { ...PREVIEW_LISTINGS[0], id: "real-1", source: "WebMotors" } satisfies DbListing;
        mockOrder.mockResolvedValue({ data: [realListing], error: null });

        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

        await waitFor(() => expect(result.current.data?.length).toBe(1));
        expect(result.current.data?.[0].id).toBe("real-1");
      });

      it("falls back to PREVIEW_LISTINGS when Supabase returns [] (D-01)", async () => {
        mockOrder.mockResolvedValue({ data: [], error: null });

        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

        await waitFor(() => expect(result.current.data?.length).toBe(PREVIEW_LISTINGS.length));
        expect(result.current.data).toEqual(PREVIEW_LISTINGS);
      });

      it("enters error state when Supabase errors", async () => {
        mockOrder.mockResolvedValue({ data: null, error: { message: "db down" } });

        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
      });

      it("calls .limit(500) on the query", async () => {
        mockOrder.mockResolvedValue({ data: [], error: null });

        const { Wrapper } = makeWrapper();
        renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

        await waitFor(() => expect(mockLimit).toHaveBeenCalledWith(500));
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/supabase/hooks/useListingsSnapshot.test.tsx` exists
    - `grep -n "falls back to PREVIEW_LISTINGS" src/lib/supabase/hooks/useListingsSnapshot.test.tsx` returns 1 match
    - `grep -n "calls \\.limit(500)" src/lib/supabase/hooks/useListingsSnapshot.test.tsx` returns 1 match
    - `pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx --run` exits 0 with 4 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx --run` green
- `pnpm typecheck && pnpm lint` both green
- D-01 silent fallback verified by the second test
</verification>

<success_criteria>
- Hook follows exact useWishlists idiom (same key prefix, same auth gate, same React Query config pattern)
- D-01 fallback: 4th test proves .limit(500) is called (correct query shape)
- No SWR imports (L4 landmine honored)
- Downstream plan 07-09 can now `const { data: snapshot = [] } = useListingsSnapshot();` and get real-or-mock transparently
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-05-SUMMARY.md` documenting:
- Hook export shape
- Test count (4 tests)
- Confirmation of D-01 silent fallback behavior
</output>
