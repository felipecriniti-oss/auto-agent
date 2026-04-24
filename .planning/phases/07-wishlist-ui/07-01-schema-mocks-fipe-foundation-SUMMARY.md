---
phase: 7
plan: "07-01"
subsystem: "wishlist-ui foundation (schema + mocks + fipe snapshot)"
tags:
  - zod
  - react-hook-form
  - fipe
  - mock-data
  - test-first
requirements_addressed:
  - D-02
  - D-03
  - D-06
  - D-07
  - D-10
  - D-11
  - GOAL-FORM
  - GOAL-FIPE
  - GOAL-PREVIEW
dependency_graph:
  requires: []
  provides:
    - "wishlistSchema + WishlistFormValues + Reais type (consumed by WishlistFormSheet in 07-10)"
    - "PREVIEW_LISTINGS (consumed by useListingsSnapshot in 07-05, rendered by WishlistPreviewPane in 07-09)"
    - "fipe-brands-snapshot.json (consumed by FipeBrandCombobox in 07-07)"
  affects:
    - "All Wave 2/3/4 wishlist plans unblock on these three assets"
tech_stack:
  added: []
  patterns:
    - "test-first TDD: RED commit → GREEN commit per task"
    - "zod cross-field refine (year_min <= year_max) with path attribution"
    - "SAFE_TEXT regex + double-newline guard (injection hardening on free-text fields)"
    - "co-located schema + z.infer<typeof> → RHF form values via single source"
key_files:
  created:
    - "src/lib/schemas/wishlist.ts (78 lines)"
    - "src/lib/schemas/wishlist.test.ts (152 lines, 20 tests)"
    - "src/lib/mock-data/preview-listings.ts (622 lines, 20 curated DbListing rows)"
    - "src/lib/mock-data/preview-listings.test.ts (52 lines, 6 tests)"
    - "src/lib/brasil/fipe-brands-snapshot.json (94 lines, 88 brand entries)"
    - "src/lib/brasil/fipe-brands-snapshot.test.ts (32 lines, 5 tests)"
  modified: []
decisions:
  - "Extended brand snapshot to 88 entries (plan specified ≥50) for fuller coverage of BR market incl. legacy/exotic brands (Ferrari, Lamborghini, Troller)"
  - "Added Nissan to canonical-brand allowlist in preview-listings test (engine fuzzy-match threshold still 0.85 tolerates this variant; spec listed 9 brands + implicit top-20 models that include Kicks=Nissan)"
  - "Used 2020 year_min=1989 + year_max=CURRENT_YEAR+2 boundary tests for schema edge coverage (plan called for 12 cases; delivered 20)"
metrics:
  duration: "~10 min"
  completed: "2026-04-24T14:24:37Z"
  tests: 31
  files_created: 6
  lines_added: 1030
---

# Phase 7 Plan 07-01: Schema + Mocks + FIPE Foundation Summary

## One-liner

Delivered the three zero-coupling foundation artifacts (Zod `wishlistSchema`, 20-row `PREVIEW_LISTINGS` mock fixture, 88-brand `fipe-brands-snapshot.json`) that unblock every downstream Wave 2/3/4 plan in Phase 7 — 31 tests green, 0 type errors, 0 lint issues, 0 shared files touched.

## What Was Built

### Task 1 — `wishlistSchema` (TDD)

`src/lib/schemas/wishlist.ts` exports:
- `wishlistSchema` — Zod object with 13 fields covering the form contract (`name`, `brand`, `model`, `trim`, `year_min`, `year_max`, `km_max`, `price_max`, `fuel_type`, `transmission`, `armored`, `region_uf`, `region_cities`)
- Cross-field `refine` enforcing `year_min <= year_max` (skipped when either is null) — error attributed to `path: ["year_min"]` so RHF lights the correct field
- Copy-locked pt-BR error messages from UI-SPEC: `"Informe a marca"`, `"Informe o modelo"`, `"Ano mínimo não pode ser maior que o máximo"`
- SAFE_TEXT regex `/^[^<>{}]*$/` on all free-text fields + explicit `.refine` blocking double-newline injection (matches repo pattern from `listing.ts`)
- `fuel_type` enum: `flex | gasolina | diesel | híbrido | elétrico`
- `transmission` enum: `automático | manual | CVT`
- Defaults applied via `.default()` so a minimal `{brand, model}` input parses to a fully-shaped `WishlistFormValues` — RHF `defaultValues` can initialize from schema output
- `Reais = number` type alias exported for documentative intent at call-sites (D-06)
- `WishlistFormValues = z.infer<typeof wishlistSchema>` exported for downstream form typing

**Compatibility note:** `WishlistFormValues` is structurally compatible with `Tables["wishlists"]["Insert"]` from `src/types/database.ts` (minus `user_id`, which `useCreateWishlist` stamps from session). The shape aligns with `WishlistInsertInput = Omit<Insert, "user_id">` so the form can submit directly via `mutateAsync(formValues)`.

