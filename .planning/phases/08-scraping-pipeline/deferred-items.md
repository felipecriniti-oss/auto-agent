# Phase 8 — Deferred Items

Out-of-scope discoveries logged during plan execution.

## 08-05 — pre-existing biome lint warning (not introduced by this plan)

- **File:** `src/lib/wishlist/formValuesToPendingWishlist.ts:52, :54`
- **Issue:** Two `// biome-ignore lint/correctness/noUnusedVariables` suppression comments report "Suppression comment has no effect" (biome `suppressions/unused`).
- **Found during:** Plan 08-05 verification (`pnpm lint src/lib/apify/client.ts src/lib/apify/client.test.ts` — biome runs on full repo).
- **Why deferred:** Pre-existing issue, completely unrelated to `src/lib/apify/client.ts` work. Files added by 08-05 (`client.ts`, `client.test.ts`) pass `biome check` cleanly. Out-of-scope per `executor.md` SCOPE BOUNDARY.
- **Action:** Owner of `wishlist/` module to fix in a follow-up commit.

