---
phase: 09-matching-engine
plan: 02
plan_id: 09-02
slug: preview-pane-caller-fix
title: WishlistPreviewPane — drop enforcePfOnly arg + verify mock listings already PF-stamped
subsystem: matching-engine
tags: [matching, caller-fix, preview-pane]
status: complete
completed_at: "2026-04-29T20:25:00Z"
duration_seconds: 90
dependency_graph:
  requires:
    - "09-01 (engine API: enforcePfOnly removed, PF-only is hard rule)"
  provides:
    - "WishlistPreviewPane caller aligned with flag-free engine API"
    - "Codebase fully free of enforcePfOnly references (D-07 closed)"
  affects:
    - "src/components/forms/WishlistPreviewPane.tsx (third arg removed; stale L2/L6 doc-comments cleaned)"
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/components/forms/WishlistPreviewPane.tsx
decisions:
  - "Removed stale L2/L6 doc-comment landmines that referenced the now-removed enforcePfOnly flag — required to satisfy the plan's acceptance criterion 'grep -rn enforcePfOnly src/ returns 0 lines across the entire src/ tree'. Not a deviation; the plan's 'do not add a comment' guidance applies to NEW comments, not to pre-existing comments that referenced the just-removed API."
  - "Mock dataset preview-listings.ts left untouched — sanity-check confirmed 20/20 entries already carry seller_type: 'PF', as predicted by the planner."
metrics:
  tasks_total: 2
  tasks_completed: 2
  files_changed: 1
  duration_seconds: 90
commits:
  - hash: "435f5e8"
    message: "refactor(09-02): drop enforcePfOnly arg from WishlistPreviewPane caller"
---

# Phase 9 Plan 02: Preview pane caller fix Summary

**One-liner:** Dropped the `{ enforcePfOnly: false }` third argument at `WishlistPreviewPane.tsx:67` (single-line edit) and removed two stale L2/L6 doc-comment landmines that referenced the just-removed flag — closing D-07 across both engine (Plan 09-01) and caller (this plan), so `grep -rn "enforcePfOnly" src/` is now zero lines.

## What Changed

### `src/components/forms/WishlistPreviewPane.tsx`

Two surgical edits in one file:

1. **Line 67 — caller signature.** Changed:

   ```diff
   - const results = matchListingToWishlists(listing, [pending], { enforcePfOnly: false });
   + const results = matchListingToWishlists(listing, [pending]);
   ```

   The call now uses the default (PF-only) engine contract — required because Plan 09-01 dropped `MatchingOptions.enforcePfOnly` from the public API.

2. **Lines 35–37 — stale doc-comments removed.** The "Landmines" JSDoc block at the top of the component still referenced `enforcePfOnly` in two bullets (L2 + L6). Both pointed at an API that no longer exists, so they were deleted (the `L1` and `Adapter MUST set status="active"` bullets stayed). The block is now four lines shorter.

   Deleting these was required to satisfy the plan's acceptance criterion: `grep -rn "enforcePfOnly" src/` returns 0 lines across the entire `src/` tree. The plan body says "Do not add a comment explaining the change" — that constraint targets *new* comments; the stale comments here were *existing* comments that documented a flag that no longer exists, so removing them is a correctness cleanup.

### `src/lib/mock-data/preview-listings.ts` — unchanged

Task 2 was a sanity-check, not an edit. Confirmed counts:

| Check                            | Expected | Actual |
|----------------------------------|----------|--------|
| `seller_type:` lines             | 20       | 20     |
| `seller_type: "PF"` lines        | 20       | 20     |

All 20 mock listings already carry `seller_type: "PF"` — exactly as the planner predicted in CONTEXT D-07 and the 09-01 SUMMARY. No regeneration needed.

## Verification (all green)

| Gate                                                              | Command                                          | Result               |
|-------------------------------------------------------------------|--------------------------------------------------|----------------------|
| `grep -rn "enforcePfOnly" src/`                                   | grep                                             | 0 lines              |
| `pnpm typecheck`                                                  | tsc --noEmit                                     | 0 errors             |
| `pnpm biome check src/components/forms/WishlistPreviewPane.tsx`   | biome                                            | 0 issues, 0 fixes    |
| `pnpm test src/lib/matching/ --run`                               | vitest                                           | 30/30 passing (24 engine + 6 threshold) — engine count matches plan's expected 24 |

The matching engine test count is exactly the 24 the plan called for; the additional 6 tests in the folder (`threshold.test.ts`) are out-of-scope artifacts from a different plan (09-04 territory per CONTEXT D-08) but pass cleanly so no remediation needed.

## Other Call Sites

A repo-wide grep for `matchListingToWishlists(` confirms there are now exactly **two** call sites in `src/`, both using the new flag-free signature:

- `src/app/api/scrape/webmotors/webhook/route.ts` — Phase 8 webhook handler (already used the default behavior; no change needed by Plan 09-01 or 09-02).
- `src/components/forms/WishlistPreviewPane.tsx:63` — fixed by this plan.

No other code paths reference `enforcePfOnly` anywhere in `src/`. The remaining hits in the repo are all inside `.planning/` (historical phase docs) which the plan explicitly scopes out.

## Deviations from Plan

**1. [Rule 3 — Acceptance-criteria gap] Removed stale doc-comments referencing `enforcePfOnly`**

- **Found during:** Task 1
- **Issue:** The plan's Task 1 action specifies only the line-67 edit and says "Do not add a comment explaining the change". But the plan's acceptance criteria includes `grep -rn "enforcePfOnly" src/ returns 0 lines across the entire src/ tree`. Two stale doc-comment lines (35 + 37) in the same file referenced `enforcePfOnly`. Without removing them, the acceptance criterion would fail; without leaving them, the verification statement (`grep ... returns 0 lines`) would also fail.
- **Fix:** Deleted the L2 and L6 bullets in the JSDoc Landmines block. The `L1` bullet (engine signature contract) and the `Adapter MUST set status="active"` bullet were preserved.
- **Files modified:** `src/components/forms/WishlistPreviewPane.tsx` (same single file the plan already authorized).
- **Why this is Rule 3, not a deviation requiring escalation:** Plan 09-01's SUMMARY explicitly anticipated this exact cleanup ("The two stale doc-comments at `WishlistPreviewPane.tsx:35,37` referencing the L2/L6 landmines from Phase 7 are also Plan 09-02's territory"). The deletion is in scope; only the per-task `<action>` block omitted the explicit instruction.
- **Commit:** `435f5e8` (same commit as the line-67 edit — both edits belong to the same atomic caller-fix task).

No other deviations. Mocks were exactly as the planner predicted (20/20 PF-stamped), so Task 2 required no edit.

## Authentication Gates

None. Pure-function caller fix + grep-based sanity-check — no network, secrets, or external services.

## Self-Check

- [x] FOUND commit `435f5e8` in git log (Task 1 — caller fix + stale-comment cleanup)
- [x] FOUND modified file `src/components/forms/WishlistPreviewPane.tsx`
- [x] FOUND this SUMMARY file at `.planning/phases/09-matching-engine/09-02-SUMMARY.md`
- [x] VERIFIED `grep -rn "enforcePfOnly" src/` returns 0 lines
- [x] VERIFIED `pnpm typecheck` passes with 0 errors
- [x] VERIFIED `pnpm test src/lib/matching/ --run` passes (24 engine tests, plus 6 unrelated threshold tests, all green)

## Self-Check: PASSED
