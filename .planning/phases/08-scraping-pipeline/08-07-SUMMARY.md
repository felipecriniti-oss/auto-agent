---
phase: 08-scraping-pipeline
plan: 07
subsystem: api
tags: [vercel-cron, supabase, listings, ttl-cleanup, timing-safe-auth, cron]

# Dependency graph
requires:
  - phase: 08-scraping-pipeline
    provides: "verifySharedSecret helper (08-03 wave 1) — timing-safe shared-secret comparison"
  - phase: 06-supabase-integration
    provides: "getSupabaseServiceRole client + listings table (status, last_scraped_at columns)"
provides:
  - "/api/cron/listings-cleanup GET endpoint — daily Vercel Cron callable"
  - "vercel.json crons array entry — first cron config in repo"
  - "D-05 stale TTL cleanup mechanism — listings older than 72h marked status='removed'"
affects:
  - 08-08-PLAN (will also append to vercel.json crons array — must preserve this entry)
  - 09-matching-engine (depends on listings.status='active' filter; cleanup keeps the matcher's input clean)
  - 12-admin-dashboard (will eventually surface scrape_runs + cleanup metrics; this route is the data source for "X listings removed today")

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel Cron auth pattern: GET + Authorization: Bearer $CRON_SECRET, timing-safe via verifySharedSecret"
    - "Service-role batch UPDATE with .lt + .neq filter chain returning only .select('id') (no PII in response)"
    - "vercel.json crons array — first instance in repo; future plans append, never replace"

key-files:
  created:
    - src/app/api/cron/listings-cleanup/route.ts
    - src/app/api/cron/listings-cleanup/route.test.ts
  modified:
    - vercel.json

key-decisions:
  - "Cron schedule '0 4 * * *' (04:00 UTC = 01:00 BRT) — well-spaced from Apify scheduled runs (02:00/14:00 BRT prod) so cleanup never overlaps an active ingest."
  - "Reused verifySharedSecret from plan 08-03 instead of duplicating timingSafeEqual — single source of truth for shared-secret auth."
  - "Used .select('id') — returns only UUIDs (not row contents) so the response { removed: <count> } leaks count only, never PII (T-08-07-06 mitigation)."
  - "TTL_HOURS = 72 hardcoded constant per D-05; matches seed Key questions #3 spec."
  - "BEARER_PREFIX check happens before timing-compare so a malformed header fast-fails without entering the timing-sensitive branch (T-08-07-01 mitigation)."

patterns-established:
  - "Cron route auth: bearer-prefix detect → strip → verifySharedSecret(provided, secret) — usable as-is for any future Vercel Cron in this repo"
  - "Test mock pattern for Supabase update().lt().neq().select() chain — chainable builder returning Promise<{ data, error }>"
  - "vercel.json crons array shape: { path, schedule } objects appended per cron, formatter inlines single-element arrays"

requirements-completed: [SCRAPE-06]

# Metrics
duration: 4min
completed: 2026-04-26
---

# Phase 8 Plan 7: listings-cleanup cron route — D-05 stale TTL 72h Summary

**Daily Vercel Cron at `/api/cron/listings-cleanup` that flips `listings.status` to `'removed'` for any row not re-scraped in 72h, gated by timing-safe `Authorization: Bearer $CRON_SECRET`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-26T14:51:00Z
- **Completed:** 2026-04-26T14:55:00Z
- **Tasks:** 2 (Task 1 split into RED + GREEN per `tdd="true"`)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **D-05 stale cleanup mechanism live.** A separate Vercel Cron now isolates TTL cleanup from the Apify webhook ingest (RESEARCH § Pattern matchings — single-responsibility per route).
- **Timing-safe bearer auth.** Plan 08-03's `verifySharedSecret` helper is now used by both the Apify webhook (custom header) and this cron (bearer-stripped). Same primitive, two protocols.
- **No PII in response.** `.select("id")` + `data.length` projection ensures the response payload is `{ removed: <count> }` only — no row contents leak (T-08-07-06).
- **First crons entry in vercel.json.** Plan 08-08 will append additional entries; the array shape and format precedent are now set.
- **8 unit tests cover every path:** missing secret (500), missing/wrong/no-prefix headers (401×3), happy path with correct count (200), zero matches (200 + 0), 72h cutoff bounds verified within 1s tolerance, db error (500).

## Task Commits

1. **Task 1 RED: failing tests for listings-cleanup** — `0e897de` (test)
2. **Task 1 GREEN: route implementation** — `04764c1` (feat)
3. **Task 2: vercel.json crons entry** — `52fa099` (chore)

_Note: Task 1 had `tdd="true"`, so RED + GREEN were committed separately per the gate-sequence rule._

## Files Created/Modified

- **`src/app/api/cron/listings-cleanup/route.ts`** (NEW) — GET handler. Reads `CRON_SECRET`, validates `Authorization: Bearer <secret>` via `verifySharedSecret`, computes `cutoff = now - 72h`, runs `UPDATE listings SET status='removed' WHERE last_scraped_at < cutoff AND status != 'removed'`, returns `{ removed: <count> }` or well-formed error envelope. `runtime = "nodejs"` + `dynamic = "force-dynamic"`.
- **`src/app/api/cron/listings-cleanup/route.test.ts`** (NEW) — 8 vitest cases. Mocks `@/lib/supabase/server` with a chainable builder that records `update`, `lt`, `neq` calls and resolves `select` with the configured rows or error. Asserts table is `"listings"`, payload is `{ status: "removed" }`, filters are `last_scraped_at` (lt) and `["status", "removed"]` (neq), cutoff is within 1s of `now - 72h`.
- **`vercel.json`** (MODIFIED) — appended `"crons": [{ "path": "/api/cron/listings-cleanup", "schedule": "0 4 * * *" }]` as a new top-level key alongside the existing `functions` config (negotiate/stream + fipe maxDuration preserved).

## Decisions Made

- **Schedule = `0 4 * * *` (04:00 UTC).** Avoids overlap with the Apify scheduled runs which run at 02:00/14:00 BRT (= 05:00/17:00 UTC) in production per phase research. Cleanup at 01:00 BRT = 04:00 UTC sits in the gap between the previous afternoon scrape and the next-day morning scrape — newly-removed rows reflect a full 24h of post-scrape activity.
- **`TTL_HOURS = 72` named constant.** Plan specified 72h; encoded as a top-of-file constant so the schedule can be changed in one place if/when Phase 13 hardening tightens or relaxes the window.
- **Bearer-prefix check fast-fails before timing-compare.** Per T-08-07-01 mitigation: `if (!auth || !auth.startsWith(BEARER_PREFIX)) return 401;` runs in non-constant time on the prefix shape but does not enter the timing-sensitive branch — so an attacker probing `Authorization: x` learns nothing about the secret content or length.
- **Reused biome-ignore pattern from `kill-switch.test.ts`** for `delete process.env.CRON_SECRET`. The repo convention is to suppress `lint/performance/noDelete` with a single-line comment rather than switching to `= undefined` (which Node coerces to the string `"undefined"` and would not actually unset the var).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] biome `noDelete` violations on `delete process.env.CRON_SECRET`**

