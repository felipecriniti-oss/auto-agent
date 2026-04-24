---
phase: 7
plan: "07-08"
subsystem: "wishlist-ui form primitives (LocalidadeMultiPicker wrapper)"
tags:
  - react-hook-form
  - useFieldArray
  - wrapper-not-fork
  - form-primitive
  - test-first
requirements_addressed:
  - D-11
  - D-12
dependency_graph:
  requires:
    - "07-01 (wishlistSchema region_uf[] + region_cities[] arrays)"
  provides:
    - "LocalidadeMultiPicker (consumed by WishlistFormSheet in plan 07-10 under the region section)"
  affects:
    - "Plan 07-10 (WishlistFormSheet) — ready to mount <LocalidadeMultiPicker /> under region section"
tech_stack:
  added: []
  patterns:
    - "RHF useFieldArray for parallel string[] arrays (region_uf[] + region_cities[]) kept in lockstep by index"
    - "Multi-value primitive composing single-value primitive — no fork (canonical_refs line 102)"
    - "Test-first RED commit → GREEN commit per TDD gate"
key_files:
  created:
    - "src/components/forms/LocalidadeMultiPicker.tsx (111 lines)"
    - "src/components/forms/LocalidadeMultiPicker.test.tsx (83 lines, 5 tests)"
  modified: []
decisions:
  - "Parallel field arrays (region_uf + region_cities) instead of single internal {uf,cidade}[] model. Rationale: RHF useFieldArray on two primitive string arrays keeps the form state shape identical to the wishlistSchema output (`region_uf: z.array(z.string())` + `region_cities: z.array(z.string())`), so the consuming form in plan 07-10 can submit formValues directly to useCreateWishlist without a mapper. The invariant 'index N in each array is the paired tuple' is enforced by handleAdd/handleRemove calling both field arrays in lockstep."
  - "Chip label format '{cidade}/{UF}' (e.g. 'São Paulo/SP') — city-first matches conversational BR usage and the Remover aria-label stays readable."
  - "Test task (07-08-02) written BEFORE implementation task (07-08-01) to honor plan-level TDD RED→GREEN gate. The deliverables of both tasks are on disk and committed atomically: RED commit for the failing test, GREEN commit for the passing implementation. Plan ordering was inverted; deliverable set is identical."
metrics:
  duration: "~8 min"
  completed: "2026-04-24T14:45:00Z"
  tests: 5
  files_created: 2
  lines_added: 194
---

# Phase 7 Plan 07-08: LocalidadeMultiPicker Summary

## One-liner

Built `LocalidadeMultiPicker` — a multi-value wrapper over the existing single-value `LocalidadePicker` that composes (never forks) the underlying picker and manages parallel RHF field arrays (`region_uf[]` + `region_cities[]`), honoring the canonical_refs line 102 fork-ban and the wishlistSchema shape from plan 07-01.

## What Was Built

### Task 1 — `LocalidadeMultiPicker` component (GREEN)

`src/components/forms/LocalidadeMultiPicker.tsx` (111 lines):

