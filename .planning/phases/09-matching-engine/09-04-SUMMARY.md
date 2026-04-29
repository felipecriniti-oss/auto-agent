---
phase: 09-matching-engine
plan: 04
plan_id: 09-04
slug: usecreatewishlist-backfill
title: useCreateWishlist — invoke backfill on success + show "encontramos N oportunidades" toast
subsystem: matching-engine
tags: [matching, hooks, react-query, sonner]
status: complete
completed_at: "2026-04-29T23:38:22Z"
duration_seconds: 240
dependency_graph:
  requires:
    - "Plan 09-03 — POST /api/match/backfill live with { matched, opportunities_created } envelope"
  provides:
    - "useCreateWishlist now triggers /api/match/backfill in onSuccess"
    - "Sonner toast wording 'Encontramos N oportunidade(s) para essa wishlist' (D-06)"
    - "Exact-key invalidate of ['supabase','opportunities',user_id] when n>0"
  affects:
    - "WishlistFormSheet save flow — toast may now fire after wishlist creation when listings backfill matches"
    - "Marketplace tab — react-query cache invalidation triggers refetch after backfill produces opportunities"
tech_stack:
  added: []
  patterns:
    - "vi.spyOn(queryClient, 'invalidateQueries') for exact-key React Query assertions (W-05)"
    - "vi.stubGlobal('fetch', fetchMock) for hook-level fetch mocking inside vitest"
    - "Sonner mock pattern: vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))"
    - "Singular/plural switch in toast wording via inline ternary on count"
key_files:
  created: []
  modified:
    - src/lib/supabase/hooks/useWishlists.ts
    - src/lib/supabase/hooks/useWishlists.test.tsx
decisions:
  - "Toast fires only on opportunities_created > 0 (D-06 — don't notify a non-event)"
  - "Backfill failure (network error or non-200) is fail-soft: console.error + continue; the wishlist insert is never rolled back"
  - "Opportunities query invalidation is gated on opportunities_created > 0 — no point invalidating when nothing was created"
  - "Singular form 'oportunidade' used when n === 1, 'oportunidades' otherwise — Portuguese grammar correctness"
  - "Test 6 captures the exact QueryClient instance via the wrapper helper and spies on invalidateQueries — exact-array match (W-05), not loose containing matcher"
  - "Sonner mock uses success/error/info as separate vi.fn() — mirrors FipeModelCombobox.test.tsx pattern (first hook test in repo to assert against sonner)"
metrics:
  tasks_total: 2
  tasks_completed: 2
  files_changed: 2
  files_created: 0
  tests_added: 7
  tests_total_after: 12
  duration_seconds: 240
commits:
  - hash: "f2d2376"
    message: "feat(09-04): wire useCreateWishlist onSuccess to backfill endpoint"
  - hash: "0f502fd"
    message: "test(09-04): cover useCreateWishlist backfill branch (7 new tests)"
---

# Phase 9 Plan 04: useCreateWishlist Backfill + Toast Summary

**One-liner:** `useCreateWishlist`'s `onSuccess` now POSTs to `/api/match/backfill` and surfaces the count-aware sonner toast "Encontramos N oportunidade(s) para essa wishlist" (D-06) — silent on n=0, fail-soft on network errors, exact-key React Query invalidation verified by spy assertion.

## What Changed

### Task 1 — Hook implementation (`feat(09-04): wire useCreateWishlist onSuccess to backfill endpoint` — `f2d2376`)

**`src/lib/supabase/hooks/useWishlists.ts` — onSuccess body, before vs after:**

