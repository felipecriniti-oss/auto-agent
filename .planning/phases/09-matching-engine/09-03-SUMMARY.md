---
phase: 09-matching-engine
plan: 03
plan_id: 09-03
slug: backfill-endpoint
title: POST /api/match/backfill — sync backfill of opportunities for a new wishlist
subsystem: matching-engine
tags: [matching, backfill, api, threshold]
status: complete
completed_at: "2026-04-29T20:30:00Z"
duration_seconds: 540
dependency_graph:
  requires:
    - "Plan 09-01 — engine signature stable, enforcePfOnly flag dropped"
  provides:
    - "POST /api/match/backfill?wishlist_id=<uuid> — sync 30d backfill for one wishlist"
    - "src/lib/matching/threshold.ts — single source of truth for MATCH_SCORE_THRESHOLD"
    - "Disambiguated counter semantics { matched, opportunities_created } (B-04)"
  affects:
    - "src/app/api/scrape/webmotors/webhook/route.ts — both call sites now consume getMatchScoreThreshold()"
    - "useCreateWishlist (Plan 09-04) can now wire onSuccess → /api/match/backfill"
tech_stack:
  added: []
  patterns:
    - "Function-based env reader (not const) so per-request env reads work in serverless and tests"
    - "Sequence-based mock for ordered Supabase responses (CREATE-then-DEDUP rigging)"
    - "matched++ BEFORE threshold filter so the 3-bucket story (engine-pass, threshold-pass, dedup-pass) stays observable"
key_files:
  created:
    - src/lib/matching/threshold.ts
    - src/lib/matching/threshold.test.ts
    - src/app/api/match/backfill/route.ts
    - src/app/api/match/backfill/route.test.ts
  modified:
    - src/app/api/scrape/webmotors/webhook/route.ts
    - src/app/api/scrape/webmotors/webhook/route.test.ts
decisions:
  - "Threshold module exposes a function (not a const) — env-var changes between requests are honored on each call, important for tests that override per case"
  - "Both webhook call sites (handleDirectListings line 212 + handleApifyRun line 400) now consume getMatchScoreThreshold() — D-08 single-source-of-truth holds across all 3 production code paths"
  - "Counter semantics: matched increments INSIDE the listings loop whenever engineMatches.length > 0 (PRE-threshold); opportunities_created only when the upsert returned a row — B-04 fix gives the response triple-storyability (total scanned, engine-pass, materialized opportunity)"
  - "Test 4 fixture uses 3 listings with savings_pct=32/5/32 to build the engine-pass / threshold-fail / dedup-hit buckets cleanly; the dedup hit is rigged via the upsert sequence (first call returns row, second returns null)"
  - "No webhook secret on the backfill endpoint — session-authenticated browser caller, RLS-bypass mitigated by reading user_id from the wishlist row not from the request body"
  - "Direct-mock testing chosen over helper-extraction — the route is short enough that the mock chain (3 tables × ~4 chain methods) is cheap, and keeping POST as a single exported entry preserves the Next.js Route Handler contract"
metrics:
  tasks_total: 3
  tasks_completed: 3
  files_changed: 6
  files_created: 4
  tests_added: 16
  tests_total_after: 66
  duration_seconds: 540
commits:
  - hash: "ac17e94"
    message: "refactor(09-03): extract MATCH_SCORE_THRESHOLD to shared module"
  - hash: "16769d6"
    message: "feat(09-03): POST /api/match/backfill — sync backfill for new wishlists"
  - hash: "d821118"
    message: "test(09-03): vitest coverage for /api/match/backfill — 9 tests, 0 todo"
---

# Phase 9 Plan 03: POST /api/match/backfill Summary

**One-liner:** Shipped the synchronous wishlist-backfill endpoint and centralized `MATCH_SCORE_THRESHOLD` into a shared module so the new route and the existing webhook handler can never drift; the response envelope `{ matched, opportunities_created }` carries disambiguated semantics (engine-pass count vs materialized opportunities).

