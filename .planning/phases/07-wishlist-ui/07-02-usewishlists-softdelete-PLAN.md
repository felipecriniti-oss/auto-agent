---
plan_id: "07-02"
phase: 7
slug: wishlist-ui
wave: 1
title: "useWishlists soft-delete migration + archived filter + test updates"
depends_on: []
files_modified:
  - src/lib/supabase/hooks/useWishlists.ts
  - src/lib/supabase/hooks/useWishlists.test.tsx
requirements_addressed:
  - D-09
  - D-14
autonomous: true
must_haves:
  truths:
    - "useDeleteWishlist issues UPDATE {status:'archived'} — never DELETE FROM wishlists"
    - "useWishlists list query filters rows with status='archived'"
    - "Existing optimistic onMutate/onError/onSettled is preserved — UI still sees immediate removal"
    - "Phase 6's 3 passing tests remain green after the migration"
  artifacts:
    - path: "src/lib/supabase/hooks/useWishlists.ts"
      provides: "Soft-delete CRUD hooks"
      contains: "update({ status: \"archived\" })"
    - path: "src/lib/supabase/hooks/useWishlists.test.tsx"
      provides: "Updated tests covering .neq + update-not-delete"
      contains: ".neq(\"status\", \"archived\")"
  key_links:
    - from: "src/components/v3/modules/WishlistModule.tsx (plan 07-11)"
      to: "src/lib/supabase/hooks/useWishlists.ts"
      via: "useDeleteWishlist mutation"
      pattern: "useDeleteWishlist\\(\\)"
---

<objective>
Close landmine L3 as its OWN plan. Today `useDeleteWishlist` hard-deletes rows (`supabase.from("wishlists").delete()`); CONTEXT D-14 mandates soft-delete via `status="archived"`. This plan surgically edits the hook (2 edits) plus the co-located Phase 6 test file (update mock chain + add 2 new tests).

Purpose: Downstream Plan 07-11 (WishlistModule rewrite) and Plan 07-12 (onboarding/sidebar) both depend on the hook behaving correctly. If this migration is buried inside the module rewrite, Phase 6's existing tests break silently and the UI gets a schizophrenic data layer.
Output: 2 files modified; hook tests all green; downstream consumers see identical API surface (hook names + return types unchanged).
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
@src/types/database.ts
</context>

<interfaces>
<!-- Hook contract MUST remain unchanged for downstream consumers -->

useWishlists(): UseQueryResult<DbWishlist[]>    // same
useCreateWishlist(): UseMutationResult<DbWishlist, Error, WishlistInsertInput>   // unchanged
useUpdateWishlist(): UseMutationResult<DbWishlist, Error, { id: string; patch: WishlistUpdateInput }>   // unchanged
useDeleteWishlist(): UseMutationResult<string, Error, string>   // unchanged API — mutates behavior only

WishlistStatus: "active" | "paused" | "archived"   // "archived" is the new value flowing through delete mutation
</interfaces>

<tasks>