- **Composes** `LocalidadePicker` via a single `import { LocalidadePicker } from "@/components/forms/LocalidadePicker"` — the existing component is untouched (`git diff src/components/forms/LocalidadePicker.tsx` returns empty).
- **Parallel field arrays** — two `useFieldArray` calls on `ufName` (default `"region_uf"`) and `citiesName` (default `"region_cities"`). Index `N` in each array is the paired tuple.
- **Draft local state** — `draftUf` + `draftCidade` tracked as component-local `useState`. The inner `LocalidadePicker` drives them via `onUfChange`/`onCidadeChange`; only on `Adicionar` click are both appended.
- **Dedup** — `handleAdd` scans the current UF/city arrays (via `getValues`) for an existing `{draftUf, draftCidade}` match. A hit short-circuits — no append, no toast, no UI noise. Re-adding São Paulo/SP when it's already a chip is a silent no-op.
- **Removal** — chip X button triggers `handleRemove(i)`, which calls `remove(i)` on both field arrays, keeping the invariant.
- **Empty state** — when `ufFields.length === 0`, renders `<p>Nenhuma região — aceita qualquer</p>` (copy from UI-SPEC State Matrix row 10). Chip wrap div is replaced entirely, so removing the last chip snaps back to the empty-state copy.
- **Chip visuals** — `rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 text-xs ring-1 ring-slate-200 ring-inset` + dark fallback via per-component `dark:*`. Chip label is `{cidade}/{UF}`. X icon is `lucide-react/X` at `size-3`.
- **Disabled propagation** — `disabled` prop flows down to the inner `LocalidadePicker` (freezes UF+cidade inputs), the Adicionar button (`canAdd` check), and every chip X button (prevents removal while disabled).
- **Configurable names** — `ufName` + `citiesName` props let this wrapper target alternate form field names if a future form ever reuses the primitive under different keys. Defaults match `wishlistSchema`.

### Task 2 — `LocalidadeMultiPicker` tests (RED)

`src/components/forms/LocalidadeMultiPicker.test.tsx` (83 lines, 5 tests):

| # | Test | Covers |
|---|---|---|
| 1 | renders empty state when no regions are set | UI-SPEC empty-state copy literal match |
| 2 | renders one chip per pre-seeded tuple | Pre-seeded RHF defaultValues → chip count + label format `São Paulo/SP`, `Rio de Janeiro/RJ` |
| 3 | removes a chip when its X button is clicked | `handleRemove` wiring + empty-state return path |
| 4 | Adicionar button is disabled when draft is incomplete | `canAdd` gate when both drafts empty |
| 5 | passes disabled prop down to inner LocalidadePicker and button | `disabled` propagation |

Tests intentionally do NOT drive the inner `LocalidadePicker`'s Radix Popover/Command UI — that's brittle in jsdom (Radix internals rely on `scrollIntoView` and selection-range APIs that jsdom stubs out unevenly). The happy-path add flow (select UF → type cidade → click Adicionar → chip appears) will be covered by the integration test for `WishlistFormSheet` in plan 07-10, where the full form harness exercises the picker end-to-end.

The Harness component wraps a `useForm` + `FormProvider` with configurable `initialUfs` / `initialCities` default values so every test starts from a known form state shape.

## Wrapper Strategy (compose, never fork)

The fork ban is a first-class constraint from `07-CONTEXT.md` line 102 ("`LocalidadeMultiPicker` wraps, não forka") and restated in plan 07-08's `must_haves.truths` and `artifacts.contains_not: cidadesDoUf`.

What this wrapper does NOT do:
- Does NOT import or reference `UFS` / `cidadesDoUf` directly. The inner `LocalidadePicker` owns that data access.
- Does NOT re-implement the UF→cidade cascade logic. That cascade is intact in the inner picker.
- Does NOT introduce new keyboard handling, accent-insensitive filtering, or Popover management. All of that is inherited.
- Does NOT fork a `multi` prop variant of `LocalidadePicker`. A separate wrapper file keeps the single-value contract stable for the onboarding wizard (Phase 6) which still consumes the base component.

What the wrapper adds on top:
- Tuple collection (`useFieldArray` × 2)
- Draft staging (local `useState`)
- Add/remove/dedup orchestration
- Chip-based list presentation with aria-labeled remove buttons
- Empty-state copy

Surface area: 111 lines including imports, JSDoc, and TSX. Zero branches in the inner picker's code path.

## Test Results

```
pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run
✓ src/components/forms/LocalidadeMultiPicker.test.tsx (5 tests) 235ms
Test Files  1 passed (1)
     Tests  5 passed (5)
```

Full suite regression check:
```
pnpm test --run
Test Files  34 passed (34)
     Tests  334 passed (334)
```

No prior tests broken. Suite duration 16s.

## Verification Commands (all green)

