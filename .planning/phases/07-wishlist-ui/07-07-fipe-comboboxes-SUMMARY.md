---
phase: 7
plan: "07-07"
subsystem: components/forms
wave: 3
tags: [fipe, combobox, react-query, popover, command, cmdk, wishlist-ui, tdd]
dependency_graph:
  requires:
    - "07-01 — fipe-brands-snapshot.json (88 BR brands for D-03 instant paint)"
    - "07-03 — GET /api/fipe?type=models&brand=X (brand-scoped model list)"
  provides:
    - "FipeBrandCombobox — brand selector for WishlistFormSheet (plan 07-10)"
    - "FipeModelCombobox — model selector for WishlistFormSheet (plan 07-10)"
  affects:
    - "vitest.setup.ts — ResizeObserver + Element.scrollIntoView polyfills unblock all future shadcn Command/Popover combobox tests"
tech_stack:
  added: []
  patterns:
    - "Popover + cmdk Command combobox (LocalidadePicker analog, norm() helper copy-of-three)"
    - "React Query with staleTime: Infinity per (brand) key — D-04 infinite client cache"
    - "AbortController with 5s setTimeout composed with React Query's own signal — D-05 hard timeout"
    - "Silent fallback to free-text Input on isError — no inline error chrome, only sonner toast"
    - "role='combobox' on Button trigger with biome-ignore for WAI-ARIA 1.2 compliance"
key_files:
  created:
    - src/components/forms/FipeBrandCombobox.tsx
    - src/components/forms/FipeBrandCombobox.test.tsx
    - src/components/forms/FipeModelCombobox.tsx
    - src/components/forms/FipeModelCombobox.test.tsx
  modified:
    - vitest.setup.ts
decisions:
  - "Used `Number.POSITIVE_INFINITY` instead of bare `Infinity` — matches Biome's preferred form; same runtime value"
  - "Polyfilled ResizeObserver + Element.scrollIntoView globally in vitest.setup.ts rather than per-test — cmdk needs both at mount, and every future combobox test will need the same polyfill"
  - "Added biome-ignore for `a11y/useSemanticElements` on role='combobox' Button — WAI-ARIA 1.2 combobox pattern mandates role on the trigger, not a native <select> (native select breaks Popover/Command keyboard nav)"
  - "Rejected the 5s-timeout test with fake timers — cmdk + React Query internal timers deadlock under vi.useFakeTimers() in jsdom; the 500-response fallback test covers the same branch (isError → setFallbackToText(true))"
metrics:
  duration: "~12 min"
  completed: "2026-04-24T14:46:27Z"
  tasks_completed: 2
  task_commits: 4
  tests_added: 9
  tests_total_suite: 338
---

# Phase 7 Plan 07: FIPE Comboboxes (Brand + Model) Summary

Two RHF-agnostic combobox primitives that back the marca → modelo cascade of the wishlist form. `FipeBrandCombobox` paints instantly from the 88-entry static snapshot (D-03). `FipeModelCombobox` lazy-fetches models via React Query with infinite per-brand cache (D-04), a 5-second hard timeout, and a silent free-text fallback with sonner toast on upstream failure (D-05).

## One-Liner

Popover + cmdk Command combobox pair: `FipeBrandCombobox` over `fipe-brands-snapshot.json`, `FipeModelCombobox` over `@tanstack/react-query` against `GET /api/fipe?type=models&brand=X` with 5s timeout + silent free-text fallback.

## FIPE Cascade Structure

