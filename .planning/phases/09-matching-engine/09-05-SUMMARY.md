---
phase: 09-matching-engine
plan: 05
plan_id: 09-05
slug: realtime-opportunity-toast
title: useOpportunityRealtime + Marketplace nav badge
type: summary
status: complete
completed_at: "2026-04-29T23:44Z"
duration_min: 9
tags: [matching, realtime, sonner, zustand, sidebar]
requires: [09-03]
provides:
  - useOpportunityRealtime
  - marketplaceUnreadCount
  - Sidebar.Marketplace
  - buildToastTitle
affects:
  - src/lib/stores/app.ts
  - src/lib/supabase/hooks/useOpportunityRealtime.ts
  - src/lib/supabase/hooks/useOpportunityRealtime.test.tsx
  - src/components/v3/AppShell.tsx
  - src/components/v3/Sidebar.tsx
  - src/components/v3/Sidebar.test.tsx
  - src/components/v3/modules/MarketplaceModule.tsx
  - src/lib/stores/app.test.ts
tech-stack:
  added:
    - sonner toast (already a dep, first use in this hook for realtime UX)
  patterns:
    - "vi.hoisted(...) for module-level mock state shared with vi.mock(...)"
    - "Sliding-window debounce w/ ref-tracked event buffer + cancellable timer"
    - "Zustand v4→v5 persist migration with defensive `?? 0` guard (W-01)"
key-files:
  created:
    - src/lib/supabase/hooks/useOpportunityRealtime.ts
    - src/lib/supabase/hooks/useOpportunityRealtime.test.tsx
    - src/lib/stores/app.test.ts
  modified:
    - src/lib/stores/app.ts
    - src/components/v3/AppShell.tsx
    - src/components/v3/Sidebar.tsx
    - src/components/v3/Sidebar.test.tsx
    - src/components/v3/modules/MarketplaceModule.tsx
decisions:
  - "Channel name 'opportunities-realtime:${user.id}' distinct from useOpportunities's 'opportunities:${user.id}' to avoid Supabase Realtime collisions"
  - "BURST_THRESHOLD=5 events/2s window collapses to ONE summary toast with FULL count (not partial)"
  - "Same-wishlist burst suppression: 0 toasts (mutation toast already fired)"
  - "Mixed-wishlist burst: summary toast fires"
  - "Badge increments per event regardless of toast suppression — badge is the persistent 'you have N unread' signal"
  - "MarketplaceModule resets badge on mount via useEffect with empty deps (N-01); Zustand action stable, biome-ignore documented"
  - "v4→v5 migration: missing marketplaceUnreadCount key fills with 0 (W-01)"
metrics:
  tasks: 4
  commits: 4
  test-suites: 12
  tests-total: 107
  tests-new: 24  # 7 app.ts + 11 realtime hook + 4 sidebar (was 2)
---

# Phase 9 Plan 05: useOpportunityRealtime + Marketplace nav badge — Summary

INSERT-only realtime hook driving sonner toasts and a Zustand-backed sidebar
unread badge for the Marketplace module, mounted once at AppShell.

## Hook architecture

`useOpportunityRealtime()` mounts at `AppShell` (one call site) so toasts +
badge updates fire regardless of which dashboard module is active. It is
intentionally **separate** from `useOpportunities` — that hook owns a
`opportunities:${user.id}` channel for query invalidation. Our hook owns
`opportunities-realtime:${user.id}` for UX surface (toast + badge). Distinct
channel names prevent Supabase Realtime conflicts even though both filter
the same table on the same `user_id`.

The hook is a no-op when:
- Supabase is not configured (`isSupabaseConfigured()` false)
- `user` is `null` (pre-auth)

Both conditions short-circuit at the top of the `useEffect` — channel is
never created, no resources allocated.

## Sliding-window flush mechanics