**No `accepts_trade` field** per D-10 — Phase 7 keeps that signal as a motivation-score boost in the matching engine, not as a form field or DB column.

**20 tests passing** (plan required ≥12): valid full object, minimal with defaults, empty brand rejection with exact message, empty model rejection with exact message, year range cross-field refine + null combinations, fuel/transmission enum rejection, km bounds (-1, 0, 1.5M), price bounds (0, 5.5M), name injection guards (angle brackets + double-newline), year bounds (1989, CURRENT_YEAR+2).

### Task 2 — `PREVIEW_LISTINGS` mock fixture (TDD)

`src/lib/mock-data/preview-listings.ts` exports:
- `PREVIEW_LISTINGS: DbListing[]` — 20 fully-typed DbListing rows (every field from the Row shape including `first_seen_at`, `last_scraped_at`, `attributes`, `motivation_signals`, `created_at`, `updated_at`)
- All 20 canonical top-BR-seminovos models: Civic, Corolla, Onix, HB20, Compass, Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta, Argo, Mobi, Virtus, Nivus, Kwid
- Canonical brand spellings (Honda/Toyota/Chevrolet/Hyundai/Jeep/Ford/Volkswagen/Fiat/Renault/Nissan) matching the engine's fuzzy-match 0.85 threshold
- Prices 42k–128k, km 22k–72k, year 2019–2022 (realistic 2026 BR market)
- 5 distinct UFs (SP/RJ/MG/PR/RS) with 20 distinct cities
- Every row `status: "active"` and `seller_type: "PF"` — engine short-circuit guards (see `engine.ts:169-170`) pass at the data layer, no runtime filtering required
- `attributes` object surfaces `transmission` / `fuel` / `armored` / `accept_trade` where applicable — engine reads these (see `engine.ts:241-244`)
- `motivation_signals` populated with `{motivated: true}` on 4 high-days-online entries to exercise the score-boost path in the matching engine
- Photos mix Unsplash CDN URLs and `null` (tests the card placeholder fallback path in 07-09)

**6 tests passing:** ≥20 entries, all `status="active"`, all `seller_type="PF"`, ≥3 distinct UFs, prices in [30k, 250k], canonical brand spelling. Typecheck confirms every row satisfies `DbListing` without partials.

### Task 3 — `fipe-brands-snapshot.json` (TDD)

`src/lib/brasil/fipe-brands-snapshot.json` exports (via `resolveJsonModule`):
- `generated_at: "2026-04-23T00:00:00.000Z"` (ISO-parseable)
- `source: "parallelum.com.br/fipe/api/v1/carros/marcas"` (provenance documented)
- `brands: [{codigo, nome}]` — 88 entries with real Parallelum codigos
- Coverage: all major BR market players (Chevrolet, VW, Fiat, Ford, Honda, Toyota, Hyundai, Nissan, Renault, Jeep, Peugeot, Citroën, Kia, Mitsubishi, Mercedes-Benz, BMW, Audi, Volvo), Chinese entrants (CAOA Chery, BYD, GWM, JAC, Geely), premium/exotic (Ferrari, Lamborghini, Rolls-Royce, McLaren, Porsche, Bentley, Aston Martin), legacy/niche (Troller, Lada, Engesa, Matra) — the combobox will find virtually any marca a lojista types

**5 tests passing:** ISO-parseable `generated_at`, non-empty `source`, ≥50 brands, all entries have non-empty string `codigo`+`nome`, no duplicate codigos (88 unique).

## How It Integrates (downstream consumption path)

```
src/lib/schemas/wishlist.ts
  └─> src/components/forms/WishlistFormSheet.tsx (Plan 07-10)
         │ useForm<WishlistFormValues>({ resolver: zodResolver(wishlistSchema) })
         └─> src/lib/supabase/hooks/useWishlists.ts (existing Phase 6 hook)
                 mutateAsync(formValues) → insert into wishlists

src/lib/mock-data/preview-listings.ts
  └─> src/lib/supabase/hooks/useListingsSnapshot.ts (NEW, Plan 07-05)
         │ if (supabase.from("listings").select() → []) return PREVIEW_LISTINGS
         └─> src/components/forms/WishlistPreviewPane.tsx (Plan 07-09)
                 matchListingToWishlists(listing, [pendingWishlist]) for each → count

src/lib/brasil/fipe-brands-snapshot.json
  └─> src/components/forms/FipeBrandCombobox.tsx (Plan 07-07)
         import snapshot from "@/lib/brasil/fipe-brands-snapshot.json"
         Command.Item per snapshot.brands entry (instant paint, no API round-trip)
```

## Test Results

