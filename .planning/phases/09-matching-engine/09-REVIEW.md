---
phase: 09-matching-engine
reviewer: gsd-code-reviewer
reviewed: 2026-04-29T22:30:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/lib/matching/engine.ts
  - src/lib/matching/engine.test.ts
  - src/lib/matching/threshold.ts
  - src/lib/matching/threshold.test.ts
  - src/app/api/match/backfill/route.ts
  - src/app/api/match/backfill/route.test.ts
  - src/app/api/scrape/webmotors/webhook/route.ts
  - src/app/api/scrape/webmotors/webhook/route.test.ts
  - src/lib/supabase/hooks/useWishlists.ts
  - src/lib/supabase/hooks/useWishlists.test.tsx
  - src/lib/supabase/hooks/useOpportunityRealtime.ts
  - src/lib/supabase/hooks/useOpportunityRealtime.test.tsx
  - src/lib/stores/app.ts
  - src/lib/stores/app.test.ts
  - src/components/v3/Sidebar.tsx
  - src/components/v3/Sidebar.test.tsx
  - src/components/v3/AppShell.tsx
  - src/components/v3/modules/MarketplaceModule.tsx
  - src/components/forms/WishlistPreviewPane.tsx
  - src/lib/mock-data/preview-listings.ts
findings:
  critical: 1
  high: 2
  medium: 5
  low: 4
  nit: 3
  total: 15
status: issues_found
verdict: YELLOW
---

# Phase 9: Code Review Report

**Reviewed:** 2026-04-29T22:30:00Z
**Depth:** standard
**Files Reviewed:** 18 source files (engine, threshold module, backfill route, webhook route consumer, realtime hook, Zustand store, Sidebar/AppShell/MarketplaceModule, WishlistPreviewPane, mock listings) + 9 test files
**Verdict:** **YELLOW** — one critical authorization gap in the backfill endpoint, two high-severity correctness/perf issues, and several maintainability nits. None of the highs block the Friday demo *if* the backfill endpoint is reachable only by the same authenticated user (server-trust boundary), but the auth gap MUST be patched before the endpoint sees adversarial traffic.

## Summary

Phase 9 wires the existing pure-function matching engine into two new triggers (wishlist-create backfill + INSERT-only realtime) cleanly. The `threshold.ts` module is well-designed (env override + bounds check + per-call read), the realtime hook's burst debounce + same-wishlist suppression is thoughtful, and the v4→v5 Zustand migration with defensive `?? 0` is exactly right.

However, the backfill endpoint at `src/app/api/match/backfill/route.ts` accepts a `wishlist_id` from the request body and runs the full matching loop **without verifying the caller owns that wishlist**. The endpoint uses `getSupabaseServiceRole()` which bypasses RLS, so any authenticated user can pass any other user's `wishlist_id` and trigger backfill against listings the attacker shouldn't see. Even though the resulting opportunities would be inserted under the *real* owner's `user_id` (the attacker doesn't gain data exfiltration), this is a real cross-tenant abuse vector: it lets attacker A spam-trigger backfills for victim B, burning function-invocation budget and inflating B's `opportunities` table with rows the attacker chose. The route's own docstring at lines 28-32 acknowledges "a stricter X-API-KEY / per-user check is deferred" — which means the team knows this is a gap. For a single-tenant demo on Friday with no real adversaries, this is acceptable; for production it is not.

Two high-severity concerns: (1) the backfill query at `route.ts:101-102` filters listings by `status='active' AND created_at >= cutoff`, but the migrations have **no composite index on `(status, created_at)`** — only `(status, last_scraped_at)` exists. With realistic 30d data of ~5-50k listings the query scans the table linearly; combined with synchronous backfill inside `useCreateWishlist.onSuccess`, this can blow past the 1.5s p99 estimate from CONTEXT and approach the 10s Vercel timeout. (2) Two parallel "default 0.7 threshold" definitions exist — `engine.ts:35 DEFAULT_OPPORTUNITY_THRESHOLD` and `threshold.ts:17 DEFAULT_MATCH_SCORE_THRESHOLD` — contradicting D-08's single-source claim and creating drift risk if anyone tunes one without the other.

