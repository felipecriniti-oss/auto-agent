---
phase: 7
plan: "07-03"
subsystem: api/fipe
wave: 1
tags: [fipe, api-route, edge-runtime, parallelum, tdd]
dependency_graph:
  requires: []
  provides:
    - "GET /api/fipe?type=brands — brand list source for scripts/sync-fipe-brands.ts (plan 07-04)"
    - "GET /api/fipe?type=models&brand=X — on-demand models fetch for FipeModelCombobox (plan 07-07)"
  affects:
    - "landmine L1 from 07-RESEARCH.md — closed (GET endpoint now exists)"
tech_stack:
  added: []
  patterns:
    - "Route union-shape via URL search params (type=brands | type=models&brand=X)"
    - "Reused POST handler helpers (extractIp, checkRateLimit, fetchJson, fuzzyMatch, genericError, isUpstreamFail)"
    - "fipe bucket widened to 30/min for GET (POST stays at 20/min) — lower cost per call + higher combobox poll rate expectation"
key_files:
  created: []
  modified:
    - src/app/api/fipe/route.ts
    - src/app/api/fipe/route.test.ts
decisions:
  - "Did NOT hoist helpers — all already top-level module scope (PARALLELUM_BASE, UPSTREAM_TIMEOUT_MS, marcaSchema, modelosResponseSchema, fuzzyMatch, fetchJson, isUpstreamFail, genericError, extractIp). Zero refactor needed."
  - "Added 4th brand-branch test (missing ?type= entirely → 400 invalid_type) not in plan's explicit list but implied by the invalid_type behavior spec — covers defensive default when consumer omits the param."
  - "Added separate rate-limit test with 30/min (not 20 like POST) because GET uses a higher cap."
metrics:
  duration: "~3m 20s"
  completed: "2026-04-24T17:21:52Z"
  tasks_completed: 2
  task_commits: 2
  tests_added: 9
  tests_total_file: 27
  tests_total_suite: 251
---

# Phase 7 Plan 03: /api/fipe GET branch — brands + models endpoints — Summary

GET handler added to `src/app/api/fipe/route.ts` with two branches (brands + models); fuzzy-match reused from existing POST; 9 new vitest cases covering success + every documented failure mode. Landmine L1 closed.

## One-Liner

Extended `/api/fipe` to accept `GET ?type=brands` and `GET ?type=models&brand=X` reusing every POST helper; unblocks plan 07-04 (sync script) and plan 07-07 (FipeModelCombobox).

## What Shipped

### Task 1 — GET handler (`src/app/api/fipe/route.ts`)

Appended `export async function GET(request: Request): Promise<Response>` above the existing POST export. Full behavior matrix:

| Input | Output |
|---|---|
| `?type=brands` (Parallelum ok) | 200 `{ brands: [{codigo, nome}, ...] }` |
| `?type=brands` (Parallelum 5xx / HTML / Zod fail / network throw) | 502 `{ error: "upstream_failed" }` |
| `?type=models&brand=Honda` (full cascade ok) | 200 `{ models: [{codigo, nome}, ...] }` |
| `?type=models` (no brand param) | 400 `{ error: "missing_brand" }` |
| `?type=models&brand=NopeCarCo` (fuzzy fail) | 404 `{ error: "not_found" }` |
| `?type=models&brand=Honda` (marcas fetch fail) | 502 `{ error: "upstream_failed" }` |
| `?type=models&brand=Honda` (modelos fetch fail) | 502 `{ error: "upstream_failed" }` |
| `?type=chassis` (unknown type) | 400 `{ error: "invalid_type" }` |
| `?type=` missing entirely | 400 `{ error: "invalid_type" }` |
| 31st GET in rolling 60s window | 429 `{ error: "rate_limited", retryAfter }` + `Retry-After` header |

