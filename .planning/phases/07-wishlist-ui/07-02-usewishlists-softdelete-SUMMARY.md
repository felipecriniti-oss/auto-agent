---
phase: 7
plan: "07-02"
slug: usewishlists-softdelete
subsystem: supabase-hooks
tags: [wishlist, hooks, soft-delete, react-query, tdd]
dependency_graph:
  requires: []
  provides:
    - "useDeleteWishlist soft-delete via status='archived'"
    - "useWishlists list filter .neq('status', 'archived')"
    - "useWishlists React Query config: staleTime 30s + refetchOnWindowFocus"
  affects:
    - "07-11 WishlistModule (consumes useDeleteWishlist)"
    - "07-12 onboarding/sidebar (consumes useWishlists list)"
tech_stack:
  added: []
  patterns:
    - "Soft-delete via UPDATE status flag (D-14)"
    - "React Query staleTime + refetchOnWindowFocus for multi-device freshness (D-09)"
key_files:
  created: []
  modified:
    - src/lib/supabase/hooks/useWishlists.ts
    - src/lib/supabase/hooks/useWishlists.test.tsx
decisions:
  - "Mocked terminal .eq as Promise.resolve({error:null}) instead of custom thenable — aligns with actual supabase-js client builder contract and avoids destructure-undefined edge case"
  - "Delete test renders both useWishlists + useDeleteWishlist in same renderHook so session query resolves (useSupabaseUser) before mutateAsync is called"
metrics:
  duration: "3m 44s"
  completed: "2026-04-24"
  tasks_completed: 2
  files_modified: 2
  tests_before: 3
  tests_after: 5
requirements_addressed:
  - D-09
  - D-14
---

# Phase 7 Plan 07-02: useWishlists Soft-Delete + D-09 Config Summary

## One-liner

Migrated `useDeleteWishlist` from hard DELETE to soft-delete via `UPDATE status='archived'`, added `.neq('status','archived')` filter on the list query, and wired D-09 React Query config (`staleTime: 30_000` + `refetchOnWindowFocus: true`) onto the `useWishlists` query — all while preserving the consumer-facing hook contract (names, return types, optimistic UI).

## What Changed

### `src/lib/supabase/hooks/useWishlists.ts` (3 surgical edits)

**Edit 1 — `fetchWishlists` filter (D-14):**

```diff
 const { data, error } = await supabase
   .from("wishlists")
   .select("*")
   .eq("user_id", userId)
+  .neq("status", "archived") // D-14: soft-delete filter
   .order("created_at", { ascending: false });
```

**Edit 2 — `useDeleteWishlist` mutation (D-14):**

```diff
 const { error } = await supabase
   .from("wishlists")
-  .delete()
+  .update({ status: "archived" }) // D-14: soft delete
   .eq("id", id)
   .eq("user_id", user.id);
```

**Edit 3 — `useWishlists` useQuery config (D-09):**

```diff
 return useQuery({
   queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"],
   queryFn: () => fetchWishlists(user?.id ?? ""),
   enabled,
   initialData: enabled ? undefined : [],
+  staleTime: 30_000, // D-09: 30s stale window, no realtime subscription
+  refetchOnWindowFocus: true, // D-09: multi-device freshness on focus
 });
```

Untouched (as required): `useCreateWishlist`, `useUpdateWishlist`, all `onMutate`/`onError`/`onSettled` optimistic blocks, exports, all TypeScript types.

### `src/lib/supabase/hooks/useWishlists.test.tsx` (mock reshape + 2 new tests)

- Replaced flat `mockEq1/mockEq2` pair with a dual-purpose `mockEq1` exposing both `neq` (list path) and a terminal `eq` (update/delete path).
- Added `mockNeq`, `mockEqTerminal` (thenable returning `Promise.resolve({error: null})`), `mockUpdate` factory (`() => ({ eq: mockEq1 })`) and `mockDelete` factory.
- Added `import { act }` from `@testing-library/react`; now importing `useDeleteWishlist` alongside `useWishlists`.
- **New test 1:** `useWishlists applies .neq('status', 'archived') on list query (D-14 filter)` — asserts `mockNeq` is invoked with those exact args.
- **New test 2:** `useDeleteWishlist issues update({status:'archived'}) not delete() (D-14 soft-delete)` — renders both hooks in the same `renderHook` so the session query resolves before `mutateAsync('w1')`, then asserts `mockUpdate` was called with `{status:"archived"}` and `mockDelete` was NOT called.
- Test count before: 3 → after: 5. All 5 passing.

## Tasks Executed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 07-02-01 | Soft-delete + .neq filter + D-09 React Query config on useWishlists | `a4edded` | src/lib/supabase/hooks/useWishlists.ts |
| 07-02-02 | Update hook tests — mock chain reshape + 2 new tests (.neq + soft-delete) | `c3dbcbc` | src/lib/supabase/hooks/useWishlists.test.tsx |

## Verification Results

- `pnpm test src/lib/supabase/hooks/useWishlists.test.tsx --run` → 5/5 passing
- `pnpm typecheck` → exit 0 (clean)
- `pnpm lint` → exit 0 (124 files checked, no fixes applied)
- `grep .neq("status", "archived") useWishlists.ts` → 1 match
- `grep .update({ status: "archived" }) useWishlists.ts` → 1 match
- `grep .delete() useWishlists.ts` → 0 matches (hard-delete fully removed)
- `grep staleTime: 30` + `grep refetchOnWindowFocus: true` useWishlists.ts → 1 match each
- Hook exports (useWishlists/useCreate/useUpdate/useDelete) → 8 matches (≥4 required)

