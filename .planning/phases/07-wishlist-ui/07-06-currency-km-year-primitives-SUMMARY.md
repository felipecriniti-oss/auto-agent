---
phase: 7
plan: "07-06"
subsystem: "wishlist-ui form primitives (BrlCurrencyInput + KmInput + YearRangeField)"
tags:
  - forms
  - primitives
  - pt-br-mask
  - rhf-agnostic
  - tdd
requirements_addressed:
  - D-06
  - D-11
dependency_graph:
  requires:
    - "07-01 — wishlistSchema + Reais type alias (src/lib/schemas/wishlist.ts)"
  provides:
    - "BrlCurrencyInput — Controlled BRL input with pt-BR mask (consumed by WishlistFormSheet in 07-10)"
    - "KmInput — Controlled km input with pt-BR thousand separator (consumed by WishlistFormSheet in 07-10)"
    - "YearRangeField — Dual number-input for year_min + year_max (consumed by WishlistFormSheet in 07-10)"
  affects:
    - "Wave 3 plan 07-10 (WishlistFormSheet) now has its numeric-field building blocks"
    - "Future billing form (P13a) will mirror the pt-BR number-input pattern established here"
tech_stack:
  added: []
  patterns:
    - "RHF-agnostic primitives: { value, onChange, disabled? } prop surface — zero react-hook-form coupling"
    - "pt-BR mask via toLocaleString('pt-BR') + digit-only stripping on input"
    - "Controlled component with null as empty sentinel (round-trips cleanly to Zod .nullable())"
    - "TDD RED/GREEN per primitive (6 commits total, 3 RED + 3 GREEN)"
key_files:
  created:
    - "src/components/forms/BrlCurrencyInput.tsx (64 lines)"
    - "src/components/forms/BrlCurrencyInput.test.tsx (55 lines, 7 tests)"
    - "src/components/forms/KmInput.tsx (61 lines)"
    - "src/components/forms/KmInput.test.tsx (47 lines, 6 tests)"
    - "src/components/forms/YearRangeField.tsx (86 lines)"
    - "src/components/forms/YearRangeField.test.tsx (80 lines, 6 tests)"
  modified: []
decisions:
  - "BrlCurrencyInput JSDoc locks W12 paste rule inline: digit-only stripping, no decimal interpretation — Zod max-bound rejects the benign 'abc130.000,50' → 13000050 edge case at submit time"
  - "KmInput 'km' suffix rendered as pointer-events-none absolute span (right-3) inside a relative wrapper — integrated visual affordance without intercepting input clicks"
  - "YearRangeField owns its label and hint/error copy; parent FormField overrides errorText via the schema refine path ['year_min'] (wiring happens in plan 07-10)"
  - "YearRangeField default labelText ('Ano'), hintText ('Deixe vazio para qualquer ano'), idMin/idMax all prop-overridable — allows onboarding step 3 to reuse the field without forking"
metrics:
  duration: "~15 min"
  completed: "2026-04-24T14:35:30Z"
  tests: 19
  files_created: 6
  lines_added: 393
  commits: 6
---

# Phase 7 Plan 07-06: Currency + KM + Year Range Primitives Summary

## One-liner

Three RHF-agnostic field primitives (`BrlCurrencyInput`, `KmInput`, `YearRangeField`) with pt-BR masks, integer-reais/km round-tripping, and null-as-empty semantics — 19 tests green, typecheck + biome clean, zero react-hook-form coupling.

## What Was Built

### Task 1 — `BrlCurrencyInput` (TDD)

`src/components/forms/BrlCurrencyInput.tsx` exports the BRL primitive.

- Prop surface: `{ value: Reais | null, onChange: (next: Reais | null) => void, placeholder?, disabled?, id?, className? }`
- Reuses the `Reais = number` type alias from 07-01 — unit intent explicit at every call-site
- Display formula: `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` → `"R$ 130.000"`
- Input mask formula: `e.target.value.replace(/\D/g, "")` → `Number.parseInt(digits, 10)` (integer reais only — D-06)
- `disabled` flag + `className` override passthrough
- **W12 paste rule locked in JSDoc:** digit-only stripping, no decimal interpretation. `'R$ 130.000'` → `130000`. `'abc130.000,50'` → `13000050` is the benign edge case Zod rejects at submit time (max 5,000,000).

**7 tests passing:**
1. `R$ 130.000` displayed when `value={130000}`
2. Empty string when `value={null}`
3. Typing `130000` → `onChange(130000)`
4. Paste `R$ 130.000` → `onChange(130000)` (stripping rule)
5. Clear → `onChange(null)`
6. `abc130000` → `onChange(130000)` (letter stripping)
7. `disabled` prop disables the input

### Task 2 — `KmInput` (TDD)