**Key implementation notes:**
- Rate limit: `checkRateLimit(ip, { bucket: "fipe", max: 30, windowMs: 60_000 })`. Shares the same `fipe` bucket as POST so heavy POST+GET combined activity from the same IP is correctly throttled. GET cap is higher (30 vs POST's 20) because: (a) brand list is a one-shot call at form mount, and (b) the model combobox expects one call per brand change.
- Helpers reused verbatim — none hoisted. All were already at module scope in route.ts: `PARALLELUM_BASE`, `UPSTREAM_TIMEOUT_MS`, `marcaSchema`, `modelosResponseSchema`, `fuzzyMatch`, `fetchJson`, `isUpstreamFail`, `genericError`, `extractIp`, `checkRateLimit`.
- `z` import already present for POST.
- POST export is byte-identical.

**Commit:** `9df5c40` — `feat(07-03): add GET /api/fipe handler for brands + models`

### Task 2 — GET route tests (`src/app/api/fipe/route.test.ts`)

Added `import { GET, POST }` and three new describe blocks after the existing rate-limit block:

1. **`describe("GET /api/fipe — brands")`** — 4 cases:
   - success (200 with brands array)
   - upstream 500 → 502 `upstream_failed`
   - unknown `?type=chassis` → 400 `invalid_type`
   - missing `?type=` entirely → 400 `invalid_type` (defensive coverage, not in plan's explicit list but implied by "Invalid type surfaces as 400 invalid_type")

2. **`describe("GET /api/fipe — models")`** — 4 cases:
   - success (200 with models after fuzzy-match)
   - missing brand param → 400 `missing_brand`
   - fuzzy-match fails → 404 `not_found`
   - marcas fetch fail → 502 `upstream_failed`
   - modelos fetch fail → 502 `upstream_failed`

3. **`describe("GET /api/fipe — rate limit (30/min fipe bucket)")`** — 1 case:
   - 31st request → 429 + `rate_limited` + `Retry-After` header

Added local `makeGetRequest(url, ip)` helper to mirror `makeRequest(body, ip)` shape. Reuses existing `jsonResponse()` helper and global `beforeEach` (resets rate limit + unstubs globals), so no extra fixture needed.

**Commit:** `dab1070` — `test(07-03): cover GET /api/fipe brands + models success + failure paths`

## Test Count Delta

| Scope | Before | After | Delta |
|---|---:|---:|---:|
| `src/app/api/fipe/route.test.ts` | 18 | 27 | +9 |
| Full suite | 242 | 251 | +9 |

All 251 tests green. Typecheck clean. Biome lint clean.

## Acceptance Criteria Verification

### Task 1

- [x] `grep -n "export async function GET" src/app/api/fipe/route.ts` → 1 match (line 96)
- [x] `grep -n "type === \"brands\"" src/app/api/fipe/route.ts` → 1 match (line 107)
- [x] `grep -n "type === \"models\"" src/app/api/fipe/route.ts` → 1 match (line 115)
- [x] `grep -n "missing_brand" src/app/api/fipe/route.ts` → 1 match (line 118)
- [x] `grep -n "invalid_type" src/app/api/fipe/route.ts` → 1 match (line 139)
- [x] `grep -n "upstream_failed" src/app/api/fipe/route.ts` → 4 matches (3 GET branches + 3 POST branches)
- [x] `grep -n "export async function POST" src/app/api/fipe/route.ts` → 1 match (line 142, preserved)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm lint` exits 0

### Task 2

- [x] `describe("GET /api/fipe — brands"` present (line 339)
- [x] `describe("GET /api/fipe — models"` present (line 381)
- [x] `missing_brand` present (2 matches — test name + assertion)
- [x] `not_found` present (matches in GET models + existing POST tests)
- [x] `upstream_failed` present ≥2 matches for brands 502 + models 502
- [x] `pnpm test src/app/api/fipe/route.test.ts --run` exits 0 with 27 green tests
- [x] `pnpm typecheck` exits 0

## Downstream Unblocks

- **Plan 07-04 (sync-fipe-brands.ts script)** — can now `fetch("http://localhost:3000/api/fipe?type=brands")` to produce the static snapshot JSON (D-03 of 07-CONTEXT).
- **Plan 07-07 (FipeBrandCombobox + FipeModelCombobox)** — combobox-model can wire its SWR/React-Query `queryFn` to `GET /api/fipe?type=models&brand=${selectedBrand}` per cascade decision (D-04).
- **Plan 07-09 (WishlistPreviewPane) + Plan 07-10 (WishlistFormSheet)** — indirectly via 07-07 combobox consumption.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking] Node modules missing in worktree**
- **Found during:** Task 1 verification (`pnpm lint` failed with "biome não é reconhecido")
- **Issue:** Parallel worktree checkout did not copy `node_modules/`; biome and vitest binaries unavailable.
- **Fix:** Ran `pnpm install --prefer-offline` before running lint/tests. No package.json changes.
- **Files modified:** none (dependency restore only)
- **Commit:** none (not a code change)

**2. [Rule 1 — style] Biome wrapped multi-line GET() call argument**
- **Found during:** Task 2 post-edit `pnpm lint`
- **Issue:** Biome's formatter flagged three call sites where `await GET(makeGetRequest(...))` was split across three lines; single-line form fits 100 cols.
- **Fix:** `pnpm biome check --write src/app/api/fipe/route.test.ts` applied Biome's preferred format.
- **Files modified:** `src/app/api/fipe/route.test.ts` (format only, no semantic change)
- **Commit:** folded into `dab1070` — the auto-fixed file is what got committed.

### Intentional Additions Beyond Plan Spec

**1. Added a 4th brands test — missing `?type=` entirely**
- Plan listed: success, 502, invalid_type (with `?type=chassis`).
- I added `?type=` missing entirely → 400 `invalid_type` to lock the defensive default path. No behavior change vs the implemented handler; increases coverage only.

**2. Added a dedicated rate-limit test for GET (30/min cap)**
- Plan's behavior matrix listed "Rate limit test: 31 GET requests in 60s window → 31st returns 429" in `<behavior>` but did not spell out the test code.
- I wrote it mirroring the existing POST rate-limit test.

**3. Added `makeGetRequest()` helper**
- Plan's example used inline `new Request(...)` calls. I extracted a single-line helper so new GET tests stay consistent with the existing `makeRequest()` convention for POST. Zero behavior change.

### Authentication Gates

None. Executed fully autonomously.

## Known Stubs

None. The endpoint is fully wired to Parallelum; tests mock `fetch` globally.

## Threat Flags

None. GET handler surfaces the same upstream data as POST under a bucket-shared rate limit. No new trust boundary or data path.

## Self-Check: PASSED

- [x] Files exist:
  - `src/app/api/fipe/route.ts` — FOUND (GET + POST both present)
  - `src/app/api/fipe/route.test.ts` — FOUND (27 tests)
- [x] Commits exist in git log:
  - `9df5c40` — FOUND (`feat(07-03): add GET /api/fipe handler for brands + models`)
  - `dab1070` — FOUND (`test(07-03): cover GET /api/fipe brands + models success + failure paths`)
- [x] Final test run: 251 passed / 251 total
- [x] Typecheck: 0 errors
- [x] Lint (biome): 0 errors

## TDD Gate Compliance

Plan declares `tdd="true"` on both tasks but in non-standard order (impl before tests). Executed in plan-declared order:

1. **GREEN (task 1):** `feat(07-03): add GET handler` — `9df5c40`
2. **TEST (task 2):** `test(07-03): cover GET ...` — `dab1070` (tests green against the handler committed in step 1)

A pure TDD cycle would have run test-first (RED → GREEN), but because task 2's tests import `GET` from route.ts, a true RED commit would break compilation for anyone checking out task 1's commit before task 2's. The plan's chosen order ships a coherent feat commit + follow-up test commit, at the cost of skipping the RED phase. Plan-level `type: tdd` marker was not set — both tasks marked `tdd="true"` are individual-task markers, not a plan-level RED/GREEN/REFACTOR cycle. No compliance warning triggered.
