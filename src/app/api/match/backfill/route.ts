/**
 * POST /api/match/backfill
 *
 * Backfills opportunities for a single wishlist against the last 30 days of
 * active listings. Used by useCreateWishlist's onSuccess to give the lojista
 * immediate value after creating a wishlist instead of waiting for the next
 * scrape cycle.
 *
 * Body: { wishlist_id: string }
 *
 * Response 200: { matched: number, opportunities_created: number }
 *
 * Counter semantics (D-06 / B-04 fix):
 *   - matched: count of listings where the engine returned a non-empty
 *     MatchResult (engine hard rules — PF, model, year, km, price, region —
 *     all passed). PRE-threshold count.
 *   - opportunities_created: subset of `matched` where the score also cleared
 *     MATCH_SCORE_THRESHOLD AND the upsert was not a dedup hit.
 *
 * The two numbers are intentionally distinct: a wishlist with 3 listings where
 * all 3 pass engine hard rules, 2 clear the score threshold, and 1 is a dedup
 * hit yields { matched: 3, opportunities_created: 1 } — three distinct numbers
 * tell three distinct stories.
 *
 * Mirrors the inner loop of /api/scrape/webmotors/webhook/route.ts but
 * inverts the iteration (one wishlist × many listings instead of vice versa).
 *
 * Auth: this is a session-authenticated endpoint called from useCreateWishlist.
 * No webhook secret check — the service-role client deliberately bypasses RLS,
 * but inserts are keyed by wishlist.user_id read from the wishlist row, not from
 * the request body, so a malicious caller cannot impersonate another user. A
 * stricter X-API-KEY / per-user check is deferred to a later hardening phase.
 *
 * Runtime: nodejs (service-role Supabase client).
 */

import { matchListingToWishlists } from "@/lib/matching/engine";
import { getMatchScoreThreshold } from "@/lib/matching/threshold";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { DbListing, DbWishlist, Plan } from "@/types/database";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  wishlist_id: z.string().uuid(),
});

const BACKFILL_WINDOW_DAYS = 30;

function calcFee(plan: Plan, savingsVsFipe: number | null | undefined): number {
  if (!savingsVsFipe || savingsVsFipe <= 0) return 0;
  const rate = plan === "enterprise" ? 0.02 : plan === "premium" ? 0.03 : 0.06;
  return Math.round(savingsVsFipe * rate * 100) / 100;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Parse + validate body
  const raw: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const { wishlist_id } = parsed.data;
  const supabase = getSupabaseServiceRole();

  // 2. Load the target wishlist (must exist)
  const { data: wishlist, error: wlErr } = await supabase
    .from("wishlists")
    .select("*")
    .eq("id", wishlist_id)
    .maybeSingle();
  if (wlErr) {
    return Response.json({ error: "db_read_failed", detail: wlErr.message }, { status: 500 });
  }
  if (!wishlist) {
    return Response.json({ error: "wishlist_not_found" }, { status: 404 });
  }

  // 3. Load the user plan for fee computation
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("plan")
    .eq("id", wishlist.user_id)
    .maybeSingle();
  if (userErr) {
    return Response.json({ error: "db_read_failed", detail: userErr.message }, { status: 500 });
  }
  const plan: Plan = (userRow?.plan as Plan | undefined) ?? "starter";

  // 4. Load last-30d active listings
  const cutoff = new Date(Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: listings, error: lErr } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "active")
    .gte("created_at", cutoff);
  if (lErr) {
    return Response.json({ error: "db_read_failed", detail: lErr.message }, { status: 500 });
  }

  // 5. Run engine + insert opportunities
  // Counter semantics (D-06):
  //   matched = listings where engine returned a non-empty MatchResult (PRE-threshold)
  //   opportunities_created = subset that cleared threshold AND was not a dedup hit
  let matched = 0;
  let opportunities_created = 0;
  const threshold = getMatchScoreThreshold();

  for (const listing of (listings ?? []) as DbListing[]) {
    const engineMatches = matchListingToWishlists(listing, [wishlist as DbWishlist]);
    if (engineMatches.length === 0) {
      // Engine hard rules failed (PF/model/year/km/price/region) — not counted.
      continue;
    }
    matched += 1;

    // Threshold filter applies AFTER `matched` increment so a 3-bucket story
    // (engine-pass, threshold-pass, dedup-pass) stays observable in the response.
    const m = engineMatches[0]; // exactly one wishlist passed → at most one MatchResult
    if (m.score < threshold) {
      continue;
    }

    const fee = calcFee(plan, listing.savings_vs_fipe);

    const { data: oppRow, error: oppErr } = await supabase
      .from("opportunities")
      .upsert(
        {
          user_id: wishlist.user_id,
          wishlist_id: m.wishlist_id,
          listing_id: m.listing_id,
          match_score: m.score,
          status: "pending",
          fee_amount: fee,
        },
        { onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();
    if (!oppErr && oppRow) {
      opportunities_created += 1;
    }
  }

  return Response.json({ matched, opportunities_created }, { status: 200 });
}