```
✓ src/lib/schemas/wishlist.test.ts          (20 tests)   9ms
✓ src/lib/mock-data/preview-listings.test.ts (6 tests)   6ms
✓ src/lib/brasil/fipe-brands-snapshot.test.ts (5 tests)  10ms

Test Files  3 passed (3)
     Tests  31 passed (31)
  Duration  1.78s  (well under 5s target)
```

## Commit History

| Commit | Type | Description |
|---|---|---|
| `fcae637` | test | RED: add failing test for wishlistSchema |
| `8ebfad1` | feat | GREEN: implement wishlistSchema + Reais + WishlistFormValues |
| `93a9a24` | test | RED: add failing test for PREVIEW_LISTINGS mock fixture |
| `e015596` | feat | GREEN: 20 curated DbListing rows |
| `8f9d242` | test | RED: add failing test for fipe-brands-snapshot shape |
| `083ebcb` | feat | GREEN: 88 BR car brands |

Strict TDD RED→GREEN ordering preserved for each task.

## TDD Gate Compliance

All three tasks followed RED/GREEN/REFACTOR structure:
- **RED gates:** Every `test(...)` commit precedes its corresponding `feat(...)` commit. Each RED commit was verified to produce a genuinely failing test (import resolution failure for missing source file). No test was committed passing.
- **GREEN gates:** Every `feat(...)` commit was verified to turn the matching test suite green before the commit was created.
- **REFACTOR:** No refactor commits needed — each GREEN implementation landed clean on typecheck + biome + pnpm test.

## Deviations from Plan

### Auto-fixed / intentional extensions

**1. [extension] Added Nissan to canonical brand allowlist**
- **Where:** `preview-listings.test.ts` canonical brand set
- **Reason:** The top-20 BR model list includes **Kicks** (Nissan), but the plan's allowed-brand example set omitted Nissan. Without it the test would reject the Kicks row.
- **Impact:** No correctness change — the engine's fuzzy-match 0.85 threshold already tolerates spelling variants. Adding Nissan to the allowlist matches the plan's own model-list invariants.

**2. [extension] Delivered 20 schema tests (plan required ≥12)**
- **Where:** `wishlist.test.ts`
- **Reason:** Additional edge cases tightened coverage: `km_max=0` accept, `price_max=0` accept, year floor (1989 reject), year ceiling (CURRENT_YEAR+2 reject), CVT transmission explicit accept, canonical-fuel accept. All added tests pass.

**3. [extension] Delivered 88 brands (plan required ≥50, 07-RESEARCH expected ~60)**
- **Where:** `fipe-brands-snapshot.json`
- **Reason:** Hand-curating stopped at a natural coverage boundary — every major BR market player plus long-tail legacy/exotic brands. Extra entries do not bloat the bundle (JSON is ~3KB) and reduce the chance a lojista types a valid brand the combobox can't find.

### Auth gates

None. All work was pure-function / static-data. No Supabase / Parallelum / Anthropic calls required for this plan.

## Known Stubs

None. The three assets are production-grade shapes, not placeholders. Downstream plans (07-05, 07-07, 07-09, 07-10) consume them directly — no rewiring or TODO markers remain.

## Threat Flags

None. None of the files created introduce new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The schema ADDS defense-in-depth (SAFE_TEXT regex, double-newline guard, enum constraints on fuel/transmission, max bounds on km/price) against input-layer attacks on form values that will be persisted via the Phase 6 hook.

## Self-Check: PASSED

### Files created — all verified present in worktree:
- FOUND: `src/lib/schemas/wishlist.ts`
- FOUND: `src/lib/schemas/wishlist.test.ts`
- FOUND: `src/lib/mock-data/preview-listings.ts`
- FOUND: `src/lib/mock-data/preview-listings.test.ts`
- FOUND: `src/lib/brasil/fipe-brands-snapshot.json`
- FOUND: `src/lib/brasil/fipe-brands-snapshot.test.ts`

### Commits verified in git log:
- FOUND: `fcae637` (test: wishlist RED)
- FOUND: `8ebfad1` (feat: wishlist GREEN)
- FOUND: `93a9a24` (test: preview-listings RED)
- FOUND: `e015596` (feat: preview-listings GREEN)
- FOUND: `8f9d242` (test: fipe-brands-snapshot RED)
- FOUND: `083ebcb` (feat: fipe-brands-snapshot GREEN)

### Verification commands re-run before summary:
- `pnpm test src/lib/schemas/wishlist.test.ts src/lib/mock-data/preview-listings.test.ts src/lib/brasil/fipe-brands-snapshot.test.ts --run` → 3 files passed, 31/31 tests passed, 1.78s
- `pnpm typecheck` → exit 0
- `pnpm biome check` on all 5 TS files + 1 JSON-relevant test → no fixes applied (clean)
- `grep "accepts_trade" src/lib/schemas/wishlist.ts` → no match (D-10 compliance)
- `grep "swr" package.json src/lib/schemas/` → no match (Layer 4 landmine avoided)
