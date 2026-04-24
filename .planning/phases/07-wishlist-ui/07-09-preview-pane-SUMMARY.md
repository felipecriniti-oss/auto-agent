---
phase: 7
plan: "07-09"
subsystem: "wishlist-ui — preview pane (Wave 3 composition)"
tags:
  - react-hook-form
  - use-watch
  - debounce
  - matching-engine
  - tdd
  - aria-live
  - silent-fallback
requirements_addressed:
  - D-01
  - D-02
  - D-10
  - GOAL-PREVIEW
dependency_graph:
  requires:
    - "07-01 (wishlistSchema, WishlistFormValues, PREVIEW_LISTINGS)"
    - "07-05 (useListingsSnapshot hook)"
  provides:
    - "WishlistPreviewPane (consumed by WishlistFormSheet in 07-10)"
    - "formValuesToPendingWishlist (adapter reusable by any caller that needs a pending DbWishlist from form state)"
  affects:
    - "Wave 4 plan 07-10 unblocked — form sheet now has a preview component to slot below fields"
tech_stack:
  added: []
  patterns:
    - "useWatch + inline setTimeout debounce (no useDebounce helper file — 07-RESEARCH anti-pattern)"
    - "Adapter pattern: Partial<WishlistFormValues> → full DbWishlist with status='active' guard"
    - "Per-listing inverse loop against matchListingToWishlists (landmine L1)"
    - "enforcePfOnly:false at preview site only (landmine L2/L6) — production DB trigger still enforces PF-only downstream"
    - "try/catch → silent no-op (State Matrix §Preview pane error row)"
    - "aria-live='polite' for screen-reader count feedback"
    - "TDD RED → GREEN ordering per task"
key_files:
  created:
    - "src/lib/wishlist/formValuesToPendingWishlist.ts (39 lines)"
    - "src/lib/wishlist/formValuesToPendingWishlist.test.ts (73 lines, 8 tests)"
    - "src/components/forms/WishlistPreviewPane.tsx (156 lines)"
    - "src/components/forms/WishlistPreviewPane.test.tsx (131 lines, 5 tests)"
  modified: []
decisions:
  - "W6: chose Skeleton over literal 'Calculando matches...' text while brand/model empty — State Matrix §Preview pane explicitly allows Skeleton and it reads more consistently against the 400ms RHF debounce feedback"
  - "enforcePfOnly:false at preview call-site only — mocks may lack seller_type='PF' and the production DB trigger on opportunity creation still enforces PF-only downstream"
  - "Separate adapter file in src/lib/wishlist/ so the pure function is unit-testable in isolation without pulling in the component, RHF, or React Query"
  - "Used Partial<WishlistFormValues> in the adapter signature (instead of full WishlistFormValues) because useWatch can return partially-populated values during RHF's first render cycle; every field falls back to a null/empty default so the engine always sees a legal DbWishlist shape"
metrics:
  duration: "~12 min"
  completed: "2026-04-24T14:47:30Z"
  tests: 13
  files_created: 4
  lines_added: 399
---

# Phase 7 Plan 07-09: WishlistPreviewPane Summary

## One-liner

Delivered the killer preview UX the PRD promised — `WishlistPreviewPane` + `formValuesToPendingWishlist` adapter that live-counts matching listings as the lojista types the wishlist, using `useWatch` + 400ms inline debounce + the pure `matchListingToWishlists` engine over the `useListingsSnapshot` data, with `aria-live` and three landmines (L1/L2/L6) all addressed.

## What Was Built

### Task 1 — `formValuesToPendingWishlist` adapter (TDD)

`src/lib/wishlist/formValuesToPendingWishlist.ts` exports a pure function:

```typescript
formValuesToPendingWishlist(v: Partial<WishlistFormValues>): DbWishlist
```

Contract:
- Stamps `status: "active"` verbatim — the matching engine short-circuits at `engine.ts:175` on non-active wishlists, so the synthetic wishlist must declare itself alive to be considered
- Synthesizes `id: "pending"`, `user_id: "pending"` — preview runs pre-persist, no DB row exists yet; the engine ignores these IDs so sentinels are fine
- Sets ISO timestamps (`new Date().toISOString()`) for `created_at`/`updated_at`
- `name` falls back to `"pending"` when the form field is empty (schema allows empty name because `WishlistModule` auto-generates one via `summarize()` on submit)
- Arrays default to `[]` (`fuel_type`, `transmission`, `region_uf`, `region_cities`)
- Nullable scalars default to `null` (`trim`, `year_min`, `year_max`, `km_max`, `price_max`, `armored`)
- Every one of the 13 `DbWishlist` row fields is assigned explicitly — TypeScript typecheck acts as a drift guard if the Row shape gains a field

