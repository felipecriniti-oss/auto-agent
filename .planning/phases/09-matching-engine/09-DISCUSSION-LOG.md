# Phase 9: Matching engine — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 09-matching-engine
**Mode:** `--auto` (Claude picked recommended defaults; user authorized via "A" in chat
on 2026-04-29 after reviewing the gray-area summary in the prior turn)
**Areas discussed:** Trigger paths · Backfill scope · PJ filter · Threshold and
soft-fail · Realtime notification UX · Aceita troca

---

## Trigger paths (engine execution location)

| Option | Description | Selected |
|---|---|---|
| Postgres trigger | DB trigger on `listings` INSERT/UPDATE → calls Edge Function → matches → inserts opportunities | |
| **App-code (current)** | Webhook handler + new endpoint call engine inline; reuse Phase 8 path | ✓ |
| Supabase Edge Function | Dedicated Deno function called from webhook + new endpoint | |

**Auto-pick rationale:** TS engine has regex normalize + weighted scoring + motivation-signal boosts; porting to PL/pgSQL is unrealistic. Edge Function adds deployment surface for zero benefit when every realistic insert path goes through Next.js. Phase 8 already proved app-code path works (route.ts:396-417).

---

## Trigger paths — second decision: which paths trigger matching

| Option | Description | Selected |
|---|---|---|
| **Listing + Wishlist INSERT** | Existing webhook (Phase 8) + new `/api/match/backfill` on wishlist create | ✓ |
| Listing + Wishlist INSERT/UPDATE | Same plus rematch on every wishlist edit | |
| Listing only | Skip wishlist backfill — let lojista wait for next scrape cycle | |

**Auto-pick rationale:** Wishlist UPDATE is rare and already idempotent via dedup key `(user_id, wishlist_id, listing_id)`. Skipping listing-only would leave a gap where new wishlists wait hours/days for scrape cycle. Best UX = backfill on insert.

---

## Backfill scope (window of historical listings)

| Option | Description | Selected |
|---|---|---|
| 7 days | Tighter window, ~120 listings | |
| **30 days** | Seed default; ~500 listings; 1.5s worst-case sync | ✓ |
| 90 days | Captures more inventory, but listings >30d are stale (cleanup cron reaps) | |
| All-time | No upper bound | |

**Auto-pick rationale:** Seed §9.5 specifies 30d. Aligns with `listings-cleanup` cron TTL (Phase 8 D-05). Older opportunities are stale.

---

## Backfill execution model

| Option | Description | Selected |
|---|---|---|
| **Sync inside mutation** | `useCreateWishlist` awaits backfill before resolving; toast on success | ✓ |
| Background queue | Enqueue and let cron drain; UI shows "processando" | |
| Fire-and-forget | Trigger but don't block UI | |

**Auto-pick rationale:** 30d × ~500 listings × ~0.1ms = 1.5s p99, well under Vercel function timeout (10s). Sync = simpler debugging + immediate user feedback ("encontramos 3 oportunidades"). Move to background only if production data proves it slow.

---

## PJ filter

| Option | Description | Selected |
|---|---|---|
| Keep `enforcePfOnly` flag | Current state: opt-in via flag, default true | |
| **Hard rule in engine** | Drop flag; PF check is unconditional alongside model/year/km hard rules | ✓ |
| Configurable per wishlist | Add column `wishlists.allow_pj` | |

**Auto-pick rationale:** PRD §NG4 makes "PF non-customer, only lojista" a project-level invariant. A flag that defaults true but can be set false is a footgun. Single source of truth in engine = no surprises. Mocks for preview pane (the only `false` caller) get regenerated with PF entries.

---

## Score threshold

| Option | Description | Selected |
|---|---|---|
| 0.5 | More opportunities, more noise | |
| 0.6 | Mid | |
| **0.7** | Seed default | ✓ |
| 0.8 | Stricter, fewer opportunities | |

**Auto-pick rationale:** Seed §9.3 specifies 0.7. Calibration is Phase 10+ concern; expose as `MATCH_SCORE_THRESHOLD` env var so tuning is deploy-not-rebuild.

---

## Soft-fail (stretch opportunities)

| Option | Description | Selected |
|---|---|---|
| **No soft-fail** | Hard rules short-circuit; price 5% over `price_max` produces no opportunity | ✓ |
| 5% margin tier | Listings within 5% of price_max become "stretch" opportunities | |
| 5% + 10% tiers | Two stretch tiers | |

**Auto-pick rationale:** Seed key question #2 — explicit MVP-hard-fail. Stretch tier without production data = guessing. Captured in Deferred for Phase 10+ revisit.

---

## Realtime notification — subscription scope

| Option | Description | Selected |
|---|---|---|
| **Per-user channel + INSERT only** | `opportunities-{user_id}` channel, INSERT events only | ✓ |
| Single channel + server filter | One shared channel, server-side filter by `user_id` | |
| Per-user + INSERT/UPDATE | Subscribe to all event types | |

**Auto-pick rationale:** INSERT-only avoids duplicate notifications when Phase 12 marketplace UI does optimistic UPDATE flows. Per-user channel is the simpler Supabase pattern (less filter logic, less risk of leaks). UPDATE events live in marketplace UI.

---

## Notification UX

| Option | Description | Selected |
|---|---|---|
| Toast only | sonner toast, dismisses in 6s | |
| Badge only | Sidebar counter increments, no toast | |
| **Toast + badge** | Both — toast for visibility, badge for "I came back later, what did I miss?" | ✓ |
| Toast + badge + persistent feed | Plus inbox dropdown | |

**Auto-pick rationale:** Toast covers the "I'm here right now" case; badge covers the "I came back to the dashboard, did anything happen?" case. Persistent feed is Phase 12 (inbox dashboard) scope. Web push / email is Phase 12+.

---

## "Aceita troca" — Phase 7 deferred decision

| Option | Description | Selected |
|---|---|---|
| **Stay as soft signal** | Engine boosts score +0.2 for trade-friendly listings (current behavior) | ✓ |
| Hard filter (opt-in) | Add column `wishlists.requires_trade`; engine hard-fails if mismatch | |
| Hard filter (always) | Always require listing to accept trade | |

**Auto-pick rationale:** Phase 7 D-10 deferred to Phase 9 to evaluate after seeing real matching behavior. Hard filter would shrink the opportunity pool without proven need; the existing +0.2 boost already surfaces these listings above non-trade competitors when threshold matters. Revisit only if calibration data shows the boost is too weak.

---

## Claude's Discretion (non-discussed, planner decides)

- `OpportunityToast` component variant/icon/CTA wording — UI-SPEC at planning time
- Supabase realtime channel name string — pick simpler per docs
- Backfill endpoint runtime (`nodejs` default, flip to `edge` only if cold-start measured)
- Whether to instrument backfill duration in a `match_runs` table (low-effort = do it; otherwise defer)

## Deferred Ideas

- Stretch-opportunity tier (5-15% above price_max)
- Score threshold tuning (empirical, post-production)
- Match-on-listing-update for price drops (Phase 12 owns)
- Notification dropdown / persistent feed (Phase 12)
- Web push / email notifications (Phase 12+)
- Admin manual rematch endpoint (until production demands)