- **Found during:** Task 1 GREEN (post-test acceptance check `pnpm exec biome check`)
- **Issue:** Plan's verbatim test code used `delete process.env.CRON_SECRET` twice (afterEach + the misconfig test). Biome's `lint/performance/noDelete` rule flagged both. The unsafe-fix suggestion (`= undefined`) is semantically wrong for `process.env` — Node coerces non-string values, so the env var would still exist with the literal string `"undefined"`, breaking the misconfig test.
- **Fix:** Added `// biome-ignore lint/performance/noDelete: process.env requires delete to truly unset` comment above each `delete` site, matching the established pattern at `src/lib/server/kill-switch.test.ts:7,13`.
- **Files modified:** `src/app/api/cron/listings-cleanup/route.test.ts`
- **Verification:** `pnpm exec biome check src/app/api/cron/listings-cleanup/route.test.ts` exits 0; all 8 tests still pass.
- **Committed in:** `0e897de` (RED commit — fix included before commit)

**2. [Rule 3 — Blocking] biome formatter wanted single-line in route.ts and vercel.json**

- **Found during:** Task 1 GREEN (route.ts) and Task 2 (vercel.json)
- **Issue:** Biome's formatter preferred the `Response.json(...)` call inlined to one line, and the `crons: [...]` array inlined to one line for the single-element case. Acceptance criterion required `pnpm lint` exit 0.
- **Fix:** Ran `pnpm exec biome format --write` on both files. No semantic change — pure whitespace.
- **Files modified:** `src/app/api/cron/listings-cleanup/route.ts`, `vercel.json`
- **Verification:** `pnpm exec biome check` exits 0 on both files; tests still 8/8 pass; JSON still parses; cron entry still present.
- **Committed in:** `04764c1` (route.ts) and `52fa099` (vercel.json)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking lint/format gates that would have failed acceptance). No scope creep — both changes are pure-presentation fixes to satisfy the repo's established lint/format conventions.

