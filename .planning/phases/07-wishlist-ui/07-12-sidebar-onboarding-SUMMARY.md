---
phase: 7
plan: "07-12"
subsystem: wishlist-ui
tags: [D-15, sidebar-rename, onboarding-wizard, B5, L8, phase-gate]
status: complete
completed: 2026-04-25
duration_min: ~30
dependency_graph:
  requires:
    - "07-10"  # WishlistFormSheet with layout='inline' + submitLabel
    - "07-11"  # WishlistModule rewrite (so /app landing is the new module)
  provides:
    - "D-15 sidebar IA close (rename + Marketplace slot removal)"
    - "Onboarding step 3 — first-wishlist creation with inline form"
    - "B5 sequential save with loading overlay + recovery path"
    - "Phase 7 shipping gate (test + lint + typecheck green)"
  affects:
    - "Phase 12 (Marketplace cleanup)"
tech_stack:
  added: []  # zero new deps
  patterns:
    - "Sequential non-atomic save with explicit loading overlay (B5/L8)"
    - "Inline embed of a sheet form via layout='inline' prop (composition reuse)"
    - "Step-conditional hero copy (eyebrow + Fraunces h1 + subtitle) under one h1 element"
key_files:
  created:
    - "src/components/v3/Sidebar.test.tsx"
    - "src/app/app/onboarding/page.test.tsx"
    - ".planning/phases/07-wishlist-ui/07-12-sidebar-onboarding-SUMMARY.md"
  modified:
    - "src/components/v3/Sidebar.tsx"
    - "src/app/app/onboarding/page.tsx"
decisions:
  - "Step 2 button copy 'Entrar no painel' → 'Continuar' (now advances to step 3, not /app)"
  - "Step 2 update no longer flips onboarding_complete (moved to step 3 save or skip)"
  - "Step 3 save flow is sequential (B5/L8): wishlist insert → onboarding_complete flip; recovery via Pular button if flip fails after wishlist insert succeeds"
  - "Eyebrow copy reads 'Primeira wishlist · piloto SP' on step 3 to keep micro-context honest"
metrics:
  duration: "~30 minutes wall-clock"
  commits: 4
  tests_added: 3  # 2 Sidebar + 1 onboarding
  tests_passing: 372  # full suite
  files_created: 2
  files_modified: 2
---

# Phase 7 Plan 07-12: Sidebar D-15 + Onboarding Step 3 Summary

**One-liner:** Closes Phase 7 by renaming the sidebar wishlists slot ("Minhas Wishlists") and removing the legacy Marketplace entry (D-15), plus extending the onboarding wizard to a 3rd step that embeds `WishlistFormSheet` inline with the B5 sequential-save toast ordering and Pular as the recovery path; phase gate ran with test + lint + typecheck green and a single pre-existing build regression on `/reset-password` documented for the orchestrator's verifier.

## Sidebar change (D-15)

Two surgical edits inside `GROUPS` in `src/components/v3/Sidebar.tsx`:

1. **Rename** — the `wishlists` item label changed from `"Wishlists"` to `"Minhas Wishlists"` (D-15 explicit). Description, key, and icon (`ListChecks`) preserved.
2. **Removal** — the entire `marketplace` block (key/label/icon/description) deleted from the Operação group. Per CONTEXT D-15, the legacy `MarketplaceModule` code stays in the repo and the `AppModule` type union is intentionally untouched (Phase 12 cleanup will delete both).
3. **Import cleanup** — `Handshake` import dropped from `lucide-react` once unused; verified by grep.

The Marketplace navigation slot is gone from the rendered sidebar without breaking any other consumer (the union still has the `marketplace` key for any code path that still references it, and we ship to Phase 12 for the cleanup).

Tests: 2 contracts in `src/components/v3/Sidebar.test.tsx` — "renders 'Minhas Wishlists'" and "does not render 'Marketplace' nav item". Mocks for `useAppStore` (selector-shaped), `useProfile`, and `ThemeToggle` keep the test isolated from network/state.

## Onboarding step 3 integration

`src/app/app/onboarding/page.tsx`:

### Step union + badge

`type Step = 1 | 2` → `1 | 2 | 3`. Header badge "Passo {step} de 2" → "Passo {step} de 3". Eyebrow copy switches to "Primeira wishlist · piloto SP" on step 3.

### Hero per step

The single Fraunces `<h1>` now picks copy by step:

- Step 1: "Conta *quem você é*."
- Step 2: "Quase *lá*."
- Step 3: "Cadastre seu primeiro carro-alvo"

Subtitle is also step-conditional, with step 3 showing "Isso configura o sistema pra começar a buscar. Você pode cadastrar mais depois." (UI-SPEC §Copywriting Contract row).

### handleStep2 refactor (B5/L8)

Previously, the step-2 submit set `onboarding_complete: true` and routed to `/app` in one shot. That's incompatible with the 3-step wizard (would skip step 3 entirely). Refactor:

- Removed `onboarding_complete: true` from the `users.update(...)` payload in `handleStep2`
- Removed `router.replace("/app")`
- Added `setStep(3)` on success
- Step 2 button copy "Entrar no painel" → "Continuar" (because it now advances, not finalizes)

