---
plan_id: "07-12"
phase: 7
slug: wishlist-ui
wave: 4
title: "Sidebar rename (D-15) + Onboarding step 3 integration + final phase gate"
depends_on:
  - "07-10"   # WishlistFormSheet with layout='inline'
  - "07-11"   # Module rewrite (ensures /app landing shows the new module)
files_modified:
  - src/components/v3/Sidebar.tsx
  - src/components/v3/Sidebar.test.tsx
  - src/app/app/onboarding/page.tsx
  - src/app/app/onboarding/page.test.tsx
requirements_addressed:
  - D-08
  - D-11
  - D-12
  - D-15
  - GOAL-MODULE
  - GOAL-FORM
autonomous: false   # Full phase gate requires `pnpm test && pnpm lint && pnpm typecheck && pnpm build` which may need developer attention if any single-file test surfaces cross-phase regression; also manual-QA items per VALIDATION.md
must_haves:
  truths:
    - "Sidebar renders label 'Minhas Wishlists' exactly once"
    - "Sidebar does NOT render a 'Marketplace' nav item"
    - "Onboarding now has 3 steps — Step union expanded, badge reads 'Passo {step} de 3'"
    - "Step 3 renders WishlistFormSheet with layout='inline'"
    - "Step 3 save flow: wishlist.insert THEN users.update onboarding_complete=true, both via existing Supabase hooks (non-atomic — L8 acknowledged)"
    - "Step 3 skip flow: users.update onboarding_complete=true, route to /app, no wishlist insert"
    - "Skip button copy: 'Pular e fazer depois'"
    - "Onboarding hero h1 Fraunces: 'Cadastre seu primeiro carro-alvo'"
    - "Final phase gate: pnpm test && pnpm lint && pnpm typecheck && pnpm build all exit 0"
  artifacts:
    - path: "src/components/v3/Sidebar.tsx"
      provides: "Updated sidebar with renamed + removed items"
      contains: "Minhas Wishlists"
      contains_not: "marketplace"
    - path: "src/app/app/onboarding/page.tsx"
      provides: "3-step wizard with wishlist save/skip"
      contains: "layout=\"inline\""
  key_links:
    - from: "src/app/app/onboarding/page.tsx"
      to: "src/components/v3/modules/WishlistFormSheet.tsx"
      via: "inline rendering with onSaved"
      pattern: "<WishlistFormSheet"
---

<objective>
Close the phase: (1) rename sidebar label and remove the marketplace slot per D-15; (2) extend the onboarding wizard to 3 steps with step 3 embedding the Wishlist form inline; (3) run the full phase gate (test + lint + typecheck + build) and verify everything passes.

Purpose: D-15 finalizes the nav IA. Onboarding step 3 closes the lojista's first-run loop (the seed Q: "how does a lojista land with their first wishlist?"). The final gate proves the phase ships.
Output: 4 files modified; final suite green; this plan is Phase 7's shipping point.
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
@src/components/v3/Sidebar.tsx
@src/app/app/onboarding/page.tsx
@src/components/v3/modules/WishlistFormSheet.tsx
@src/lib/supabase/client.ts
@src/lib/supabase/hooks/useSupabaseUser.ts
</context>

<interfaces>
<!-- Sidebar: from src/components/v3/Sidebar.tsx:41-52 -->
GROUPS array contains { key: "wishlists", label: "Wishlists", icon: ListChecks, description: "Carros que você quer" }
+ { key: "marketplace", label: "Marketplace", icon: Handshake, description: "Oportunidades pré-negociadas" }

<!-- Onboarding: from src/app/app/onboarding/page.tsx -->
type Step = 1 | 2
Badge renders "Passo {step} de 2"
handleStep2 currently updates users.update(..., onboarding_complete: true) and routes /app

<!-- Supabase browser client -->
getSupabaseBrowser().from("users").update({...}).eq("id", user.id)
</interfaces>

<tasks>

