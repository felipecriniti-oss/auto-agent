---
plan_id: "07-11"
phase: 7
slug: wishlist-ui
wave: 4
title: "WishlistModule in-place rewrite — Supabase hooks + AlertDialog + summarize import"
depends_on:
  - "07-02"   # soft-delete hook migration
  - "07-10"   # WishlistFormSheet
files_modified:
  - src/components/v3/modules/WishlistModule.tsx
  - src/components/v3/modules/WishlistModule.test.tsx
requirements_addressed:
  - D-13
  - D-14
  - D-08
  - GOAL-MODULE
autonomous: true
must_haves:
  truths:
    - "WishlistModule imports zero symbols from @/lib/stores/app (Zustand fully removed)"
    - "Uses useWishlists / useCreateWishlist / useUpdateWishlist / useDeleteWishlist from @/lib/supabase/hooks/useWishlists"
    - "Delete action opens shadcn AlertDialog — NOT window.confirm"
    - "AlertDialog auto-focuses Cancel button (UI-SPEC a11y)"
    - "Empty state heading reads 'Ainda sem wishlists' verbatim"
    - "Error state card reads 'Não carregou suas wishlists. Recarregue a página ou tente em alguns minutos.' verbatim"
    - "Module imports summarize() from @/lib/wishlist/summarize (no duplicated helper)"
  artifacts:
    - path: "src/components/v3/modules/WishlistModule.tsx"
      provides: "Module root — grid + empty/loading/error states + AlertDialog + form sheet orchestration"
      contains_not: "useAppStore"
      contains_not: "LocalWishlist"
      contains_not: "window.confirm"
      contains_not: "confirm("
  key_links:
    - from: "src/app/app/page.tsx (AppShell router)"
      to: "src/components/v3/modules/WishlistModule.tsx"
      via: "module registry"
      pattern: "WishlistModule"
---

<objective>
Phase 7's keystone integration plan. Rewrites `WishlistModule.tsx` in place: (1) swaps Zustand → Supabase hooks; (2) swaps `window.confirm` → shadcn AlertDialog with Cancel-focus; (3) swaps internal `WishlistFormDrawer` → external `WishlistFormSheet` (plan 07-10); (4) imports `summarize` from the extracted helper (plan 07-10); (5) keeps `EmptyState`, `WishlistCard`, `Row`, `Chip`, `StatusBadge` visual components verbatim from Phase 5 scaffold.

Purpose: GOAL-MODULE. Without this, the lojista never sees a Supabase-backed wishlist grid. This is THE plan that proves Phase 7 works end-to-end.
Output: 2 files (rewrite + test); `grep -rn useAppStore|LocalWishlist|window.confirm src/components/v3/modules/WishlistModule.tsx` returns 0.
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
@src/components/v3/modules/WishlistModule.tsx
@src/components/v3/modules/WishlistFormSheet.tsx
@src/lib/supabase/hooks/useWishlists.ts
@src/lib/wishlist/summarize.ts
@src/components/ui/alert-dialog.tsx
@src/components/ui/card.tsx
@src/components/ui/skeleton.tsx
@src/types/database.ts
</context>

<interfaces>
<!-- From plan 07-02 — useWishlists hook surface -->
useWishlists(): UseQueryResult<DbWishlist[]>
useCreateWishlist(): UseMutationResult<DbWishlist, Error, WishlistInsertInput>
useUpdateWishlist(): UseMutationResult<DbWishlist, Error, { id: string; patch: WishlistUpdateInput }>
useDeleteWishlist(): UseMutationResult<string, Error, string>   // now soft-deletes

<!-- From plan 07-10 -->
WishlistFormSheet: props { initial?, open?, onOpenChange?, onSaved?, layout? }

<!-- From plan 07-10 -->
summarize(w: SummarizableWishlist): string

<!-- From shadcn alert-dialog -->
AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
</interfaces>

<tasks>

