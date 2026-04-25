---
phase: 07-wishlist-ui
fix_applied: 2026-04-24T13:09:00Z
fix_scope: critical_warning
findings_in_scope: 5
fixed: 5
skipped: 7
iteration: 1
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-04-24
**Source review:** `.planning/phases/07-wishlist-ui/07-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope (high + medium): 5
- Fixed: 5
- Skipped (low, out of scope): 7
- Smoke gate: `pnpm typecheck` clean, `pnpm test --run` 43 files / 381 tests pass

## Fixed Issues

### HIGH-01: WishlistFormSheet renders both desktop aside AND mobile Dialog simultaneously on md+

**Files modified:** `src/lib/hooks/useMediaQuery.ts` (new), `src/components/v3/modules/WishlistFormSheet.tsx`
**Commit:** `38e75a2`
**Applied fix:** Added a new SSR-safe `useMediaQuery` hook in `src/lib/hooks/`. Replaced the dual `<div className="hidden md:block">` + `<div className="md:hidden">` wrappers in `WishlistFormSheet` with a runtime `isDesktop = useMediaQuery("(min-width: 768px)")` JSX gate that mounts exactly one branch per viewport. This is the minimal correct fix because Radix `DialogContent` portals to `document.body` and CSS-only wrappers cannot hide the portal subtree.

### MED-01: FipeModelCombobox triggers fallback toast on every error refetch

**Files modified:** `src/components/forms/FipeModelCombobox.tsx`
**Commit:** `433a410`
**Applied fix:** Added a `toastedRef` ref that records the brand the toast was last fired for. The `[isError, brand]` effect now only fires the `toast.info("FIPE indisponível — digite manualmente")` when `toastedRef.current !== brand`, and the brand-reset effect clears the ref so a new failing brand still produces exactly one toast.

### MED-02: useWishlists missing refetchOnReconnect (D-09 explicitly lists it)

**Files modified:** `src/lib/supabase/hooks/useWishlists.ts`
**Commit:** `4e2b356`
**Applied fix:** Added `refetchOnReconnect: true` to the `useQuery` config in `useWishlists`, aligning with D-09 in `07-CONTEXT.md` and bringing it in parity with `useListingsSnapshot` which already had the flag. Now wishlists auto-refresh when a flaky mobile network comes back online.

### MED-03: formValuesToPendingWishlist will silently drift if DbWishlist["Row"] grows

**Files modified:** `src/lib/wishlist/formValuesToPendingWishlist.ts`
**Commit:** `cfeed9a`
**Applied fix:** Added a type-level invariant via `Equals<X, Y>` that asserts the function's `ReturnType` is exactly `DbWishlist`. The `_adapterCovers: _AdapterCoversRow = true` line fails the TypeScript build if the row schema gains, removes, or renames a column without the adapter being updated. Updated the docstring to explain what the guard actually guarantees. `pnpm typecheck` confirms current shapes match.

### MED-04: WishlistPreviewPane <img> bypasses next/image (no domain whitelist either)

**Files modified:** `src/components/forms/WishlistPreviewPane.tsx`
**Commit:** `23995b6`
**Applied fix:** Per the review's recommendation, this is benign for Phase 7 (curated mocks, 96px square thumbnails, max 3 per render) and the real fix belongs in Phase 8 when WebMotors/OLX/Mercado Livre URLs replace mocks. Added an explicit `TODO(Phase 8)` comment plus a Biome ignore comment so the swap to `next/image` + `next.config.ts` `images.remotePatterns` configuration is not forgotten when scraping starts.

## Skipped Issues

All 7 LOW findings are out of the `critical_warning` scope. None were trivially co-located with a higher-severity fix (each lives in a separate file). Defer to a future iteration or a dedicated low-severity sweep.

### LOW-01: BrlCurrencyInput silently corrupts pasted values with cents/decimals

**File:** `src/components/forms/BrlCurrencyInput.tsx:43-50`
**Reason:** Out of scope (low severity, separate file from the high/medium fixes).
**Original issue:** Pasting `"R$ 130,50"` becomes `13050` (R$ 13.050) — passes Zod max 5,000,000 silently. Self-correcting via the noisy preview pane but a real UX nit.

### LOW-02: KmInput shares the same paste-corruption pattern as BrlCurrencyInput

**File:** `src/components/forms/KmInput.tsx:35-42`
**Reason:** Out of scope (low severity, separate file).
**Original issue:** Same digit-strip pattern as LOW-01. Less commonly hit because km isn't usually copied with cents.

### LOW-03: Year range Number(raw) accepts "1990abc" → NaN

**File:** `src/lib/schemas/wishlist.ts:73-76` and `src/components/forms/YearRangeField.tsx:46`
**Reason:** Out of scope (low severity, separate file).
**Original issue:** `Number(raw)` parses `"1990abc"` to `NaN` which Zod rejects with a confusing error; should use `Number.parseInt` + `Number.isFinite`.

### LOW-04: WishlistModule unused mutation (cosmetic)

**File:** `src/components/v3/modules/WishlistModule.tsx:51`
**Reason:** Out of scope (low severity, cosmetic dead code).
**Original issue:** `const _createMut = useCreateWishlist();` is unused; trivially deletable.

### LOW-05: Sidebar still shows "Marketplace" entry indirectly via AppShell registry

**File:** `src/components/v3/Sidebar.tsx`
**Reason:** Out of scope. Reviewer explicitly notes "no fix needed in Phase 7" — D-15 cleanup is deferred to Phase 12.
**Original issue:** Pointer that activating `activeModule="marketplace"` from any code path would render the legacy module silently. Not a Phase 7 concern.

### LOW-06: WishlistPreviewPane debounce uses values from useWatch as effect dep

**File:** `src/components/forms/WishlistPreviewPane.tsx:48-51`
**Reason:** Out of scope (cosmetic, works correctly).
**Original issue:** Cast `values as Partial<WishlistFormValues>` is unnecessary — `useWatch(control)` is already typed as `Partial<...>`. Cosmetic only.

### LOW-07: LocalidadeMultiPicker reads currentUfs/currentCities outside RHF subscription

**File:** `src/components/forms/LocalidadeMultiPicker.tsx:38-40`
**Reason:** Out of scope (low severity, dormant bug).
**Original issue:** `getValues(ufName)` is imperative and would not react to cross-component edits. Phase 7 has no such writer so the bug is dormant.

---

_Fixed: 2026-04-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
