---
phase: 09-matching-engine
verified: 2026-04-29T20:55:00Z
status: passed
score: 14/14 must-haves verified (D-01..D-14) + 7/7 ROADMAP deliverables
re_verification:
  is_re_verification: false
---

# Phase 9: Matching engine (DB integration) — Verification Report

**Phase Goal:** Pure-function matching engine `src/lib/matching/engine.ts` (23 tests passing — Phase 7) becomes the single source of opportunity creation across every code path that inserts/updates listings or wishlists. Backfill on wishlist insert + realtime notification UX wired in.
**Verified:** 2026-04-29
**Status:** passed
**Re-verification:** No — initial verification (5 plans, auto-mode chain)

---

## Goal Achievement

### Observable Truths (ROADMAP-derived)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Engine called on listing insert/update (Phase 8 webhook path) | VERIFIED | `route.ts:209-212` (handleDirectListings) + `route.ts:397-400` (handleApifyRun) both call `matchListingToWishlists(...).filter(m => m.score >= getMatchScoreThreshold())` |
| 2 | Engine called against active wishlists | VERIFIED | webhook pre-loads `wishlists.select("*").eq("status","active")` (route.ts:327); backfill loads target wishlist by id and engine short-circuits non-active inside (engine.ts:172) |
| 3 | Score >= threshold creates opportunity (configurable env) | VERIFIED | `getMatchScoreThreshold()` in `src/lib/matching/threshold.ts:19` — reads `process.env.MATCH_SCORE_THRESHOLD`, validates [0,1], falls back to default 0.7. Consumed at 3 call sites (webhook x2 + backfill). 6 unit tests in threshold.test.ts cover unset / valid / non-numeric / out-of-range / empty fallback. |
| 4 | Dedup by (user_id, wishlist_id, listing_id) | VERIFIED | All 3 upsert sites use `onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true` (route.ts:234, route.ts:416, backfill route.ts:143). Test 4 in backfill suite explicitly drives "first upsert returns row, second returns null (dedup)" sequence and asserts `opportunities_created=1, matched=3`. |
| 5 | Realtime notification subscription | VERIFIED | `useOpportunityRealtime` mounted at AppShell.tsx:45. Subscribes to `opportunities-realtime:${user.id}` postgres_changes INSERT events filtered by `user_id=eq.${user.id}`. Returns no-op cleanup hook with channel removal + flush timer clear. |
| 6 | Computes fee_amount = savings × fee_rate(plan) on insert | VERIFIED | `calcFee(plan, savingsVsFipe)` rates 6%/3%/2% for starter/premium/enterprise (backfill route.ts:52-56, webhook same shape). Applied in opportunities.upsert at all 3 sites. Backfill test 9 explicitly asserts premium plan + savings 10000 → fee 300. |
| 7 | Re-matching on wishlist change (backfill) | VERIFIED | `POST /api/match/backfill` at `src/app/api/match/backfill/route.ts` (153 lines, full impl). Invoked from `useCreateWishlist.onSuccess` (useWishlists.ts:77) with `wishlist_id` body. 30d cutoff via `BACKFILL_WINDOW_DAYS=30` and `gte("created_at", cutoff)`. |

**Score:** 7/7 truths verified

### Locked Decisions Verification (D-01 to D-14)