## What Changed

### Task 1 — Threshold module (`refactor(09-03): extract MATCH_SCORE_THRESHOLD…` — `ac17e94`)

**`src/lib/matching/threshold.ts` (new, 27 lines):**

- `DEFAULT_MATCH_SCORE_THRESHOLD = 0.7`
- `getMatchScoreThreshold(): number` — reads `process.env.MATCH_SCORE_THRESHOLD`, validates it parses to a finite number in `[0, 1]`, otherwise falls back to the default. Function (not const) so per-request env reads work for both serverless reloads and per-test env overrides.

**`src/lib/matching/threshold.test.ts` (new, 51 lines, 6 tests):**

- Default 0.7 when unset
- Returns parsed value for valid input (`"0.5"` → `0.5`)
- Falls back on non-numeric (`"garbage"`)
- Falls back on out-of-range below (`"-0.5"`) and above (`"1.5"`)
- Falls back on empty string (`""`)

**`src/app/api/scrape/webmotors/webhook/route.ts` (2 lines changed):**

- Added import `import { getMatchScoreThreshold } from "@/lib/matching/threshold";`
- Replaced hardcoded `>= 0.7` at **two** sites:
  - `handleDirectListings` line 212 (Phase 7 stub contract — original B-02 fix target)
  - `handleApifyRun` line 400 (Phase 8 Apify pipeline) — surfaced by the sanity grep, fixed in the same edit so D-08 holds across all production code paths
- The plan's grep `score >= 0\.7` returns 0 hits in `src/` (only the `0.7` reference remaining is in a docstring at line 15 documenting the historical behavior)

**`src/app/api/scrape/webmotors/webhook/route.test.ts` (1 new test, 89 lines added):**

The new test `uses getMatchScoreThreshold() — env override changes the cutoff` reuses the existing matching fixture (savings_pct=36.4 + motivated → score ~0.93), sets `MATCH_SCORE_THRESHOLD="0.95"`, and asserts:

- `body.listings_processed === 1` (listing was upserted normally)
- `body.opportunities_created === 0` (engine matched but score 0.93 < 0.95 cutoff)
- No opportunities upsert was attempted (`upsertCalls.find(c => c.table === "opportunities")` returns `undefined`)

The env var is restored in a `finally` block so subsequent tests run against default. The test confirms the threshold is read **per filter call**, not cached at module import.

### Task 2 — Backfill route (`feat(09-03): POST /api/match/backfill…` — `16769d6`)

**`src/app/api/match/backfill/route.ts` (new, 153 lines):**

Five-step structure:

1. **Parse body** — zod `{ wishlist_id: uuid }` schema; 400 on failure with first 5 issues
2. **Load wishlist** — `.select("*").eq("id", wishlist_id).maybeSingle()`; 404 if null, 500 on db error
3. **Load user plan** — `.select("plan").eq("id", wishlist.user_id).maybeSingle()`; defaults to `"starter"` if missing
4. **Load listings** — `.select("*").eq("status","active").gte("created_at", cutoff)` with cutoff = `now - 30 days`
5. **Engine + upsert loop** — for each listing, run `matchListingToWishlists(listing, [wishlist])`. If empty (engine hard rules failed), continue without incrementing. Otherwise `matched += 1`, then check threshold; if cleared, attempt the opportunities upsert with `onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true`. `opportunities_created += 1` only when the upsert returned a row.

**Counter semantics (B-04 fix):**

```
total scanned     = listings.length            (= the count Supabase returned)
engine-pass count = matched                    (engine hard rules satisfied)
materialized      = opportunities_created      (cleared threshold + non-dedup)
```

The 3-bucket fixture from Test 4 makes this concrete: 3 listings, all 3 pass engine hard rules, 1 of those 3 fails threshold (savings_pct=5 → score 0.55), 1 of the 2 above-threshold is a dedup hit. Response: `{ matched: 3, opportunities_created: 1 }`.

