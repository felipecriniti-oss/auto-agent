# Phase 9: Matching engine (DB integration) — Context

**Gathered:** 2026-04-29 (auto-mode discussion, recommended defaults)
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure-function matching engine (`src/lib/matching/engine.ts`, 23 tests passing — built in
Phase 7) becomes the **single source of opportunity creation** across every code path that
inserts/updates listings or wishlists.

Phase 8 already wired the matching engine into the Apify webhook handler (Option B from
the seed, route.ts:396-417 — listing upsert → match → opportunity insert with dedup +
fee compute). This phase **completes the loop** by adding the two missing trigger paths
that the seed surfaces, plus the realtime notification layer that turns matches into
visible UX:

1. **Backfill on wishlist insert/edit** — when a lojista creates a wishlist, run the
   engine against existing listings (last 30d) so they don't have to wait for the next
   scrape cycle to see opportunities.
2. **Realtime notification** — Supabase realtime subscription on `opportunities` filtered
   by `user_id`; toast + sidebar badge when a new opportunity lands.
3. **PJ filter hardening** — make `seller_type='PF'` a hard rule in the engine itself
   (currently a flag `enforcePfOnly` defaulting to true, with one caller passing false).

**Out of scope:**
- Edge Function or pg trigger (option A from seed) — keep matching in app code; Phase 8
  webhook + new backfill endpoint cover all realistic insert paths
- Notification dropdown / persistent feed — Phase 12 inbox dashboard owns that
- Algorithm tuning (threshold, soft-fail) beyond MVP defaults — calibration is a Phase 10+
  concern once production data lands
- Admin UI for opportunity inspection — Phase 12

</domain>

<decisions>
## Implementation Decisions

### Trigger paths

- **D-01:** Keep matching execution **in Node.js app code**, not Postgres triggers or
  Supabase Edge Functions. The TypeScript engine (regex normalize, weighted scoring,
  motivation-signal boosts) is too complex to port to PL/pgSQL, and Edge Function adds
  deployment complexity for zero benefit when every realistic insert path goes through
  Next.js anyway. Reasoning recorded so a future contributor doesn't re-evaluate.
- **D-02:** Trigger paths are exactly two:
  1. **Listing insert/update** → existing webhook handler (Phase 8) — already wired, no
     change in this phase.
  2. **Wishlist insert** → new endpoint `POST /api/match/backfill` invoked by
     `useCreateWishlist` after the optimistic insert resolves. Wishlist UPDATE is **not**
     a backfill trigger (see D-04).
- **D-03:** No admin/manual rematch endpoint in this phase. If a re-match is needed for
  ops debugging, the dev runs the matching engine via a one-off script. Phase 12 may add
  an admin-facing button if real ops demand it.

### Backfill scope

- **D-04:** Backfill window: **listings created in the last 30 days** with
  `status='active'`. Older listings get reaped by `listings-cleanup` cron anyway and
  their opportunities are stale. Wishlist UPDATE does NOT re-trigger backfill — edits
  are rare, the dedup key `(user_id, wishlist_id, listing_id)` already prevents
  duplicate inserts when the next scrape arrives, and re-running on every keystroke
  edit would burn function-invocation budget.
- **D-05:** Backfill runs **synchronously inside the create-wishlist mutation** path —
  `useCreateWishlist` awaits the insert, then awaits POST `/api/match/backfill?wishlist_id=...`
  before resolving. Worst-case 30d × ~500 listings = 15k engine invocations × ~0.1ms each
  = ~1.5s, well within Vercel's 10s function default. If this gets slow on production
  data we move to a background job in Phase 12.
- **D-06:** Backfill response shape: `{ matched: number, opportunities_created: number }`.
  The mutation surfaces `opportunities_created > 0` via toast — "Encontramos N
  oportunidades para essa wishlist" — overlapping with the realtime toast (D-09) is OK;
  the realtime sub kicks in only after the page-level mutation toast has fired.

### PJ filter

- **D-07:** Remove the `enforcePfOnly` flag from the engine API entirely. Make
  `seller_type === 'PF'` a **hard rule** at the top of the engine (alongside model/year/km
  hard rules). Only call site that currently passes `false` is the wishlist preview pane
  in Phase 7 (`WishlistPreviewPane.tsx:67`) — that pane shows projected matches against
  the mock listings dataset, where `seller_type` is mostly `null`/`PJ` because the mocks
  predate the PF-only rule. The fix is to **regenerate the mocks** with `seller_type='PF'`
  on every entry, then drop the flag. Single source of truth for "PJ never produces an
  opportunity."

### Threshold and soft-fail

