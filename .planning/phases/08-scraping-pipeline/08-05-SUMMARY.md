---
phase: 08-scraping-pipeline
plan: 05
subsystem: scraping
tags: [scraping, apify, http-client, async-generator, token-scrub]

# Dependency graph
requires:
  - phase: 08-scraping-pipeline
    provides: WebMotorsScraped type (08-02 — src/lib/apify/types.ts)
provides:
  - "src/lib/apify/client.ts: getActorRun(runId, token, signal) → RunMeta"
  - "src/lib/apify/client.ts: streamDatasetItems<T>(datasetId, token, signal, pageSize?) async generator"
  - "RunMeta type with status enum (RUNNING|SUCCEEDED|FAILED|ABORTED|TIMED-OUT) + cost field"
  - "Token-scrub helper pattern (scrubToken) re-applicable in webhook route"
affects:
  - 08-06 (webhook integration — imports getActorRun + streamDatasetItems)
  - 08-scraping-pipeline downstream cost-tracking + dataset ingestion

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AsyncGenerator pagination over Apify dataset (yield-one-item, never accumulate)"
    - "Token-scrub on every catch via scrubToken() — wraps original error in fresh Error with regex-replaced message"
    - "HTTPS-only base URL constant (no override parameter, no MITM surface)"
    - "AbortSignal forwarded into every fetch call"

key-files:
  created:
    - src/lib/apify/client.ts (110 lines)
    - src/lib/apify/client.test.ts (199 lines, 11 test cases)
  modified: []

key-decisions:
  - "Wrap fetch errors with scrubToken() before re-throwing; never log token, never let original Error.message escape"
  - "AsyncGenerator returns on empty page OR partial page (length < pageSize) — saves one round-trip vs offset-only loop"
  - "RunMeta.usageTotalUsd typed as number | null because Apify omits the field while a run is RUNNING"
  - "RunMeta.finishedAt typed as string | null for the same reason"
  - "Added 11th test (getActorRun AbortSignal forwarding) so signal-forwarding is asserted symmetrically on both functions per acceptance criteria"

patterns-established:
  - "lib-level fetch wrappers: zero console.* (logging is the caller's responsibility), token-scrub on every catch, AbortSignal mandatory"
  - "Async-iterable pagination: while(true) loop with offset+pageSize, early-return on empty/short page"

requirements-completed: [SCRAPE-02]

# Metrics
duration: 4min
completed: 2026-04-26
---

# Phase 8 Plan 05: Apify REST Client Summary

**Two thin Apify REST wrappers (`getActorRun` + `streamDatasetItems` async generator) with strict token-scrub discipline, AbortSignal forwarding, and zero in-library logging — ready for the 08-06 webhook to ingest scheduled-run datasets without loading them into memory.**

## Performance

- **Duration:** 4 min (250 s)
- **Started:** 2026-04-26T14:30:55Z
- **Completed:** 2026-04-26T14:35:05Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 created, 0 modified

## Accomplishments

- `getActorRun(runId, token, signal)` calls `GET /v2/actor-runs/{runId}` and returns parsed `RunMeta` (id, status, defaultDatasetId, usageTotalUsd, startedAt, finishedAt). Throws `apify_run_meta_{status}` on non-2xx.
- `streamDatasetItems<T>(datasetId, token, signal, pageSize=1000)` paginates `/v2/datasets/{id}/items` with `clean=true&limit&offset`, yielding one item at a time. Stops on empty or partial page. Throws `apify_dataset_{status}` on non-2xx.
- Both functions scrub the token from every thrown error via `scrubToken()` (wraps in fresh `Error` so original Error properties cannot leak the token through stack/cause).
- Both functions accept and forward `AbortSignal` into every fetch call.
- `APIFY_BASE` hardcoded to `https://api.apify.com/v2` — no parameter override, no HTTP fallback (T-08-05-05).
- 11 unit tests cover: happy path × 2, status errors (404/500/dataset-404), pagination (1500 over 2 pages), empty first page, partial first page, token-scrub × 2, AbortSignal forwarding × 2.

## Task Commits

Each task committed atomically (TDD cycle):

1. **Task 1 RED — failing tests** — `0a1022b` (test)
2. **Task 1 GREEN — implementation** — `66c0a77` (feat)

_REFACTOR step skipped — implementation was already minimal and clean. No structural cleanup needed._

**Plan metadata commit:** pending (this SUMMARY commit, see end of plan).

## Files Created/Modified

- `src/lib/apify/client.ts` — Apify REST wrappers: `getActorRun`, `streamDatasetItems`, `RunMeta` type, `scrubToken` helper. Zero `console.*`. HTTPS-only base.
- `src/lib/apify/client.test.ts` — 11 vitest cases via `vi.stubGlobal('fetch', ...)`. No real network.

## Decisions Made