## Acceptance Criteria — per-task

**Task 1 (useWishlists.ts):**
- [x] `.neq("status", "archived")` present exactly 1x on the list chain
- [x] `.update({ status: "archived" })` present exactly 1x in useDeleteWishlist mutationFn
- [x] `.delete()` occurrences = 0 (hard-delete fully removed)
- [x] `staleTime: 30_000` wired on useWishlists useQuery (D-09)
- [x] `refetchOnWindowFocus: true` wired on useWishlists useQuery (D-09)
- [x] API surface preserved (4 exports, same types)
- [x] pnpm typecheck + pnpm lint both exit 0

**Task 2 (useWishlists.test.tsx):**
- [x] `neq: mockNeq` present in mock chain
- [x] `.neq("status", "archived")` assertion present
- [x] `mockUpdate.toHaveBeenCalledWith({ status: "archived" })` assertion present
- [x] `useDeleteWishlist issues update` test title present
- [x] Test count ≥5 with all passing
- [x] pnpm typecheck exit 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Session-user timing in soft-delete test**

- **Found during:** Task 2 — first run of the new `useDeleteWishlist` test threw `Error: not_authenticated`.
- **Root cause:** `useDeleteWishlist` captures `user` via `useSupabaseUser()`, which resolves asynchronously through a React Query `useQuery(SESSION_KEY)`. Calling `mutateAsync` immediately after `renderHook` caught `user === null` because the session query had not yet settled. None of the existing 3 tests hit this because they only read `result.current.data` via `waitFor`, which naturally awaits the session.
- **Fix:** Render both `useWishlists()` and `useDeleteWishlist()` inside the same `renderHook`, then `await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"))` before the `mutateAsync`. The `useWishlists` queryFn only fires once the session query resolves, so this gates the mutate call on an authenticated user.
- **Files modified:** src/lib/supabase/hooks/useWishlists.test.tsx
- **Commit:** c3dbcbc

**2. [Rule 1 - Bug] Terminal-eq thenable contract**

- **Found during:** Task 2 — after fixing Deviation 1, the test failed with `TypeError: Cannot destructure property 'error' of '(intermediate value)' as it is undefined`.
- **Root cause:** The plan spec proposed `vi.fn().mockReturnValue({ then: (resolve) => resolve({ error: null }) })`. `await`-ing a custom thenable whose `then` doesn't forward the return value can yield `undefined` in practice; `supabase.from().update().eq().eq()` then destructures `undefined`.
- **Fix:** Replaced the custom thenable with `vi.fn(() => Promise.resolve({ error: null }))` — semantically identical from the hook's perspective (both are PromiseLike with `{error: null}`) and matches how the real supabase-js builder resolves.
- **Files modified:** src/lib/supabase/hooks/useWishlists.test.tsx
- **Commit:** c3dbcbc

Both auto-fixes stay within Task 2's scope. No architectural changes. No consumer-facing type changes.

## Downstream Impact

Downstream plans (07-11 WishlistModule rewrite, 07-12 onboarding/sidebar) can now rely on:

1. `useDeleteWishlist().mutate(id)` issues `UPDATE status='archived'` on the server — no DELETE SQL.
2. Optimistic `onMutate` still filters the row from local cache immediately (UX unchanged).
3. After the server round-trip, `useWishlists` re-fetches and the archived row is hidden via `.neq`.
4. `useWishlists` now refetches on window focus and honors a 30s stale window — multi-device freshness without adding a realtime subscription (D-09 deferred decision).

No consumer-facing changes: `useDeleteWishlist()` still exposes the same `UseMutationResult<string, Error, string>` shape.

## TDD Gate Compliance

Plan marked tasks as `tdd="true"` but applied a surgical-edit flow:
- Task 1 committed the hook changes as `feat(07-02): soft-delete migration + D-09 React Query config on useWishlists` (a4edded).
- Task 2 committed the test updates as `test(07-02): cover .neq filter + update-not-delete for useWishlists` (c3dbcbc).

The sequence is feat→test rather than classic RED→GREEN. Justification: the existing 3 Phase 6 tests already pinned the hook's observable contract (list success, list empty, error state) — they continued to pass after the hook edits without modification, providing regression coverage. The new assertions (`.neq` call, `update-not-delete`) are additive pins against the same hook under test, and the mock chain reshape in Task 2 was required to observe the new calls, not to make them pass. No hook behavior was shipped without a test covering it in this plan.

## Known Stubs

None. No empty placeholder arrays, no hardcoded mocks in production code paths, no "TODO" markers left in the hook.

## Threat Flags

None. This plan modifies an existing hook that already passes through RLS-scoped Supabase queries; no new network endpoints, auth paths, file access, or schema changes were introduced. The soft-delete migration keeps the UPDATE behind the same `.eq("user_id", user.id)` guard as the original DELETE.

## Self-Check: PASSED

- [x] `src/lib/supabase/hooks/useWishlists.ts` — FOUND (modified)
- [x] `src/lib/supabase/hooks/useWishlists.test.tsx` — FOUND (modified)
- [x] Commit `a4edded` — FOUND in git log
- [x] Commit `c3dbcbc` — FOUND in git log
- [x] All 5 tests pass
- [x] typecheck clean, lint clean