The flag flip moved to two new handlers (`handleWishlistSaved` and `handleSkip`), described next.

### Step 3 save flow — sequential, non-atomic (B5)

Per L8 (RESEARCH.md), Supabase doesn't expose a single transactional handle for the wishlist insert + users update from the browser, so we ship the contract honestly:

1. **First** — User clicks "Salvar e começar" (note: copy injected via the new `submitLabel` prop on `WishlistFormSheet` per B3). The form sheet runs `useCreateWishlist.mutateAsync` internally; on success it fires `toast.success("Wishlist '...' criada", { description: summarize() })` AND calls `onSaved(created)`.
2. **Second** — `onSaved → handleWishlistSaved` sets `finalizing=true` (renders a `fixed inset-0 z-50` overlay with `Finalizando onboarding...` copy) and runs `supabase.from("users").update({ onboarding_complete: true }).eq("id", user.id)`.
3. On success: `toast.success("Onboarding concluído")` + `router.push("/app")`.
4. On failure: `toast.error("Wishlist salva, mas falhou ao finalizar onboarding. Toque em 'Pular e fazer depois' pra continuar.")` and the user stays on step 3. The "Pular e fazer depois" button is the recovery path — it retries the flag flip in isolation.

### Step 3 skip flow (Pular)

`handleSkip`: same `users.update(onboarding_complete=true)` call without any wishlist insert. On success → `router.push("/app")`. On failure → toast.error("Falha ao pular", { description }) and keeps the user on step 3 to retry.