- **Pagination loop terminates on `items.length < pageSize`** in addition to `length === 0`. Saves one wasted round-trip when the tail page is short — Apify guarantees a short page only at the dataset tail, so this is correctness-equivalent and faster.
- **`scrubToken()` returns a fresh `new Error(safeMsg)`** rather than mutating the original. Mutating `err.message` on a non-Error throwable (e.g. `string`, `{ message }`) would crash; wrapping is total.
- **`RunMeta.usageTotalUsd: number | null` and `RunMeta.finishedAt: string | null`** match the actual Apify response shape — both fields are absent while a run is RUNNING. Caller (08-06 webhook) handles the null branch when persisting `scrape_runs.cost_usd`.
- **Added an 11th test case** (`getActorRun forwards the AbortSignal into fetch`) beyond the plan listing's 10 cases, satisfying acceptance criterion `AbortSignal forwarding asserted on at least 2 cases` symmetrically (one assertion per public function).
- **REFACTOR step intentionally omitted.** GREEN code already met all acceptance criteria (token-scrub, AbortSignal, encodeURIComponent, no console.*, HTTPS-only, async generator). No restructuring required.

## Deviations from Plan

None — plan executed exactly as written. The 11th test case is additive (the plan listing showed 10 but acceptance criteria required 11+), not a deviation from the plan's intent.

## Issues Encountered

- **Repo-wide biome lint flagged 2 pre-existing `suppressions/unused` warnings in `src/lib/wishlist/formValuesToPendingWishlist.ts:52,54`.** Out of scope per executor SCOPE BOUNDARY. The 08-05 files (`client.ts`, `client.test.ts`) pass `pnpm exec biome check` cleanly. Logged to `.planning/phases/08-scraping-pipeline/deferred-items.md` for the wishlist module owner. The deferred-items.md edit is NOT included in the plan's atomic commits because the parallel-execution constraint restricts touched files to `src/lib/apify/client.ts` and `client.test.ts` only — the orchestrator may pick up `deferred-items.md` separately or it can be folded into a follow-up.

## Threat Flags

None new. The plan's `<threat_model>` covered all surface introduced by this change. No additional network endpoints, auth paths, or trust boundaries were created beyond what was specified.

## Known Stubs

None. Both functions are fully wired; pagination, error handling, token-scrub, and AbortSignal forwarding are all real (no TODOs, no placeholders, no mock-only code paths).

## TDD Gate Compliance

- **RED gate:** `0a1022b` — `test(08-05): add failing tests for apify client (RED)` — vitest reported `Failed to resolve import "./client"` (module not found). Confirmed RED state.
- **GREEN gate:** `66c0a77` — `feat(08-05): implement apify rest client (GREEN)` — vitest reports 11/11 passing.
- **REFACTOR gate:** intentionally skipped (no cleanup needed).

Sequence verified in `git log --oneline -3`: GREEN commit follows RED commit. Compliant.

## User Setup Required

None. This plan adds a self-contained library module with no env vars, no external service configuration, and no infrastructure changes. The webhook route (08-06) will be the consumer and will inherit the existing `APIFY_API_TOKEN` env var that Phase 5 already configured.

## Next Phase Readiness

- `08-06` (webhook integration) can now `import { getActorRun, streamDatasetItems, type RunMeta } from "@/lib/apify/client"` and use `for await (const item of streamDatasetItems(...))` to ingest dataset items one-at-a-time.
- Caller responsibility: provide `AbortSignal` (Vercel timeout safety), persist `RunMeta.usageTotalUsd` into `scrape_runs.cost_usd`, route normalization + zod validation per item (Phase 8 § 8.4 — handled by `08-04` filters/normalize module).
- No blockers for downstream work in this wave (08-03 webhook-auth and 08-04 filters/normalize are independent).

## Self-Check

Verified file existence and commit hashes:

- `src/lib/apify/client.ts` — FOUND
- `src/lib/apify/client.test.ts` — FOUND
- Commit `0a1022b` (RED) — FOUND in `git log`
- Commit `66c0a77` (GREEN) — FOUND in `git log`

All 11 tests pass: `pnpm test src/lib/apify/client.test.ts --run` exits 0.
Typecheck clean: `pnpm tsc --noEmit` exits 0.
Lint clean for 08-05 files: `pnpm exec biome check src/lib/apify/client.ts src/lib/apify/client.test.ts` reports `Checked 2 files. No fixes applied.` with zero errors.

Grep acceptance criteria all satisfied (see plan `<acceptance_criteria>`):

- `export async function getActorRun` — match at line 49 of client.ts
- `export async function* streamDatasetItems` — match at line 75 of client.ts
- `export interface RunMeta` — match at line 29 of client.ts
- `replace(new RegExp(token` — 1 match (in `scrubToken`)
- `encodeURIComponent(token)` — 2 matches (one per endpoint)
- `encodeURIComponent(runId)` — 1 match
- `encodeURIComponent(datasetId)` — 1 match
- `console.` — 0 matches in client.ts (no logging from library)

## Self-Check: PASSED

---
*Phase: 08-scraping-pipeline*
*Completed: 2026-04-26*
