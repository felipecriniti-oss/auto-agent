---
phase: 7
slug: wishlist-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution of Wishlist UI (`WishlistModule` rewrite, RHF+zod form, FIPE cascade, preview pane, soft-delete migration of `useDeleteWishlist`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.9 + @testing-library/react 16.3.2 + jsdom 25.0.1 |
| **Config file** | `vitest.config.mts` (`@` alias → `./src`, `environment: "jsdom"`, setup file wired) |
| **Setup file** | `vitest.setup.ts` (matchMedia shim, randomUUID shim, jest-dom matchers) |
| **Quick run command** | `pnpm test <file>` — single-file run, typically <5s |
| **Full suite command** | `pnpm test && pnpm lint && pnpm typecheck && pnpm build` |
| **Estimated runtime** | ~15s vitest · ~45s full suite |

No new test infrastructure needed — all dependencies already installed.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test <changed-file>.test.tsx` (single-file scope)
- **After every plan wave:** Run `pnpm test` (full vitest)
- **Before `/gsd-verify-work`:** `pnpm test && pnpm lint && pnpm typecheck && pnpm build` all green
- **Max feedback latency:** 5s per task commit · 45s per wave gate

---

## Per-Task Verification Map

| Source ID | Decision/Behavior | Wave | Test Type | Automated Command | File Exists | Status |
|-----------|-------------------|------|-----------|-------------------|-------------|--------|
| D-01 | `useListingsSnapshot` returns mocks when Supabase returns `[]` | 2 | unit | `pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx` | ❌ W0 | ⬜ pending |
| D-02 | `preview-listings.ts` mocks parse as valid `DbListing[]`; UF/price diversity | 1 | unit | `pnpm test src/lib/mock-data/preview-listings.test.ts` | ❌ W0 | ⬜ pending |
| D-03 | `fipe-brands-snapshot.json` parses; ≥50 brands; stable ordering | 1 | unit | `pnpm test src/lib/brasil/fipe-brands-snapshot.test.ts` | ❌ W0 | ⬜ pending |
| D-04 | `FipeModelCombobox` React Query fetch by brand key; cache hit no refetch | 3 | integration | `pnpm test src/components/forms/FipeModelCombobox.test.tsx` | ❌ W0 | ⬜ pending |
| D-05 | Fall back to `<Input>` free-text on `/api/fipe` 5xx or >5s timeout + sonner toast | 3 | integration | same file above | ❌ W0 | ⬜ pending |
| D-06 | `BrlCurrencyInput` round-trips integer reais: `130000` → `"R$ 130.000"` → onChange emits `130000` | 2 | unit | `pnpm test src/components/forms/BrlCurrencyInput.test.tsx` | ❌ W0 | ⬜ pending |
| D-06 | `KmInput` round-trips integer km; non-digits stripped | 2 | unit | `pnpm test src/components/forms/KmInput.test.tsx` | ❌ W0 | ⬜ pending |
| D-08 | `summarize(wishlist)` — 4 branches (full / no UF / no year / fallback) | 3 | unit | `pnpm test src/components/v3/modules/WishlistModule.test.tsx` | ❌ W0 | ⬜ pending |
| D-09 | `useWishlists` uses `staleTime: 30_000` + `refetchOnWindowFocus: true` | 1 | unit | `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx` (extend) | ✅ modify | ⬜ pending |
| D-11 | `wishlistSchema` valid/invalid/edge (year_min > year_max rejected; optionals ok; fuel enum rejects typos) | 1 | unit | `pnpm test src/lib/schemas/wishlist.test.ts` | ❌ W0 | ⬜ pending |
| D-13 | Delete action opens shadcn `AlertDialog`; cancel closes; confirm calls mutation; Cancel auto-focused | 3 | integration | `pnpm test src/components/v3/modules/WishlistModule.test.tsx` | ❌ W0 | ⬜ pending |
| D-14 | `useDeleteWishlist` issues `UPDATE {status:"archived"}` (no `.delete()`) | 1 | unit | `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx` | ✅ modify | ⬜ pending |
| D-14 | `useWishlists.fetchWishlists` filters archived rows via `.neq("status","archived")` | 1 | unit | same file above | ✅ modify | ⬜ pending |
| D-15 | `Sidebar` renders label `"Minhas Wishlists"`; no `marketplace` nav item | 4 | unit | `pnpm test src/components/v3/Sidebar.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC Preview | count>0 when rules match mocks; count=0 when over-restrictive; zero-match copy renders | 3 | integration | `pnpm test src/components/forms/WishlistPreviewPane.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC Adapter | `formValuesToPendingWishlist` produces shape accepted by `matchListingToWishlists` | 3 | unit | co-located in `WishlistPreviewPane.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC a11y | Preview pane has `aria-live="polite"`; AlertDialog focuses Cancel on open | 3 | integration | covered in respective integration tests | ❌ W0 | ⬜ pending |
| UI-SPEC Submit | Happy path: valid form → `useCreateWishlist.mutateAsync` called → success toast → sheet closes | 4 | integration | `pnpm test src/components/v3/modules/WishlistFormSheet.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC Submit | Invalid form: inline error per field; submit blocked | 4 | integration | same file above | ❌ W0 | ⬜ pending |
| UI-SPEC Submit | Save error: sheet stays open + `toast.error` + optimistic card reverts | 4 | integration | same file above | ❌ W0 | ⬜ pending |
| UI-SPEC Field Array | `LocalidadeMultiPicker` add tuple / remove tuple / prevent dupes through RHF `useFieldArray` | 3 | integration | `pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC YearRange | `YearRangeField` shows cross-field error when min > max; clears when either empties | 2 | unit | `pnpm test src/components/forms/YearRangeField.test.tsx` | ❌ W0 | ⬜ pending |
| UI-SPEC FIPE-Brand | `FipeBrandCombobox` renders snapshot, fuzzy search, selects brand, cascade clears model on change | 3 | integration | `pnpm test src/components/forms/FipeBrandCombobox.test.tsx` | ❌ W0 | ⬜ pending |
| Onboarding step 3 | Skip flow flips `onboarding_complete=true` without creating wishlist; route lands on `/app` | 4 | integration | `pnpm test src/app/app/onboarding/page.test.tsx` | ❌ W0 | ⬜ pending |
| Onboarding step 3 | Save flow inserts wishlist via `useCreateWishlist` AND flips `onboarding_complete=true` (sequential, non-atomic accepted per Landmine §M) | 4 | integration | same file above | ❌ W0 | ⬜ pending |
| `/api/fipe` GET | `GET ?type=brands` returns brands array; 502 upstream returns `{ error: "upstream" }` | 1 | unit | `pnpm test src/app/api/fipe/route.test.ts` (extend) | ✅ modify | ⬜ pending |
| `/api/fipe` GET | `GET ?type=models&brand=Honda` returns models; 404 unknown brand; 502 upstream | 1 | unit | same file above | ✅ modify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These test files must be created/extended before their wave's implementation task commits:

**Schema & mocks (Wave 1 pre-req):**
- [ ] `src/lib/schemas/wishlist.test.ts` — covers D-11
- [ ] `src/lib/mock-data/preview-listings.test.ts` — covers D-02
- [ ] `src/lib/brasil/fipe-brands-snapshot.test.ts` — covers D-03
- [ ] `src/app/api/fipe/route.test.ts` — extend for new GET branches (`?type=brands|models`)
- [ ] `src/lib/supabase/hooks/useWishlists.test.tsx` — extend for D-14 soft-delete + archived-filter + D-09 stale/focus

**Hooks (Wave 2 pre-req):**
- [ ] `src/lib/supabase/hooks/useListingsSnapshot.test.tsx` — covers D-01
- [ ] `src/components/forms/BrlCurrencyInput.test.tsx` — covers D-06 (BRL)
- [ ] `src/components/forms/KmInput.test.tsx` — covers D-06 (km)
- [ ] `src/components/forms/YearRangeField.test.tsx` — cross-field validation

**Forms & preview (Wave 3 pre-req):**
- [ ] `src/components/forms/FipeBrandCombobox.test.tsx`
- [ ] `src/components/forms/FipeModelCombobox.test.tsx` — covers D-04, D-05
- [ ] `src/components/forms/LocalidadeMultiPicker.test.tsx`
- [ ] `src/components/forms/WishlistPreviewPane.test.tsx` — covers debounce + adapter + zero/non-zero

**Module & integration (Wave 4 pre-req):**
- [ ] `src/components/v3/modules/WishlistModule.test.tsx` — covers D-08 summarize, D-13 AlertDialog, list/empty/error
- [ ] `src/components/v3/modules/WishlistFormSheet.test.tsx` — covers submit success/failure/validation
- [ ] `src/components/v3/Sidebar.test.tsx` — covers D-15
- [ ] `src/app/app/onboarding/page.test.tsx` — covers step 3 save + skip

**Framework install:** none — vitest + @testing-library/react + jsdom + @testing-library/jest-dom all already present. `vitest.setup.ts` already shims `matchMedia` (sonner/next-themes) and `randomUUID` (form defaults).

---

## Manual-Only Verifications

| Behavior | Source | Why Manual | Test Instructions |
|----------|--------|-----------|-------------------|
| Desktop (≥md) sheet renders fixed right 560px with backdrop blur; mobile (<md) renders full-screen Dialog | UI-SPEC §Form invocation | Responsive breakpoint visual; CSS-layout not easily asserted in jsdom | `pnpm dev` → open `/app` → click "+ Nova Wishlist" → resize viewport across 768px boundary → confirm transform |
| Accent `#4C46DC` reserved to the 7 locations in UI-SPEC §Accent reserved list | UI-SPEC §Color | Visual color audit | `pnpm dev` → module page + sheet + onboarding; eyeball every CTA, chip state, hero icon |
| Dark-mode chrome flows via `globals.css` fallback layer (no per-component `dark:bg-*` on card/border/body) | UI-SPEC §Color + D-07 (inherited from P5) | CSS cascade visual | `pnpm dev` → toggle dark mode in OS → compare card background, border tone, body text |
| Preview pane debounce feels right (400ms) while typing | UI-SPEC §Preview pane | Subjective feel | `pnpm dev` → open sheet → type rapidly in fields → confirm count stops updating after ~400ms idle |
| `sonner` toast positioning + stacking under simultaneous mutations | UI-SPEC §Toast feedback | sonner state not mocked in jsdom | `pnpm dev` → create + update + delete in rapid succession → confirm toast stack/collapse |
| `+ Nova Wishlist` → sheet open → Esc closes → focus returns to trigger button | UI-SPEC §Keyboard & a11y | Jsdom focus semantics differ from real browsers for focus traps | `pnpm dev` → tab through form → press Esc → confirm focus returns |
| Onboarding step 3 Fraunces display font renders correctly | UI-SPEC §Typography (Fraunces editorial) | Font loading/fallback | `pnpm dev` → visit `/app/onboarding` step 3 → confirm `Cadastre seu primeiro carro-alvo` renders in Fraunces |
| `scripts/sync-fipe-brands.ts` re-run produces diff against committed snapshot only when FIPE data changed | D-03 | Script is one-shot manual tooling | `pnpm tsx scripts/sync-fipe-brands.ts` → `git diff src/lib/brasil/fipe-brands-snapshot.json` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or are Wave 0 (test file exists before impl commits)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (none expected — every source file has a co-located test)
- [ ] Wave 0 covers all MISSING references (13 new test files enumerated above)
- [ ] No watch-mode flags in CI or task-commit sampling (`pnpm test <file>` runs once and exits)
- [ ] Feedback latency < 5s per task commit; < 45s per wave gate
- [ ] `nyquist_compliant: true` set in frontmatter after Phase 7 completes

**Approval:** pending