The skip button is a `variant="ghost"` `Button`, full width, disabled while `finalizing` (so it can't fire while the in-flight onboarding flip from a successful wishlist insert is still pending).

### Test coverage

`src/app/app/onboarding/page.test.tsx` carries one smoke test asserting "Passo 1 de 3" renders on initial load, which is enough to prove the wizard expanded. The mocks (router, useSupabaseUser → returns `isLoading: false` not `loading: false` per the actual hook contract, supabase client, sonner, `WishlistFormSheet`, `useListingsSnapshot`) stub the dep graph cleanly. Deeper integration of step 3 (fill steps 1+2 with valid data, advance, click Saved/Skip and assert mutations) is acknowledged as manual QA per VALIDATION.md.

## Final phase gate results

Ran `pnpm test && pnpm lint && pnpm typecheck && pnpm build`:

| Gate | Result | Notes |
|------|--------|-------|
| `pnpm test` | PASS | 42 test files, 372 tests passing, ~18s total |
| `pnpm lint` | PASS | Biome — 154 files checked, 0 errors (after fixing one fragment-redundancy auto-fix during this plan) |
| `pnpm typecheck` | PASS | tsc --noEmit clean |
| `pnpm build` | **FAIL** | Pre-existing cross-phase regression on `/(auth)/reset-password/page.tsx` — `useSearchParams() should be wrapped in a suspense boundary`. NOT in this plan's `files_modified`. Original implementation introduced in commit `3db1de1` ("feat(auth): friendly 429 rate-limit handling"). |

The build failure is a Next.js 15 prerender error in a file outside this plan's scope. Per the executor's instructions for `autonomous: false` plans: "REPORT any failures in SUMMARY.md; do not attempt to fix code outside your plan's files_modified. If `pnpm build` is slow or fails with infra issues, document the failure and let the orchestrator's verification step handle it." Logged here for the orchestrator's verifier.

The fix (when the orchestrator picks it up) is to wrap the `useSearchParams()` consumer inside `/reset-password/page.tsx` in a `<Suspense>` boundary or to add `export const dynamic = "force-dynamic"` to opt the page out of static generation.

### Build failure full context

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/reset-password".
    at g (chunks/623.js)
    at m (chunks/623.js)
    at r (app/(auth)/reset-password/page.js)
Error occurred prerendering page "/reset-password".
Export encountered an error on /(auth)/reset-password/page: /reset-password, exiting the build.
```

Mitigation candidates (deferred, NOT applied here):
- Wrap the `useSearchParams()` consumer inside `<Suspense fallback={...}>` in `/(auth)/reset-password/page.tsx`
- Or `export const dynamic = "force-dynamic"` at the top of the file
- Or split the component so the `useSearchParams()` call is inside a `'use client'` child wrapped in `<Suspense>`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Redundant fragment in step-3 hero copy**
- **Found during:** Task 2 lint pass
- **Issue:** Wrote `{step === 3 && <>Cadastre seu primeiro carro-alvo</>}` to keep symmetry with the step 1/2 fragments — but step 3's content is a single string with no nested element, so Biome flags the fragment as redundant.
- **Fix:** Replaced with `{step === 3 && "Cadastre seu primeiro carro-alvo"}` (no fragment, plain string).
- **Files modified:** src/app/app/onboarding/page.tsx
- **Commit:** Folded into the GREEN commit `e6a2cd9` (one continuous edit; no separate commit).

**2. [Rule 1 - Plan correction] Step 2 button copy "Entrar no painel" → "Continuar"**
- **Found during:** Task 2 implementation review
- **Issue:** Plan didn't mention this but the original step 2 button said "Entrar no painel" because step 2 was the final step. Now step 2 advances to step 3 — keeping that copy would be misleading.
- **Fix:** Updated the button copy to "Continuar" (matches the step 1 button's intent).
- **Files modified:** src/app/app/onboarding/page.tsx
- **Commit:** `e6a2cd9`

**3. [Rule 1 - Plan correction] useSupabaseUser returns `isLoading`, not `loading`**
- **Found during:** Test setup
- **Issue:** Plan's mock used `loading: false` but the actual hook contract (verified in `src/lib/supabase/hooks/useSupabaseUser.ts` line 42) returns `isLoading`. Page reads `isLoading` (page.tsx line 46).
- **Fix:** Test mock returns `isLoading: false` (and `signOut: vi.fn()` for completeness).
- **Files modified:** src/app/app/onboarding/page.test.tsx
- **Commit:** Folded into the RED commit `f6e81a7`.

### Reported, Not Auto-fixed

**1. [Cross-phase regression] `pnpm build` fails on `/(auth)/reset-password/page.tsx`**
- See "Final phase gate results" above. Per the parent agent's directive (`autonomous: false`, "do not attempt to fix code outside your plan's files_modified"), this is reported for the orchestrator's verifier rather than auto-fixed in this plan.

## Known Stubs

None. Sidebar renders real labels; onboarding step 3 wires the real `WishlistFormSheet` (which itself uses real `useCreateWishlist`/`useUpdateWishlist` mutations) and the real `getSupabaseBrowser().from('users').update(...)` for the `onboarding_complete` flip.

## Threat Flags

None. No new endpoints, auth surface, or schema. Both edits operate on existing trust boundaries:
- Sidebar is render-only navigation (no data side-effects)
- Onboarding step 3 reuses already-vetted RLS-stamped mutations from Phase 6 + the same `users.update()` call shape that step 2 already used; the only new pattern is its sequential ordering, which has no security-relevant effect.

## Must-haves confirmation (plan frontmatter truths)

- [x] Sidebar renders label "Minhas Wishlists" exactly once (verified by `grep -c 'label: "Minhas Wishlists"' src/components/v3/Sidebar.tsx` → 1)
- [x] Sidebar does NOT render a "Marketplace" nav item (verified — old `key: "marketplace"` block removed; `Handshake` import removed)
- [x] Onboarding now has 3 steps — Step union expanded, badge reads "Passo {step} de 3"
- [x] Step 3 renders WishlistFormSheet with layout="inline" and submitLabel="Salvar e começar"
- [x] Step 3 save flow: wishlist.insert via useCreateWishlist hook (with success toast from the form sheet); onboarding_complete flip via direct supabase.from('users').update() (separate call, with its own loading overlay + success/error toast)
- [x] Step 3 skip flow: users.update onboarding_complete=true, route to /app, no wishlist insert
- [x] Skip button copy: "Pular e fazer depois"
- [x] Onboarding hero h1 Fraunces: "Cadastre seu primeiro carro-alvo"
- [ ] Final phase gate: `pnpm test && pnpm lint && pnpm typecheck` exit 0; `pnpm build` fails on pre-existing `/reset-password` Suspense issue (cross-phase, reported for orchestrator)

## Commits

- `e577d69` — test(07-12): RED — Sidebar D-15 rename + Marketplace removal contract
- `3fec1ba` — feat(07-12): Sidebar D-15 — rename Wishlists→Minhas Wishlists, drop Marketplace slot
- `f6e81a7` — test(07-12): RED — onboarding wizard expanded to 3-step contract
- `e6a2cd9` — feat(07-12): onboarding step 3 — inline WishlistFormSheet w/ B5 toast ordering

## Next pointer

Phase 8 (scraping pipeline). Before starting Phase 8, the orchestrator's verifier should pick up the `/(auth)/reset-password` Suspense fix. Once that lands, `pnpm build` will be green and Phase 7 ships unblocked.

## Self-Check: PASSED (with one cross-phase build failure documented)

- [x] `src/components/v3/Sidebar.tsx` modified — verified by `git log --oneline -- src/components/v3/Sidebar.tsx | head -1` showing `3fec1ba`
- [x] `src/components/v3/Sidebar.test.tsx` exists — verified
- [x] `src/app/app/onboarding/page.tsx` modified — verified by `git log --oneline -- src/app/app/onboarding/page.tsx | head -1` showing `e6a2cd9`
- [x] `src/app/app/onboarding/page.test.tsx` exists — verified
- [x] All 4 commits reachable from HEAD (`git log --oneline 9bfd1a9..HEAD` matches)
- [x] `pnpm test` → 372 passing, 0 failing
- [x] `pnpm lint` → 0 errors
- [x] `pnpm typecheck` → 0 errors
- [ ] `pnpm build` → fails on pre-existing `/(auth)/reset-password/page.tsx` (cross-phase, NOT in this plan's `files_modified` per `autonomous: false` directive)