**8 tests passing:**
1. `status="active"` stamped
2. `id + user_id === "pending"`
3. Array defaults to `[]` when undefined
4. Null scalars default to `null`
5. Provided values preserved verbatim
6. Empty name → `"pending"` fallback
7. Non-empty name preserved
8. Timestamps are ISO-parseable

### Task 2 — `WishlistPreviewPane` component (TDD)

`src/components/forms/WishlistPreviewPane.tsx` exports a "use client" component that:

1. Reads the current RHF form values via `useWatch({ control })` — one rerender per any field change
2. Debounces 400ms through an inline `useEffect + setTimeout + clearTimeout` (no `useDebounce` helper file per 07-RESEARCH anti-pattern)
3. Calls `useListingsSnapshot()` for the listings universe (D-01 silent fallback to mocks when DB empty)
4. Per-listing inverse loop calling `matchListingToWishlists(listing, [pending], { enforcePfOnly: false })` — counts listings where `results.length > 0` and retains the first 3 as "examples"
5. Wraps the engine call in `try/catch` — on throw, returns `null` so the pane stays silent (State Matrix §Preview pane Error row)
6. Renders three states:
   - `count === null` (brand/model empty or engine threw) → 2-line `Skeleton` (W6: chose Skeleton over literal "Calculando matches..." per State Matrix §Preview pane allowance)
   - `count === 0` → zero-match copy verbatim from UI-SPEC: `Ainda não achamos anúncios compatíveis. Você pode salvar a wishlist mesmo assim — novos anúncios aparecem todo dia.`
   - `count > 0` → happy path: `Com essas regras, acharíamos <X anúncios> esta semana.` with the count wrapped in `<span className="font-semibold text-[#4C46DC]">{count} anúncios</span>` — the ONE allowed body-copy accent exception per UI-SPEC §Color accent allowlist item 4
7. When matches exist, renders a ghost `Button` "Ver exemplos" with animated `ChevronDown` that toggles a collapsible `grid-cols-1 md:grid-cols-3` `<ul>` of 3 mini cards (photo square, brand/model, price + km, year + UF, no interactive elements per UI-SPEC §Interaction Contracts "preview cards are not clickable")
8. Root `<section>` carries `aria-live="polite"` so screen readers hear count changes as the user types

**5 tests passing:**
1. Skeleton renders while brand/model are empty
2. Happy path: Honda+Civic → `/acharíamos/` + `/anúncios/` in DOM
3. Zero-match copy when `price_max: 1` makes the wishlist impossible
4. `aria-live='polite'` on the section
5. Accent `text-[#4C46DC]` span exists (via `querySelector("span.text-\\[\\#4C46DC\\]")`)

## Landmine Compliance

| Landmine | Status | Evidence |
|---|---|---|
| L1: engine is `matchListingToWishlists(listing, wishlists[])` not `scoreListings(rules, listings)` | **Addressed** | `grep -rn "scoreListings" src/components/forms/` returns 0 matches; `matchListingToWishlists` called with `(listing, [pending], opts)` shape at line 67 |
| L2: `enforcePfOnly: false` — preview permits all sellers because mocks may not set `seller_type="PF"` | **Addressed** | Literal `enforcePfOnly: false` appears exactly once at the engine call site (line 67); production DB trigger still enforces PF downstream when opportunities are persisted in Phase 9 |
| L6: the option must be **explicitly** passed `false` (engine default is `true`, which would zero the count) | **Addressed** | Same line 67 call site passes the option inline rather than relying on the default |
| Adapter: `status: "active"` on synthetic wishlist | **Addressed** | Adapter stamps `status: "active"` and an 8-test suite asserts it |

## W6 Decision — Loading Copy

UI-SPEC §Copywriting Contract row "Preview pane loading" specifies the literal text `"Calculando matches..."`, but State Matrix §Preview pane row explicitly allows `Skeleton` for the loading visual. I chose **Skeleton** (two `bg-muted animate-pulse` bars) because:

- Reads more consistently with the RHF debounce feedback (no text that flashes then disappears during the 400ms window)
- Matches the shadcn primitive pattern used elsewhere (module page skeleton while `useWishlists` loads — UI-SPEC State Matrix row "Module page → Loading")
- Three W6-tagged inline comments in the component body document the divergence for future reviewers

## How It Integrates

