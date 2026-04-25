---
phase: 07-wishlist-ui
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/lib/schemas/wishlist.ts
  - src/lib/mock-data/preview-listings.ts
  - src/lib/brasil/fipe-brands-snapshot.json
  - src/lib/brasil/fipe-brands-snapshot.test.ts
  - src/app/api/fipe/route.ts
  - scripts/sync-fipe-brands.ts
  - src/lib/supabase/hooks/useWishlists.ts
  - src/lib/supabase/hooks/useListingsSnapshot.ts
  - src/components/forms/BrlCurrencyInput.tsx
  - src/components/forms/KmInput.tsx
  - src/components/forms/YearRangeField.tsx
  - src/components/forms/FipeBrandCombobox.tsx
  - src/components/forms/FipeModelCombobox.tsx
  - src/components/forms/LocalidadeMultiPicker.tsx
  - src/components/forms/WishlistPreviewPane.tsx
  - src/components/v3/modules/WishlistFormSheet.tsx
  - src/components/v3/modules/WishlistModule.tsx
  - src/lib/wishlist/summarize.ts
  - src/lib/wishlist/formValuesToPendingWishlist.ts
  - src/components/v3/Sidebar.tsx
  - src/app/app/onboarding/page.tsx
findings:
  critical: 0
  high: 1
  medium: 4
  low: 7
  total: 12
status: findings
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 21
**Status:** findings

## Summary

Phase 7 is well-engineered overall. Schema, hooks, primitives, and the matching engine integration are all correct, and the verification report (12/12 truths, 381 tests passing, lint+typecheck clean) is genuine — none of those green checks hide a real bug. The decisions D-01 through D-15 are all honored at the code level.

The notable finding is **HIGH-01**: `WishlistFormSheet`'s sheet layout double-mounts the form body on desktop because Radix's `DialogContent` portals out of the `<div className="md:hidden">` wrapper. The intended responsive swap (aside on md+ / Dialog on mobile) does not actually swap — both render simultaneously when `open === true`. This is the kind of issue that would surface during the human UAT step listed in `07-VERIFICATION.md` (the "560px aside on desktop" test) and is worth fixing before the demo.

Beyond that, the medium/low items are mostly hardening concerns: a tiny race in the FIPE fallback toast, a couple of UX nits in the BRL input, the missing `refetchOnReconnect` flag from D-09, and a debt around the `formValuesToPendingWishlist` adapter not being kept in sync with `DbWishlist["Row"]` if new columns are added. Nothing blocks the Friday demo.

## High

### HIGH-01: WishlistFormSheet renders both desktop aside AND mobile Dialog simultaneously on md+

**File:** `src/components/v3/modules/WishlistFormSheet.tsx:443-479`
**Issue:** The sheet layout wraps the desktop aside in `<div className="hidden md:block">` and the mobile Dialog in `<div className="md:hidden">`. The latter does not work as intended: shadcn's `DialogContent` (`src/components/ui/dialog.tsx:58-81`) wraps its children in a Radix `DialogPortal`, which mounts the overlay and content directly on `document.body` and escapes the `md:hidden` parent wrapper entirely. Result on a desktop viewport:

1. The `<aside className="fixed inset-y-0 right-0 z-50 flex w-[560px] ...">` renders correctly on the right side (560px wide).
2. The Radix Dialog also renders its `DialogOverlay` (`fixed inset-0 z-50 bg-black/50`) plus the centered `DialogContent` panel — both portaled to `body` and therefore visible on desktop too, on top of the aside.
3. The `body` JSX is referenced from both subtrees, so two `<WishlistPreviewPane>`, two `<LocalidadeMultiPicker>` (each calling `useFieldArray` against the same `region_uf` / `region_cities` field paths), and two `<Form>` consumers exist at once. RHF tolerates the shared `form` instance, but the user gets two preview-pane debounced computations running in parallel and two visually conflicting modals.

The Verification report (line 11) pre-flagged this as a human-required check ("560px aside on desktop, full-screen Dialog on mobile") — that gate would catch the visible double overlay.

