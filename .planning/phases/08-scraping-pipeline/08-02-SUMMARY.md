---
phase: 08-scraping-pipeline
plan: 02
plan_id: 08-02
slug: types-targetmodels-skeleton
title: lib/apify scaffolding — types.ts move + target-models.ts seed
type: summary
tags: [scraping, apify, scaffolding, refactor]
requirements_addressed: [SCRAPE-01, SCRAPE-03]
dependency_graph:
  requires:
    - 08-01 (apify tier probe — GO decision)
  provides:
    - "@/lib/apify/types#WebMotorsScraped — single source of truth for actor payload"
    - "@/lib/apify/target-models#TARGET_MODELS — D-06 LOCKED top-20 list"
    - "@/lib/apify/target-models#TargetModel — entry shape"
  affects:
    - src/app/api/scrape/webmotors/route.ts (now imports type instead of declaring inline)
tech_stack:
  added: []
  patterns:
    - "readonly TargetModel[] + as const for compile-time literal narrowing"
    - "verbatim type relocation pattern for sharing between route + lib modules"
key_files:
  created:
    - src/lib/apify/types.ts
    - src/lib/apify/target-models.ts
    - src/lib/apify/target-models.test.ts
  modified:
    - src/app/api/scrape/webmotors/route.ts
decisions:
  - "WebMotorsScraped lives in @/lib/apify/types — Wave 1 normalize/filters/client modules import from one place, no circular references"
  - "TARGET_MODELS hardcoded as readonly array (D-06 LOCKED) — admin UI deferred to Phase 12+"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
  commits: 3
---

# Phase 08 Plan 02: lib/apify scaffolding — types.ts move + target-models.ts seed

**One-liner:** Verbatim move of `WebMotorsScraped` to `@/lib/apify/types` and seed of `TARGET_MODELS` (D-06 top-20 Brazil list) — pure scaffolding that unblocks Wave 1 modules without behavioral change to the on-demand route.

## What Shipped

**Three new files in `src/lib/apify/`:**

1. **`types.ts`** — exports `WebMotorsScraped` interface (verbatim move from on-demand route lines 38-82). Single source of truth for the ribtools/webmotors-scraper actor payload shape. All ~30 fields preserved including the nested `seller` object and `[key: string]: unknown` escape hatch.

2. **`target-models.ts`** — exports `TARGET_MODELS: readonly TargetModel[]` of length exactly 20 (Fenabrave-derived top sellers Brasil 2025) and the `TargetModel` interface (`{brand, model, url}`). Each URL follows the WebMotors estoque template `https://www.webmotors.com.br/carros/estoque?marca=<slug>&modelo=<slug>`.

3. **`target-models.test.ts`** — 4 vitest cases pinning length=20, non-empty fields, URL pattern regex match, and case-insensitive brand+model uniqueness.

**One modified file:**

- **`src/app/api/scrape/webmotors/route.ts`** — removed the inline `interface WebMotorsScraped { ... }` block (and its leading `─── Apify types` section comment + JSDoc), added `import type { WebMotorsScraped } from "@/lib/apify/types"`. Zero runtime behavior change.

## Verification Results

| Check                                                    | Result | Notes                                       |
| -------------------------------------------------------- | ------ | ------------------------------------------- |
| `pnpm test src/lib/apify/target-models.test.ts --run`    | PASS   | 4/4 tests                                   |
| `pnpm test src/app/api/scrape/webmotors/route.test.ts`   | PASS   | 12/12 tests (same as pre-plan baseline)     |
| `pnpm tsc --noEmit` (whole-repo)                         | PASS   | exit 0                                      |
| `pnpm biome check` (touched files)                       | PASS   | exit 0 after auto-format                    |
| `grep -c interface WebMotorsScraped src/.../route.ts`    | 0      | inline interface removed                    |
| `grep -c 'import.*WebMotorsScraped.*lib/apify/types'`    | 1      | new import in place                         |
| `grep -c webmotors.com.br/carros/estoque target-models`  | 20     | one per entry                               |
| `grep -c "as const" target-models.ts`                    | 1      | preserved through Biome rewrap              |
| `grep -c "export interface TargetModel" target-models.ts`| 1      | preserved                                   |