```
RHF form (WishlistFormSheet, plan 07-10)
  │ control: Control<WishlistFormValues>
  ▼
WishlistPreviewPane.tsx  ← THIS PLAN
  │
  ├─ useWatch(control) → debounce 400ms → Partial<WishlistFormValues>
  │
  ├─ formValuesToPendingWishlist → DbWishlist (status="active" stamped)
  │
  ├─ useListingsSnapshot → DbListing[] (real or PREVIEW_LISTINGS fallback)
  │
  └─ for each listing: matchListingToWishlists(listing, [pending], {enforcePfOnly:false})
       └─ count results.length > 0 → preview count
```

Downstream consumer (`WishlistFormSheet`, plan 07-10) will slot the pane below the form fields and above the sticky submit footer, passing `form.control` directly — no props reshaping required.

## Test Results

```
 ✓ src/lib/wishlist/formValuesToPendingWishlist.test.ts    (8 tests)   4ms
 ✓ src/components/forms/WishlistPreviewPane.test.tsx       (5 tests)  78ms

 Test Files  2 passed (2)
      Tests  13 passed (13)
   Duration  2.10s
```

Sibling checks:
- `pnpm typecheck` → exit 0
- `pnpm lint` (biome check src) → exit 0, 142 files checked, no fixes applied

## Commit History

| Commit    | Type    | Description                                               |
| --------- | ------- | --------------------------------------------------------- |
| `f605f99` | test    | RED: add failing test for formValuesToPendingWishlist (8 tests) |
| `0dcb1b1` | feat    | GREEN: implement formValuesToPendingWishlist adapter       |
| `c8060fc` | test    | RED: add failing test for WishlistPreviewPane (5 tests)    |
| `6fadd45` | feat    | GREEN: implement WishlistPreviewPane — debounced live count |
| `45c9cd5` | style   | biome organizeImports + format on preview pane test       |

Strict TDD RED → GREEN ordering preserved for each task.

## TDD Gate Compliance

- **RED gates:** Both `test(...)` commits (`f605f99`, `c8060fc`) were verified to fail with `Error: Failed to resolve import` before the corresponding GREEN commit landed — genuine RED (import resolution failure, not a passing test committed as RED).
- **GREEN gates:** Both `feat(...)` commits (`0dcb1b1`, `6fadd45`) were verified to turn the matching test suite green (8/8 and 5/5 respectively) before the commit was created.
- **REFACTOR:** No refactor commits needed. One `style(...)` commit (`45c9cd5`) applied biome's auto-fix to the test file's import ordering and JSX formatting — triggered by `pnpm exec biome check --write` during the GREEN verification pass for Task 2. No behavior change, test suite re-verified green afterward.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — blocking] `biome-ignore lint/performance/noImgElement` category does not exist in biome 1.9.4**

- **Found during:** Task 2 GREEN lint pass
- **Issue:** Initial implementation of the preview card photo used `<img>` and carried a `biome-ignore lint/performance/noImgElement` suppression comment. Biome 1.9 (configured in `biome.json`) has no such rule — it is a Next.js ESLint rule, not a biome rule — so biome flagged the suppression itself as unparseable.
- **Fix:** Removed the suppression comment. The `<img>` renders without issue because biome's `recommended` rules do not flag plain `<img>`. The preview cards are read-only / non-interactive (UI-SPEC §Interaction Contracts "preview cards are not clickable") and use Unsplash CDN URLs on 3 mock thumbnails — Next/Image optimization is not required for this Phase 7 preview; if a future phase wires these to real listings, a switch to `next/image` can happen in place.
- **Files modified:** `src/components/forms/WishlistPreviewPane.tsx`
- **Commit:** Rolled into the GREEN commit `6fadd45`

**2. [Rule 3 — blocking] Biome organizeImports on both new TSX files**

- **Found during:** Task 2 GREEN lint pass
- **Issue:** Biome's `organizeImports` rule wanted `@/...` alias imports sorted above external-package imports in the component (path-alias group first) and in a specific order in the test file.
- **Fix:** Ran `pnpm exec biome check --write` on both files — auto-fix resolved both. Tests re-verified green afterward.
- **Files modified:** `src/components/forms/WishlistPreviewPane.tsx`, `src/components/forms/WishlistPreviewPane.test.tsx`
- **Commits:** Component fix rolled into `6fadd45`; test file fix committed as `45c9cd5` (style).

**3. [Rule 3 — blocking] Plan's illustrative `scoreListings` reference inside JSDoc broke the acceptance grep**