<task id="07-02-01" type="auto" tdd="true">
  <name>Task 1: Soft-delete the delete mutation + filter archived on list</name>
  <files>src/lib/supabase/hooks/useWishlists.ts</files>
  <read_first>
    - src/lib/supabase/hooks/useWishlists.ts (read the whole file, all 155 lines — need current fetchWishlists at lines 28-37 and useDeleteWishlist at lines 119-155)
    - src/types/database.ts (confirm WishlistStatus enum includes "archived" — it does, line 100 approx)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-14 (soft delete lock)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §useWishlists.ts modifications (exact before/after diffs at lines 1435-1485)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pattern 4 Soft delete wrapper (lines 473-496)
  </read_first>
  <action>
    Make TWO surgical edits to `src/lib/supabase/hooks/useWishlists.ts`:

    **Edit 1 — Append `.neq("status", "archived")` to fetchWishlists chain.**

    Find the block (approximately lines 28-37):
    ```typescript
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
    ```

    Replace with:
    ```typescript
    async function fetchWishlists(userId: string): Promise<DbWishlist[]> {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("wishlists")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "archived")            // D-14: soft-delete filter
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
    ```

    **Edit 2 — Change `.delete()` to `.update({ status: "archived" })` inside useDeleteWishlist mutationFn.**

    Find the block (approximately lines 120-135):
    ```typescript
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
    ```

    Replace with:
    ```typescript
    mutationFn: async (id: string): Promise<string> => {
      if (!user) throw new Error("not_authenticated");
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("wishlists")
        .update({ status: "archived" })      // D-14: soft delete
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      return id;
    },
    ```

    **DO NOT TOUCH** the `onMutate`/`onError`/`onSettled` block — optimistic filter-out logic stays correct (the card disappears from client state either way).

    **DO NOT TOUCH** `useCreateWishlist` or `useUpdateWishlist` — their contracts are unchanged.

    Hook contract (API surface) MUST remain unchanged — same exports, same TypeScript types, same return shapes.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint --filter=src/lib/supabase/hooks/useWishlists.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "\.neq(\"status\", \"archived\")" src/lib/supabase/hooks/useWishlists.ts` returns exactly 1 match
    - `grep -n "\.update({ status: \"archived\" })" src/lib/supabase/hooks/useWishlists.ts` returns exactly 1 match
    - `grep -cE '\.delete\(\)' src/lib/supabase/hooks/useWishlists.ts` returns 0 (hard-delete fully removed)
    - `grep -n "useCreateWishlist\|useUpdateWishlist\|useDeleteWishlist\|useWishlists" src/lib/supabase/hooks/useWishlists.ts` returns ≥4 exports (API surface preserved)
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
</task>

<task id="07-02-02" type="auto" tdd="true">
  <name>Task 2: Update hook tests — mock chain .neq + soft-delete assertion</name>
  <files>src/lib/supabase/hooks/useWishlists.test.tsx</files>
  <read_first>
    - src/lib/supabase/hooks/useWishlists.test.tsx (read all 102 lines — need current mockEq/mockSelect chain at lines 9-32)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §useWishlists.test.tsx (excerpt at lines 1490-1525 — exact new mock shape + 2 new tests)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall / Landmine L3 tests update
  </read_first>
  <behavior>
    - Existing 3 Phase 6 tests remain green after mock-chain updates to reflect `.neq`
    - NEW: test asserts `.neq("status", "archived")` is invoked on the list query
    - NEW: test asserts useDeleteWishlist calls `update({status:"archived"})` with the right chain, NOT `delete()`
    - Optimistic behavior preserved — one test demonstrates `onMutate` still filters the row locally
  </behavior>
  <action>
    Modify `src/lib/supabase/hooks/useWishlists.test.tsx`:

    **Step 1 — Extend the mock chain to include `.neq` after `.eq("user_id", ...)`**

    Before (around lines 9-19):
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
    ```

    After:
    ```typescript
    const mockOrder = vi.fn();
    const mockNeq = vi.fn(() => ({ order: mockOrder }));
    const mockEq1 = vi.fn(() => ({
      // list query: .eq("user_id", x).neq("status", "archived").order(...)
      neq: mockNeq,
      order: mockOrder,
      // update/delete path: .eq("id", x).eq("user_id", y) — final eq resolves to a PromiseLike
      eq: vi.fn().mockReturnValue({ then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) }),
    }));
    const mockSelect = vi.fn(() => ({ eq: mockEq1, order: mockOrder }));
    const mockInsert = vi.fn();
    const mockUpdate = vi.fn(() => ({ eq: mockEq1 }));
    const mockDelete = vi.fn();
    const mockFrom = vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    }));
    ```

    **Step 2 — Add two new tests**

    At the bottom of the existing describe block, add:

    ```typescript
    it("useWishlists applies .neq('status', 'archived') on list query (D-14 filter)", async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      const { Wrapper } = makeWrapper();
      renderHook(() => useWishlists(), { wrapper: Wrapper });
      await waitFor(() => {
        expect(mockNeq).toHaveBeenCalledWith("status", "archived");
      });
    });

    it("useDeleteWishlist issues update({status:'archived'}) not delete() (D-14 soft-delete)", async () => {
      // Seed list so the hook has a query to invalidate
      mockOrder.mockResolvedValue({ data: [], error: null });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDeleteWishlist(), { wrapper: Wrapper });
      await act(async () => {
        await result.current.mutateAsync("w1");
      });
      expect(mockUpdate).toHaveBeenCalledWith({ status: "archived" });
      expect(mockDelete).not.toHaveBeenCalled();
    });
    ```

    Import `useDeleteWishlist` and `act` at top if not already imported:
    ```typescript
    import { useDeleteWishlist, useWishlists } from "./useWishlists";
    import { act, renderHook, waitFor } from "@testing-library/react";
    ```

    **Step 3 — Verify existing 3 Phase 6 tests still pass** (list success, list empty, insert success per VERIFICATION.md line 34). The mock chain edits preserve the `mockEq1.eq` fallback for update/delete paths so the insert test's `mockInsert` assertions stay green.

    If any existing test breaks due to chain reshape, adjust ONLY the mock wiring — do NOT change the assertions (Phase 6 contract stays).
  </action>
  <verify>
    <automated>pnpm test src/lib/supabase/hooks/useWishlists.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "neq: mockNeq" src/lib/supabase/hooks/useWishlists.test.tsx` returns ≥1 match
    - `grep -n ".neq('status', 'archived')" src/lib/supabase/hooks/useWishlists.test.tsx || grep -n ".neq(\"status\", \"archived\")" src/lib/supabase/hooks/useWishlists.test.tsx` returns ≥1 match
    - `grep -n "mockUpdate).toHaveBeenCalledWith({ status: \"archived\" })" src/lib/supabase/hooks/useWishlists.test.tsx` returns exactly 1 match
    - `grep -n "useDeleteWishlist issues update" src/lib/supabase/hooks/useWishlists.test.tsx` returns exactly 1 match
    - `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx --run` exits 0 with all original 3 tests plus 2 new tests = ≥5 tests passing
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx --run` all tests green
- `pnpm typecheck` green
- `pnpm lint` green
- Downstream plans (07-11, 07-12) can call `useDeleteWishlist().mutate(id)` and observe: (a) no DELETE SQL issued, (b) local list immediately filters the row via onMutate, (c) server update({status:"archived"}) fires, (d) subsequent refetch hides the row via .neq filter.
</verification>

<success_criteria>
- D-14 fully satisfied: hook contract unchanged from consumer perspective, server behavior flipped
- Phase 6 tests remain green + 2 new assertions added
- No breakage of `useCreateWishlist` / `useUpdateWishlist` paths
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-02-SUMMARY.md` documenting:
- Exact diff applied to useWishlists.ts (2 surgical edits)
- Test count before/after (3 → 5)
- Confirmation that no consumer-facing type changed
</output>