**Fix:**
```tsx
// Replace the JSX in lines 443-479 with a single branch that picks ONE layout
// per viewport. The simplest robust fix is to pick by media query at runtime
// with a small useMediaQuery hook, or guard the Dialog mount on a CSS-only
// strategy that doesn't rely on the parent wrapper:

// Option A — runtime media query (preferred, clean tree):
const isDesktop = useMediaQuery("(min-width: 768px)");
return isDesktop ? (
  <>
    <button type="button" aria-label="Fechar" onClick={handleCancel}
      className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" />
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[560px] ...">
      {header}
      {body}
    </aside>
  </>
) : (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-full w-full flex-col p-0 sm:max-w-none">
      <DialogHeader className="..."><DialogTitle>...</DialogTitle></DialogHeader>
      {body}
    </DialogContent>
  </Dialog>
);

// Option B — keep the Dialog only for mobile by gating the JSX itself, not via
// `md:hidden` on a wrapper:
{!isDesktop && (
  <Dialog open={open} onOpenChange={onOpenChange}>...</Dialog>
)}
```
Either fix removes the duplicate `<body>` mount and the duplicate Dialog overlay. The `body` const can be reused across the two branches; what must NOT be reused is rendering both branches simultaneously into the React tree.

## Medium

### MED-01: FipeModelCombobox triggers fallback toast on every error refetch

**File:** `src/components/forms/FipeModelCombobox.tsx:90-95`
**Issue:** The `useEffect` that fires `toast.info("FIPE indisponível — digite manualmente")` and `setFallbackToText(true)` watches `[isError]`. With `retry: false` and `staleTime: Infinity`, this is mostly fine in practice — but if a parent re-mount (e.g. re-opening the sheet) triggers a refetch and React Query reports `isError=true` again, the toast can re-fire. More importantly, the effect doesn't guard against `isError` flipping back to `false` after the user has already entered text in the fallback `<Input>`: a parent-driven re-fetch that succeeds would not auto-restore the combobox (which is desired by D-05) but the prior fallback toast is the only signal — a second fallback event in the same session re-toasts.

There is also a minor reentrancy concern: the `[brand]` reset effect (line 99-101) sets `fallbackToText=false`, and if the new brand ALSO errors, the `[isError]` effect fires again on the next render. This is the intended D-05 behavior, but please verify that `toast.info` doesn't stack visibly when the user types fast across two failing brands.

**Fix:**
```tsx
// Track whether we've already shown the toast this brand-session to avoid
// double-firing on re-renders:
const toastedRef = useRef<string | null>(null);
useEffect(() => {
  if (isError && toastedRef.current !== brand) {
    toast.info("FIPE indisponível — digite manualmente");
    toastedRef.current = brand;
    setFallbackToText(true);
  }
}, [isError, brand]);

// And in the brand reset effect, also clear toastedRef:
useEffect(() => {
  setFallbackToText(false);
  toastedRef.current = null;
}, [brand]);
```

### MED-02: useWishlists missing refetchOnReconnect (D-09 explicitly lists it)

**File:** `src/lib/supabase/hooks/useWishlists.ts:49-50`
**Issue:** D-09 in `07-CONTEXT.md` says: "React Query cobre: `staleTime: 30s`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`." The hook implements the first two but omits `refetchOnReconnect`. `useListingsSnapshot.ts:62` correctly includes it. Effect: on flaky mobile networks, the wishlists list will not auto-refresh when the connection is restored; the user must focus the window or wait 30s.

**Fix:**
```tsx
// useWishlists.ts:44-51
return useQuery({
  queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"],
  queryFn: () => fetchWishlists(user?.id ?? ""),
  enabled,
  initialData: enabled ? undefined : [],
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true, // ← add this
});
```

### MED-03: formValuesToPendingWishlist will silently drift if DbWishlist["Row"] grows

**File:** `src/lib/wishlist/formValuesToPendingWishlist.ts:17-39`
**Issue:** The docstring claims the function "fails to compile until the new field is handled" if `DbWishlist["Row"]` grows. That is true for **field removal** (TS will error on a missing required property), but it is NOT true for field **renames** with the same shape, and more relevantly, it is NOT true for `Record<string, unknown>` columns or other already-unknown-shaped fields the engine might start reading. The current return shape covers the existing 18 fields but silently drops anything new the engine may key on later (e.g. a future `notes` column the matching engine starts using as a hard rule).