<task id="07-12-01" type="auto" tdd="true">
  <name>Task 1: Sidebar — rename "Wishlists" → "Minhas Wishlists", remove "Marketplace" slot</name>
  <files>src/components/v3/Sidebar.tsx, src/components/v3/Sidebar.test.tsx</files>
  <read_first>
    - src/components/v3/Sidebar.tsx (read fully — confirm GROUPS array location and current items)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-15 (exact rename + remove rules)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §Sidebar.tsx (lines 1287-1321 — exact before/after)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Files Modified §Sidebar.tsx (line 880 — rename + remove)
  </read_first>
  <action>
    Modify `src/components/v3/Sidebar.tsx`:

    **Change 1 — Rename `wishlists` label:**

    Find:
    ```typescript
    {
      key: "wishlists",
      label: "Wishlists",
      icon: ListChecks,
      description: "Carros que você quer",
    },
    ```

    Replace with:
    ```typescript
    {
      key: "wishlists",
      label: "Minhas Wishlists",
      icon: ListChecks,
      description: "Carros que você quer",
    },
    ```

    **Change 2 — Remove the marketplace item entirely:**

    Find and DELETE the block:
    ```typescript
    {
      key: "marketplace",
      label: "Marketplace",
      icon: Handshake,
      description: "Oportunidades pré-negociadas",
    },
    ```

    **Change 3 — Remove the `Handshake` import** if it's now unused. Check with:
    ```bash
    grep -n "Handshake" src/components/v3/Sidebar.tsx
    ```
    If only the import line remains → remove from the `lucide-react` import statement.

    **DO NOT** touch `AppModule` type in `src/lib/stores/app.ts` — other modules may still reference the union. Cleanup of MarketplaceModule is deferred to Phase 12.

    Create `src/components/v3/Sidebar.test.tsx`:

    ```typescript
    import { render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";

    // Sidebar may read app state; mock if needed. For label assertion a simple render suffices.
    vi.mock("@/lib/stores/app", () => ({
      useAppStore: (selector: any) => selector({ currentModule: "wishlists", setCurrentModule: () => {} }),
    }));

    import { Sidebar } from "./Sidebar";

    describe("Sidebar (D-15)", () => {
      it("renders label 'Minhas Wishlists'", () => {
        render(<Sidebar />);
        expect(screen.getByText("Minhas Wishlists")).toBeInTheDocument();
      });

      it("does not render 'Marketplace' nav item", () => {
        render(<Sidebar />);
        expect(screen.queryByText("Marketplace")).toBeNull();
      });
    });
    ```

    Note: if the Sidebar is a named default export OR has different store dependencies, adapt the `vi.mock` block accordingly after reading the file. The two assertions above are the contract.
  </action>
  <verify>
    <automated>pnpm test src/components/v3/Sidebar.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "label: \"Minhas Wishlists\"" src/components/v3/Sidebar.tsx` returns exactly 1 match
    - `grep -n "label: \"Wishlists\"" src/components/v3/Sidebar.tsx` returns 0 matches (old label gone)
    - `grep -n "label: \"Marketplace\"" src/components/v3/Sidebar.tsx` returns 0 matches
    - `grep -n "key: \"marketplace\"" src/components/v3/Sidebar.tsx` returns 0 matches
    - `grep -n "Handshake" src/components/v3/Sidebar.tsx` returns 0 matches (import removed if unused)
    - File `src/components/v3/Sidebar.test.tsx` exists and tests exit 0 with 2 passing
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

<task id="07-12-02" type="auto" tdd="true">
  <name>Task 2: Onboarding — expand to step 3 with inline WishlistFormSheet + skip</name>
  <files>src/app/app/onboarding/page.tsx, src/app/app/onboarding/page.test.tsx</files>
  <read_first>
    - src/app/app/onboarding/page.tsx (read fully all 306 lines — confirm Step type at line 32, handleStep2 at lines 76-108, badge at line 151)
    - src/components/v3/modules/WishlistFormSheet.tsx (from plan 07-10 — confirm layout="inline" + onSaved prop)
    - src/lib/supabase/client.ts (confirm getSupabaseBrowser)
    - src/lib/supabase/hooks/useSupabaseUser.ts (confirm useSupabaseUser)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Onboarding wizard integration (lines 243-248), §Copywriting Contract rows for onboarding hero/subtitle/CTA/skip
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-08/§D-11/§D-12 (reuse same schema, same fields, full-page flat)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §onboarding/page.tsx modifications (lines 1336-1429)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Landmines [MEDIUM] Onboarding step 3 save cannot be atomic (L8)
  </read_first>
  <action>
    Modify `src/app/app/onboarding/page.tsx`:

    **Edit 1 — Expand the Step union** (line ~32):

    Before: `type Step = 1 | 2;`
    After:  `type Step = 1 | 2 | 3;`

    **Edit 2 — Update progress badge** (line ~151):

    Before: `Passo {step} de 2`
    After:  `Passo {step} de 3`

    **Edit 3 — Move `onboarding_complete: true` OUT of handleStep2** (lines ~76-108):

    Current handler likely sets `onboarding_complete: true` + routes to /app. Remove those two lines from handleStep2 body:
    - Remove `onboarding_complete: true` from the `.update({...})` call
    - Remove the `router.replace("/app")` / route transition
    - Add `setStep(3)` at the end of the success branch

    Rewrite in this form:

    ```typescript
    const handleStep2 = async (e: React.FormEvent) => {
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
            // NOTE: onboarding_complete moved to step 3 handler (save or skip)
          })
          .eq("id", user.id);
        if (error) {
          toast.error("Falha ao salvar", { description: error.message });
          return;
        }
        setStep(3);
      } finally {
        setSubmitting(false);
      }
    };
    ```

    **Edit 4 — Add step 3 render branch** (after the existing step 2 JSX block):

    Import at top:
    ```typescript
    import { WishlistFormSheet } from "@/components/v3/modules/WishlistFormSheet";
    import { Button } from "@/components/ui/button";
    ```

    Add JSX block for step === 3:

    ```tsx
    {step === 3 && (
      <div className="mt-8 space-y-6">
        <div>
          <h1
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
            className="text-3xl font-semibold leading-[1.05] tracking-tight md:text-4xl text-slate-900 dark:text-slate-100"
          >
            Cadastre seu primeiro carro-alvo
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            Isso configura o sistema pra começar a buscar. Você pode cadastrar mais depois.
          </p>
        </div>
        <WishlistFormSheet
          layout="inline"
          onSaved={async () => {
            // Sequential non-atomic (L8 acknowledged): onboarding_complete flip
            // comes AFTER a successful wishlist insert. If insert succeeds and this
            // fails, user is onboarded minus the flag flip — they'll re-hit step 3
            // on next login, which is an acceptable degradation.
            if (!user) return;
            const supabase = getSupabaseBrowser();
            const { error } = await supabase
              .from("users")
              .update({ onboarding_complete: true })
              .eq("id", user.id);
            if (error) {
              toast.error("Wishlist salva, mas houve erro ao finalizar onboarding", {
                description: error.message,
              });
              return;
            }
            router.replace("/app");
          }}
        />
        <Button
          variant="ghost"
          type="button"
          onClick={async () => {
            if (!user || submitting) return;
            setSubmitting(true);
            try {
              const supabase = getSupabaseBrowser();
              const { error } = await supabase
                .from("users")
                .update({ onboarding_complete: true })
                .eq("id", user.id);
              if (error) {
                toast.error("Falha ao pular", { description: error.message });
                return;
              }
              router.replace("/app");
            } finally {
              setSubmitting(false);
            }
          }}
          className="w-full"
        >
          Pular e fazer depois
        </Button>
      </div>
    )}
    ```

    **Edit 5 — Hide step 1 and step 2 forms when step === 3** — wrap their existing JSX in `{step === 1 && (...)}`  and `{step === 2 && (...)}` if not already conditional.

    Create `src/app/app/onboarding/page.test.tsx`:

    ```typescript
    import { render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";

    // Router mock — onboarding page uses next/navigation
    vi.mock("next/navigation", () => ({
      useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    }));

    // useSupabaseUser must provide a user for the page to render past the gate
    vi.mock("@/lib/supabase/hooks/useSupabaseUser", () => ({
      useSupabaseUser: () => ({
        user: { id: "u1", email: "lojista@test.com" },
        loading: false,
      }),
    }));

    // Supabase client mock
    const mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    vi.mock("@/lib/supabase/client", () => ({
      getSupabaseBrowser: () => ({
        from: () => ({ update: mockUpdate, select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }) }),
      }),
    }));

    vi.mock("sonner", () => ({
      toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    // Mock the heavy form sheet so we don't need its full dep graph
    vi.mock("@/components/v3/modules/WishlistFormSheet", () => ({
      WishlistFormSheet: ({ layout, onSaved }: { layout?: string; onSaved?: () => void }) => (
        <div data-testid="wishlist-form-sheet" data-layout={layout}>
          <button type="button" onClick={() => onSaved?.()}>Saved</button>
        </div>
      ),
    }));

    // Likewise mock useListingsSnapshot for any deep imports
    vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
      useListingsSnapshot: () => ({ data: [], isLoading: false, isError: false }),
    }));

    import OnboardingPage from "./page";

    describe("OnboardingPage step 3", () => {
      it("renders 'Passo {N} de 3' (expanded wizard)", () => {
        render(<OnboardingPage />);
        // Badge on step 1 → "Passo 1 de 3"
        expect(screen.getByText(/de 3/)).toBeInTheDocument();
      });
    });
    ```

    Note: Full step 3 render requires user to advance through steps 1+2 which requires filling forms + mocking `users` Supabase fetch. The smoke test above confirms the badge edit (proof the wizard is now 3-step). Deeper step-3 integration (Pular button flow, WishlistFormSheet onSaved flow) is acknowledged as manual QA per VALIDATION.md.
  </action>
  <verify>
    <automated>pnpm test src/app/app/onboarding/page.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "type Step = 1 | 2 | 3" src/app/app/onboarding/page.tsx` returns 1 match
    - `grep -n "Passo {step} de 3\|de 3" src/app/app/onboarding/page.tsx` returns ≥1 match
    - `grep -n "Cadastre seu primeiro carro-alvo" src/app/app/onboarding/page.tsx` returns 1 match
    - `grep -n "Pular e fazer depois" src/app/app/onboarding/page.tsx` returns 1 match
    - `grep -n "layout=\"inline\"" src/app/app/onboarding/page.tsx` returns 1 match
    - `grep -n "onboarding_complete: true" src/app/app/onboarding/page.tsx` returns ≥2 matches (in onSaved and in skip handler — moved OUT of handleStep2)
    - `grep -n "<WishlistFormSheet" src/app/app/onboarding/page.tsx` returns ≥1 match
    - File `src/app/app/onboarding/page.test.tsx` exists; `pnpm test src/app/app/onboarding/page.test.tsx --run` exits 0 with ≥1 passing test
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
</task>