Before (3 lines):

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"] });
},
```

After (32 lines, async + data param):

```typescript
onSuccess: async (data: DbWishlist) => {
  queryClient.invalidateQueries({ queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"] });

  // D-05: sync backfill against the last 30d of listings.
  try {
    const res = await fetch("/api/match/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wishlist_id: data.id }),
    });
    if (!res.ok) {
      console.error("backfill_failed", { status: res.status, wishlist_id: data.id });
      return;
    }
    const { opportunities_created } = (await res.json()) as {
      matched: number;
      opportunities_created: number;
    };
    // D-06: only toast when something happened.
    if (opportunities_created > 0) {
      toast.success(
        `Encontramos ${opportunities_created} oportunidade${opportunities_created === 1 ? "" : "s"} para essa wishlist`,
        { duration: 5000 },
      );
      queryClient.invalidateQueries({
        queryKey: ["supabase", "opportunities", user?.id ?? "anon"],
      });
    }
  } catch (err) {
    console.error("backfill_failed", err);
  }
},
```

Key invariants preserved:
- `mutationFn` untouched — wishlist insert path unchanged
- Original `WISHLISTS_KEY` invalidation still fires unconditionally
- `data` parameter is the resolved value of `mutationFn` (`DbWishlist`) — react-query passes it as the first onSuccess arg
- Two distinct invalidate calls: wishlists (always) + opportunities (only when n>0)

### Task 2 — Test coverage (`test(09-04): cover useCreateWishlist backfill branch (7 new tests)` — `0f502fd`)

**`src/lib/supabase/hooks/useWishlists.test.tsx` — 5 → 12 tests (+7 new).**

Test count delta:

| Before | Added | After |
|--------|-------|-------|
| 5 (existing useWishlists list/error/D-14 + soft-delete) | 7 (new `useCreateWishlist — backfill` describe) | 12 |

The 7 new tests in `describe("useCreateWishlist — backfill")`:

| # | Test | What it asserts |
|---|------|-----------------|
| 1 | calls /api/match/backfill with the inserted wishlist_id after successful insert | fetch called with URL + POST + correct body `{wishlist_id: "w-new"}` |
| 2 | fires a sonner toast when opportunities_created > 0 | `toast.success` called with `/Encontramos 3 oportunidades para essa wishlist/`, duration 5000 |
| 3 | uses singular form when opportunities_created === 1 | `oportunidade` (singular), and explicitly NOT `oportunidades` |
| 4 | does NOT fire a toast when opportunities_created === 0 | `toast.success` not called (D-06) |
| 5 | logs and continues silently when backfill fetch fails (network error) | `console.error("backfill_failed", Error)`, mutation still resolves with `id="w-new"` |
| 6 | logs and continues silently when backfill returns non-200 | `console.error("backfill_failed", {status:500, wishlist_id})`, mutation still resolves, no toast |
| 7 | invalidates opportunities query with exact key when opportunities_created > 0 | **W-05**: `invalidateSpy.toHaveBeenCalledWith({queryKey:['supabase','opportunities','user-1']})` — exact-array match |

Note: I added test #3 (singular form) on top of the plan's 6 — the plan's `<acceptance_criteria>` for Task 1 explicitly required "singular/plural correction (oportunidade vs oportunidades)", so an explicit dedicated test felt appropriate. All other tests follow the plan's test list 1:1.

#### Sonner mock pattern (precedent for hook tests)

This is the first hook test in the repo to assert against sonner. The mock mirrors `FipeModelCombobox.test.tsx:6` precedent but extends it to all three toast methods:

```typescript
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { toast } from "sonner";
```

Future hook tests asserting against sonner should follow the same shape — mock all 3 methods so a hook that pivots from `success` to `error` doesn't silently bypass an existing mock.

#### W-05 spy pattern (exact-key React Query invalidation assertion)

The plan's W-05 fix (avoid loose `containing` matchers on `queryKey`) required spying on the exact `QueryClient` instance the hook closes over. Pattern used in test #7:

```typescript
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
});
const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

// renderCreateHook accepts an optional explicit QueryClient and uses it inside
// the wrapper, so the hook closes over THIS instance and the spy sees its calls.
const { result } = renderCreateHook(queryClient);
// ... mutateAsync ...