This is a maintainability concern, not a present-day bug — the matching engine (line 161-260) only reads exactly what's in the form schema. Worth a comment that the adapter is the single point of truth for "what the preview engine sees", and to add a test fixture row that asserts the adapter output matches a real `DbWishlist` shape.

**Fix:** Add a co-located type-level guard:
```ts
// At the bottom of formValuesToPendingWishlist.ts, just for compile-time hygiene:
type _AdapterCoversRow = Equals<
  ReturnType<typeof formValuesToPendingWishlist>,
  DbWishlist
>; // ← Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
const _adapterCovers: _AdapterCoversRow = true; // breaks compile if shapes drift
```
Or simpler: drop the docstring claim and document the function as "best-effort adapter, manually keep in sync with DbWishlist Row".

### MED-04: WishlistPreviewPane <img> bypasses next/image (no domain whitelist either)

**File:** `src/components/forms/WishlistPreviewPane.tsx:128`
**Issue:** Listing photos render via raw `<img src={l.photo_url}>`. The mock data uses Unsplash CDN URLs, and future real listings will use WebMotors-hosted URLs (Phase 8). Two consequences:

1. **No image optimization** — Vercel won't transform/cache these. For preview pane (3 thumbnails max, 96px square in the layout), this is fine performance-wise.
2. **No CSP/domain whitelist enforcement at build time.** Sidebar already uses `next/image` for the logo. The mixed approach is a small inconsistency and means a malicious listing photo URL (Phase 8 onward, sourced from scraping) will load straight from the third party with no Next.js-level guard.

For Phase 7 with curated mocks this is benign. Once Phase 8 starts ingesting third-party listing URLs, this should switch to `next/image` with `images.remotePatterns` configured for `webmotors.com.br` (or the actual CDN host). The `next.config.ts` is currently empty (`{ /* config options here */ }`), so adding `images.remotePatterns` won't conflict with anything.

**Fix:** Defer to Phase 8 listings ingestion task; add a TODO comment so the swap isn't forgotten:
```tsx
// TODO(Phase 8): swap raw <img> for next/image once listing photo URLs come from
// scraping. Configure images.remotePatterns for webmotors.com.br + the listing CDN.
{l.photo_url ? (
  <img src={l.photo_url} alt="" className="h-full w-full object-cover" />
) : null}
```

## Low

### LOW-01: BrlCurrencyInput silently corrupts pasted values with cents/decimals

**File:** `src/components/forms/BrlCurrencyInput.tsx:43-50`
**Issue:** The component strips all non-digits before parsing. The docstring acknowledges this: paste `"abc130.000,50"` and you get `13000050` (R$ 13M instead of R$ 130k). The doc claims this is "benign because Zod rejects price > 5,000,000 at submit time" — true for that specific value, but `"R$ 130,50"` becomes `13050` (R$ 13.050) which IS valid per the schema and would be silently saved as a wildly-wrong wishlist max price.

This is a low-severity UX bug — the lojista's "max price" being 100x the intended value would lead to a noisy preview pane (matches everything), which is self-correcting via feedback. But a paste from a price string that includes `,50` cents will quietly become wrong.

**Fix:**
```tsx
// In handleChange, treat ',' or '.' as decimal separators when present in
// pt-BR-ish form (",50" or ",00") and round/floor:
function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
  const raw = e.target.value;
  // Strip currency prefix and spaces, then split on the rightmost comma if present
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  // Detect a fractional part (",NN" at end) — if found, drop it (we don't keep cents)
  const integerPart = cleaned.replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");
  if (integerPart.length === 0) {
    onChange(null);
    return;
  }
  onChange(Number.parseInt(integerPart, 10));
}
```

### LOW-02: KmInput shares the same paste-corruption pattern as BrlCurrencyInput