- **D-08:** Score threshold for opportunity creation: **0.7** (default from seed). Stored
  as `MATCH_SCORE_THRESHOLD` env var with code default `0.7` if unset. Calibration is a
  Phase 10+ concern once we have production data — leave the knob exposed but don't tune
  it now. Hard rules continue to short-circuit before scoring (model/year/km/price/region
  fail → 0 match, no row).
- **D-09:** No soft-fail / "stretch opportunity" tier in this phase. If a listing's price
  is 5% above `wishlist.price_max`, it does not produce an opportunity. Seed flagged this
  as MVP-hard-fail; we keep that. Stretch tier is an idea worth exploring once we see
  real data — captured in Deferred.

### Realtime notification UX

- **D-10:** **Supabase realtime subscription** on the `opportunities` table, filtered by
  `user_id = auth.uid()`. Subscribe in `/app/layout.tsx` (or a top-level provider) so the
  sub is alive on every dashboard view, not just on `/app/marketplace`.
- **D-11:** Listen to **INSERT events only**. UPDATE events (status transitions like
  `pending → assumed`) are owned by Phase 12's marketplace UI which has its own
  optimistic update flow — replaying them as toasts would create duplicate notifications.
- **D-12:** Toast UX: `sonner` toast with the listing summary —
  `"Nova oportunidade · {brand} {model} {year} · −{savings_pct}% FIPE"` — duration 6s,
  action button "Ver" routes to `/app#opportunity-{id}`. Sidebar badge "Marketplace
  ({n})" increments via a Zustand counter; counter is reset to actual count on dashboard
  mount (so a refresh re-syncs from DB rather than relying on sticky client state).
- **D-13:** No browser push notifications, no service worker, no email. Realtime is in-tab
  only. Push is Phase 12+ scope when the marketplace dashboard owns the notification feed.

### "Aceita troca" — Phase 7 deferred decision

- **D-14:** Phase 7 deferred whether `accepts_trade` should become a hard filter
  (`07-CONTEXT.md` D-10). **Decision: stays as motivation signal boost only**. Hard rule
  would shrink the opportunity pool without proven value, and the engine already gives
  these listings a +0.2 score boost which surfaces them above non-trade listings when the
  threshold matters. Revisit only if calibration data shows the boost isn't strong enough.

### Claude's Discretion

- Concrete shape of `OpportunityToast` component (variant, icon, button label) — UI-SPEC
  in planning step will resolve.
- Exact channel name for the Supabase realtime sub (`opportunities-{user_id}` vs single
  shared channel with server-side filter) — pick the simpler option per Supabase docs at
  planning time.
- Backfill endpoint runtime — `nodejs` is the default; flip to `edge` only if a real
  cold-start measurement justifies it. Default is nodejs.
- Whether to instrument backfill duration with a `scrape_runs`-like observability table —
  if planner judges low-effort, do it; otherwise defer to Phase 12.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 9 source-of-truth files

- `.planning/phases/09-matching-engine/09-PHASE-SEED.md` — original goal, scope sections
  9.1-9.5, key questions answered above
- `src/lib/matching/engine.ts` — pure function, 278 lines, **already implements** all
  scoring rules from seed §9.1. Review before changing anything.
- `src/lib/matching/engine.test.ts` — 246 lines, 23 tests. Any engine change must keep
  these green and add new tests for the rule it touches.

### Phase 7 + 8 prior decisions that constrain this phase

- `.planning/phases/07-wishlist-ui/07-CONTEXT.md` D-10 — `accepts_trade` deferred to
  Phase 9; resolved in this CONTEXT D-14 (stays as soft signal).
- `.planning/phases/08-scraping-pipeline/08-CONTEXT.md` — webhook handler matches inline
  after listing upsert; this phase reuses the same path for the listing trigger and only
  adds the wishlist trigger.
- `src/app/api/scrape/webmotors/webhook/route.ts` lines 396-417 — reference
  implementation of "match after upsert + dedup + fee compute". The new backfill endpoint
  mirrors this exact pattern but iterates the inverse direction (one wishlist × many
  listings).

### Project-level

- `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` §NG4 — PF
  is non-customer, only the lojista is the user; matching never produces an opportunity
  where the seller is PJ (D-07).
- `.planning/PIVOT-3.md` — phase order; Phase 9 unblocks Phase 13a (billing) by ensuring
  opportunities are flowing end-to-end before Stripe Checkout goes live.

### Existing patterns to mirror (codebase scout)

- `src/lib/supabase/hooks/useWishlists.ts` — React Query mutation pattern with
  optimistic insert. Backfill call wraps inside `onSuccess` to keep optimistic UX intact.
- `src/components/ui/sonner.tsx` (via `Toaster` mounted in `app/layout.tsx`) — toast
  primitive; D-12 toast uses this.
