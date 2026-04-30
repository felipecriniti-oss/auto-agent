# Phase 7 Code Review — Second Pass

**Reviewed:** 2026-04-29
**Reviewer:** gsd-code-reviewer (second pass after Phase 9 caller cleanup + today's Esc handler fix)
**Files reviewed:** 21 (Phase 7 owns)
**Note:** Phase 7's first internal review (`07-REVIEW.md`) flagged 1 HIGH + 4 MEDIUM that were all fixed during execution. This pass focuses on what changed AFTER those: the Phase 9 caller cleanup in `WishlistPreviewPane`, and today's Esc handler fix in `WishlistFormSheet`.

## Findings (1 HIGH, 4 MEDIUM, 5 LOW)

### HIGH-01: Esc handler closes sheet WITHOUT cleaning up form state when Radix popover is open

**File:** `src/components/v3/modules/WishlistFormSheet.tsx:211-221`

**Issue:** Reflexive Esc on the FIPE combobox popover (where users hit Esc to close the dropdown) propagates to our document handler and nukes the entire form. Radix Popover's built-in Esc-to-close handler does NOT call `event.stopPropagation()` (Radix design choice — they want host apps to be able to listen for Esc as a global "exit" intent).

**Repro:**
1. Open the sheet, fill brand=Honda, model=Civic, region tuples, etc.
2. Open the FIPE model combobox (Radix Popover).
3. Press Esc to close the popover.
4. Popover closes; keyDown event ALSO bubbles to our `document.addEventListener("keydown", handler)`. `handleCancel()` runs — sheet closes, form resets, all typed data lost.

**Fix:**
```tsx
useEffect(() => {
  if (!open || !isDesktop) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // If a Radix popover/select/combobox is open inside the sheet, let IT
    // handle the Esc — don't close the sheet from under the user.
    const openPopover = document.querySelector(
      '[data-state="open"][data-radix-popper-content-wrapper], ' +
      '[role="listbox"][data-state="open"], ' +
      '[role="combobox"][aria-expanded="true"] + [data-radix-popper-content-wrapper]'
    );
    if (openPopover) return;
    e.preventDefault();
    handleCancel();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [open, isDesktop, handleCancel]);
```

Alternative: only close on Esc if `form.formState.isDirty === false`, OR show an `AlertDialog` for "Descartar alterações?" before reset.

### MED-01: `previouslyFocusedRef.current` may be `<body>` when sheet opens via async path

**File:** `src/components/v3/modules/WishlistFormSheet.tsx:197-209`

**Issue:** Snapshot is taken inside the `[open]` effect, which runs AFTER parent re-render. If the trigger button was unmounted between click and effect (e.g. WishlistCard re-keys after `useUpdateWishlist` optimistic update toggles `status`), `document.activeElement` will be `body`. Cleanup calls `body.focus()` — no-op on most browsers, focus stuck on body.

**Fix:** Skip `<body>` snapshots, guard `document.contains(el)` before refocus.

### MED-02: `aria-modal="true"` without focus trap is a misleading a11y promise

**File:** `src/components/v3/modules/WishlistFormSheet.tsx:496-501`

**Issue:** `aria-modal="true"` carries an implementation contract: "this dialog traps focus." Our implementation does NOT trap focus — pressing Tab from the last input moves focus to the next page-level focusable element OUTSIDE the aside. Mobile branch (Radix Dialog) does trap focus, so we have asymmetric a11y where mobile is compliant and desktop is not.

**Fix options:**
- A: Drop `aria-modal="true"`; document as "side panel, not modal"
- B: Implement focus trap (`focus-trap-react` ~3KB, or hand-roll on Tab/Shift+Tab)
- C: Switch desktop branch to Radix `<Dialog>` with custom positioning (free a11y)

For demo, Option A is the smallest correct change.

### MED-03: 429 (rate limited) responses do NOT trigger FIPE silent-fallback path correctly

**File:** `src/components/forms/FipeModelCombobox.tsx:78`, `src/app/api/fipe/route.ts:98-101`

**Issue:** Component checks `res.status >= 500 || !res.ok`. 429 (rate-limited from `/api/fipe` itself) DOES fall through to catch and trigger toast "FIPE indisponível" — but actually FIPE works fine, it's our own rate-limiter that fired. Multi-user dealership behind NAT shares an IP; 5 people during onboarding could collectively hit 30/min and lock everyone into free-text mode.

**Fix:** Distinguish 429 from 5xx in error handling; raise rate-limit ceiling once auth is added in Phase 6.

### MED-04: FIPE recovery does not auto-restore combobox UI

**File:** `src/components/forms/FipeModelCombobox.tsx:93-99`

**Issue:** Once `fallbackToText=true`, only brand change resets it. If user stays on failing brand and `/api/fipe` recovers mid-session, no path back to combobox. Defer if demo timeline tight.

### LOW-01: `useMediaQuery` initializes `false` → form sheet briefly renders mobile then hydrates desktop

**File:** `src/lib/hooks/useMediaQuery.ts:21`

**Issue:** First render returns `false`; effect corrects after mount. On desktop opening sheet: brief flash of mobile UI (Dialog mounts/unmounts) before swap to aside. Form context created twice in quick succession (~50ms flash).

**Fix:** Lazy initializer reading `window.matchMedia(query).matches` synchronously when window is defined.

### LOW-02: `setMatchMedia` test helper leaks state between tests

**File:** `src/components/v3/modules/WishlistFormSheet.test.tsx:186-201`

**Fix:** Restore original `window.matchMedia` in `afterEach`.

### LOW-03: Carry-overs from first review still unfixed

**Files:** `BrlCurrencyInput.tsx`, `KmInput.tsx`, `YearRangeField.tsx`, `WishlistModule.tsx`, `WishlistPreviewPane.tsx`, `LocalidadeMultiPicker.tsx`

The original Phase 7 review flagged 7 LOW items; the fix iteration explicitly skipped them. Still present:
- LOW-01/02: paste corruption in BrlCurrencyInput / KmInput
- LOW-03: `Number(raw)` accepts `"1990abc"` → NaN in YearRangeField
- LOW-04: `_createMut` dead code in WishlistModule.tsx:51
- LOW-05: deferred Marketplace cleanup (Phase 12)
- LOW-06: `as Partial<WishlistFormValues>` cosmetic cast in WishlistPreviewPane.tsx:39, 45
- LOW-07: `getValues` instead of `useWatch` in LocalidadeMultiPicker.tsx:39-40

Recommend bundling into a "Phase 7 LOW sweep" task post-demo.

### LOW-04: Mock listings — 6 of 20 have `accept_trade=true`, disproportionate

Cosmetic; not worth changing.

### LOW-05: `runtime = "edge"` on `/api/fipe/route.ts` — re-evaluate per Vercel Fluid Compute migration

**File:** `src/app/api/fipe/route.ts:12`

Vercel 2025+ guidance pushes apps off Edge Runtime. Edge has known pain points: AbortSignal.timeout coverage incomplete, chunked Promise.all fan-out hits Edge-specific connection pool ceiling. Flag for future hardening; not a bug today.

## Re-verifications (no findings)

- **`previouslyFocusedRef` snapshot pattern** (Test 2 fix today): correct on happy path. See MED-01 for failure mode.
- **HIGH-01 from original review (JSX-gate desktop vs mobile):** confirmed clean at lines 482-529.
- **`refetchOnReconnect`** (MED-02 from original): present at line 52 of `useWishlists.ts`. Fixed.
- **`Equals<X, Y>` type-level guard:** present at lines 48-58 of `formValuesToPendingWishlist.ts`. Resolves green after Phase 9.
- **`enforcePfOnly` Phase 9 cleanup:** confirmed via grep — no remaining references. WishlistPreviewPane caller is clean.
- **`accepts_trade`:** not in wishlist schema (D-10 honored). Engine reads `attributes.accept_trade` only as soft motivation signal.
- **i18n/copy:** spot-checked all flagged files — all copy is pt-BR.
- **Onboarding flow:** Step 3 → `WishlistFormSheet layout="inline"` → `onSaved` → `users.onboarding_complete=true`. Sequential, no race with Phase 9 realtime.

## Three-paragraph summary

**Overall health.** Phase 7 is in good shape. Original review flagged 1 HIGH + 4 MEDIUM all fixed during execution. Second-pass found a different HIGH (Esc handler accidentally closes sheet when Radix popover Esc bubbles up) and 4 new MEDIUMs — edge cases (focus-snapshot races) or hardening items demo can survive without (focus trap, 429 distinction, FIPE auto-recovery). The Phase 9 caller cleanup in `WishlistPreviewPane` and the type-guard sentinel in `formValuesToPendingWishlist` are clean. Test 2 (Esc + focus restore) genuinely passes for the happy path tested.

**Top 3 must-fix.** (1) HIGH-01 — Esc handler should detect open Radix popovers; reflexive Esc on FIPE combobox today nukes entire form. (2) MED-01 — Guard `previouslyFocusedRef` against `<body>` snapshots and verify `document.contains(el)` before `el.focus()`. (3) MED-02 — Drop `aria-modal="true"` OR implement focus trap; today screen-reader users are told "modal" but Tab walks them out.

**Recommendations.** Pre-demo: ship popover-aware Esc guard (HIGH-01, ~10 lines), drop `aria-modal="true"` (one-line). Post-demo: switch desktop sheet to Radix `<Dialog>` with custom positioning (free focus trap + Esc semantics), benchmark `/api/fipe` with `runtime = "nodejs"`, add FIPE recovery probe interval (MED-04). Test hygiene: `setMatchMedia` cleanup helper (LOW-02) and a popover-bubble test for HIGH-01 regression.