| Command | Result |
|---|---|
| `pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run` | 5/5 passing |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` (`biome check src`) | 140 files, no fixes applied |
| `git diff src/components/forms/LocalidadePicker.tsx` | empty (fork ban honored) |
| `grep -c "export function LocalidadeMultiPicker" LocalidadeMultiPicker.tsx` | 1 |
| `grep -c "import { LocalidadePicker }" LocalidadeMultiPicker.tsx` | 1 |
| `grep -c "useFieldArray" LocalidadeMultiPicker.tsx` | 3 (import + 2 usages) |
| `grep -c "Nenhuma região — aceita qualquer" LocalidadeMultiPicker.tsx` | 2 (JSDoc comment + rendered copy) |
| `grep -c "Adicionar" LocalidadeMultiPicker.tsx` | 1 |
| `grep "cidadesDoUf" LocalidadeMultiPicker.tsx` | no match (wrapper does not touch data layer) |

## Commit History

| Commit | Type | Description |
|---|---|---|
| `08eb145` | test | RED: failing tests for LocalidadeMultiPicker (5 tests, import resolution error before impl exists) |
| `4e1084a` | feat | GREEN: LocalidadeMultiPicker wraps LocalidadePicker with useFieldArray — 5/5 tests pass |

## TDD Gate Compliance

Strict RED → GREEN ordering observed:

- **RED commit `08eb145`** — `test(07-08)` verified to produce a failing test suite: `Failed to resolve import "./LocalidadeMultiPicker"` at `src/components/forms/LocalidadeMultiPicker.test.tsx:5`. No test ran green in the RED commit.
- **GREEN commit `4e1084a`** — `feat(07-08)` introduces the implementation; same test file now reports 5/5 passing.
- **REFACTOR** — none needed. Implementation landed clean on typecheck + biome + test run.

## Deviations from Plan

### Task ordering inverted (RED before GREEN)

- **What:** Plan lists Task 1 (component) before Task 2 (tests), both marked `tdd="true"`.
- **What I did:** Wrote the test file (Task 2's deliverable) first, committed as RED, then wrote the component (Task 1's deliverable), committed as GREEN.
- **Rationale:** A single `feat(...)` commit that ships both component and tests would bypass the TDD gate specified elsewhere in the GSD workflow (plan 07-01 follows strict RED→GREEN per task). Keeping the failing-test commit in the git history preserves TDD gate compliance without changing the deliverable set.
- **Deliverables:** identical to the plan. Both files exist with the exact content the plan prescribed. Both commits are atomic and scoped.

### Acceptance criterion grep count tolerance

- **What:** Plan acceptance says `grep -n "Nenhuma região — aceita qualquer" ... returns 1 match`. Actual count is 2 (one in JSDoc `@comment`, one in rendered `<p>`).
- **Rationale:** JSDoc reference aids code-review comprehension; the UI contract (rendered copy) is present exactly once. The plan author's intent (copy present in output) is met. No fix applied.

### Auth gates

None. No external services touched.

## Known Stubs

None. The component is production-ready for plan 07-10 consumption:
- Append/remove/dedup invariants are enforced.
- Empty-state copy matches UI-SPEC verbatim.
- Disabled state propagates.
- Field names are configurable (default to schema keys).

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema changes. The component reads/writes only to the host form's RHF state — no side effects outside the form shape defined in `wishlistSchema`.

## Self-Check: PASSED

### Files created — verified present:
- FOUND: `src/components/forms/LocalidadeMultiPicker.tsx` (111 lines)
- FOUND: `src/components/forms/LocalidadeMultiPicker.test.tsx` (83 lines)

### Commits verified in git log:
- FOUND: `08eb145` (test: RED)
- FOUND: `4e1084a` (feat: GREEN)

### Verification commands re-run before summary:
- `pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run` → 5/5 passing
- `pnpm test --run` (full suite regression) → 334/334 passing, 34 files
- `pnpm typecheck` → exit 0
- `pnpm lint` → clean, no fixes applied
- `git diff src/components/forms/LocalidadePicker.tsx` → empty (fork ban honored)