```
INSERT event → push { id, wishlist_id, ts } into buffer ref
            → cancel pending flush timer
            → schedule fresh setTimeout(flush, 200ms)
            → ALSO: incrementMarketplaceUnread() (always)

flush (after 200ms quiet):
  events = buffer.filter(e => now - e.ts < 2000ms)
  if events.length === 0: return
  if events.length >= 5:
    if all share wishlist_id → SUPPRESS (W-03)
    else → toast.success("Nova wishlist gerou {n} oportunidades")
  else:
    for ev in events: fetch enriched + toast.success(buildToastTitle(...))
```

**Why 200ms debounce:** absorbs realistic burst latency (4-8 events from a
backfill landing within a few hundred ms) without delaying the single-event
UX noticeably (a single new opportunity still feels real-time).

**Why 2000ms sliding window:** events older than 2s are dropped from the
burst calculation. A burst is a tightly-clustered storm; trailing events
beyond 2s should be treated as separate beats.

**BURST_THRESHOLD = 5:** below 5 events → individual toasts (high-signal,
each is a meaningful card). At 5+ → summary (avoids spam).

## Same-wishlist suppression (W-03)

When every event in a flush buffer shares the same `wishlist_id`, the
realtime hook drops the summary toast entirely. Rationale: when
`useCreateWishlist` runs `/api/match/backfill` and that endpoint returns
opportunities_created > 0, the mutation toast already informed the user
("Encontramos N oportunidades para essa wishlist"). A second realtime
summary toast would be a double-notification.

When wishlist_ids are MIXED (e.g., backfill on wishlist A racing with a
fresh webhook insert on wishlist B), the summary toast fires normally — the
user is hearing about cross-source activity, which the mutation toast
doesn't cover.

Badge increments per event in BOTH cases. The badge is a persistent count;
the toast is an ephemeral signal. Their wiring is independent.

## buildToastTitle field-name decision (B-01)

The `opportunities_enriched` view exposes `listing_brand`, `listing_model`,
`listing_year`, `savings_pct` (and `listing_km`, `listing_price`,
`listing_fipe`). It does NOT expose bare `brand`, `model`, `year` — those
exist only on the underlying `listings` table, not the join view. See
`src/types/database.ts:380-397`.

`buildToastTitle(opp)` reads exclusively from the `listing_*` columns. The
B-01 grep guard `grep -E "opp\.(brand|model|year)\b"` returns 0 hits in the
hook — verified pre-commit and post-biome.

Brand-dedup: when `listing_model` already starts with `listing_brand`
(case-insensitive), the brand prefix is omitted. So `Honda` + `Honda Civic`
renders as `Honda Civic`, not `Honda Honda Civic`. Null `savings_pct` falls
back to a trailing `· FIPE` segment with no percent.

Title format (verbatim): `Nova oportunidade · {brand|""} {model} {year} · −{round(savings_pct)}% FIPE`
with whitespace collapsed and trimmed.

## Sidebar additions

- New `marketplace` nav item in the `Operação` group, between `wishlists`
  and `backstage`. Icon: `ShoppingBag` from lucide-react.
- Badge: `<span aria-label="${n} novas oportunidades">` rendered only when
  `marketplaceUnreadCount > 0` and `item.key === "marketplace"`. Brand color
  `#4C46DC`, white text, 20px circle, clamps at `99+` for counts >99.
- `handleNav("marketplace")` calls `resetMarketplaceUnread()` before
  switching modules — the user is about to see all the new opportunities,
  so the badge clears immediately.

## Pre/post Sidebar.test.tsx pass state (W-04)

- **Pre-edit:** `pnpm test src/components/v3/Sidebar.test.tsx --run` → 2 tests
  passing (D-15 era — asserted Marketplace was REMOVED).
- **Post-edit:** 6 tests passing — positive Marketplace assertion, ordering
  (Wishlists < Marketplace < Backstage), badge absent at 0, badge present
  with count at 7, 99+ clamp at 142.
- The two D-15 anti-tests (`does not render 'Marketplace'`) are deleted —
  09-05 explicitly reverses that decision per D-12.

## Double-source-of-truth badge

The badge has two sources of truth:
1. Realtime hook **increments** per INSERT event (always, regardless of toast).
2. MarketplaceModule **resets to 0** on mount via `useEffect(reset, [])`.