- Zustand store at `src/lib/store/dashboardStore.ts` (or whatever the `Marketplace (n)`
  badge currently reads from) — the realtime sub increments the same counter the badge
  already reads.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/lib/matching/engine.ts`** — pure function `matchListingToWishlists(listing,
  wishlists, opts)`. **Already implements** Phase 9 §9.1 scoring rules. The only API
  change this phase needs is removing the `opts.enforcePfOnly` flag (D-07). Tests must
  be updated to drop the `enforcePfOnly: false` cases and replace with positive PF-only
  expectations.
- **`useCreateWishlist`** — React Query mutation in `src/lib/supabase/hooks/
  useWishlists.ts`. Add `onSuccess` callback that POSTs to `/api/match/backfill` with the
  freshly inserted `wishlist_id`. Optimistic update path stays untouched.
- **`useListingsSnapshot`** hook in same dir — already returns the last-30d listings
  used by Phase 7 preview. The backfill endpoint can use this same query (server-side
  via Supabase service-role client) so the "what counts as recent" definition stays in
  one place.
- **Phase 8 webhook handler** at `src/app/api/scrape/webmotors/webhook/route.ts` lines
  396-417 — reference impl of "engine call → opportunity insert with dedup + fee compute".
  Backfill endpoint copies the inner loop verbatim, just iterates wishlist × listings
  instead of listings × wishlists.

### Established Patterns

- **API routes under `src/app/api/`** with `nodejs` runtime, service-role Supabase
  client, zod-validated request body. Pattern from
  `src/app/api/scrape/webmotors/webhook/route.ts`.
- **Sonner toasts** for transient notifications, Zustand for persistent counters
  (sidebar badge). Don't mix.
- **React Query keys** shape: `["supabase", "<table>", userId]`. Realtime sub for
  opportunities should invalidate `["supabase", "opportunities", userId]` on every
  INSERT event so the marketplace tab re-fetches in addition to the toast firing.

### Integration Points

- **`/api/match/backfill`** — new file `src/app/api/match/backfill/route.ts`.
- **Realtime subscription** — likely a new client-side hook
  `src/lib/supabase/hooks/useOpportunityRealtime.ts` mounted from a top-level layout or
  provider (whichever is the highest-level component that wraps every dashboard view).
- **Engine API change** — drop `enforcePfOnly` parameter. Single-line breaking change
  with two call sites: webhook handler (already passes default true) and preview pane
  (currently passes false → must regenerate mocks with PF, then drop the param).

</code_context>

<specifics>
## Specific Ideas

- **Mock regeneration for preview pane:** when D-07 lands, every entry in
  `src/lib/mock-data/preview-listings.ts` (20 listings, top BR seminovos) needs
  `seller_type: 'PF'` set explicitly. The mocks already include realistic PF behavior
  patterns (motivation signals, days_online); only the `seller_type` field needs adding
  uniformly.
- **Backfill toast wording:** `"Encontramos {n} oportunidades para a wishlist {name}"`
  on success when `n > 0`; suppress toast when `n = 0` (don't notify a non-event).
- **Realtime toast wording:** `"Nova oportunidade · {brand} {model} {year} ·
  −{savings_pct}% FIPE"` — rounds savings_pct to integer, omits brand if model already
  contains it (e.g., "Honda Civic" not "Honda Honda Civic").
- **Sidebar badge debounce:** if 5 INSERT events arrive within 2s (e.g., a fresh wishlist
  backfill that creates 8 opportunities), debounce the toast — show one summary toast
  "Nova wishlist gerou {n} oportunidades" instead of 8 individual toasts. The badge
  increments on every event; only the toast UX is debounced.

</specifics>

<deferred>
## Deferred Ideas

- **Stretch-opportunity tier** — listings 5-15% above `price_max` could become a separate
  tier in the marketplace ("quase no seu orçamento"). Worth exploring once production
  data shows the strict-fail rate. Phase 10+ calibration item.
- **Score threshold tuning** — `0.7` is a guess. Phase 10/11 will have outcome data
  (deals closed × initial match score) that lets us tune empirically.
- **Match-on-listing-update for price drops** — currently the webhook calls the engine
  on listing UPDATE too (route.ts:391-393), but the dedup key prevents creating a *new*
  opportunity when the same listing+wishlist already exists with `status='pending'`.
  When a price drops 10% on a stale opportunity, we could push a "price drop" event
  rather than a new opportunity. Phase 12 inbox dashboard owns this.
- **Notification dropdown / persistent feed** — D-13 explicitly excludes this; lives in
  Phase 12.
- **Web push / email notifications** — Phase 12+ when the user has invested enough in the
  product to want out-of-tab notifications.
- **Admin manual rematch endpoint** — D-03 excludes; ad-hoc dev script suffices until
  production demands a UI.

</deferred>

---

*Phase: 09-matching-engine*
*Context gathered: 2026-04-29 via /gsd-discuss-phase 9 --auto*