<task id="07-11-01" type="auto" tdd="true">
  <name>Task 1: WishlistModule in-place rewrite — Supabase hooks + AlertDialog + external sheet</name>
  <files>src/components/v3/modules/WishlistModule.tsx</files>
  <read_first>
    - src/components/v3/modules/WishlistModule.tsx (READ ENTIRELY — all 722 lines. You're rewriting in place; you need to preserve visual components exactly)
    - src/components/v3/modules/WishlistFormSheet.tsx (plan 07-10 output — the new form component to compose)
    - src/lib/supabase/hooks/useWishlists.ts (post-plan-07-02 — soft delete + archived filter wired)
    - src/lib/wishlist/summarize.ts (plan 07-10 output — import instead of inlining)
    - src/components/ui/alert-dialog.tsx (all 187 lines — AlertDialog primitive API)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Copywriting Contract (empty heading, empty body, error card, card actions, destructive dialog, toast strings), §Interaction Contracts §Delete flow, §State Matrix row "Module page"
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-13 (AlertDialog not window.confirm), §D-14 (soft-delete visual effect), §D-15 (module uses it but sidebar rename is plan 07-12)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §WishlistModule.tsx (lines 1211-1282 — exact preserve/replace plan), Cross-Cutting §AlertDialog Template (lines 1740-1769 verbatim)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall 4 (useCreateWishlist is NOT optimistic — toast + close is feedback)
  </read_first>
  <action>
    Rewrite `src/components/v3/modules/WishlistModule.tsx` in place. Strategy:

    **PRESERVE verbatim (copy-paste from the current file):**
    - `EmptyState` component (approx lines 205-228) — only change heading to `"Ainda sem wishlists"` and body to UI-SPEC copy
    - `WishlistCard` (approx lines 230-329) — visual unchanged; update props to use `DbWishlist` instead of `LocalWishlist`
    - `Row` helper (approx lines 331-349) — unchanged
    - `Chip` helper (approx lines 351-367) — unchanged
    - `StatusBadge` (wherever declared) — unchanged
    - `formatBrl` helper (lines 82-85) — may stay co-located or move to a lib/util; for minimal change, keep in this file

    **REPLACE:**
    - Imports: remove `useAppStore`, `LocalWishlist`, `WishlistInput` from `@/lib/stores/app`
    - Imports: add `useWishlists`, `useCreateWishlist`, `useUpdateWishlist`, `useDeleteWishlist` from `@/lib/supabase/hooks/useWishlists`
    - Imports: add `type DbWishlist` from `@/types/database`
    - Imports: add `WishlistFormSheet` from `./WishlistFormSheet`
    - Imports: add `summarize` from `@/lib/wishlist/summarize`
    - Imports: add AlertDialog primitives from `@/components/ui/alert-dialog`
    - Imports: add `{ toast } from "sonner"` if not already
    - Hook usage: replace `useAppStore((s) => s.wishlists)` with `const { data: wishlists = [], isLoading, isError } = useWishlists();`
    - Hook usage: replace any `createWishlist`/`updateWishlist`/`deleteWishlist` from Zustand with `const createMut = useCreateWishlist(); const updateMut = useUpdateWishlist(); const deleteMut = useDeleteWishlist();`
    - Delete handler: remove `if (confirm(...))` block. Add `const [deleting, setDeleting] = useState<DbWishlist | null>(null);` state. Card's onDelete prop → `() => setDeleting(wl)`
    - Internal `WishlistFormDrawer` component: REMOVE. Replace with `<WishlistFormSheet open={...} onOpenChange={...} initial={...} />` at the module's return level (only rendered when the open/editing state indicates)
    - Add a "+ Nova Wishlist" button at the module header (UI-SPEC Copy: `+ Nova Wishlist`) — uses accent `bg-[#4C46DC] text-white hover:bg-[#3f39c1]`
    - Module h1: `Minhas Wishlists` + subtitle `Cadastre os carros que você quer comprar. O sistema monitora o WebMotors e entrega oportunidades compatíveis.`
    - Grid: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
    - Loading state: render 3 shadcn `<Skeleton>` card placeholders
    - Error state: render a Card with `Não carregou suas wishlists. Recarregue a página ou tente em alguns minutos.`
    - Empty state: render `EmptyState` with heading `Ainda sem wishlists` + body per UI-SPEC
    - Summary helper call sites: replace any local `summarize(local)` with imported `summarize(dbWishlist)`

    **AlertDialog template** (paste from PATTERNS.md Cross-Cutting §AlertDialog Template lines 1740-1769):

    ```typescript
    <AlertDialog
      open={deleting !== null}
      onOpenChange={(o) => !o && setDeleting(null)}
    >
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
            onClick={() => {
              if (!deleting) return;
              deleteMut.mutate(deleting.id, {
                onSuccess: () => toast.success("Wishlist removida."),
              });
              setDeleting(null);
            }}
          >
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    ```

    **Pause/Resume handler** (pre-existing pattern but rebound to `updateMut`):

    ```typescript
    const togglePause = (w: DbWishlist) => {
      const nextStatus = w.status === "paused" ? "active" : "paused";
      updateMut.mutate({ id: w.id, patch: { status: nextStatus } }, {
        onSuccess: () =>
          toast.success(
            nextStatus === "paused"
              ? "Wishlist pausada. O sistema não criará novas oportunidades até retomar."
              : "Wishlist ativa de novo.",
          ),
      });
    };
    ```

    **Editing state management:**
    ```typescript
    const [formState, setFormState] = useState<{ mode: "create" | "edit"; initial?: DbWishlist } | null>(null);

    // Header button
    <Button
      onClick={() => setFormState({ mode: "create" })}
      className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
    >
      + Nova Wishlist
    </Button>

    // Sheet rendering (at module bottom)
    {formState !== null && (
      <WishlistFormSheet
        initial={formState.initial}
        open
        onOpenChange={(o) => { if (!o) setFormState(null); }}
        onSaved={() => setFormState(null)}
      />
    )}
    ```

    **Sorting: paused cards to bottom** — preserved from scaffold:
    ```typescript
    const sorted = [...wishlists].sort((a, b) => {
      if (a.status === "paused" && b.status !== "paused") return 1;
      if (a.status !== "paused" && b.status === "paused") return -1;
      return 0;
    });
    ```

    Final `grep` self-check before commit:
    - `grep -n "useAppStore\|LocalWishlist\|from \"@/lib/stores/app\"" src/components/v3/modules/WishlistModule.tsx` MUST return 0 matches.
    - `grep -n "window.confirm\|confirm(" src/components/v3/modules/WishlistModule.tsx` MUST return 0 matches (scaffold line 181).
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "useAppStore\|LocalWishlist\|from \"@/lib/stores/app\"" src/components/v3/modules/WishlistModule.tsx` returns 0 matches
    - `grep -n "window.confirm" src/components/v3/modules/WishlistModule.tsx` returns 0 matches
    - `grep -nE "\\bconfirm\\(" src/components/v3/modules/WishlistModule.tsx` returns 0 matches
    - `grep -n "useWishlists\\|useCreateWishlist\\|useUpdateWishlist\\|useDeleteWishlist" src/components/v3/modules/WishlistModule.tsx` returns ≥4 matches (all four hook imports/usages)
    - `grep -n "import .*WishlistFormSheet.* from \"./WishlistFormSheet\"" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "import .*summarize.* from \"@/lib/wishlist/summarize\"" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "AlertDialog" src/components/v3/modules/WishlistModule.tsx` returns ≥3 matches (import + open + content)
    - `grep -n "autoFocus" src/components/v3/modules/WishlistModule.tsx` returns ≥1 match (AlertDialogCancel autoFocus per UI-SPEC a11y)
    - `grep -n "Ainda sem wishlists" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "Minhas Wishlists" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "Não carregou suas wishlists" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "Apagar wishlist\\?" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `grep -n "\\+ Nova Wishlist" src/components/v3/modules/WishlistModule.tsx` returns 1 match
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
    - `pnpm build` exits 0
  </acceptance_criteria>
</task>

<task id="07-11-02" type="auto" tdd="true">
  <name>Task 2: WishlistModule integration tests — render states + delete flow</name>
  <files>src/components/v3/modules/WishlistModule.test.tsx</files>
  <read_first>
    - src/components/v3/modules/WishlistModule.tsx (task 07-11-01 output)
    - src/lib/supabase/hooks/useWishlists.ts (hook surface)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §WishlistModule.test.tsx (lines 1272-1281 — key tests)
  </read_first>
  <behavior>
    - When `useWishlists` returns data.length === 0 → empty state renders
    - When data has 2 wishlists → 2 cards render
    - When `isLoading` is true → skeleton card placeholders render
    - When `isError` is true → error card "Não carregou..." renders
    - Click delete icon on a card → AlertDialog opens with title "Apagar wishlist?"
    - AlertDialog Manter button is auto-focused (Cancel)
    - Click "Apagar" → deleteMut.mutate called
    - Click "Manter" → AlertDialog closes, deleteMut NOT called
  </behavior>
  <action>
    Create `src/components/v3/modules/WishlistModule.test.tsx`:

    ```typescript
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { fireEvent, render, screen } from "@testing-library/react";
    import type { ReactNode } from "react";
    import { beforeEach, describe, expect, it, vi } from "vitest";
    import type { DbWishlist } from "@/types/database";

    const mockDeleteMutate = vi.fn();
    const mockUpdateMutate = vi.fn();
    let mockData: DbWishlist[] = [];
    let mockIsLoading = false;
    let mockIsError = false;

    vi.mock("sonner", () => ({
      toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    vi.mock("@/lib/supabase/hooks/useWishlists", () => ({
      useWishlists: () => ({ data: mockData, isLoading: mockIsLoading, isError: mockIsError }),
      useCreateWishlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useUpdateWishlist: () => ({ mutate: mockUpdateMutate, mutateAsync: vi.fn(), isPending: false }),
      useDeleteWishlist: () => ({ mutate: mockDeleteMutate, mutateAsync: vi.fn(), isPending: false }),
    }));

    vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
      useListingsSnapshot: () => ({ data: [], isLoading: false, isError: false }),
    }));

    import { WishlistModule } from "./WishlistModule";

    function makeWrapper() {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
      });
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      return { Wrapper };
    }

    function makeWishlist(overrides: Partial<DbWishlist> = {}): DbWishlist {
      return {
        id: "w1",
        user_id: "u1",
        name: "Meu Civic",
        brand: "Honda",
        model: "Civic",
        trim: null,
        year_min: 2018,
        year_max: null,
        km_max: null,
        price_max: null,
        fuel_type: [],
        transmission: [],
        armored: null,
        region_uf: ["SP"],
        region_cities: ["São Paulo"],
        status: "active",
        created_at: "2026-04-20T10:00:00Z",
        updated_at: "2026-04-20T10:00:00Z",
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockData = [];
      mockIsLoading = false;
      mockIsError = false;
    });

    describe("WishlistModule", () => {
      it("renders empty state when wishlists=[]", () => {
        mockData = [];
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        expect(screen.getByText("Ainda sem wishlists")).toBeInTheDocument();
      });

      it("renders module h1 'Minhas Wishlists'", () => {
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        expect(screen.getByText("Minhas Wishlists")).toBeInTheDocument();
      });

      it("renders cards when wishlists has data", () => {
        mockData = [makeWishlist({ id: "w1", name: "Civic" }), makeWishlist({ id: "w2", name: "Corolla" })];
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        expect(screen.getByText("Civic")).toBeInTheDocument();
        expect(screen.getByText("Corolla")).toBeInTheDocument();
      });

      it("renders error card when isError is true", () => {
        mockIsError = true;
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        expect(screen.getByText(/Não carregou suas wishlists/)).toBeInTheDocument();
      });

      it("renders '+ Nova Wishlist' CTA button", () => {
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        expect(screen.getByRole("button", { name: /Nova Wishlist/ })).toBeInTheDocument();
      });

      it("opens AlertDialog with 'Apagar wishlist?' on delete click", () => {
        mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        // Find the delete button by its accessible name "Apagar"
        const deleteBtn = screen.getByRole("button", { name: /Apagar/ });
        fireEvent.click(deleteBtn);
        expect(screen.getByText("Apagar wishlist?")).toBeInTheDocument();
        expect(screen.getByText(/Meu Civic/)).toBeInTheDocument(); // name interpolated into description
      });

      it("AlertDialog Manter (cancel) closes dialog without calling deleteMut", () => {
        mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        fireEvent.click(screen.getByRole("button", { name: /Apagar/ }));
        const manterBtn = screen.getByRole("button", { name: "Manter" });
        fireEvent.click(manterBtn);
        expect(mockDeleteMutate).not.toHaveBeenCalled();
      });

      it("AlertDialog Apagar (confirm) calls deleteMut.mutate with id", () => {
        mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
        const { Wrapper } = makeWrapper();
        render(<WishlistModule />, { wrapper: Wrapper });
        // Open dialog (first Apagar button is card action)
        const cardDeleteBtn = screen.getAllByRole("button", { name: /Apagar/ })[0];
        fireEvent.click(cardDeleteBtn);
        // In the dialog: the confirm button is also labeled "Apagar" — use getAllByRole to find the dialog one
        const allApagar = screen.getAllByRole("button", { name: "Apagar" });
        // Click the last one (inside dialog)
        fireEvent.click(allApagar[allApagar.length - 1]);
        expect(mockDeleteMutate).toHaveBeenCalledWith("w1", expect.any(Object));
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/components/v3/modules/WishlistModule.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/v3/modules/WishlistModule.test.tsx` exists
    - `grep -n "Ainda sem wishlists" src/components/v3/modules/WishlistModule.test.tsx` returns ≥1 match
    - `grep -n "Apagar wishlist?" src/components/v3/modules/WishlistModule.test.tsx` returns ≥1 match
    - `grep -n "mockDeleteMutate).not.toHaveBeenCalled" src/components/v3/modules/WishlistModule.test.tsx` returns ≥1 match
    - `grep -n "mockDeleteMutate).toHaveBeenCalledWith" src/components/v3/modules/WishlistModule.test.tsx` returns ≥1 match
    - `pnpm test src/components/v3/modules/WishlistModule.test.tsx --run` exits 0 with ≥7 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/components/v3/modules/WishlistModule.test.tsx --run` green
- `pnpm typecheck && pnpm lint && pnpm build` all green
- `grep -rn "useAppStore\|LocalWishlist\|window.confirm" src/components/v3/modules/WishlistModule.tsx` returns 0 matches
- `grep -rn "WishlistFormDrawer" src/components/v3/modules/WishlistModule.tsx` returns 0 matches (internal component removed)
</verification>

<success_criteria>
- GOAL-MODULE delivered: WishlistModule compiles, renders, and wires all Supabase hooks correctly
- D-13 honored: AlertDialog replaces window.confirm
- D-14 honored: delete flow dispatches soft-delete (via hook from plan 07-02)
- D-08 honored: summarize imported from helper (not duplicated)
- Scaffold visual language preserved (EmptyState, WishlistCard, badges, card layout)
- 7 integration tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-11-SUMMARY.md` with:
- Zustand → Supabase diff summary (which imports removed)
- AlertDialog wiring confirmation
- Confirmation grep-checks all return expected counts
- Test count breakdown
</output>