The remaining items are quality-of-life: dead code in `engine.ts` (`opportunitiesWorthCreating` is only used by tests), `MatchingOptions` parameter that is read but no longer used inside `matchListingToWishlists`, the realtime hook's `flush()` async path that can fire toasts after unmount in a narrow race window, and a few comment/naming drift items.

## Critical Issues

### CR-01: Backfill endpoint does not verify caller owns the wishlist (cross-tenant abuse)

**File:** `src/app/api/match/backfill/route.ts:58-83`
**Severity:** CRITICAL
**Issue:** The route reads `wishlist_id` from the request body, looks up the wishlist via `getSupabaseServiceRole()` (which bypasses RLS), and proceeds to run backfill without checking that the *current* authenticated user equals `wishlist.user_id`. Any authenticated user can POST `{ wishlist_id: "<someone-elses-uuid>" }` and:

1. Trigger a 30-day-window listings scan + N engine invocations + opportunity upserts on the victim's behalf, burning Vercel function budget the victim pays for via plan tiers.
2. Potentially deduce the existence of wishlists owned by other users (timing attack: `404` vs `200`).
3. Create denial-of-resource conditions if scripted at scale.

The opportunities themselves are still inserted with `user_id: wishlist.user_id` (read from the row, not from the request — that's correct), so direct data exfiltration is not possible. But this is still a real abuse vector that production cannot accept.

The route's own docstring (lines 28-32) flags this: *"A stricter X-API-KEY / per-user check is deferred to a later hardening phase."*

**Fix:**

```typescript
// After parsing wishlist_id, before service-role lookup:
const supabaseServer = await getSupabaseServer();
const { data: { user } } = await supabaseServer.auth.getUser();
if (!user) {
  return Response.json({ error: "unauthenticated" }, { status: 401 });
}

// Then after loading the wishlist row, but before the listings query:
if (wishlist.user_id !== user.id) {
  // Return 404 (not 403) to avoid leaking existence of others' wishlists.
  return Response.json({ error: "wishlist_not_found" }, { status: 404 });
}
```

This adds a server-cookie auth check before any expensive work and a constant-response equality check that prevents both abuse and existence-disclosure timing leaks. For Friday demo it's safe to defer (single-tenant, no adversaries), but the fix should land before any external user can hit this endpoint.

---

## High

### HI-01: Backfill `listings` query has no supporting composite index — risk of 10s Vercel timeout on popular wishlists

**File:** `src/app/api/match/backfill/route.ts:98-102`, `supabase/migrations/0001_init.sql:137-140`
**Severity:** HIGH
**Issue:** The backfill query is:

```typescript
.from("listings").select("*").eq("status", "active").gte("created_at", cutoff)
```

The migration creates four indexes on `listings`:
- `(lower(brand), lower(model), year)` — for engine model lookup
- `(status, last_scraped_at)` — for cron cleanup
- `(seller_uf)` — for region filter
- `(seller_type)` — for PF-only filter

**No index covers `(status, created_at)`.** Postgres will scan the full `listings` table to evaluate the predicate. The CONTEXT D-05 estimate ("30d × ~500 listings = 15k engine invocations × ~0.1ms = ~1.5s") assumes the listings *fetch* is fast — but at 5k-50k rows in production (one full Apify run can populate 1k+ in a session) the sequential scan plus the synchronous round-trip of all rows over the wire dwarfs engine time. Worst case at 50k rows + cold Vercel function + serverless network: **5-10s, which approaches the 10s timeout**.

Additionally, the query selects `*` — every column including potentially-large `attributes` and `motivation_signals` JSONB blobs. The engine only reads a handful of fields.

**Fix (two parts):**

1. Add a migration:
```sql
-- supabase/migrations/0010_listings_status_created_at.sql
create index idx_listings_status_created_at on public.listings(status, created_at desc) where status = 'active';
```
A partial index on `status='active'` is much smaller and exactly matches the backfill filter.

2. (Optional, cheap win) Tighten the column selection to what the engine needs:
```typescript
.from("listings")
.select("id, brand, model, year, km, price, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, days_online, reductions, attributes, motivation_signals, status")
.eq("status", "active")
.gte("created_at", cutoff);
```

Even with the index, dropping `*` reduces wire bytes by ~30-50%. Both fixes together keep p99 well under 2s up to ~50k active listings.

---

### HI-02: Dual sources of truth for default 0.7 threshold contradict D-08 single-source claim

**File:** `src/lib/matching/engine.ts:35` and `src/lib/matching/threshold.ts:17`
**Severity:** HIGH
**Issue:** Two unrelated constants both equal `0.7` and both serve as the "default match score threshold":

```typescript
// engine.ts:35
const DEFAULT_OPPORTUNITY_THRESHOLD = 0.7;

// threshold.ts:17
export const DEFAULT_MATCH_SCORE_THRESHOLD = 0.7;
```

The first is consumed by `opportunitiesWorthCreating` (line 273), the second by `getMatchScoreThreshold()`. D-08 declares `threshold.ts` is the **single source of truth** so that webhook + backfill consumers cannot drift. But anyone who sees `engine.ts:35` and updates only that constant (e.g. for tuning) will silently leave the production code paths still reading the old 0.7 from `threshold.ts`. The reverse is also true: env-overriding `MATCH_SCORE_THRESHOLD=0.6` does NOT change what `opportunitiesWorthCreating` returns, even though the name suggests it should.

`opportunitiesWorthCreating` is currently dead production code (only `engine.test.ts` imports it), but its existence as a public export advertises a parallel-but-broken API.

**Fix:** Either delete `opportunitiesWorthCreating` + `DEFAULT_OPPORTUNITY_THRESHOLD` outright (preferred — it's unused), or refactor it to import `DEFAULT_MATCH_SCORE_THRESHOLD` and `getMatchScoreThreshold()` from `threshold.ts` so there's one constant. Recommended:

```typescript
// engine.ts — remove lines 35 and 264-275 entirely.
// Update engine.test.ts to import from threshold.ts directly:
import { getMatchScoreThreshold } from "./threshold";
// ... and replace opportunitiesWorthCreating(...) calls with
//     matchListingToWishlists(...).filter(m => m.score >= getMatchScoreThreshold())
// to mirror what production code does.
```

If kept for any reason, at minimum delete the duplicate constant and route `opportunitiesWorthCreating` through the threshold module:

```typescript
// engine.ts
import { getMatchScoreThreshold } from "./threshold";

export function opportunitiesWorthCreating(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts: MatchingOptions = {},
): MatchResult[] {
  const threshold = opts.threshold ?? getMatchScoreThreshold();
  return matchListingToWishlists(listing, wishlists, opts).filter((m) => m.score >= threshold);
}
```

---

## Medium

### ME-01: `flush()` can fire stale toasts after unmount in a narrow race window

**File:** `src/lib/supabase/hooks/useOpportunityRealtime.ts:80-124`, `158-164`
**Severity:** MEDIUM
**Issue:** The cleanup function at lines 158-164 clears the pending `flushTimer` and removes the channel. But when `flush()` has already started executing (timer fired, but the function is mid-`await` on `supabase.from("opportunities_enriched").select(...).maybeSingle()`), unmount cannot interrupt it. The hook will:

1. Resolve the enriched fetch.
2. Call `toast.success(...)` after the component is gone.

Sonner is a global singleton, so the toast still renders — usually harmless, but in route-change scenarios (user navigates away from the dashboard mid-burst), the toast appears on the new page out of context. Worse, the `onClick` handler in the action button references `e.id` and sets `window.location.hash = #opportunity-${e.id}` — which on a different route can be confusing UX.

The test at line 202-218 (`removes the channel on unmount + cancels pending flush timer`) only verifies the case where unmount happens BEFORE the timer fires; it doesn't cover the case where unmount happens AFTER the timer fires but BEFORE the await resolves.

**Fix:** Add a mounted-ref guard:

```typescript
useEffect(() => {
  if (!enabled || !user) return;
  let mounted = true;
  // ...
  const flush = async (): Promise<void> => {
    flushTimer.current = null;
    // ...existing logic...
    for (const ev of events) {
      const { data: enriched } = await supabase
        .from("opportunities_enriched").select("*").eq("id", ev.id).maybeSingle();
      if (!mounted) return; // guard against unmount during await
      if (!enriched) continue;
      // ...toast.success...
    }
  };
  // ...
  return () => {
    mounted = false;
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    void supabase.removeChannel(channel);
  };
}, [enabled, user]);
```

Also worth adding a regression test:

```typescript
it("does not fire toasts when component unmounts during in-flight enriched fetch", async () => {
  // Make maybeSingle() return a never-resolving promise initially, fire event,
  // unmount, then resolve the promise, assert no toast called.
});
```

---

### ME-02: Backfill route does not short-circuit on paused/archived wishlist

**File:** `src/app/api/match/backfill/route.ts:81-83, 95-105`
**Severity:** MEDIUM
**Issue:** The route loads the wishlist and only checks `if (!wishlist) return 404`. It does NOT check `wishlist.status === 'active'` before fetching the 30d listings window. If a paused wishlist is somehow targeted (e.g., user pauses just before the create-mutation's `onSuccess` fires the backfill — admittedly rare given `useCreateWishlist` only fires on create not update, but D-04 reserves the right to extend later), the route does the expensive listings query, runs the engine over thousands of listings, and the engine then returns `[]` for every iteration because `engine.ts:172` short-circuits non-active wishlists. Net: zero useful work, full DB cost.

Engine short-circuit is correct as defense-in-depth, but the route should fail fast.

**Fix:**

```typescript
if (!wishlist) {
  return Response.json({ error: "wishlist_not_found" }, { status: 404 });
}
if (wishlist.status !== "active") {
  // Same response shape as a no-op success — caller doesn't care why.
  return Response.json({ matched: 0, opportunities_created: 0 }, { status: 200 });
}
```

---

### ME-03: Same-wishlist suppression treats single-event burst as "all same wishlist" — but the threshold guard makes this benign

**File:** `src/lib/supabase/hooks/useOpportunityRealtime.ts:88-101`
**Severity:** MEDIUM (low-risk false-positive worth noting)
**Issue:** The W-03 same-wishlist suppression check runs only when `events.length >= BURST_THRESHOLD` (5). For 1-4 events, the loop at line 104 fires individual toasts regardless of wishlist correlation. This is correct per D-12 / spec, but consider the realistic edge case: a fresh wishlist that creates exactly 4 opportunities. The mutation toast in `useCreateWishlist` already says "Encontramos 4 oportunidades" → the realtime hook then fires 4 individual toasts on top of that. User sees 5 toasts in 2 seconds for one user action.

This isn't a bug per the locked spec, but it's a UX rough edge worth flagging. The existing 5-event suppression catches the common "8-12 opportunities" case; the gap is exactly 1-4.

**Fix (optional, deferred):** Apply the same-wishlist suppression for any burst (even <5) where every event shares one wishlist_id. The mutation toast is the dual source of truth — extending suppression below the threshold doesn't change the spec, just the heuristic:

```typescript
// After buffer.current = []; if (events.length === 0) return;
const firstWishlist = events[0].wishlist_id;
const allSameWishlist = events.every((e) => e.wishlist_id === firstWishlist);
if (allSameWishlist) {
  // Mutation toast already informed the user — suppress at any burst size.
  return;
}
if (events.length >= BURST_THRESHOLD) {
  toast.success(`Nova wishlist gerou ${events.length} oportunidades`, { duration: 6000 });
  return;
}
// 2-4 events with mixed wishlists — fire individual toasts.
for (const ev of events) { /* ... */ }
```

If left as-is, document the trade-off in `useOpportunityRealtime.ts` so future readers know it's intentional.

---

### ME-04: `MatchingOptions` parameter on `matchListingToWishlists` is silently ignored

**File:** `src/lib/matching/engine.ts:156-158, 163`
**Severity:** MEDIUM
**Issue:** After D-07 dropped `enforcePfOnly`, the `MatchingOptions` type only contains `threshold?: number`, but `matchListingToWishlists` itself never reads `opts.threshold` — only the deprecated `opportunitiesWorthCreating` consumes it. Callers passing `{ threshold: 0.5 }` to `matchListingToWishlists` get the silent default behavior; the option name lies.

```typescript
export type MatchingOptions = {
  threshold?: number; // minimum score to be considered opportunity-worthy
};

export function matchListingToWishlists(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts: MatchingOptions = {},   // ← read but never used in body
): MatchResult[] {
```

**Fix:** Remove the unused `opts` parameter from `matchListingToWishlists` (or implement filtering inside it). Consider removing `MatchingOptions` from the engine entirely and let callers do the threshold filter explicitly via `getMatchScoreThreshold()` (which they already do — see route.ts:212, 400). Cleanest:

```typescript
export function matchListingToWishlists(
  listing: DbListing,
  wishlists: DbWishlist[],
): MatchResult[] {
  // ...existing body...
}
```

This also makes the no-config-needed nature of the engine more obvious.

---

### ME-05: Backfill route uses linear listings × 1-wishlist iteration — fine for sync 30d, but not extensible

**File:** `src/app/api/match/backfill/route.ts:115-150`
**Severity:** MEDIUM
**Issue:** The route iterates listings one-by-one and calls `matchListingToWishlists(listing, [wishlist])` for each. The engine's main loop is `O(wishlists)` so passing a single-wishlist array is fine, but: (a) every match path performs an individual upsert with `await` — one round-trip per match — which is the slow part, and (b) this duplicates the inner-loop pattern of webhook/route.ts:209-242 with subtle differences (counter semantics, but otherwise the same upsert shape).

CONTEXT line 199-202 said: *"Backfill endpoint copies the inner loop verbatim, just iterates wishlist × listings instead of listings × wishlists."* — and indeed it did, but as copy-paste. Future maintenance will need to keep three places in sync (engine + 2 routes). Today this is just a YAGNI nit; if Phase 12 adds a third trigger or modifies the upsert shape, it becomes a real maintenance hazard.

Also: per-match `await` serializes upserts; for a wishlist with 50 above-threshold matches, that's 50 sequential round-trips (~500ms-1s of pure DB latency on top of the listings query).

**Fix (deferred, not blocking):**

1. Extract a shared helper:
```typescript
// src/lib/matching/createOpportunity.ts
export async function upsertOpportunity(
  supabase: SupabaseClient<Database>,
  match: MatchResult,
  ctx: { user_id: string; plan: Plan; savings_vs_fipe: number | null }
): Promise<{ created: boolean }> {
  const fee = calcFee(ctx.plan, ctx.savings_vs_fipe);
  const { data, error } = await supabase.from("opportunities").upsert(/* ... */).select().maybeSingle();
  return { created: !error && data !== null };
}
```
Both webhook handlers + backfill consume this. `calcFee` also moves there.

2. For batch inserts, use `Promise.all` over the matches loop (Supabase pooled connections handle this fine):
```typescript
const matched: { match: MatchResult; created: boolean }[] = await Promise.all(
  toUpsert.map(async (match) => ({ match, created: (await upsertOpportunity(/* ... */)).created }))
);
```

This is a Phase 10+ concern; Phase 9's behavior is correct, just not minimal-coupling.

---

## Low

### LO-01: `console.error("backfill_failed", ...)` mixes structured object and Error in same key

**File:** `src/lib/supabase/hooks/useWishlists.ts:83, 101`
**Severity:** LOW
**Issue:** Two `console.error` calls share the same string key but log different shapes:

```typescript
// Line 83 — structured object
console.error("backfill_failed", { status: res.status, wishlist_id: data.id });

// Line 101 — Error instance
console.error("backfill_failed", err);
```

A log aggregator that filters on the string `backfill_failed` will see two different value shapes for the same event — annoying for anyone trying to query "all backfill failures by wishlist_id" later.

**Fix:**

```typescript
console.error("backfill_failed", {
  reason: "non_2xx",
  status: res.status,
  wishlist_id: data.id,
});
// ...
console.error("backfill_failed", {
  reason: "network_error",
  wishlist_id: data.id,
  error: err instanceof Error ? err.message : String(err),
});
```

Note: existing test at `useWishlists.test.tsx:327` already expects `backfill_failed, expect.any(Error)` — fixing the shape will require updating the test assertion to match the new structured object.

---

### LO-02: `useEffect` empty-deps reset has stale-closure pitfall hidden by Zustand stability

**File:** `src/components/v3/modules/MarketplaceModule.tsx:75-78`
**Severity:** LOW
**Issue:**

```typescript
// biome-ignore lint/correctness/useExhaustiveDependencies: Zustand actions stable; mount-only reset.
useEffect(() => {
  resetMarketplaceUnread();
}, []);
```

The biome-ignore is correct *today* because Zustand actions are stable references. But the more idiomatic pattern that survives any future change to how `resetMarketplaceUnread` is sourced is:

```typescript
useEffect(() => {
  useAppStore.getState().resetMarketplaceUnread();
}, []);
```

This makes the mount-only intent explicit (no React reactivity at all — pulled from the store imperatively) and removes the biome-ignore entirely. Same behavior, less mental overhead.

---

### LO-03: Sidebar reads `marketplaceUnreadCount` selector but does not memoize the badge content

**File:** `src/components/v3/Sidebar.tsx:255-262`
**Severity:** LOW
**Issue:** Every increment of `marketplaceUnreadCount` causes the entire `Sidebar` to re-render (because `useAppStore((s) => s.marketplaceUnreadCount)` triggers re-render on count change). For a typical session with 3-5 INSERTs per minute this is a non-issue, but in burst scenarios (W-03 same-wishlist of 8+ events) the sidebar re-renders 8 times in 200ms. Each render re-computes `GROUPS.flatMap(...)`, the user chip block, and 12+ DOM nodes per nav button.

Not a bug. Phase 9 ships fine. But if the Marketplace badge ever moves to a separate atom or React.memo'd subcomponent, the cost-per-event drops to a single span update.

**Fix (deferred, micro-optimization):** Extract the badge into its own subcomponent that subscribes only to the count:

```typescript
function MarketplaceBadge() {
  const count = useAppStore((s) => s.marketplaceUnreadCount);
  if (count === 0) return null;
  return (
    <span aria-label={`${count} novas oportunidades`} className="...">
      {count > 99 ? "99+" : count}
    </span>
  );
}
```

Then memo the `Sidebar`'s nav button rendering by `item.key`. Phase 12+ if/when the sidebar gets heavier.

---

### LO-04: Backfill test mock allows `users.select("plan").eq("id", x).maybeSingle()` to silently return `null` data

**File:** `src/app/api/match/backfill/route.test.ts:46-60`
**Severity:** LOW
**Issue:** The test builder's `.eq()` `maybeSingle` branch has:

```typescript
if (table === "users") return Promise.resolve(userResult);
return Promise.resolve({ data: null, error: null });
```

But `userResult` is initialized to `{ data: { plan: "starter" }, error: null }` and never reset on a per-test basis between describes. If a future test seeds `userResult = { data: null, error: null }` and forgets to reset it, the next test's `plan` falls back to `"starter"` (per route.ts:94 `?? "starter"`) silently — masking a regression where the user lookup is broken.

The test for fee computation (line 435+) explicitly sets `userResult = { data: { plan: "premium" }, error: null }` and asserts `fee_amount = 300`, so accidental regression to "starter" (6%, fee=600) WOULD be caught. Today this is fine; flagging only because the lifecycle reset at line 156-163 omits `userResult` while resetting `wishlistResult`, `listingsResult`, and `opportunitiesUpsertSequence`.

**Fix:**

```typescript
beforeEach(() => {
  vi.resetModules();
  upsertCalls.length = 0;
  wishlistResult = { data: null, error: null };
  userResult = { data: { plan: "starter" }, error: null }; // ← add this line
  listingsResult = { data: [], error: null };
  opportunitiesUpsertSequence = [];
});
```

---

## Nits

### NI-01: Inconsistent comment dating between code and docs

**File:** `src/components/v3/Sidebar.tsx:125`, multiple files
**Issue:** Inline comments reference `// 09-05:` — useful for recent context but will be confusing in 6 months when "09-05" is ancient history. The `D-07`, `D-12`, etc. references are durable (anchored to phase-locked decisions); the bare plan numbers are not.

**Fix:** Replace `09-05:` with the corresponding D-ID where possible:

```typescript
// D-12: navigating to Marketplace clears the unread badge — the user is
// about to see all the new opportunities in the grid.
```

---

### NI-02: `engine.ts` docstring still references "default 0.7" but engine itself doesn't apply it

**File:** `src/lib/matching/engine.ts:21-23`
**Issue:** The header comment says: *"Caller decides whether to create opportunities (typically score >= threshold, default 0.7)."* — accurate, but a reader landing here will assume the threshold is engine concern. Since the engine has no threshold logic anymore (consumers use `threshold.ts`), the doc should point there:

```typescript
 * Output: MatchResult[] for listings that cleared hard rules. Caller decides
 * whether to create opportunities — typically by filtering on
 * `score >= getMatchScoreThreshold()` from `./threshold`.
```

---

### NI-03: `webhook/route.ts:15` hard-codes `0.7` in docstring

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:15`
**Issue:**

```typescript
 *   5. For each match with score >= 0.7, insert into `opportunities` with a
```

This contradicts D-08 (configurable env var). Verifier already noted this is "docstring only" but it's still drift. Replace with:

```typescript
 *   5. For each match with score >= getMatchScoreThreshold() (default 0.7,
 *      configurable via MATCH_SCORE_THRESHOLD env), insert into
 *      `opportunities` with a computed fee_amount...
```

---

## Summary Table

| Severity | Count |
| --- | --- |
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 4 |
| NIT | 3 |
| **Total** | **15** |

## Verdict: YELLOW

- **GREEN blockers cleared:** No data-corruption bugs. PF-only hard rule is correctly enforced. Dedup constraint exists. v4→v5 migration is defensive. Realtime hook cleans up correctly on unmount (when no in-flight async). 173 tests pass.
- **Why not GREEN:** CR-01 (cross-tenant abuse vector) and HI-01 (missing index → potential 10s timeout) are real production concerns. They do not block Friday demo (single-tenant, no adversaries, ≤500 listings in dev), but they need fixing before the endpoint is exposed publicly.
- **Why not RED:** No CRITICAL data-loss / auth-bypass / silent-corruption bugs. CR-01 is access control on an internal-flagged endpoint, not a complete bypass. HI-01 is a perf cliff, not a guaranteed failure.

---

_Reviewed: 2026-04-29T22:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
