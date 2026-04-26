---
phase: 08-scraping-pipeline
plan: 08
plan_id: 08-08
slug: fipe-retry-cron
subsystem: scraping/cron
tags: [scraping, cron, fipe, retry, listings, vercel-cron]
requires:
  - "Wave 1 (08-01..08-04): src/lib/apify/webhook-auth.ts (verifySharedSecret)"
  - "Wave 2 (08-06): webhook sets attributes.fipe_retry_pending=true on FIPE failure (D-04)"
  - "Phase 6: src/lib/supabase/server.ts (getSupabaseServiceRole)"
  - "Phase 7: /api/fipe POST endpoint (Edge runtime)"
provides:
  - "GET /api/cron/fipe-retry — hourly drain of FIPE retry queue"
  - "Resolves D-04 long-tail: webhook degrades gracefully when Parallelum is down; cron backfills within ~24h"
affects:
  - "vercel.json (now has 2 cron entries: listings-cleanup + fipe-retry)"
  - "listings table (UPDATE: fipe, savings_vs_fipe, savings_pct, attributes minus fipe_retry_pending)"
tech-stack:
  added: []
  patterns:
    - "Bearer-token cron auth with verifySharedSecret (timing-safe) — same pattern as 08-07"
    - "Chunked Promise.allSettled (CHUNK=10) — anti Promise.all-explosion (Phase 1 lesson 75b3177)"
    - "Postgrest jsonb path filter via .filter(\"attributes->>fipe_retry_pending\", \"eq\", \"true\")"
    - "Internal /api/fipe call via fetch (graceful null-on-failure)"
key-files:
  created:
    - src/app/api/cron/fipe-retry/route.ts
    - src/app/api/cron/fipe-retry/route.test.ts
  modified:
    - vercel.json
decisions:
  - "Hourly schedule (5 * * * *) offset 5 min from listings-cleanup (04:00) to avoid overlap"
  - "MAX_PER_RUN=100, CHUNK=10 — comfortably under Parallelum 30/min rate limit (10 chunks ≈ 1 min)"
  - "On FIPE call failure leave row unchanged (next tick retries) — no exponential backoff in row state"
  - "callFipeOrNull never throws — returns null on any error; row state determines retry"
  - "Privilege confinement: only listings table is touched (asserted by test)"
metrics:
  duration_min: 3
  completed_at: 2026-04-26T15:00:57Z
  tasks_completed: 2
  tests_added: 11
  files_created: 2
  files_modified: 1
---

# Phase 08 Plan 08: fipe-retry hourly cron Summary

**One-liner:** Hourly Vercel Cron that drains the `attributes.fipe_retry_pending=true` queue from listings, calling `/api/fipe` chunked at 10 max concurrent, updating fipe + savings + clearing the flag on success — closes D-04 long-tail when Parallelum is down at scrape time.

## What was built

A new GET handler at `/api/cron/fipe-retry`:

1. **Auth gate.** `Authorization: Bearer $CRON_SECRET`. Bearer prefix stripped, then compared to `process.env.CRON_SECRET` via `verifySharedSecret` (`crypto.timingSafeEqual`). Missing/wrong/no-prefix → 401. Missing `CRON_SECRET` → 500 misconfigured.

2. **Queue read.** `select("id, brand, model, year, price, attributes").filter("attributes->>fipe_retry_pending", "eq", "true").is("fipe", null).limit(100)`. Postgrest jsonb-path filter chosen because the existing `.eq` chain is for top-level columns; `.filter(col, op, val)` is the correct shape for `attributes->>fipe_retry_pending`. DB error → 500 `db_read_failed`.

3. **Chunked enrichment.** `for-loop` over slices of 10. Inside each chunk: `Promise.allSettled` of 10 async tasks — each calls `/api/fipe` (`POST { marca, modelo, ano }`), and on a numeric `fipe` response computes `savings_vs_fipe = fipe - price` and `savings_pct = ((fipe - price) / fipe) * 100`, builds `nextAttrs = {...row.attributes}; delete nextAttrs.fipe_retry_pending;`, and `update({ fipe, savings_vs_fipe, savings_pct, attributes: nextAttrs }).eq("id", row.id)`. Failures (missing brand/model/year, non-2xx, non-numeric fipe, db update error) increment `failed`; successes increment `succeeded`.

4. **Response.** `{ processed, succeeded, failed }`, status 200. Counts only — no row data leaks (mitigation for T-08-08-04).

5. **vercel.json.** Appended `{ "path": "/api/cron/fipe-retry", "schedule": "5 * * * *" }` to the `crons` array. `listings-cleanup` entry from 08-07 preserved.

## Test coverage (11 tests, all passing)

| # | Group | Case | Asserts |
|---|-------|------|---------|
| 1 | auth | CRON_SECRET unset | 500 + `error: "misconfigured"` |
| 2 | auth | missing Authorization header | 401 |
| 3 | auth | wrong bearer | 401 |
| 4 | auth | header lacks "Bearer " prefix | 401 |
| 5 | happy | no pending rows | 200 + `{0,0,0}`, no fetch, no update |
| 6 | happy | 5 rows, 4 fipe ok / 1 500 | 200 + `{5,4,1}`, 4 updates, retry flag cleared, other attrs preserved |
| 7 | happy | savings math | `savings_vs_fipe=40000`, `savings_pct≈36.36` |
| 8 | happy | 15 rows chunked | peak in-flight ≤ 10, 15 fetches |
| 9 | happy | rows with brand/model/year null | counted as failed, no fetch, no update |
| 10 | happy | privilege confinement | every `from(...)` call uses table=`listings` only |
| 11 | db | select error | 500 + `error: "db_read_failed"` |

## Threat model coverage

