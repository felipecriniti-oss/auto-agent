---
phase: 08-scraping-pipeline
plan: 06
subsystem: api
tags: [scraping, webhook, apify, cost-cap, scrape-runs, fipe, discriminator, timing-safe-auth]

# Dependency graph
requires:
  - phase: 07-marketplace-mvp
    provides: Phase 7 webhook stub with array-shape contract + matching engine + opportunity upsert flow
  - phase: 08-03
    provides: verifySharedSecret (timing-safe shared-secret comparison)
  - phase: 08-04
    provides: normalizeWebMotorsItem (discriminated-union NormalizeResult) + filters (sinistro/leilao detection)
  - phase: 08-05
    provides: getActorRun + streamDatasetItems (AsyncGenerator)
provides:
  - Apify scheduled-run ingestion pipeline (event-driven webhook)
  - Body-shape discriminator preserving Phase 7 stub contract verbatim
  - Cost cap enforcement (D-02 / SCRAPE-08) — 429 at >= MAX_DAILY_SCRAPE_COST_USD
  - scrape_runs lifecycle (status='running' on entry, completed/failed with counts on exit)
  - FIPE retry-queue flag (D-04) — listings inserted with fipe=null + attributes.fipe_retry_pending=true
  - Timing-safe auth replacing plain `header !== secret`
affects: [08-07, 08-08, 09-matching-engine-validation]

# Tech tracking
tech-stack:
  added: []  # all dependencies already added in 08-03/08-04/08-05
  patterns:
    - "Body-shape discriminator: Apify event payload vs Phase 7 stub array routes to two top-level handlers"
    - "Cost cap query before any external Apify REST call (DoS mitigation T-08-06-04)"
    - "scrape_runs lifecycle: insert on entry → update on exit (single row per run)"
    - "FIPE graceful degrade: insert with fipe=null + retry flag instead of blocking on FIPE failure"
    - "Token-scrub on every catch: regex-replace APIFY_API_TOKEN before logging"
    - "Distinguish technical_errors from clean filter rejects when computing failure status"

key-files:
  created: []
  modified:
    - src/app/api/scrape/webmotors/webhook/route.ts
    - src/app/api/scrape/webmotors/webhook/route.test.ts

key-decisions:
  - "Filter rejects (sinistro/leilao) do not count toward 20% failure threshold — only technical errors do (Rule 1 fix to plan formula)"
  - "AbortSignal-based timeout APIFY_FETCH_TIMEOUT_MS = 55_000 (under Vercel's 60s default)"
  - "FIPE call uses VERCEL_URL host or localhost fallback for test/dev"

patterns-established:
  - "Two-shape webhook discriminator: try Apify schema first, fall back to stub array"
  - "Cost cap BEFORE any side-effect: SUM(cost_usd) gte today UTC, return 429 if >= cap, never insert scrape_runs row"
  - "scrape_runs row = entry insert (running) + finally update (completed/failed) — paired inside try/finally"
  - "technical_errors counter separate from listings_error: filter rejects increment listings_error but NOT technical_errors"

requirements-completed: [SCRAPE-02, SCRAPE-04, SCRAPE-05, SCRAPE-08, SCRAPE-09]

# Metrics
duration: 7min
completed: 2026-04-26
---

# Phase 08 Plan 06: Extend webhook route — discriminator + Apify ingest + cost cap + scrape_runs lifecycle

**Extended Phase 7 webhook with Apify event-payload ingest, $50/day cost cap, scrape_runs lifecycle row, and FIPE retry-queue flag — Phase 7 stub array contract preserved verbatim.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-26T14:40:11Z
- **Completed:** 2026-04-26T14:46:55Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Body-shape discriminator routes Apify `{resource:{id}}` payloads to `handleApifyRun` and Phase 7 stub arrays to `handleDirectListings` (verbatim move)
- Auth gate hardened: `verifySharedSecret(header, secret)` replaces plain `===` compare (timing-safe per D-01 revised)
- Cost cap (D-02): SUM(scrape_runs.cost_usd) for today UTC; 429 immediately when >= MAX_DAILY_SCRAPE_COST_USD (default 50). No scrape_runs row inserted, no Apify REST call made
- scrape_runs lifecycle (SCRAPE-05): single row per run with status='running' on entry, status='completed'|'failed' + counts + cost_usd + ended_at on exit
- Apify run-meta fetch (SCRAPE-02) + dataset stream (one item at a time via AsyncGenerator) with AbortSignal-based 55s timeout
- FIPE failure path (D-04 / SCRAPE-04): listing inserted with fipe=null + attributes.fipe_retry_pending=true. Plan 08-08 cron will re-enrich
- Filtros eliminatorios (SCRAPE-09): sinistro/leilao listings rejected at normalize boundary, never reach DB; rejects increment listings_error
- Token-scrub: every crash path replaces APIFY_API_TOKEN with [REDACTED] before logging (T-08-06-03)

## Task Commits

1. **Task 1: Refactor + discriminator + verifySharedSecret + handleDirectListings extraction** — `7dd0020` (feat)
2. **Task 2: handleApifyRun full implementation — cost cap + scrape_runs + dataset stream + FIPE retry** — `9434b25` (feat)

_TDD pattern collapsed RED+GREEN into a single commit per task because both tasks touched the same two files atomically._

## Files Created/Modified