This gives the user two intuitive guarantees:
- "If I'm viewing the marketplace, I have 0 unread."
- "If I navigate away and a new opportunity lands, the badge shows me."

The empty deps array is intentional (N-01 pre-decision). Zustand action
references are stable per the store's contract — Listing the action in
deps would cause the effect to re-run on every render that subscribes to
the store, wasting work for a one-time mount reset. A `biome-ignore`
comment documents this in MarketplaceModule.tsx.

## v4→v5 persist migration model (W-01)

Bumped store `version: 4 → 5`. Added `if (version < 5)` migration branch
that defensively adds `marketplaceUnreadCount: prev.marketplaceUnreadCount ?? 0`
when the v4-shaped persisted state lacks the key.

The action body also uses the defensive guard:
`incrementMarketplaceUnread: () => set({ marketplaceUnreadCount: (get().marketplaceUnreadCount ?? 0) + 1 })`

so even if migration somehow doesn't run (e.g., test-time setState with
`undefined`), increments land at `1` instead of `NaN`. Verified by test 3 in
`app.test.ts` ("from undefined-key state lands at 1 (W-01 defensive)") and
by test 7 ("v4-persisted state lacking marketplaceUnreadCount migrates to 0").

Test 7 reaches into the persist API via
`(useAppStore as unknown as { persist: { rehydrate(): Promise<void> } }).persist.rehydrate()`
to drive an actual round-trip through the migrate function, validating the
production code path (not just direct setState).

## Test scaffolding decisions

**Hoisted mocks (`vi.hoisted`):** `vi.mock("sonner", ...)` is hoisted to
top-of-file at module-init time. Naively declaring `const toastSuccess = vi.fn()`
above the `vi.mock` call hits a TDZ error: "Cannot access 'toastSuccess'
before initialization". Solution: wrap shared mock state in `vi.hoisted(() => ({ ... }))`
which is also hoisted, and consume via `mocks.toastSuccess` inside the
factory. This is the same pattern used by other hook tests in the codebase.

**Fake timers + `advanceTimersByTimeAsync(250)`:** Tests 6/7 fire 8
synchronous events through the captured handler (each schedules/cancels a
200ms `setTimeout`) and then await `vi.advanceTimersByTimeAsync(250)` to
drain both the debounce and any microtasks. The enriched fetch mock returns
`Promise.resolve(...)` (synchronous resolution after the macrotask) so the
flush function doesn't hang on `await supabase.from(...)`.

**Synchronous enriched-fetch mock:** crucial for tests 4/5 (single-event
toast) — the hook awaits the maybeSingle() call inside flush. Test fixture
`mocks.state.enrichedFixture` is set per-test and the mock returns it via
`Promise.resolve({ data: fixture, error: null })`. In tests 6/7 (burst path),
individual fetches are skipped, so the fixture is irrelevant.

**Handler capture pattern:** the `.on("postgres_changes", opts, handler)`
mock stashes both `opts` and `handler` into hoisted state. Tests then assert
on `opts.event === "INSERT"` and synthesize INSERT payloads via
`fireEvent(id, wishlist_id)` which calls `handler({ new: { id, wishlist_id } })`.

## User-facing changes

**New visible nav item: Marketplace** — appears in the `Operação` group of
the sidebar, between `Minhas Wishlists` and `Backstage`. Uses the
ShoppingBag icon and shows a live unread badge (purple `#4C46DC` circle)
whenever new opportunities have arrived since the user last visited the
module. This is a reversal of D-15 (which removed Marketplace from the
sidebar nav) — see 09-CONTEXT.md D-12 for the rationale.

When the user clicks Marketplace, the badge resets to 0 immediately.

**New realtime toasts** in the dashboard:
- Single new opportunity: `Nova oportunidade · {brand} {model} {year} · −{n}% FIPE`
  with a "Ver" action button that scrolls to the opportunity card.
- Burst from a fresh wishlist (mixed sources): `Nova wishlist gerou {n} oportunidades`.
- Burst from same wishlist: silent (the wishlist creation toast already
  fired).