<task id="07-12-03" type="auto">
  <name>Task 3: Final phase gate — full suite green</name>
  <files>(no files modified — gate only)</files>
  <read_first>
    - .planning/phases/07-wishlist-ui/07-VALIDATION.md §Sampling Rate (phase gate command)
  </read_first>
  <action>
    Run the full phase gate:

    ```bash
    pnpm test && pnpm lint && pnpm typecheck && pnpm build
    ```

    If any step fails:
    1. Capture the error output
    2. Fix the root cause in the OFFENDING file (not in this plan's files)
    3. Re-run the gate
    4. Repeat until all four commands exit 0

    Common failure modes to expect and fix:
    - Biome/lint: unused imports from the scaffold rewrite — `pnpm lint --apply` auto-fixes most
    - Typecheck: orphan `useAppStore` import removed but type references remain — grep `LocalWishlist` anywhere outside `src/lib/stores/app.ts` and replace
    - Build: Next.js App Router SSR vs "use client" boundary violation — ensure all new client components have `"use client"` at top
    - Tests: React Query state leaking across tests — confirm every hook test uses the `makeWrapper()` QueryClient harness

    DO NOT commit until the gate is green.
  </action>
  <verify>
    <automated>pnpm test && pnpm lint && pnpm typecheck && pnpm build</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test` exits 0 (all phase 7 tests + all prior phase tests)
    - `pnpm lint` exits 0
    - `pnpm typecheck` exits 0
    - `pnpm build` exits 0
    - Git status shows no uncommitted changes in files outside Phase 7 scope (other than legitimate cross-plan fixes)
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test && pnpm lint && pnpm typecheck && pnpm build` all exit 0
- `grep -rn "label: \"Marketplace\"" src/components/v3/Sidebar.tsx` returns 0
- `grep -rn "Passo {step} de 2" src/app/app/onboarding/page.tsx` returns 0 (old badge replaced)
- Manual-QA checklist from VALIDATION.md (responsive sheet, dark mode, accent reservation, debounce feel) is documented for human verification but not blocking
</verification>

<success_criteria>
- D-15 fully closed: sidebar rename + removal complete
- Onboarding wizard extended to 3 steps; step 3 renders WishlistFormSheet inline with save + skip flows
- Phase gate green
- Phase 7 ready to ship — lojista can sign up → complete onboarding → land on /app with first wishlist created (or skipped) → see grid → open sheet → create/edit/delete/pause/resume wishlists → observe live preview count
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-12-SUMMARY.md` documenting:
- Sidebar change (label + removal)
- Onboarding step 3 integration (non-atomic save, acknowledged L8)
- Final gate results (`pnpm test && pnpm lint && pnpm typecheck && pnpm build` output)
- Pointer to next phase (Phase 8 — scraping pipeline) or to /gsd-verify-work
</output>

<phase_end_summary>
## Phase 7 Wishlist UI — Complete Must-Haves

With all 12 plans executed, these are verifiable:

1. **Lojista can create a wishlist with brand + model (mandatory)** — RHF form + Zod validation; save → useCreateWishlist → Supabase insert → grid shows new card
2. **Edit flow works** — click Editar → sheet opens with pre-filled values → Salvar → useUpdateWishlist
3. **Delete via AlertDialog soft-deletes (status=archived); card disappears from grid**
4. **Pause/Resume toggle** — useUpdateWishlist with status="paused"|"active" + sonner toast
5. **Preview pane** — "acharíamos X anúncios" live, debounced 400ms; falls back to mocks when DB empty
6. **FIPE cascade** — brand snapshot instant paint; models on-demand via React Query; silent fallback on 5xx/timeout
7. **Sidebar** — "Minhas Wishlists" label; no Marketplace entry
8. **Onboarding step 3** — form embedded; save or skip flips onboarding_complete
9. **Dark mode** — globals.css fallback layer carries chrome; accent strictly on 7 UI-SPEC loci
10. **Phase gate** — `pnpm test && pnpm lint && pnpm typecheck && pnpm build` green
11. **Zero Zustand imports in WishlistModule.tsx** — grep-verified
12. **Zero window.confirm in module** — grep-verified

All landmines L1-L9 addressed by the plan structure:
- L1 (FIPE GET) → plan 07-03
- L2 (engine signature) → plan 07-09 adapter + inverse loop
- L3 (hard-delete hook) → plan 07-02 as own atomic plan
- L4 (SWR vs React Query) → documented in every plan that touches server state
- L5 (no shadcn sheet) → plan 07-10 uses scaffold aside + Dialog pattern
- L6 (enforcePfOnly false + status active) → plan 07-01 + 07-09
- L7 (useCreateWishlist non-optimistic) → acknowledged in plan 07-10 (toast+close as feedback, no added onMutate)
- L8 (non-atomic onboarding) → plan 07-12 uses sequential + toast on partial failure
- L9 (Zustand imports removed) → plan 07-11 acceptance_criteria grep
</phase_end_summary>