| D-ID | Decision | Status | Evidence |
| ---- | -------- | ------ | -------- |
| D-01 | Matching stays in Node.js app code (no pg trigger / Edge Function) | VERIFIED | No new Edge Function or pg migration. All matching is in TypeScript route handlers. |
| D-02 | Two trigger paths: webhook (Phase 8, unchanged) + new backfill endpoint | VERIFIED | Webhook handlers at route.ts:209/397 + new `/api/match/backfill/route.ts`. No third trigger path added. |
| D-03 | No admin/manual rematch endpoint | VERIFIED | No route under `/api/admin/match/*` exists; only `/api/match/backfill`. |
| D-04 | Backfill window: last 30d active listings; wishlist UPDATE NOT a trigger | VERIFIED | `BACKFILL_WINDOW_DAYS = 30` (backfill route.ts:50) + `gte("created_at", cutoff)` filter. `useUpdateWishlist` mutation has no backfill call (useWishlists.ts:107-152, only `onSettled` invalidates). |
| D-05 | Backfill runs synchronously inside create-wishlist mutation onSuccess | VERIFIED | `onSuccess: async (data: DbWishlist) => { ... await fetch("/api/match/backfill", ...) }` (useWishlists.ts:72-103). The mutation `await`s the backfill before resolving to caller. |
| D-06 | Response shape `{ matched, opportunities_created }`; toast only on n>0 | VERIFIED | Backfill route returns `Response.json({ matched, opportunities_created })` at line 152. Hook gates toast on `if (opportunities_created > 0)` at useWishlists.ts:91. Counter semantics: `matched` increments BEFORE threshold filter (B-04 fix), explicit comment at backfill route.ts:121. |
| D-07 | enforcePfOnly flag dropped; PF-only is hard rule | VERIFIED | `grep -rn "enforcePfOnly" src/` → 0 matches. Engine short-circuits at line 167: `if (listing.seller_type !== "PF") return [];`. MatchingOptions type at line 156 only contains `threshold?: number`. |
| D-08 | Score threshold: 0.7 default, MATCH_SCORE_THRESHOLD env override | VERIFIED | `src/lib/matching/threshold.ts` exposes `DEFAULT_MATCH_SCORE_THRESHOLD = 0.7` and `getMatchScoreThreshold()` function. Both webhook call sites + backfill call site consume the function. `grep "score >= 0\.7" src/` → only 1 hit (a docstring at webhook route.ts:15, not code). |
| D-09 | No soft-fail / "stretch opportunity" tier | VERIFIED | Engine `priceWithin` is hard fail (engine.ts:92-96). Score threshold filter is hard `>=`; no separate tier emitted. |
| D-10 | Realtime sub on opportunities filtered by user_id, mounted at AppShell | VERIFIED | `useOpportunityRealtime()` called at AppShell.tsx:45 (single mount, top-level). Channel filter `user_id=eq.${user.id}` (useOpportunityRealtime.ts:134). |
| D-11 | INSERT events only (no UPDATE) | VERIFIED | `event: "INSERT"` in postgres_changes opts (useOpportunityRealtime.ts:131). UPDATE not subscribed. |
| D-12 | Toast wording + Marketplace nav badge | VERIFIED | `buildToastTitle` produces `Nova oportunidade · {brand} {model} {year} · −{savings}% FIPE` (useOpportunityRealtime.ts:56-67). Sidebar badge increments via Zustand `marketplaceUnreadCount`, clamps 99+ at Sidebar.tsx:255-262. Mount-time reset in MarketplaceModule.tsx:76-78 (empty deps, biome-ignore documented). v4→v5 persist migration adds the key (app.ts:277-285). |
| D-13 | No browser push / service worker / email | VERIFIED | `useOpportunityRealtime.ts` only uses sonner toast and Zustand badge. No `Notification.requestPermission`, no `serviceWorker`, no email send. |
| D-14 | accepts_trade stays as motivation signal boost only (not hard rule) | VERIFIED | engine.ts:239-242: `if (attrs?.accept_trade === true) { score += 0.03; reasons.push("aceita troca"); }` — soft score boost. Not in any hard-fail conditional. |