## Commits

| Task | Step    | Hash      | Message                                                              |
| ---- | ------- | --------- | -------------------------------------------------------------------- |
| 1    | RED     | `c56f633` | test(08-02): add failing test for TARGET_MODELS top-20 list          |
| 1    | GREEN   | `688cf95` | feat(08-02): add WebMotorsScraped type + TARGET_MODELS top-20 list   |
| 2    | refactor| `62f16c3` | refactor(08-02): import WebMotorsScraped from @/lib/apify/types ...  |

## Decisions Made

1. **Verbatim type move (no schema cleanup, no narrowing)** — The plan demanded byte-for-byte equality apart from the `export` keyword. Resisted the urge to tighten optional fields or replace `[key: string]: unknown` with a more restrictive index signature. Wave 1 normalize layer is the right place for that, not a scaffolding plan.

2. **`as const` after the array literal** — Provides compile-time literal narrowing without affecting consumers, since the public type is `readonly TargetModel[]`. This matches the v3 mock-data patterns elsewhere in the codebase.

3. **Multi-line entries (post-Biome)** — Original draft had each `TARGET_MODELS` entry on a single line for readability, but Biome's formatter expanded them. Accepted the rewrap; the data content is bit-for-bit identical (20 entries, same brand/model/URL slugs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node_modules missing in worktree**
- **Found during:** Task 1 RED phase (vitest binary not on PATH)
- **Issue:** `pnpm test` failed with "vitest n�o � reconhecido" because the worktree was freshly checked out without `node_modules`.
- **Fix:** Ran `pnpm install` (restored ~600 packages). Pre-existing repo state — not a plan defect.
- **Files modified:** none (lockfile unchanged)
- **Commit:** none (purely environmental)

**2. [Rule 3 - Blocking] Biome formatter rejected single-line array entries**
- **Found during:** Task 2 verification (`pnpm biome check`)
- **Issue:** Biome's formatter wanted multi-line object entries in `TARGET_MODELS` and a line break before the regex literal in the test. Lint exit code was non-zero in some configs.
- **Fix:** Ran `pnpm biome check --write` on the three new files. Output is purely cosmetic — same 20 entries, same regex. All 4 target-models tests still pass.
- **Files modified:** src/lib/apify/target-models.ts, src/lib/apify/target-models.test.ts
- **Commit:** rolled into `62f16c3` (Task 2 commit)

No Rule 1 (bug) or Rule 2 (missing critical functionality) deviations. No Rule 4 (architectural) decisions needed.

## TDD Gate Compliance

Plan-level type was `execute` (not `tdd`), but Task 1 carried `tdd="true"`. Gate sequence verified in git log:

- RED: `c56f633` — test(08-02): add failing test (test file imports `./target-models` which does not yet exist → resolution error)
- GREEN: `688cf95` — feat(08-02): add WebMotorsScraped type + TARGET_MODELS top-20 list (4/4 tests pass)
- REFACTOR: not needed — implementation was a static literal; no cleanup opportunity.

Gate sequence valid.

## Authentication Gates

None encountered.

## Self-Check: PASSED

**Files verified to exist:**
- src/lib/apify/types.ts — FOUND
- src/lib/apify/target-models.ts — FOUND
- src/lib/apify/target-models.test.ts — FOUND
- .planning/phases/08-scraping-pipeline/08-02-SUMMARY.md — FOUND (this file)

**Commits verified in git log:**
- c56f633 — FOUND
- 688cf95 — FOUND
- 62f16c3 — FOUND

**All success criteria met:**
- [x] All 2 tasks executed and committed atomically
- [x] target-models test (4 cases) passes
- [x] route.test.ts preserves prior pass count (12 → 12)
- [x] `pnpm tsc --noEmit` exits 0
- [x] 08-02-SUMMARY.md created
- [x] All grep acceptance criteria satisfied

## Wave 1 Unblocking

Plans 08-03 (normalize), 08-04 (filters), 08-05 (apify-client) can now safely:

```typescript
import type { WebMotorsScraped } from "@/lib/apify/types";
import { TARGET_MODELS, type TargetModel } from "@/lib/apify/target-models";
```

with no risk of circular dependency on the on-demand route handler.
