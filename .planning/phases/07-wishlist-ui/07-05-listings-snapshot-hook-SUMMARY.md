---
phase: 7
plan: "07-05"
subsystem: "wishlist-ui — listings snapshot hook (Layer 2 data access)"
tags:
  - react-query
  - supabase
  - hooks
  - tdd
  - silent-fallback
requirements_addressed:
  - D-01
  - D-09
dependency_graph:
  requires:
    - "07-01 (PREVIEW_LISTINGS fixture)"
  provides:
    - "useListingsSnapshot (consumed by WishlistPreviewPane in 07-09)"
  affects:
    - "Wave 3 plan 07-09 unblocked — preview pane now has a data source"
tech_stack:
  added: []
  patterns:
    - "React Query hook mirror of useWishlists shape (key prefix, auth gate, config gate)"
    - "Silent mock fallback (D-01): empty DB result -> PREVIEW_LISTINGS transparently"
    - "initialData degraded path for unauth/unconfigured sessions"
    - "Query key scoped by user?.id to avoid cross-tenant cache bleed (07-RESEARCH Pitfall 2)"
    - "TDD RED -> GREEN ordering preserved"
key_files:
  created:
    - "src/lib/supabase/hooks/useListingsSnapshot.ts (64 lines)"
    - "src/lib/supabase/hooks/useListingsSnapshot.test.tsx (97 lines, 4 tests)"
  modified: []
decisions:
  - "No .eq('user_id', ...) on the query — listings are global (not user-scoped); the user_id only scopes the React Query key"
  - "initialData=PREVIEW_LISTINGS when hook is disabled so the preview works before sign-in (onboarding step 3 pre-auth flow)"
  - "Used `type UseQueryResult, useQuery` import order to satisfy biome organizeImports (type-first)"
metrics:
  duration: "~8 min"
  completed: "2026-04-24T17:33:19Z"
  tests: 4
  files_created: 2
  lines_added: 161
---

# Phase 7 Plan 07-05: useListingsSnapshot Hook Summary

## One-liner

Delivered the Layer 2 `useListingsSnapshot` React Query hook with D-01 silent mock fallback — Supabase returns `[]` transparently becomes `PREVIEW_LISTINGS`, so `WishlistPreviewPane` (plan 07-09) can render correct match counts in dev (empty DB), Vercel preview, and prod-day-1 without any conditional consumer code.

## What Was Built

### Task 1 (+ Task 2 test file) — `useListingsSnapshot` (TDD)

`src/lib/supabase/hooks/useListingsSnapshot.ts` exports:

- `useListingsSnapshot(): UseQueryResult<DbListing[]>` — React Query hook that fetches the most recent 500 listings from `public.listings` and silently returns `PREVIEW_LISTINGS` when the query resolves to `[]`
- Query shape: `.from("listings").select("*").limit(500).order("created_at", { ascending: false })`
- Query key: `["supabase", "listings-snapshot", user?.id ?? "anon"]` — mirrors the `useWishlists` key pattern exactly (07-RESEARCH Pitfall 2)
- Config: `staleTime: 60_000` (per UI-SPEC §Preview pane), `refetchOnWindowFocus: true`, `refetchOnReconnect: true` (D-09)
- Auth gate: `enabled: isSupabaseConfigured() && !!user` — matches `useWishlists` gating
- Degraded path: `initialData: PREVIEW_LISTINGS` when the hook is disabled so unauth / unconfigured sessions still see mocks (useful for onboarding step 3 pre-signup)
- React Query only — **no SWR imports** (L4 landmine honored)

### Test coverage

`src/lib/supabase/hooks/useListingsSnapshot.test.tsx` — 4 tests, all green:

1. **Returns real listings when Supabase has rows** — mock chain resolves `{ data: [realListing], error: null }`; hook data === [realListing] (NOT mocks). Also asserts `from("listings")` was called.
2. **D-01 silent fallback** — mock chain resolves `{ data: [], error: null }`; hook data === `PREVIEW_LISTINGS`. This is the contract-proving test.
3. **Error state on Supabase error** — mock chain resolves `{ data: null, error: {...} }`; hook enters `isError: true`.
4. **.limit(500) is called** — asserts the query shape wires `.limit(500)` correctly (prevents accidental regression to unbounded query).

## How It Integrates (downstream consumption)

```
src/lib/mock-data/preview-listings.ts (07-01)
       │
       ▼
src/lib/supabase/hooks/useListingsSnapshot.ts   ← THIS PLAN
       │  DbListing[] (real or mocks, transparent to caller)
       ▼
src/components/forms/WishlistPreviewPane.tsx   (Plan 07-09, Wave 3)
       │  const { data: snapshot = [] } = useListingsSnapshot();
       │  snapshot.reduce((acc, listing) => acc + (matchListingToWishlists(...).length > 0 ? 1 : 0), 0)
       ▼
"acharíamos X anúncios esta semana" (preview pane copy)
```

## D-01 Silent Fallback — Contract Verified

The silent fallback is proven by test #2 (`"falls back to PREVIEW_LISTINGS when Supabase returns [] (D-01)"`). Consumer code like:

```typescript
const { data: snapshot = [] } = useListingsSnapshot();
```

will never need to know whether `snapshot` is real or mock data. In dev (empty DB), Vercel preview (empty DB), and prod-day-1 (empty DB), the preview pane will render against `PREVIEW_LISTINGS`; in prod-day-N (real listings populated by Phase 8), it will render against real data. **No env flag, no conditional branch, no dev/prod gating.**

## Test Results

```
✓ src/lib/supabase/hooks/useListingsSnapshot.test.tsx   (4 tests)  255ms
✓ src/lib/supabase/hooks (full regression)             (20 tests)  2.65s
```

No regressions in sibling hooks (`useDeals`, `useOpportunities`, `useSupabaseUser`, `useWishlists`). `pnpm typecheck` and `pnpm lint` both exit 0.

## Commit History

| Commit    | Type | Description                                               |
| --------- | ---- | --------------------------------------------------------- |
| `7021803` | test | RED: add failing test for useListingsSnapshot             |
| `67a2025` | feat | GREEN: implement useListingsSnapshot with silent fallback |

Strict TDD RED -> GREEN ordering preserved.

## TDD Gate Compliance

- **RED gate:** Commit `7021803` created `useListingsSnapshot.test.tsx` and was verified to fail with `Error: Failed to resolve import "./useListingsSnapshot"` — a genuine RED (import resolution failure, not a passing test committed as RED).
- **GREEN gate:** Commit `67a2025` added the hook and brought all 4 tests green; also kept sibling hook suites green (20/20).
- **REFACTOR gate:** None needed — the implementation landed clean on typecheck and biome with only a trivial `type`-first import sort adjustment applied before the GREEN commit.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — blocking] Biome `organizeImports` wanted type-first import sort**

- **Found during:** Task 1 GREEN verification (post-typecheck `pnpm lint`)
- **Issue:** `import { useQuery, type UseQueryResult } from "@tanstack/react-query"` triggered `organizeImports` — biome wants `type`-prefixed members sorted before value members within a single import specifier list.
- **Fix:** Reordered to `import { type UseQueryResult, useQuery } from "@tanstack/react-query"`
- **Files modified:** `src/lib/supabase/hooks/useListingsSnapshot.ts` (one line)
- **Commit:** Rolled into the GREEN commit `67a2025` (fix applied before committing the hook file)

### Bundled tasks

The plan defined Tasks 1 and 2 separately (hook file, test file). Strict TDD required writing the test first and then the hook, which I did. The test file is therefore committed as the RED gate for Task 1 (`7021803`) rather than as a separate Task 2 commit — this makes the git history read as a clean RED -> GREEN pair rather than out-of-order GREEN -> test. All of Task 2's acceptance criteria are satisfied by that same file.

### Auth gates

None. All work was Vitest unit-level with a fully mocked Supabase client. No Supabase / Parallelum / Anthropic calls required for this plan.

## Known Stubs

None. The hook is production-grade. The `PREVIEW_LISTINGS` fallback is a **deliberate D-01 product decision**, not a placeholder — it is the specified behavior for Phase 7 (transparent to consumers, same code path in dev/preview/prod until Phase 8 ships the scraper + real listings populator).

## Threat Flags

None. The hook introduces no new network endpoints (re-uses the Supabase browser client and the Phase 6 authenticated session); no new auth paths (inherits `useSupabaseUser` session); no new file I/O; no new schema surface (reads the existing `listings` table from the Phase 6 schema). Query is bounded at `.limit(500)` to prevent accidental full-table scans from a client.

## Self-Check: PASSED

### Files created — verified present in worktree:

- FOUND: `src/lib/supabase/hooks/useListingsSnapshot.ts`
- FOUND: `src/lib/supabase/hooks/useListingsSnapshot.test.tsx`

### Commits verified in git log:

- FOUND: `7021803` (test: useListingsSnapshot RED)
- FOUND: `67a2025` (feat: useListingsSnapshot GREEN)

### Acceptance-criteria greps (Task 1 + Task 2):

- `grep -c "export function useListingsSnapshot"` = 1 ✓
- `grep -c "PREVIEW_LISTINGS"` in hook = 4 (>= 2 required — import, fallback return, initialData, plus comment) ✓
- `grep -c "staleTime: 60_000"` = 1 ✓
- `grep -c "refetchOnWindowFocus: true"` = 1 ✓
- `grep -c 'from("listings")'` = 1 ✓
- `grep -c "limit(500)"` = 1 ✓
- `grep -n "swr"` (case-sensitive) = 0 matches ✓ (L4)
- `grep -n "falls back to PREVIEW_LISTINGS"` in test = 1 ✓
- `grep -nE 'calls \.limit\(500\)'` in test = 1 ✓

### Verification commands re-run before summary:

- `pnpm test src/lib/supabase/hooks/useListingsSnapshot.test.tsx --run` -> 4/4 passing, 255ms
- `pnpm test src/lib/supabase/hooks --run` -> 20/20 passing, no sibling regressions
- `pnpm typecheck` -> exit 0
- `pnpm lint` (biome check src) -> exit 0