**Impact on plan:** Zero behavioral impact. Test count, route logic, and JSON validity all unchanged.

## TDD Gate Compliance

Task 1 had `tdd="true"`. Gate sequence verified in git log:

1. **RED gate:** `0e897de test(08-07): add failing tests for listings-cleanup cron route` — written and run BEFORE the route module existed; vitest reported `Failed to resolve import "./route"`, confirming RED.
2. **GREEN gate:** `04764c1 feat(08-07): implement listings-cleanup cron route` — route added; all 8 tests passed on first run.
3. **REFACTOR gate:** Not needed; no refactor commits made (formatter-only changes were folded into the GREEN commit since they preceded it).

Both required gate commits (`test(...)` then `feat(...)`) are present in the correct order.

## Issues Encountered

- **None.** TDD cycle completed in one pass: tests written → route module not found (RED) → minimal implementation → tests pass (GREEN). Lint/format issues were surfaced and fixed before committing.

## Threat Surface Scan

Plan's `<threat_model>` covered the 6 STRIDE entries (T-08-07-01 through T-08-07-06). All "mitigate" dispositions implemented as specified:

- **T-08-07-01 (forged cron call):** verifySharedSecret + bearer-prefix fast-fail — implemented.
- **T-08-07-03 (CRON_SECRET length leak):** Inherited from 08-03's verifySharedSecret — unchanged.
- **T-08-07-04 (SQL injection via cutoff):** Cutoff is `Date.now()`-derived; no user input enters SQL — verified.
- **T-08-07-05 (writes to wrong table):** Static `.from("listings")` — no dynamic table name in code.
- **T-08-07-06 (response PII leak):** `.select("id")` + `data.length` projection — implemented.
- **T-08-07-02 (high-frequency abuse):** "accept" disposition — UPDATE is idempotent; Vercel platform rate-limits crons.

No threat flags raised. No new attack surface introduced beyond what the plan's threat model already covered.

## User Setup Required

**External service config:** `CRON_SECRET` env var must be set in Vercel project settings before the cron runs in production. Vercel auto-injects the same value into the `Authorization: Bearer <secret>` header it sends to the route, so no manual header config is needed.

For local dev: set `CRON_SECRET` in `.env.local` and call the route directly with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/listings-cleanup`.

(No new env var added by this plan — `CRON_SECRET` is the standard Vercel Cron convention; the existing project may already have it set for prior cron experiments. Verify in Vercel dashboard before first scheduled run.)

## Next Phase Readiness

- **Plan 08-08 ready to extend `vercel.json`.** The `crons` array is now in place; 08-08's planner should append additional entries to the existing array, not replace the file.
- **Plan 09 matching engine input is cleaner.** Once this cron starts running, the matcher can rely on `status='active'` filter accurately reflecting "currently in WebMotors inventory" rather than "ever scraped". Reduces false positives in opportunity creation.
- **No blockers.** All acceptance criteria met. tsc clean. tests 8/8 pass. JSON valid.

## Self-Check: PASSED

- [x] `src/app/api/cron/listings-cleanup/route.ts` — FOUND
- [x] `src/app/api/cron/listings-cleanup/route.test.ts` — FOUND
- [x] `vercel.json` — FOUND (modified)
- [x] Commit `0e897de` — FOUND in git log
- [x] Commit `04764c1` — FOUND in git log
- [x] Commit `52fa099` — FOUND in git log
- [x] 8/8 tests pass
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm exec biome check` clean on all touched files
- [x] vercel.json valid JSON with `/api/cron/listings-cleanup` entry preserved alongside existing functions config

---
*Phase: 08-scraping-pipeline*
*Completed: 2026-04-26*