## Outstanding observability items deferred

- **Backfill-duration metric** — Claude's Discretion item from CONTEXT,
  not surfaced in this plan. Belongs in a future plan that wires structured
  logs / OTEL spans around the `/api/match/backfill` endpoint. Out of scope
  for 09-05 (UX surface only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.mock hoisting collision**
- **Found during:** Task 2 (first test run after writing the file)
- **Issue:** Naive `const toastSuccess = vi.fn()` at top of test file caused
  `ReferenceError: Cannot access 'toastSuccess' before initialization`
  because `vi.mock` is hoisted above the const declaration.
- **Fix:** Refactored shared mock state into `vi.hoisted(() => ({ ... }))`
  so all references inside `vi.mock` factories resolve to a hoisted object.
  This is the canonical Vitest pattern.
- **Files modified:** src/lib/supabase/hooks/useOpportunityRealtime.test.tsx
- **Commit:** part of `855bbf4`

### Coordination notes (not deviations from plan)

**Task 1 commit hash mislabel.** A parallel executor working on Plan 09-04
(useCreateWishlist backfill toast) committed during my Task 1 verification
window. Their commit (`0f502fd`) inadvertently swept up my staged Task 1
files (`src/lib/stores/app.ts`, `src/lib/stores/app.test.ts`) along with
their `useWishlists.test.tsx` work, because the git index is shared between
parallel executors operating on the same working directory. The CONTENT of
my Task 1 work IS in commit `0f502fd` — confirmed via
`git show 0f502fd:src/lib/stores/app.ts | grep marketplaceUnreadCount` (9
matches). The commit message labels it as 09-04, but that's a coordination
artifact, not a code defect. All Task 1 acceptance criteria were verified
against the file state post-commit.

## Authentication gates

None occurred during this plan.

## Tasks + Commits

| Task | Name                                                       | Commit  |
| ---- | ---------------------------------------------------------- | ------- |
| 1    | Zustand marketplaceUnreadCount + v4→v5 migration           | 0f502fd*|
| 2    | useOpportunityRealtime hook + 11-test suite                | 855bbf4 |
| 3    | AppShell mount + Sidebar Marketplace nav with badge        | 4a383c5 |
| 4    | MarketplaceModule mount-time badge reset                   | dc702f9 |

\* Task 1 content landed in `0f502fd` (commit message labelled 09-04 due to
parallel-executor index sharing — see Coordination notes above).

## Self-Check: PASSED

Verified post-write:

**Files:**
- src/lib/supabase/hooks/useOpportunityRealtime.ts — FOUND (166 lines)
- src/lib/supabase/hooks/useOpportunityRealtime.test.tsx — FOUND (254 lines)
- src/lib/stores/app.test.ts — FOUND (in commit 0f502fd, 93 lines)
- src/lib/stores/app.ts — FOUND (modified in 0f502fd, 9 marketplaceUnreadCount refs)
- src/components/v3/AppShell.tsx — FOUND (modified in 4a383c5, useOpportunityRealtime imported + called)
- src/components/v3/Sidebar.tsx — FOUND (modified in 4a383c5, ShoppingBag + marketplace + badge wiring)
- src/components/v3/Sidebar.test.tsx — FOUND (modified in 4a383c5, 6 tests pass)
- src/components/v3/modules/MarketplaceModule.tsx — FOUND (modified in dc702f9, resetMarketplaceUnread on mount)
- .planning/phases/09-matching-engine/09-05-SUMMARY.md — FOUND (this file)

**Commits:**
- 0f502fd — FOUND
- 855bbf4 — FOUND
- 4a383c5 — FOUND
- dc702f9 — FOUND

**Verification:**
- `pnpm typecheck` — 0 errors
- `pnpm biome check src` — 178 files, 0 issues
- `pnpm test src/lib/stores src/lib/supabase src/components/v3 --run` — 12 suites, 107 tests, all pass
- `grep -E "opp\.(brand|model|year)\b" src/lib/supabase/hooks/useOpportunityRealtime.ts` — 0 hits (B-01)