**File:** `src/components/forms/KmInput.tsx:35-42`
**Issue:** Same as LOW-01: pasting `"60.500,5 km"` becomes `605005` (605k km) which still passes the schema (`max(1_000_000)`). Less commonly an issue (km isn't usually copied with cents) but the pattern is identical.

**Fix:** Apply the same fix as LOW-01.

### LOW-03: Year range allows year_min == year_max but accepts "1990 to 1990"

**File:** `src/lib/schemas/wishlist.ts:73-76`
**Issue:** The `.refine` allows `year_min <= year_max`. That's correct. But neither the schema nor the UI prevents `year_min = 2030` (where `CURRENT_YEAR + 1 = 2027`) — the schema caps at `CURRENT_YEAR + 1`, so this is bounded. Still, when the YearRangeField is left empty on both sides, the form is in valid state but `summarize()` falls back to "Honda Civic" (no year segment). That's intentional per D-08, just verify the UX doesn't surprise the user.

Also: `Number(raw)` in `YearRangeField.tsx:46` accepts `"1990abc"` → `NaN`, which RHF stores as `NaN`. The Zod schema then rejects with "Expected number, received nan" and the user sees a confusing error. Use `Number.parseInt(raw, 10)` and check `Number.isFinite` before passing through.

**Fix:**
```tsx
// YearRangeField.tsx:43-48
function handle(change: (v: number | null) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return change(null);
    const n = Number.parseInt(raw, 10);
    change(Number.isFinite(n) ? n : null);
  };
}
```

### LOW-04: WishlistModule unused mutation (cosmetic)

**File:** `src/components/v3/modules/WishlistModule.tsx:51`
**Issue:** `const _createMut = useCreateWishlist();` — the comment claims it's "referenced for hook count + future inline create paths". This is dead code: the module never invokes `createMut`. The form sheet handles creation directly via its own `useCreateWishlist()`. Calling the mutation hook here costs a useless React Query mutation registration.

**Fix:**
```tsx
// Remove the line entirely:
// const _createMut = useCreateWishlist(); // ← delete

// If a future refactor truly needs an inline create path, re-introduce it then.
```

### LOW-05: Sidebar still shows "Marketplace" entry indirectly via AppShell registry

**File:** `src/components/v3/Sidebar.tsx` (no marketplace entry — correct)
**Issue:** Verification report line 56 notes "only the still-registered MarketplaceModule registry mapping in AppShell.tsx remains, no sidebar entry". This is per D-15 (cleanup deferred to Phase 12). The current code matches the decision; flagging only as a pointer that the deferred cleanup is still pending and that activating `activeModule="marketplace"` from any code path would render the legacy module silently. No fix needed in Phase 7.

### LOW-06: WishlistPreviewPane debounce uses values from useWatch as effect dep

**File:** `src/components/forms/WishlistPreviewPane.tsx:48-51`
**Issue:** `useEffect(() => { setTimeout(() => setDebounced(values as Partial<WishlistFormValues>), 400); }, [values])` — `values` is the live RHF watch object. RHF returns a new object reference on EVERY render of the watching component (this is standard `useWatch` behavior). Combined with `useWatch(control)` returning all fields, every keystroke causes a new `values` reference, which is exactly what's intended. But the cast `values as Partial<WishlistFormValues>` is unnecessary — `useWatch(control)` is already typed as `Partial<...>` for the no-name overload, and the explicit cast hides any future type mismatches.

Cosmetic — works correctly. Replace `as Partial<WishlistFormValues>` with the inferred type or remove the cast.

### LOW-07: LocalidadeMultiPicker reads currentUfs/currentCities outside RHF subscription

**File:** `src/components/forms/LocalidadeMultiPicker.tsx:38-40`
**Issue:** `getValues(ufName)` reads the field value imperatively at render time. For the chip labels to stay accurate after `append`/`remove`, the component must re-render. `useFieldArray` does cause re-renders on `append/remove/insert`, so this works in practice. But typing in a parent input that's NOT the field array won't propagate updates here, and reading `getValues` instead of `useWatch(name)` means cross-component edits to `region_uf[0]` would not refresh the chip label.

In Phase 7 the only writers to `region_uf` / `region_cities` are this component itself, so the bug is dormant. Worth a comment or a switch to `useWatch({ name: ufName })` for resilience:

**Fix:**
```tsx
import { useWatch } from "react-hook-form";

const currentUfs = (useWatch({ control, name: ufName }) as string[] | undefined) ?? [];
const currentCities = (useWatch({ control, name: citiesName }) as string[] | undefined) ?? [];
```
This guarantees the chips always reflect the current form values, even if a future feature lets users edit tuples elsewhere.

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