`src/components/forms/KmInput.tsx` — BRL twin without the currency prefix.

- Prop surface mirrors BrlCurrencyInput, but `value: number | null` (no semantic type alias — km is already unambiguous as integer)
- Display formula: `value.toLocaleString("pt-BR", ...)` → `"80.000"` (no prefix)
- `"km"` suffix rendered as `<span className="pointer-events-none absolute inset-y-0 right-3 ...">km</span>` inside a `relative` wrapper — click-through enabled, input owns focus
- `pr-10` on input reserves space for the suffix
- Same digit-only stripping rule + null-as-empty semantics as BrlCurrencyInput

**6 tests passing:**
1. `'80.000'` displayed when `value={80000}` (assert `not.toContain('R$')`)
2. `'km'` suffix rendered (`getByText("km")`)
3. Empty string when `value={null}`
4. Typing `80000` → `onChange(80000)`
5. Typing `80.000` → `onChange(80000)` (stripping)
6. Clear → `onChange(null)`

### Task 3 — `YearRangeField` (TDD)

`src/components/forms/YearRangeField.tsx` — paired `type="number"` inputs for `year_min + year_max`.

- Prop surface: `{ valueMin, valueMax, onChangeMin, onChangeMax, disabled?, idMin?, idMax?, labelText?, hintText?, errorText?, className? }`
- Renders shared `<Label>Ano</Label>` above a `grid grid-cols-2 gap-3` wrapper holding two inputs
- Per-input `min={1990}` + `max={CURRENT_YEAR + 1}` — matches schema bounds from 07-01 so the browser's native number UI enforces the same range
- Per-input placeholders: `1990+` (min) and `String(CURRENT_YEAR)` (max)
- Empty string → `null`; any numeric string → `Number(raw)`
- **Hint/error swap:** when `errorText` is provided, it replaces the hint (`"Deixe vazio para qualquer ano"`). Error styling is `text-red-600 dark:text-red-400`; hint styling is `text-slate-500 dark:text-slate-400`.
- Component is agnostic to validation — parent `FormField` in plan 07-10 wires `errorText` to the Zod refine error at path `["year_min"]`

**6 tests passing:**
1. Two `input[type='number']` in a `.grid.grid-cols-2` container
2. Displayed values round-trip (`valueMin=2018, valueMax=2023`)
3. Typing `2018` → `onChangeMin(2018)`
4. Clearing → `onChangeMin(null)`
5. Hint `"Deixe vazio para qualquer ano"` renders when no error
6. `errorText` overrides hint (hint not in document when errorText set)

## How It Integrates (downstream consumption path)

```
src/components/forms/BrlCurrencyInput.tsx
  └─> src/components/forms/WishlistFormSheet.tsx (Plan 07-10)
         <FormField control={form.control} name="price_max" render={({ field }) => (
           <BrlCurrencyInput value={field.value} onChange={field.onChange} />
         )} />

src/components/forms/KmInput.tsx
  └─> src/components/forms/WishlistFormSheet.tsx (Plan 07-10)
         <FormField control={form.control} name="km_max" render={({ field }) => (
           <KmInput value={field.value} onChange={field.onChange} />
         )} />

src/components/forms/YearRangeField.tsx
  └─> src/components/forms/WishlistFormSheet.tsx (Plan 07-10)
         <YearRangeField
           valueMin={form.watch("year_min")}
           valueMax={form.watch("year_max")}
           onChangeMin={(v) => form.setValue("year_min", v, { shouldValidate: true })}
           onChangeMax={(v) => form.setValue("year_max", v, { shouldValidate: true })}
           errorText={form.formState.errors.year_min?.message}
         />
```

All three primitives stay pure: the RHF glue lives in the form shell (07-10), never inside the primitives themselves. This keeps them testable in isolation and reusable outside RHF (e.g., filter bars, ad-hoc search UIs).

## Test Results

```
✓ src/components/forms/BrlCurrencyInput.test.tsx   (7 tests)   106ms
✓ src/components/forms/KmInput.test.tsx            (6 tests)   118ms
✓ src/components/forms/YearRangeField.test.tsx     (6 tests)   113ms

Test Files  3 passed (3)
     Tests  19 passed (19)
  Duration  1.98s
```

Full-repo verification:
- `pnpm typecheck` → exit 0
- `pnpm lint` (biome check src) → 136 files checked, no fixes applied
- `grep -l "react-hook-form" src/components/forms/{BrlCurrencyInput,KmInput,YearRangeField}.tsx` → no matches (RHF-agnostic confirmed)

## Commit History