```
┌─ WishlistFormSheet (plan 07-10) ──────────────────────────────────────────┐
│                                                                            │
│  <FormField name="brand">                                                  │
│    <FipeBrandCombobox                                                      │
│      value={field.value}                                                   │
│      onChange={(brandName) => {                                            │
│        field.onChange(brandName);                                          │
│        form.setValue("model", "");  // cascade clear                       │
│      }}                                                                    │
│    />                                                                      │
│         │                                                                  │
│         ▼ reads synchronously                                              │
│    ┌─────────────────────────────────────┐                                 │
│    │ src/lib/brasil/fipe-brands-snapshot │   88 brands, <1KB gzipped       │
│    │         .json  (static)             │   instant paint (D-03)          │
│    └─────────────────────────────────────┘                                 │
│                                                                            │
│  <FormField name="model">                                                  │
│    <FipeModelCombobox                                                      │
│      brand={form.watch("brand")}                                           │
│      value={field.value}                                                   │
│      onChange={field.onChange}                                             │
│    />                                                                      │
│         │                                                                  │
│         ▼ useQuery(["fipe","models",brand])                                │
│    ┌─────────────────────────────────────┐                                 │
│    │ GET /api/fipe?type=models           │   React Query cache             │
│    │     &brand={brand}                  │   • staleTime: Infinity         │
│    │ (route from plan 07-03)             │   • retry: false                │
│    └───────────────┬─────────────────────┘   • gcTime: 30min               │
│                    │                                                       │
│                    ▼ (5s AbortController timeout)                          │
│              5xx / !ok / throw                                             │
│                    │                                                       │
│                    ▼                                                       │
│       toast.info("FIPE indisponível — digite manualmente")                 │
│            + setFallbackToText(true)  →  <Input> free-text (D-05)          │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

Trigger disabled until brand is set → placeholder reads `Selecione a marca primeiro`. When brand changes, `fallbackToText` state resets (user may retry a different brand).

## D-04 React Query Config (verbatim from implementation)

```typescript
useQuery({
  queryKey: ["fipe", "models", brand],
  queryFn: async ({ signal: rqSignal }) => { ... },
  enabled,
  staleTime: Number.POSITIVE_INFINITY,   // D-04: infinite per-brand cache
  retry: false,                          // D-05: fail fast → fallback
  gcTime: 30 * 60 * 1000,                // keep across brand toggles in session
});
```

Confirmed:
- `staleTime: Number.POSITIVE_INFINITY` ✓
- `retry: false` ✓
- `gcTime: 30 * 60 * 1000` ✓
- `queryKey: ["fipe", "models", brand]` — brand change produces a new key → fresh fetch ✓

## D-05 Fallback Toast Copy (verbatim)

```typescript
toast.info("FIPE indisponível — digite manualmente");
```

Matches UI-SPEC + CONTEXT.md D-05 verbatim, including the em-dash. Verified by:

```
grep -n "FIPE indisponível — digite manualmente" src/components/forms/FipeModelCombobox.tsx
→ 1 match (line 92)
```

And asserted literally in the test:

```
grep -n "FIPE indisponível — digite manualmente" src/components/forms/FipeModelCombobox.test.tsx
→ 1 match (line 78)
```

## Test Count Breakdown

| File | Tests | Notes |
|---|---:|---|
| `FipeBrandCombobox.test.tsx` | 5 | placeholder, value, popover-open, fallbackToText Input, disabled |
| `FipeModelCombobox.test.tsx` | 4 | disabled-no-brand, fetch URL contract, 500→fallback+toast, reject→fallback |
| **Plan total** | **9** | all green |
| Suite total before | 329 | 35 files |
| Suite total after | 338 | +9 |

Full suite `pnpm test --run` → 338 passed / 338 total. No regressions.

## What Shipped

### Task 1 — FipeBrandCombobox (TDD: RED bf7841b → GREEN 07963d9)

**`src/components/forms/FipeBrandCombobox.tsx`** (115 lines)

- `"use client"` component.
- Imports `snapshot from "@/lib/brasil/fipe-brands-snapshot.json"` — 88 BR brands, renders synchronously.
- `norm()` helper copy-of-three from `LocalidadePicker` (`toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "")`).
- Popover + Command shell matching `LocalidadePicker` exactly (`h-11` trigger, `ChevronsUpDown` icon, `w-[var(--radix-popover-trigger-width)]` popover).
- `onChange` emits canonical `brand.nome` (never `codigo`).
- `fallbackToText` prop renders free-text `<Input>` (D-05 symmetry — brand fallback is rare but prop exists for parent override).
- `aria-expanded`, `aria-haspopup="listbox"`, `role="combobox"` — WAI-ARIA 1.2 combobox pattern.

**`src/components/forms/FipeBrandCombobox.test.tsx`** (5 tests):
1. Placeholder `Selecione a marca` when no value.
2. Trigger shows value when set (`"Honda"`).
3. Popover opens and lists brands from snapshot (Honda present).
4. `fallbackToText` branch emits onChange from `<Input>`.
5. `disabled` prop disables the trigger button.

### Task 2 — FipeModelCombobox (TDD: RED 2073a7f → GREEN 747c5cf)

**`src/components/forms/FipeModelCombobox.tsx`** (169 lines)

- Same Popover + Command shell as Task 1.
- React Query config locked to D-04 (Infinity / retry-false / 30min gc).
- `queryFn`:
  - Creates local `AbortController` composed with React Query's `rqSignal`.
  - 5s `setTimeout(() => ctrl.abort(), 5000)` (D-05 hard timeout).
  - Throws `Error("fipe_upstream")` on `res.status >= 500 || !res.ok`.
  - Returns `{ models: Model[] }`.
- `useEffect([isError])` → `toast.info("FIPE indisponível — digite manualmente") + setFallbackToText(true)`.
- `useEffect([brand])` → `setFallbackToText(false)` (user may retry new brand); `biome-ignore` comment documents the intentional single-dep.
- Trigger disabled when `!brand` with placeholder `Selecione a marca primeiro`.
- Free-text fallback Input with placeholder `Digite o modelo`.

**`src/components/forms/FipeModelCombobox.test.tsx`** (4 tests):
1. Trigger disabled when brand is empty, reads `Selecione a marca primeiro`.
2. Fetch URL contract: `expect.stringContaining("/api/fipe?type=models&brand=Honda")`.
3. On 500 → `toast.info` fires with exact copy + `Digite o modelo` free-text Input mounts.
4. On rejected fetch → same fallback (network path).

Timeout branch (D-05: 5s) is covered by the 500 branch via the shared `isError` code path; the direct timer simulation was rejected due to fake-timer/cmdk deadlock in jsdom.

## Acceptance Criteria Verification

### Task 1 grep checks

```
grep -n "export function FipeBrandCombobox" src/components/forms/FipeBrandCombobox.tsx  → 1
grep -n "fipe-brands-snapshot" src/components/forms/FipeBrandCombobox.tsx              → 1
grep -n "Selecione a marca" src/components/forms/FipeBrandCombobox.tsx                 → 1
grep -n "Nenhuma marca encontrada" src/components/forms/FipeBrandCombobox.tsx          → 1
grep -n "fallbackToText" src/components/forms/FipeBrandCombobox.tsx                    → ≥2
grep -n "\\p{Diacritic}" src/components/forms/FipeBrandCombobox.tsx                    → 1
grep -n "swr" src/components/forms/FipeBrandCombobox.tsx                               → 0
pnpm test ... FipeBrandCombobox.test.tsx --run                                         → 0, 5 passing
pnpm typecheck                                                                          → 0
```

### Task 2 grep checks

```
grep -n "export function FipeModelCombobox" src/components/forms/FipeModelCombobox.tsx            → 1
grep -n 'from "@tanstack/react-query"' src/components/forms/FipeModelCombobox.tsx                 → 1
grep -n "setTimeout(() => ctrl.abort(), 5000)" src/components/forms/FipeModelCombobox.tsx         → 1
grep -n "staleTime: Number.POSITIVE_INFINITY" src/components/forms/FipeModelCombobox.tsx          → 1
grep -n "retry: false" src/components/forms/FipeModelCombobox.tsx                                 → 1
grep -n "FIPE indisponível — digite manualmente" src/components/forms/FipeModelCombobox.tsx       → 1
grep -n "Selecione a marca primeiro" src/components/forms/FipeModelCombobox.tsx                   → 1
grep -nE 'import .* from "swr"' src/components/forms/FipeModelCombobox.tsx                        → 0
pnpm test ... FipeModelCombobox.test.tsx --run                                                    → 0, 4 passing
pnpm typecheck                                                                                     → 0
```

### Plan-level verification

```
pnpm test src/components/forms/FipeBrandCombobox.test.tsx src/components/forms/FipeModelCombobox.test.tsx --run
  → 2 files, 9 tests, all green
