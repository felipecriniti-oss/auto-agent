---
phase: 09-matching-engine
plan: 01
plan_id: 09-01
slug: engine-pf-hard-rule
title: Matching engine — PF-only hard rule, enforcePfOnly flag dropped
subsystem: matching-engine
tags: [matching, engine, breaking-api, pf-only]
status: complete
completed_at: "2026-04-29T23:20:38Z"
duration_seconds: 125
dependency_graph:
  requires: []
  provides:
    - "matchListingToWishlists() rejects all non-PF listings unconditionally"
    - "MatchingOptions public type contains only { threshold?: number }"
  affects:
    - "src/components/forms/WishlistPreviewPane.tsx (typecheck breaks until Plan 09-02 fixes call site)"
    - "Future webhook + backfill paths consuming matchListingToWishlists"
tech_stack:
  added: []
  patterns:
    - "Listing-level short-circuit gates: status + seller_type sit before per-wishlist for-loop"
key_files:
  created: []
  modified:
    - src/lib/matching/engine.ts
    - src/lib/matching/engine.test.ts
decisions:
  - "D-07 from 09-CONTEXT.md materialized: enforcePfOnly removed from public API, PF-only is now a hard rule alongside model/year/km/price/region"
  - "null seller_type treated as non-PF (defensive — undefined/null never satisfies !== \"PF\")"
metrics:
  tasks_total: 2
  tasks_completed: 2
  files_changed: 2
  tests_before: 23
  tests_after: 24
  tests_added: 3
  tests_removed: 2
  duration_seconds: 125
commits:
  - hash: "8073455"
    message: "refactor(09-01): drop enforcePfOnly flag, make PF-only a hard rule in engine"
  - hash: "82f926f"
    message: "test(09-01): align engine tests with PF-only hard-rule contract"
---

# Phase 9 Plan 01: Matching engine PF-only hard rule Summary

**One-liner:** Removed `MatchingOptions.enforcePfOnly` from the public engine API and promoted `seller_type === "PF"` to a listing-level short-circuit gate (alongside `status === "active"`), eliminating the foot-gun of a future caller re-enabling PJ matching.

## What Changed

### `src/lib/matching/engine.ts`

Two minimal edits at the entry point of the engine (line 154-167 region):

1. **`MatchingOptions` type (line 156-158):** removed the `enforcePfOnly?: boolean; // default true; skip PJ listings` field. The type now exposes only `threshold?: number`.

2. **`matchListingToWishlists` body (line 165-167):** removed the `const enforcePf = opts.enforcePfOnly ?? true;` line and replaced the conditional `if (enforcePf && listing.seller_type !== "PF") return [];` with the unconditional `if (listing.seller_type !== "PF") return [];`. The `opts` parameter was retained because `opportunitiesWorthCreating` still reads `opts.threshold`.

The header doc-comment (lines 1-23) already lists `seller_type must be 'PF'` as a hard rule — left untouched.

### `src/lib/matching/engine.test.ts`

Replaced two tests at lines 143-153 with three positive PF-only assertions:

**Removed (2):**
- `it("rejects PJ listings by default", ...)` — language ("by default") implied a flag still existed
- `it("allows PJ if enforcePfOnly=false", ...)` — depended on the now-removed flag

**Added (3):**
- `it("rejects PJ listings unconditionally", ...)` — PJ listing produces zero matches against compatible wishlist
- `it("rejects listings with null seller_type (treated as non-PF)", ...)` — defensive case; null/undefined never equals `"PF"` so short-circuits correctly
- `it("accepts PF listings without any options argument", ...)` — verifies the no-third-arg call shape works post-API-shrink

Test count: 23 → 24 (− 2 + 3).

## Verification (all green)

| Gate | Command | Result |
|------|---------|--------|
| `grep "enforcePfOnly" src/lib/matching/engine.ts` | — | 0 lines |
| `grep "enforcePfOnly" src/lib/matching/engine.test.ts` | — | 0 lines |
| `pnpm test src/lib/matching/ --run` | vitest | 24/24 passing in 25ms |
| `pnpm biome check src/lib/matching/ --write` | biome | 0 issues, 0 fixes applied |
| `pnpm typecheck` (engine subtree) | tsc --noEmit | 0 errors originating in `src/lib/matching/` |

## Other Call Sites Surfaced by Typecheck

Exactly one downstream consumer remains — **as predicted by the plan**:

- **`src/components/forms/WishlistPreviewPane.tsx:67`** — passes `{ enforcePfOnly: false }` as the third arg to `matchListingToWishlists`. This is **owned by Plan 09-02** and is intentionally left in a typecheck-failing state at the boundary between these two atomic plans. Plan 09-02 will drop the third argument entirely (mocks already carry `seller_type: "PF"` per `src/lib/mock-data/preview-listings.ts`).

The two stale doc-comments at `WishlistPreviewPane.tsx:35,37` referencing the L2/L6 landmines from Phase 7 are also Plan 09-02's territory.

No other code paths reference `enforcePfOnly` anywhere in `src/`. All other matches grep surfaces are inside `.planning/` (historical phase docs).

## Deviations from Plan

None. Plan executed exactly as written:
- Edits A and B in Task 1 applied verbatim
- Three new tests in Task 2 use the exact signatures and assertions the plan specified
- Acceptance criteria met for both tasks at first run
- The single remaining typecheck error (`WishlistPreviewPane.tsx:67`) was anticipated and explicitly scoped to Plan 09-02

## Authentication Gates

None encountered. Pure-function edit + test update — no network, secrets, or external services.

## Self-Check

- [x] FOUND commit `8073455` in git log (Task 1: refactor)
- [x] FOUND commit `82f926f` in git log (Task 2: test)
- [x] FOUND modified file `src/lib/matching/engine.ts`
- [x] FOUND modified file `src/lib/matching/engine.test.ts`
- [x] FOUND this SUMMARY file at `.planning/phases/09-matching-engine/09-01-SUMMARY.md`

## Self-Check: PASSED