| Commit | Type | Description |
|---|---|---|
| `f25a616` | test | RED: add failing test for BrlCurrencyInput primitive |
| `16a0091` | feat | GREEN: implement BrlCurrencyInput primitive |
| `d22adcf` | test | RED: add failing test for KmInput primitive |
| `38d58c7` | feat | GREEN: implement KmInput primitive |
| `ee17851` | test | RED: add failing test for YearRangeField primitive |
| `0ecadd5` | feat | GREEN: implement YearRangeField primitive |

Strict TDD RED→GREEN ordering preserved per primitive. Each RED commit verified to produce a failing import-resolution test before its GREEN pair landed.

## TDD Gate Compliance

All three tasks followed RED/GREEN/REFACTOR structure:
- **RED gates:** Every `test(...)` commit precedes its corresponding `feat(...)` commit. Each RED commit produced a genuine failure (import resolution — component file did not exist yet). No test was committed passing.
- **GREEN gates:** Every `feat(...)` commit was verified to turn the matching test suite green before committing. Typecheck + biome checked before each commit.
- **REFACTOR:** No refactor commits needed — each GREEN landed clean. Biome auto-formatted the YearRangeField test file on write (single-line JSX where short), which was folded into the GREEN commit rather than a separate refactor.

## Deviations from Plan

### Intentional (plan acceptance criterion conflicts with repo tooling)

**1. [Rule 3 - Tool conflict] KmInput: `grep -n ">km<"` criterion not literally met**
- **Where:** `src/components/forms/KmInput.tsx` line 56-58
- **Issue:** Plan acceptance criterion: `grep -n ">km<" src/components/forms/KmInput.tsx returns 1 match`. Biome formatter forces the `<span>...km...</span>` JSX to render across 3 lines (content on its own line) because of the long `className` list. Single-line form fails `pnpm lint`.
- **Resolution:** Kept biome-formatted multiline JSX. The behavioral assertion (`screen.getByText("km")` returns the DOM node) passes — the suffix is rendered. The literal grep pattern is a narrow syntactic check that the repo's mandatory formatter prohibits.
- **Impact:** None on correctness; behavioral test covers the intent.

**2. [Rule 3 - Tool conflict] YearRangeField: `grep -cE "type=\"number\""` returns 3, not 2**
- **Where:** `src/components/forms/YearRangeField.tsx`
- **Issue:** Plan acceptance criterion expected exactly 2 matches (one per input). Third match is in the JSDoc block comment line 25 (`* - pt-BR friendly: type="number" + inputMode="numeric"`).
- **Resolution:** Kept the JSDoc line — it documents the type="number" + inputMode="numeric" pattern the component establishes and is valuable for code review. The intent of the grep check (verify 2 number inputs exist) is satisfied — lines 56 and 68 each hold a real `type="number"` attribute on an Input element.
- **Impact:** None on correctness; behavioral test `renders two number inputs` asserts the 2-count via DOM query.

### Auth gates

None. All work was pure-component / test. No Supabase / Parallelum / Anthropic calls.

## Known Stubs

None. The three primitives are production-ready shapes with full value round-tripping and RHF-ready prop surfaces. Plan 07-10 consumes them directly — no rewiring or TODO markers remain in the three source files.

## Threat Flags

None. None of the files created introduce new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The BrlCurrencyInput / KmInput digit-only stripping rule ADDS defense-in-depth against input-layer attacks — but the authoritative bounds (max 5,000,000 BRL, max 1,000,000 km) live in the Zod schema from 07-01, not in these components. Primitives are intentionally permissive at the input layer to avoid UI-level validation drift.

## Self-Check: PASSED

### Files created — all verified present in worktree:
- FOUND: `src/components/forms/BrlCurrencyInput.tsx`
- FOUND: `src/components/forms/BrlCurrencyInput.test.tsx`
- FOUND: `src/components/forms/KmInput.tsx`
- FOUND: `src/components/forms/KmInput.test.tsx`
- FOUND: `src/components/forms/YearRangeField.tsx`
- FOUND: `src/components/forms/YearRangeField.test.tsx`

### Commits verified in git log:
- FOUND: `f25a616` (test: BrlCurrencyInput RED)
- FOUND: `16a0091` (feat: BrlCurrencyInput GREEN)
- FOUND: `d22adcf` (test: KmInput RED)
- FOUND: `38d58c7` (feat: KmInput GREEN)
- FOUND: `ee17851` (test: YearRangeField RED)
- FOUND: `0ecadd5` (feat: YearRangeField GREEN)

### Verification commands re-run before summary:
- `pnpm test src/components/forms/BrlCurrencyInput.test.tsx src/components/forms/KmInput.test.tsx src/components/forms/YearRangeField.test.tsx --run` → 3 files passed, 19/19 tests passed, 1.98s
- `pnpm typecheck` → exit 0
- `pnpm lint` (biome check src, full repo) → 136 files checked, no fixes applied
- `grep "react-hook-form"` across the three primitive source files → no matches (RHF-agnostic verified)