**No webhook secret on this endpoint** — it's session-authenticated from the browser via `useCreateWishlist`. The service-role client bypasses RLS, but the insert is keyed by `wishlist.user_id` read from the wishlist row, not from the request body, so a malicious caller cannot impersonate another user. A stricter X-API-KEY / per-user check is deferred to a later hardening phase per the plan note.

`matchListingToWishlists` is called with exactly two arguments — D-07 alignment check from Plan 09-01: the engine takes `(listing, wishlists, opts?)` and we pass no `opts`.

### Task 3 — Backfill tests (`test(09-03): vitest coverage…` — `d821118`)

**`src/app/api/match/backfill/route.test.ts` (new, 461 lines, 9 tests):**

Mocking strategy: hand-rolled service-role mock keyed by table name, with **per-call sequence** for opportunities upserts. The sequence pattern `opportunitiesUpsertSequence = [{ data: row, error: null }, { data: null, error: null }]` lets one test rig "first upsert creates, second is dedup hit" cleanly — essential for Test 4.

The 9 tests, by describe block:

| # | Describe | Test | Asserts |
|---|----------|------|---------|
| 1 | validation | missing wishlist_id → 400 | `body.error === "invalid_body"` |
| 2 | validation | non-uuid wishlist_id → 400 | same |
| 3 | wishlist lookup | wishlist not found → 404 | `body.error === "wishlist_not_found"` |
| 4 | counter semantics | `matched=3, opportunities_created=1` | engine-pass + threshold-pass + dedup-pass distinction (B-04) |
| 5 | counter semantics | `matched=2, opportunities_created=2` | engine-failure (Toyota) does NOT increment matched |
| 6 | counter semantics | idempotent: `matched=3, opportunities_created=0` on re-call | matched preserved, materialized zeroed |
| 7 | counter semantics | PJ inheritance: `matched=1, opportunities_created=1` (1 PF + 1 PJ) | engine short-circuits PJ before matched++ |
| 8 | threshold env override | `MATCH_SCORE_THRESHOLD=0.95` → all 3 (scores 0.83/0.85/0.93) below cutoff | `matched=3, opportunities_created=0`, **N-02 — real test, no it.todo** |
| 9 | fee computation | premium plan, savings_vs_fipe=10000 → fee_amount=300 | 3% rate per plan tier |

Zero `it.todo` shipped (N-02 fix verified by the test count `it` in the file vs `it.todo`).

The mock builder is shared across tests via module-level state that's reset in `beforeEach`. The `vi.resetModules()` call ensures the route module is re-imported per test so the env-override test (#8) doesn't leak into other tests.

## Verification (all green)

| Gate | Command | Result |
|------|---------|--------|
| Threshold tests | `pnpm test src/lib/matching/threshold --run` | 6/6 in 3ms |
| Backfill tests | `pnpm test src/app/api/match/backfill/ --run` | 9/9 in 357ms (no it.todo) |
| Webhook tests (regression + new) | `pnpm test src/app/api/scrape/webmotors/webhook --run` | 15/15 in 854ms |
| Engine tests (no regression) | `pnpm test src/lib/matching --run` | 24+6=30/30 |
| Full plan-relevant suite | `pnpm test src/lib/matching src/app/api/match src/app/api/scrape --run` | 66/66 in 3.84s |
| Typecheck | `pnpm typecheck` | 0 errors |
| Biome (modified dirs) | `pnpm biome check src/lib/matching src/app/api/match` | 6 files, 0 issues |
| Hardcoded threshold sanity | `grep -rn "score >= 0\.7" src/` | 0 lines |
| Threshold call site count | `grep -n "getMatchScoreThreshold" src/app/api/scrape/webmotors/webhook/route.ts` | 3 lines (1 import + 2 call sites) |
| Engine call shape (D-07) | `grep "matchListingToWishlists(listing, \[wishlist as DbWishlist\])"` | exactly 2 args, no opts |