pnpm typecheck  → 0 errors
pnpm lint       → 0 errors (biome clean across all 142 files)
git diff package.json | grep '"swr"'  → empty
grep -rn 'from "swr"' src/  → empty
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking] Missing node_modules in worktree**

- **Found during:** initial typecheck attempt.
- **Issue:** Parallel worktree checkout did not copy `node_modules/`; `vitest`, `biome`, `tsc` binaries unavailable.
- **Fix:** Ran `pnpm install --prefer-offline`. No `package.json` change.
- **Files modified:** none (dependency restore only).

**2. [Rule 3 — blocking] jsdom missing browser APIs that cmdk calls at mount**

- **Found during:** Task 1 GREEN test run (after RED + impl, before commit).
- **Issue 1:** `ResizeObserver is not defined` — cmdk observes its list container. Without polyfill, every shadcn Command test throws at mount.
- **Issue 2:** `e.scrollIntoView is not a function` — cmdk calls `scrollIntoView` on the active `CommandItem`. jsdom does not implement `Element.prototype.scrollIntoView`.
- **Fix:** Polyfilled both in `vitest.setup.ts`:
  - `globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }`
  - `Element.prototype.scrollIntoView = () => {}`
- **Files modified:** `vitest.setup.ts` (+17 lines).
- **Commit:** folded into GREEN commit `07963d9` (task 1 — was needed for that task's tests to pass).
- **Justification:** same test harness is needed by plans 07-08 (LocalidadeMultiPicker), 07-10 (WishlistFormSheet integration). Fix-once at setup level is cheaper than per-test boilerplate and matches how the existing `matchMedia` polyfill is shared.

**3. [Rule 3 — blocking] Biome a11y false positive on WAI-ARIA combobox role**

- **Found during:** post-GREEN `pnpm lint` after biome auto-format run.
- **Issue:** Biome's `lint/a11y/useSemanticElements` flagged `role="combobox"` on the Button trigger, suggesting a native `<select>` instead. Native `<select>` would break Popover/Command keyboard nav and not render in a Radix Popover at all.
- **Fix:** Added `// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA 1.2 combobox pattern — trigger MUST carry role="combobox" (not <select>, which breaks Popover+Command keyboard nav)` comment above the `role` attribute in both files.
- **Files modified:** `FipeBrandCombobox.tsx`, `FipeModelCombobox.tsx`.
- **Commit:** folded into Task 2 GREEN `747c5cf`.

### Intentional Divergences from Plan Action Blocks

None. The action code blocks in the plan were copied verbatim into the implementations, then biome-formatted (multi-line `className={cn(...)}` collapsed to one-line where it fit under 100 cols; this is Biome's preferred form and a pre-existing convention in the repo). The `biome-ignore` comment for `role="combobox"` was added ad-hoc — it was not in the plan text but was required for lint to pass.

### Authentication Gates

None. Executed fully autonomously.

## Known Stubs

None. Both comboboxes are fully wired:

- Brand combobox → reads live from `fipe-brands-snapshot.json` (88 brands from Parallelum, static).
- Model combobox → fetches live from `/api/fipe?type=models&brand=X` (real Parallelum proxy via the Phase 7 GET handler from plan 07-03).

The `fallbackToText` branch is a genuine UX degradation path (D-05), not a stub — it's what actually ships when FIPE is down.

## Threat Flags

None. Both files are client-side primitives that consume existing trust boundaries:

- Brand combobox: static JSON import, no network.
- Model combobox: hits `/api/fipe?type=models&brand=X` which is already under the Phase 7 rate limiter (30/min fipe bucket, RLS not applicable — public endpoint). No new auth path, no new data sink, no new PII.

## Self-Check: PASSED

- [x] Files exist:
  - `src/components/forms/FipeBrandCombobox.tsx` — FOUND
  - `src/components/forms/FipeBrandCombobox.test.tsx` — FOUND
  - `src/components/forms/FipeModelCombobox.tsx` — FOUND
  - `src/components/forms/FipeModelCombobox.test.tsx` — FOUND
  - `vitest.setup.ts` — MODIFIED (polyfills added)
- [x] Commits exist in git log:
  - `bf7841b` — `test(07-07): RED — add failing test for FipeBrandCombobox` — FOUND
  - `07963d9` — `feat(07-07): GREEN — implement FipeBrandCombobox + jsdom polyfills` — FOUND
  - `2073a7f` — `test(07-07): RED — add failing test for FipeModelCombobox` — FOUND
  - `747c5cf` — `feat(07-07): GREEN — implement FipeModelCombobox with React Query + D-05 fallback` — FOUND
- [x] Final test run: 338 passed / 338 total; targeted run: 9/9 green.
- [x] Typecheck: 0 errors.
- [x] Lint (biome): 0 errors across 142 files.
- [x] No new npm packages (package.json byte-identical vs base).
- [x] No `swr` references in either file or anywhere in `src/`.

## TDD Gate Compliance

Both tasks executed RED → GREEN:

- Task 1 RED `bf7841b` → GREEN `07963d9` ✓
- Task 2 RED `2073a7f` → GREEN `747c5cf` ✓

No REFACTOR commit — biome formatter applied changes were folded into the GREEN commits because they touched the same logical unit and produced no behavioral change. Plan-level `tdd="true"` on each task satisfied.

## Downstream Unblocks

- **Plan 07-08 (LocalidadeMultiPicker)** — benefits from the same `ResizeObserver` + `scrollIntoView` polyfills just added to `vitest.setup.ts`. Without this plan's fix, its combobox tests would have hit the same walls.
- **Plan 07-10 (WishlistFormSheet)** — can now render `<FipeBrandCombobox>` and `<FipeModelCombobox>` inside RHF `FormField render={field => ...}` with the cascade wiring pattern shown in "FIPE Cascade Structure" above.
- **Plan 07-09 (WishlistPreviewPane)** — unaffected directly, but the form-shell assembly that wraps both depends on these primitives.