- **Found during:** Task 2 acceptance-grep verification
- **Issue:** The plan's acceptance criteria require `grep -n "scoreListings" src/components/forms/WishlistPreviewPane.tsx` to return **0 matches** (L1 guard). My initial JSDoc block mentioned `scoreListings` in the form `"engine is matchListingToWishlists(...), not scoreListings(...)"` — a pedagogical negation, but literal grep counted it.
- **Fix:** Rewrote the JSDoc line to drop the negative reference and kept the L1 explanation ("engine signature is `matchListingToWishlists(listing, wishlists[])` — the inverse loop is mandatory").
- **Files modified:** `src/components/forms/WishlistPreviewPane.tsx`
- **Commit:** Rolled into the GREEN commit `6fadd45` (the re-run of acceptance greps happened before the file was committed)

### Auth gates

None. All work was Vitest unit-level with a fully mocked `useListingsSnapshot` and an inline `FormProvider` harness. No Supabase / Parallelum / Anthropic calls required for this plan.

## Known Stubs

None. `WishlistPreviewPane` is production-grade and renders against real engine+data. The `formValuesToPendingWishlist` adapter is a pure function with a complete 8-test suite proving its shape contract.

The `<img src={l.photo_url}>` on preview cards is NOT a stub — it's a deliberate choice for Phase 7:
- Preview cards are read-only (UI-SPEC §Interaction Contracts line 239: "No interactive elements (not links, no CTAs)")
- 3 mock thumbs per preview session — not a hot-path image-perf concern
- A future phase that rewires preview cards to real listings can swap to `next/image` in place without changing this component's props

## Threat Flags

None. The component introduces no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. It only consumes:
- The existing `useListingsSnapshot` hook (read-only query on `listings` with `.limit(500)` already bounded by plan 07-05)
- The pure `matchListingToWishlists` function (23 tests already passing in `src/lib/matching/engine.test.ts`)
- The existing Zod-validated `WishlistFormValues` type from plan 07-01

The `<img>` tag loads from whatever URL is on `listing.photo_url` — for Phase 7 those are curated Unsplash CDN URLs (hard-coded in `PREVIEW_LISTINGS`), and any real listing photos come from the WebMotors scraper pipeline (out-of-scope for Phase 7). `alt=""` is intentional — the adjacent `<p>{l.brand} {l.model}</p>` carries the semantic label, so the image is decorative per W3C a11y guidance.

## Self-Check: PASSED

### Files created — all verified present in worktree:

- FOUND: `src/lib/wishlist/formValuesToPendingWishlist.ts`
- FOUND: `src/lib/wishlist/formValuesToPendingWishlist.test.ts`
- FOUND: `src/components/forms/WishlistPreviewPane.tsx`
- FOUND: `src/components/forms/WishlistPreviewPane.test.tsx`

### Commits verified in git log:

- FOUND: `f605f99` (test: formValuesToPendingWishlist RED)
- FOUND: `0dcb1b1` (feat: formValuesToPendingWishlist GREEN)
- FOUND: `c8060fc` (test: WishlistPreviewPane RED)
- FOUND: `6fadd45` (feat: WishlistPreviewPane GREEN)
- FOUND: `45c9cd5` (style: biome auto-fix on test file)

### Acceptance-criteria greps (re-run pre-summary):

Task 1:
- `grep -c "export function formValuesToPendingWishlist" src/lib/wishlist/formValuesToPendingWishlist.ts` = 1 ✓
- `grep -c "status: \"active\"" src/lib/wishlist/formValuesToPendingWishlist.ts` = 1 ✓

Task 2:
- `grep -c "aria-live=\"polite\"" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓
- `grep -c "Prévia de resultados" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓
- `grep -c "Com essas regras, acharíamos" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓
- `grep -c "Ainda não achamos anúncios compatíveis" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓
- `grep -c "Ver exemplos" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓
- `grep -n "font-semibold text-\[#4C46DC\]" src/components/forms/WishlistPreviewPane.tsx` = 1 line ✓
- `grep -n "matchListingToWishlists" src/components/forms/WishlistPreviewPane.tsx` = 4 lines (import + 2 JSDoc + call; ≥2 required) ✓
- `grep -c "enforcePfOnly: false" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓ (L6)
- `grep -c "setTimeout(() => setDebounced" src/components/forms/WishlistPreviewPane.tsx` = 1 ✓ (inline debounce, no helper file)
- `grep -c "scoreListings" src/components/forms/WishlistPreviewPane.tsx` = 0 ✓ (L1 — wrong signature)
- `grep -c "W6" src/components/forms/WishlistPreviewPane.tsx` = 3 (≥1 required) ✓

### Verification commands re-run before summary:

- `pnpm test src/lib/wishlist/formValuesToPendingWishlist.test.ts src/components/forms/WishlistPreviewPane.test.tsx --run` → 2 files passed, 13/13 tests passed, 2.10s
- `pnpm typecheck` → exit 0
- `pnpm lint` (biome check src) → exit 0, 142 files checked, no fixes applied