## Counter Semantics — Worked Example

Wishlist W with 3 last-30d listings: A (savings_pct 32 + motivated), B (savings_pct 5), C (savings_pct 32 + motivated, but already an opportunity from prior scrape).

| Listing | Engine result | Score | Threshold check | Upsert result | matched++? | opp_created++? |
|---------|--------------|-------|----------------|---------------|------------|-----------------|
| A | non-empty | ~0.93 | clears 0.7 | row returned | yes | yes |
| B | non-empty | ~0.55 | below 0.7 | not attempted | yes | no |
| C | non-empty | ~0.93 | clears 0.7 | null (dedup) | yes | no |

Response: `{ matched: 3, opportunities_created: 1 }`.

A wishlist with 2 PJ Civics in the listings table would yield: matched=0, opportunities_created=0 (engine short-circuits PJ at the listing level — Plan 09-01 hard rule).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Second hardcoded threshold site in handleApifyRun**

- **Found during:** Task 1 sanity grep
- **Issue:** Plan's `read_first` and `action` for Task 1 both targeted `route.ts:399` (line ~399 in the `handleDirectListings` reference impl quoted in `<interfaces>`). The actual webhook now has TWO call sites: `handleDirectListings` at line 211 (was the original Phase 7 contract path the plan referenced) AND `handleApifyRun` at line 399 (Phase 8 Apify path that landed after the plan was drafted). The sanity grep `grep "score >= 0\.7"` would have flagged both.
- **Fix:** Replaced both `m.score >= 0.7` sites with `m.score >= getMatchScoreThreshold()` in the same edit. D-08 single-source-of-truth would have been violated otherwise — every Apify scheduled run still went through the hardcoded constant.
- **Files modified:** `src/app/api/scrape/webmotors/webhook/route.ts` (2 sites, both fixed)
- **Commit:** `ac17e94`

No other deviations. Plan executed as written for Tasks 2 and 3.

## Authentication Gates

None. Pure unit test + service-role server endpoint. No external services, no secrets validation beyond what already exists in the webhook (and the backfill endpoint deliberately does not require a webhook secret — see plan §<action> notes).

## Stub Tracking

No stubs introduced. The route handler is fully wired: real Supabase queries, real engine, real upserts. No "coming soon" placeholders, no UI rendering of empty data.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unauthenticated-mutation | src/app/api/match/backfill/route.ts | New POST endpoint at trust boundary; no per-user auth check, no webhook secret. Mitigated by reading `user_id` from the wishlist row (not request body), but a caller with any `wishlist_id` UUID can trigger backfill for another user's wishlist (DOS / engine-burn risk, not data exfiltration since opportunities are inserted under the wishlist's owner). Documented as deferred hardening per plan; revisit when the dashboard ships RLS + session checks. |

## Self-Check

- [x] FOUND commit `ac17e94` — `refactor(09-03): extract MATCH_SCORE_THRESHOLD to shared module`
- [x] FOUND commit `16769d6` — `feat(09-03): POST /api/match/backfill — sync backfill for new wishlists`
- [x] FOUND commit `d821118` — `test(09-03): vitest coverage for /api/match/backfill — 9 tests, 0 todo`
- [x] FOUND created file `src/lib/matching/threshold.ts`
- [x] FOUND created file `src/lib/matching/threshold.test.ts`
- [x] FOUND created file `src/app/api/match/backfill/route.ts`
- [x] FOUND created file `src/app/api/match/backfill/route.test.ts`
- [x] FOUND modified file `src/app/api/scrape/webmotors/webhook/route.ts` (import + 2 call sites)
- [x] FOUND modified file `src/app/api/scrape/webmotors/webhook/route.test.ts` (1 new test)
- [x] FOUND this SUMMARY file at `.planning/phases/09-matching-engine/09-03-SUMMARY.md`

## Self-Check: PASSED