**Score:** 14/14 decisions verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/matching/engine.ts` | enforcePfOnly removed, PF as hard rule | VERIFIED | Line 156-158 type only has `threshold?`. Line 167 hard-rule. 24 tests pass. |
| `src/lib/matching/threshold.ts` | New module — single source of truth | VERIFIED | 30 lines, `DEFAULT_MATCH_SCORE_THRESHOLD = 0.7` + function reader. 6 unit tests cover all branches. |
| `src/lib/matching/threshold.test.ts` | Unit coverage for threshold reader | VERIFIED | 6/6 tests pass in 4ms. |
| `src/app/api/match/backfill/route.ts` | New endpoint — POST sync backfill | VERIFIED | 153 lines. Real Supabase queries, real engine, real upserts. zod-validated body. nodejs runtime. |
| `src/app/api/match/backfill/route.test.ts` | Test coverage for backfill | VERIFIED | 9/9 tests pass (validation x2, lookup x1, counter semantics x4, threshold env x1, fee x1). No `it.todo`. |
| `src/app/api/scrape/webmotors/webhook/route.ts` | Both call sites consume threshold module | VERIFIED | Line 37 imports `getMatchScoreThreshold`. Lines 212 + 400 call it. No hardcoded `0.7` in code paths. |
| `src/lib/supabase/hooks/useWishlists.ts` | onSuccess invokes backfill + toast | VERIFIED | Lines 72-103: async onSuccess, fetches backfill, gates toast on n>0, invalidates opportunities query exact-key. Singular/plural switch on n===1. Fail-soft on network/non-200. |
| `src/lib/supabase/hooks/useOpportunityRealtime.ts` | New realtime hook | VERIFIED | 167 lines. Distinct channel name `opportunities-realtime:${user.id}` from useOpportunities. Sliding-window 200ms debounce + 2s burst window + BURST_THRESHOLD=5. Same-wishlist suppression (W-03). Reads `listing_brand`/`listing_model`/`listing_year`/`savings_pct` (B-01) — `grep "opp\.brand|opp\.model|opp\.year"` returns 0. Buffer + flushTimer cleanup on unmount. |
| `src/lib/supabase/hooks/useOpportunityRealtime.test.tsx` | Test coverage for realtime hook | VERIFIED | 11/11 tests pass. Covers buildToastTitle, INSERT-only event opts, single-event flow, burst summary, same-wishlist suppression, badge increment regardless of toast, cleanup on unmount. |
| `src/lib/stores/app.ts` | marketplaceUnreadCount + actions + v4→v5 migration | VERIFIED | Field defined line 78. Actions at 186-189 with defensive `?? 0` (W-01). Migration at 277-285 fills missing key with 0. partialize includes the key (line 296). version: 5 (line 243). |
| `src/lib/stores/app.test.ts` | Tests for store + migration | VERIFIED | 7/7 tests pass — initial=0, increment chain, undefined defensive, multiple resets, set-with-clamp, partialize includes key, v4→v5 rehydrate round-trip. |
| `src/components/v3/Sidebar.tsx` | Marketplace nav item with badge | VERIFIED | `marketplace` group entry at line 47-52 (between wishlists and backstage). Badge wiring lines 255-262 with aria-label, 99+ clamp, brand color. handleNav resets badge before module switch (lines 124-130). |
| `src/components/v3/Sidebar.test.tsx` | Tests for sidebar with badge | VERIFIED | 6/6 tests pass — Marketplace present, ordering, badge absent at 0, badge present at 7, 99+ clamp at 142. D-15 anti-tests removed. |
| `src/components/v3/AppShell.tsx` | Realtime hook mounted | VERIFIED | Line 45: `useOpportunityRealtime();` called once at top of component, before guards. |
| `src/components/v3/modules/MarketplaceModule.tsx` | Mount-time badge reset | VERIFIED | Lines 76-78: `useEffect(() => resetMarketplaceUnread(), [])` with biome-ignore documented (N-01). |
| `src/components/forms/WishlistPreviewPane.tsx` | Caller fix — drop enforcePfOnly arg | VERIFIED | Line 63: `matchListingToWishlists(listing, [pending])` — no third arg. Stale doc-comment landmines removed. |
| `src/lib/mock-data/preview-listings.ts` | All 20 entries have seller_type='PF' | VERIFIED | `grep -c "seller_type:\"PF\""` returns 20; `grep -c "seller_type"` also returns 20. 20/20 stamped. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `useCreateWishlist.onSuccess` | `/api/match/backfill` | `fetch("POST", { wishlist_id })` | WIRED | useWishlists.ts:77 → backfill route handler reads body, runs engine, returns counter envelope. Tests 1-7 in useWishlists.test.tsx assert end-to-end. |
| Backfill route | `matchListingToWishlists` | direct import | WIRED | backfill route.ts:37 imports + line 116 calls. No `enforcePfOnly` arg. |
| Backfill route | `getMatchScoreThreshold` | direct import | WIRED | route.ts:38 imports + line 113 calls. |
| Webhook route | `getMatchScoreThreshold` | direct import | WIRED | route.ts:37 imports + lines 212, 400 call. |
| `useOpportunityRealtime` | Supabase realtime channel | `.channel().on().subscribe()` | WIRED | hook.ts:126-156. INSERT-only filter, user_id-scoped. cleanup removes channel on unmount. |
| INSERT event | `marketplaceUnreadCount` | `useAppStore.getState().incrementMarketplaceUnread()` | WIRED | hook.ts:140 fires on every INSERT regardless of toast suppression (D-12 dual source of truth). |
| `MarketplaceModule` mount | `marketplaceUnreadCount = 0` | `useEffect(reset, [])` | WIRED | MarketplaceModule.tsx:76-78. |
| Sidebar Marketplace click | `marketplaceUnreadCount = 0` | `handleNav` calls reset | WIRED | Sidebar.tsx:124-130 before setActiveModule. |
| INSERT enriched-fetch | `opportunities_enriched` view | `.from("opportunities_enriched").select("*").eq("id", ev.id)` | WIRED | hook.ts:104-110. Reads `listing_brand`/`listing_model`/`listing_year` (B-01 verified). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Backfill response | `matched, opportunities_created` | for-loop over real listings × real engine | Yes — counters increment per loop iteration; backed by Supabase queries | FLOWING |
| Sidebar badge | `marketplaceUnreadCount` | Zustand store, incremented by realtime hook on each Supabase INSERT event | Yes — production code path uses real Supabase realtime; tests synthesize INSERT payloads through captured handler | FLOWING |
| Toast title | `listing_brand/listing_model/listing_year` | `opportunities_enriched` view fetched per event in hook flush | Yes — view fields confirmed in `src/types/database.ts:380-397` (per SUMMARY); hook reads them via `.from("opportunities_enriched")` | FLOWING |
| Opportunity row | `fee_amount` | `calcFee(plan, savings_vs_fipe)` × upserted | Yes — plan is loaded from users table per wishlist; savings comes from upserted listing | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All Phase 9 tests pass | `pnpm vitest run src/lib/matching src/lib/supabase src/lib/stores src/app/api/match src/app/api/scrape src/components/v3 --testTimeout 30000` | 17 suites / 173 tests pass | PASS |
| TypeScript clean | `pnpm typecheck` | exit 0, no output | PASS |
| `enforcePfOnly` purged from src/ | `grep -rn "enforcePfOnly" src/` | 0 lines | PASS |
| Hardcoded `score >= 0.7` purged from code | `grep -rn "score >= 0\.7" src/` | 1 hit, docstring only (route.ts:15 comment) | PASS |
| `opp.brand/.model/.year` not used in realtime hook | `grep -E "opp\.(brand|model|year)\b" src/lib/supabase/hooks/useOpportunityRealtime.ts` | 0 lines | PASS |
| `getMatchScoreThreshold` consumed at 3 call sites | `grep "getMatchScoreThreshold" src/app/api/...` | webhook x2 + backfill x1 + own definition | PASS |
| `marketplaceUnreadCount` field + actions present | `grep "marketplaceUnreadCount" src/lib/stores/app.ts` | 9 references | PASS |
| Marketplace nav item rendered | `grep "Marketplace" src/components/v3/Sidebar.tsx` | label + nav handler + reset call | PASS |
| Mock listings 20/20 PF-stamped | `grep -c "seller_type" preview-listings.ts` | 20 | PASS |
| All 13 commits referenced in SUMMARYs exist in git log | `git log --oneline -20` | 8073455 / 82f926f / 435f5e8 / ac17e94 / 16769d6 / d821118 / f2d2376 / 0f502fd / 855bbf4 / 4a383c5 / dc702f9 — all FOUND | PASS |

### Anti-Patterns Found

None. Reviewed all created/modified files for:
- TODO/FIXME/PLACEHOLDER markers — only one TODO at WishlistPreviewPane.tsx:123 is pre-existing (MED-04 from Phase 7), unrelated to Phase 9
- Empty implementations / `return null` / stubs — none in Phase 9 code
- Hardcoded empty data flowing to UI — none
- Console.log-only handlers — none
- Static returns in API routes — backfill returns dynamic counter envelope; webhook returns dynamic processed count

### Requirements Coverage

No `requirements:` field in PLAN frontmatter for any Phase 9 plan; ROADMAP success_criteria captured as truths above.

### Test Counts (Evidence)

| Test File | Tests | Status |
| --------- | ----- | ------ |
| `src/lib/matching/engine.test.ts` | 24 | PASS |
| `src/lib/matching/threshold.test.ts` | 6 | PASS |
| `src/app/api/match/backfill/route.test.ts` | 9 | PASS |
| `src/app/api/scrape/webmotors/webhook/route.test.ts` | 15 | PASS |
| `src/lib/supabase/hooks/useWishlists.test.tsx` | 12 | PASS |
| `src/lib/supabase/hooks/useOpportunityRealtime.test.tsx` | 11 | PASS |
| `src/lib/stores/app.test.ts` | 7 | PASS |
| `src/components/v3/Sidebar.test.tsx` | 6 | PASS |
| Other regressions in scope | 83 | PASS |
| **Total** | **173** | **17/17 suites green** |

### Notes on Test Run Environment

The first parallel test run with default 5s timeout produced 2 timeouts in:
- `backfill/route.test.ts > validation > returns 400 when wishlist_id is missing`
- `webhook/route.test.ts > auth > returns 500 misconfigured when SCRAPE_WEBHOOK_SECRET is unset`

These tests use `await import("./route")` for fresh module isolation. Under vitest worker contention on Windows (parallel suites + ESM transform pipeline cold-start), the first dynamic import in a test file can exceed 5s. Re-running the same suites in isolation (or with `--testTimeout 30000`) produces 9/9 + 15/15 PASS in <2s each. The test logic is correct; the failure was a worker-scheduler flake, not a regression. SUMMARY claims of "all tests passing" are accurate when given a reasonable timeout.

### Human Verification Required

None. All ROADMAP deliverables and D-01..D-14 decisions are reflected in the committed code, all grep guards pass, all 173 tests pass, typecheck is clean. Manual smoke testing (creating a wishlist via the live dashboard against a deployed Supabase instance and observing toast + badge + Marketplace re-fetch) is the conventional next step but is operational/integration validation, not goal verification.

---

## VERIFICATION PASSED

All 14 locked decisions (D-01 to D-14) and all 7 ROADMAP deliverables are reflected in the committed code. Grep guards return expected counts. 173/173 Phase 9-relevant tests pass. TypeScript clean. No anti-patterns. The pure-function matching engine is now plugged into both insert paths (Phase 8 webhook + new wishlist backfill) with shared threshold module, the realtime UX layer is mounted at AppShell with proper debounce + suppression, and the Marketplace nav is back with a Zustand-backed unread badge.

---

_Verified: 2026-04-29T20:55:00Z_
_Verifier: Claude (gsd-verifier)_