// Exact-array match — not toHaveBeenCalledWith({queryKey: expect.arrayContaining([...])}).
expect(invalidateSpy).toHaveBeenCalledWith({
  queryKey: ["supabase", "opportunities", "user-1"],
});
expect(invalidateSpy).toHaveBeenCalledWith({
  queryKey: ["supabase", "wishlists", "user-1"],
});
```

The trick was building a `renderCreateHook(qc?)` helper that accepts an explicit `QueryClient`, so test #7 can capture the same instance the hook closes over while leaving the other 6 backfill tests using a fresh per-test client. Future hook tests that need exact-key assertions can copy this pattern verbatim.

#### Fetch mocking via `vi.stubGlobal`

```typescript
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
```

Per-test `mockResolvedValue` / `mockRejectedValue` calls rig the response. `fetchMock.mockReset()` in the new `describe`'s `beforeEach` ensures no leakage between tests in the new describe block (the existing `useWishlists` block already had its own `vi.clearAllMocks` and doesn't touch fetch).

## Verification (all green)

| Gate | Command | Result |
|------|---------|--------|
| Wishlists hook tests | `pnpm test src/lib/supabase/hooks/useWishlists --run` | 12/12 in 994ms |
| Full supabase suite (regression) | `pnpm test src/lib/supabase --run` | 27/27 in 4.12s |
| Matching suite (regression) | `pnpm test src/lib/matching --run` | 30/30 in 1.65s |
| Typecheck | `pnpm typecheck` | 0 errors |
| Biome (modified dir) | `pnpm biome check src/lib/supabase/hooks` | 11 files, 0 issues |
| Acceptance grep — fetch URL | `grep "/api/match/backfill" src/lib/supabase/hooks/useWishlists.ts` | 1 line (line 77) |
| Acceptance grep — toast call | `grep "toast.success" src/lib/supabase/hooks/useWishlists.ts` | 1 line (line 92) |

### Manual smoke (deferred to next /app session)

The plan's `<verification>` lists a manual smoke: create a wishlist via /app, observe (a) network tab shows POST /api/match/backfill 200, (b) if n>0 a toast appears, (c) marketplace tab re-fetches.

This is an integration-level check that requires the app running with a live Supabase instance and seeded listings — out of scope for the unit-test gate. It's safe to run during the next dev-session smoke pass once Plan 09-05 (realtime sub) lands and the dashboard can demonstrate the full backfill→toast→marketplace-refresh chain end to end.

## Deviations from Plan

### Auto-fixed issues

None — Tasks 1 and 2 executed as written.

### Out-of-scope files swept into Task 2 commit (acknowledge)

The Task 2 commit `0f502fd` unexpectedly includes two files outside this plan's scope:

- `src/lib/stores/app.test.ts` (new, +93 lines) — a marketplace-unread-badge test
- `src/lib/stores/app.ts` (modified, +28 lines) — adds `marketplaceUnreadCount` + `incrementMarketplaceUnread` / `resetMarketplaceUnread` / `setMarketplaceUnread` actions

These appear to be Plan 09-05 (realtime sub / D-12) groundwork that was already staged in the index from a prior agent's session before this executor started — `git add src/lib/supabase/hooks/useWishlists.test.tsx` only stages that one path, but the index already contained the others. There are no `.husky` / `.git/hooks` pre-commit hooks active in this repo to explain the inclusion.

The included changes are forward-compatible (additive store fields, no breaking changes), and Plan 09-05 is the next plan in this same phase, so the work is not lost — but it lands in a 09-04 commit where it doesn't belong. Documenting here so the 09-05 executor knows this code already exists and doesn't re-add it. The summary's `metrics.files_changed` reports 2 (only the plan's own files); the extra two are not 09-04 deliverables.

A clean fix (revert + re-commit without the extras) would require destructive git operations the executor charter prohibits without explicit user instruction.

### Tests added beyond the plan's list

Plan listed 6 new tests; I shipped 7. The extra test (#3 — "uses singular form when opportunities_created === 1") is justified by Task 1's `<acceptance_criteria>`: "The toast wording uses the singular/plural correction (oportunidade vs oportunidades)". Tests 2 and 3 together pin both branches of the inline ternary; without test 3, a regression that always emitted "oportunidades" on n=1 would slip through.

## Authentication Gates

None. Hook unit tests against mocked Supabase; no external services.

## Stub Tracking

No stubs introduced. The hook is fully wired:

- Real `fetch` call to `/api/match/backfill` (mocked in tests, real in production)
- Real `toast.success` import from sonner (mocked in tests)
- Real `queryClient.invalidateQueries` calls

No "coming soon" placeholders, no mock data flowing to UI, no UI rendering empty state from this hook.

## Threat Flags

None. The hook is a thin client of the already-deployed `/api/match/backfill` endpoint. The endpoint's threat surface (unauthenticated mutation across user wishlists) was flagged in 09-03-SUMMARY.md and remains the single entry point — this hook does not widen it.

## Self-Check

- [x] FOUND commit `f2d2376` — `feat(09-04): wire useCreateWishlist onSuccess to backfill endpoint`
- [x] FOUND commit `0f502fd` — `test(09-04): cover useCreateWishlist backfill branch (7 new tests)`
- [x] FOUND modified file `src/lib/supabase/hooks/useWishlists.ts` (line 77 contains `/api/match/backfill`, line 92 contains `toast.success`)
- [x] FOUND modified file `src/lib/supabase/hooks/useWishlists.test.tsx` (12 tests, including 7 in `describe("useCreateWishlist — backfill")`)
- [x] FOUND this SUMMARY file at `.planning/phases/09-matching-engine/09-04-SUMMARY.md`
- [x] Acknowledged out-of-scope files in Task 2 commit (`src/lib/stores/app.ts`, `src/lib/stores/app.test.ts`) — not 09-04 deliverables; documented above

## Self-Check: PASSED