- `src/app/api/scrape/webmotors/webhook/route.ts` — Body-shape discriminator + handleApifyRun (cost cap + scrape_runs lifecycle + dataset stream + FIPE retry queue) + handleDirectListings (Phase 7 contract verbatim) + callFipeOrNull helper
- `src/app/api/scrape/webmotors/webhook/route.test.ts` — Extended supabase mock builder with `.gte()` / `.insert()` / `.update()` chains; added Apify client mock; 6 new tests across 3 new describe blocks (apify_run auth ×2, dataset ingest ×2 including sinistro reject, cost_cap ×2 including env override)

## Decisions Made

- **Filter rejects vs technical errors (Rule 1 deviation):** Plan formula `listings_error / total > 0.2 → failed` would have made a 1-item-sinistro-reject run return 502, contradicting the plan's own test expectation (`expect(res.status).toBe(200)`). Fixed by introducing `technical_errors` counter that excludes clean filter rejects (sinistro/leilao/recall). `listings_error` still gets incremented (per must_have spec), but the failure threshold uses `technical_errors`. This matches the spirit of the threshold (catch normalize/upsert bugs, not normal filter behavior).
- **AbortSignal timeout 55s:** Set under Vercel's 60s default Node-runtime timeout to allow graceful failure handling in the catch block.
- **FIPE host resolution:** `VERCEL_URL` env at runtime, `localhost:3000` fallback for tests/dev. Tests don't actually hit FIPE because the ingest test uses raw with `fipe_price` already populated, so `needsFipe=false`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan failure-threshold formula contradicted plan's sinistro test expectation**
- **Found during:** Task 2 (full implementation of handleApifyRun)
- **Issue:** Plan specified `finalStatus = (total > 0 && listings_error / total > 0.2) ? "failed" : "completed"`. With 1 sinistro reject only, this evaluates to 1/1 = 1.0 > 0.2 → "failed" → HTTP 502. Plan's own ingest test asserts `expect(res.status).toBe(200)` for the sinistro-reject case.
- **Fix:** Introduced `technical_errors` counter. `listings_error` still increments on filter rejects (matches must_have spec), but the failure-threshold check uses `technical_errors / total > 0.2`. Filter rejects (sinistro/leilao/recall) increment `listings_error` only; normalize-invalid-data and DB upsert errors increment both.
- **Files modified:** src/app/api/scrape/webmotors/webhook/route.ts (added `technical_errors` local + 3 conditional increments + final-status formula change)
- **Verification:** All 14 webhook tests pass including the sinistro-reject case asserting status=200 + listings_error=1.
- **Committed in:** 9434b25 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix to internal logic to satisfy plan's own test contract)
**Impact on plan:** Pure correctness fix. No scope creep. The formula change makes filter-rejected sinistro/leilao listings return HTTP 200 (correct: filters are doing their job), while still failing the run on actual technical errors (DB failures, normalization invalid_data, crash exceptions).

## Issues Encountered

None blocking. Biome auto-formatted both files after first edit pass; tests still passed after format.

## User Setup Required

None — `MAX_DAILY_SCRAPE_COST_USD` env var optional (defaults to 50). `APIFY_API_TOKEN` already configured per CONTEXT.md. `SCRAPE_WEBHOOK_SECRET` already set in Vercel env from Phase 7.

## Next Phase Readiness

- **Plan 08-08 (FIPE retry cron):** Listings with `attributes->'fipe_retry_pending' = true` are now flagged by this plan's ingest path. The cron route can query and re-enrich them.
- **Plan 08-07 (Apify dashboard wiring):** Webhook URL `/api/scrape/webmotors/webhook` is now production-ready for the Apify Headers template (`X-AutoAgent-Webhook-Secret: <SCRAPE_WEBHOOK_SECRET>`).
- **Phase 9 (matching engine validation):** All 23 matching tests still pass. Phase 7 stub array contract is byte-equivalent (handleDirectListings is the original logic, just relocated below the dispatcher).

## Verification Output

```
pnpm test src/app/api/scrape/webmotors/webhook/route.test.ts --run
  Test Files  1 passed (1)
       Tests  14 passed (14)

pnpm test src/lib/matching/ --run
  Test Files  1 passed (1)
       Tests  23 passed (23)

pnpm test --run
  Test Files  48 passed (48)
       Tests  443 passed (443)

pnpm tsc --noEmit  → exits 0

pnpm exec biome check src/app/api/scrape/webmotors/webhook/route.ts src/app/api/scrape/webmotors/webhook/route.test.ts
  Checked 2 files in 11ms. No fixes applied.
```

All grep-based acceptance criteria pass:
- `verifySharedSecret(header, secret)`: 1 match
- `header !== secret`: 0 matches (plain compare removed)
- `async function handleDirectListings`: 1 match
- `async function handleApifyRun`: 1 match
- `apifyEventSchema`: 3 matches
- `import { verifySharedSecret } from "@/lib/apify/webhook-auth"`: 1 match
- `streamDatasetItems<WebMotorsScraped>`: 1 match
- `getActorRun(payload.resource.id`: 1 match
- `fipe_retry_pending: true`: 1 match
- `cost_cap_exceeded`: 1 match
- `MAX_DAILY_SCRAPE_COST_USD`: 2 matches (docstring + code)
- `.from("scrape_runs")`: 3 matches (cost-cap select, insert running, update final)
- `replace(new RegExp(apifyToken`: 1 match (token scrub)

## Self-Check: PASSED

- `src/app/api/scrape/webmotors/webhook/route.ts` — exists
- `src/app/api/scrape/webmotors/webhook/route.test.ts` — exists
- `.planning/phases/08-scraping-pipeline/08-06-SUMMARY.md` — exists
- Commit `7dd0020` — present in git log
- Commit `9434b25` — present in git log

---
*Phase: 08-scraping-pipeline*
*Completed: 2026-04-26*