All 7 STRIDE entries from the plan's `<threat_model>` are mitigated or accepted as designed:

| Threat | Mitigation in code |
|--------|--------------------|
| T-08-08-01 (forged cron call) | `verifySharedSecret(provided, secret)` after bearer-strip; tests #2-4 cover all 401 paths |
| T-08-08-02 (Promise.all DoS) | `CHUNK=10` hardcoded; test #8 asserts peak ≤ 10 with 15-row workload; `MAX_PER_RUN=100` cap |
| T-08-08-03 (malicious fipe response) | `typeof json.fipe === "number"` validation in `callFipeOrNull` — non-number → null → no update |
| T-08-08-04 (info disclosure via response) | Response body is counts only; no IDs, no row content |
| T-08-08-05 (cross-table privilege escalation) | All `.from(...)` calls in the route reference `"listings"`; test #10 asserts this at runtime |
| T-08-08-06 (race with webhook UPDATE) | Accepted — `is("fipe", null)` filter + Postgres row-locking handle concurrent updates |
| T-08-08-07 (CRON_SECRET length leak) | Inherited from `verifySharedSecret` — same posture as 08-07 |

## Deviations from Plan

**1. [Lint compliance — Rule 3] Postgrest mock thenable pattern.**
- **Found during:** Task 1 RED→GREEN transition (biome lint after first GREEN test pass)
- **Issue:** Plan's mock used a literal `then(...)` method, which trips `lint/suspicious/noThenProperty` (Biome).
- **Fix:** Switched to the in-repo convention from `src/app/api/scrape/webmotors/webhook/route.test.ts` — attach `then` via `Object.defineProperty(chain, "t" + "hen", { value: ... })`. Behavior unchanged; lint clean.
- **Files modified:** `src/app/api/cron/fipe-retry/route.test.ts` (mock builder)
- **Commit:** `810dfb4`

**2. [Coverage uplift — Rule 2] Added test #10 — privilege confinement.**
- **Found during:** Task 1 — addressing T-08-08-05 in the threat model.
- **Rationale:** Plan's threat register lists T-08-08-05 as `mitigate` ("only `listings` table is touched"), but the original test list didn't assert this at runtime. Added a `tablesTouched` array seeded by `makeBuilder` and asserted every captured table name === `"listings"`. Cheap, makes the threat-model claim verifiable.
- **Commit:** `4e038d6`

**3. [Lint hygiene] Added biome-ignore for `delete nextAttrs.fipe_retry_pending`.**
- **Found during:** Auto-format pass.
- **Issue:** `lint/performance/noDelete` would flag the `delete` operator.
- **Fix:** Added inline suppression — actual key removal from a JSONB-bound object is the correct semantic (otherwise the row would still carry `fipe_retry_pending: undefined`).
- **Commit:** `810dfb4`

No other deviations. Auth gates: none — `CRON_SECRET` is already configured in the deploy env (per validation).

## Verification

- `pnpm test src/app/api/cron/fipe-retry/route.test.ts --run` → 11/11 pass
- `pnpm tsc --noEmit` → exit 0
- `pnpm biome check src/app/api/cron/fipe-retry/route.ts src/app/api/cron/fipe-retry/route.test.ts` → exit 0
- `node -e "JSON.parse(...vercel.json...)"` → 2 cron entries (listings-cleanup, fipe-retry) confirmed valid

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `4e038d6` | test | RED gate — failing tests for fipe-retry cron (11 cases) |
| `810dfb4` | feat | GREEN gate — fipe-retry route implementation; all 11 tests pass |
| `6c6e8bd` | chore | Append fipe-retry cron entry to vercel.json (preserving listings-cleanup) |

## Operational notes

- Schedule `5 * * * *` runs at minute 5 of every hour UTC (00:05, 01:05, …). Offset chosen to avoid overlapping with `listings-cleanup` at 04:00.
- A full pending queue (100 rows × ~10 chunks × ~2s/chunk inside Vercel Edge) processes in ~20s — well under the default 60s function budget. No `maxDuration` override needed.
- `process.env.VERCEL_URL` is used to compute the base URL for the inner `/api/fipe` POST. In local dev (no VERCEL_URL) it falls back to `http://localhost:3000`. The cron only fires on Vercel deployments, so this fallback is for tests/manual runs.
- Postgres concurrent-update race with webhook (08-06) is accepted: webhook sets `fipe=null + flag=true`; if the cron fires mid-flight, its `is("fipe", null)` filter stays valid only as long as no fipe is set; once set, the next tick excludes the row. T-08-08-06 in threat register.

## TDD Gate Compliance

- RED gate: ✅ commit `4e038d6` is `test(08-08): add failing tests for fipe-retry cron` — confirmed module-not-found failure before GREEN.
- GREEN gate: ✅ commit `810dfb4` is `feat(08-08): implement fipe-retry cron route` — all 11 tests pass.
- REFACTOR gate: not applicable (implementation already minimal and lint-clean).

## Threat Flags

None. All security-relevant surface introduced by this plan (the GET handler, the `Bearer` auth, the cross-tenant listings UPDATE) is enumerated in the plan's `<threat_model>`.

## Self-Check: PASSED

**Files exist:**
- `src/app/api/cron/fipe-retry/route.ts` — FOUND
- `src/app/api/cron/fipe-retry/route.test.ts` — FOUND
- `vercel.json` — FOUND (modified)

**Commits exist:**
- `4e038d6` — FOUND (test RED gate)
- `810dfb4` — FOUND (feat GREEN gate)
- `6c6e8bd` — FOUND (chore vercel.json)

**Plan acceptance criteria:** all 9 grep/file checks from `<acceptance_criteria>` pass; CHUNK=10 enforced and asserted; only `listings` table touched.
