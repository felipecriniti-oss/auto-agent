/**
 * POST /api/scrape/webmotors/webhook
 *
 * Stub ingest endpoint — bridges Phase 8's scraper output into the matching
 * engine + DB. The real Apify scheduled run hits this endpoint with a batch
 * of normalized listings.
 *
 * Flow:
 *   1. Auth: x-scrape-webhook-secret header must equal SCRAPE_WEBHOOK_SECRET.
 *      Returns 401 otherwise.
 *   2. Body: array of listings matching WebhookListing (zod-validated).
 *   3. For each listing: upsert into `listings` by fingerprint.
 *   4. For each upserted listing, run matchListingToWishlists against every
 *      active wishlist (across ALL users — service role bypasses RLS).
 *   5. For each match with score >= 0.7, insert into `opportunities` with a
 *      computed fee_amount from plan tier + savings. Duplicate
 *      (user_id, wishlist_id, listing_id) inserts are NOOP via the unique
 *      constraint (onConflict: do nothing).
 *   6. Return { listings_processed, opportunities_created, details }.
 *
 * Curl example (local):
 *   curl -X POST http://localhost:3000/api/scrape/webmotors/webhook \
 *     -H "Content-Type: application/json" \
 *     -H "x-scrape-webhook-secret: $SCRAPE_WEBHOOK_SECRET" \
 *     -d '[{"source":"webmotors","source_listing_id":"wm-test-1",
 *           "fingerprint":"fp-test-1","brand":"Honda","model":"Civic",
 *           "year":2020,"km":50000,"price":95000,"fipe":110000,
 *           "seller_type":"PF","seller_uf":"SP","seller_city":"São Paulo"}]'
 *
 * Runtime: nodejs (service-role client needs Node APIs).
 */

import { matchListingToWishlists } from "@/lib/matching/engine";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { DbListing, DbWishlist, Plan } from "@/types/database";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Request validation ────────────────────────────────────────────────────

const webhookListingSchema = z.object({
  source: z.string().default("webmotors"),
  source_listing_id: z.string().min(1),
  fingerprint: z.string().min(1),
  brand: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable().optional(),
  trim: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  km: z.number().int().min(0).nullable().optional(),
  price: z.number().min(0).nullable().optional(),
  fipe: z.number().min(0).nullable().optional(),
  savings_vs_fipe: z.number().nullable().optional(),
  savings_pct: z.number().nullable().optional(),
  seller_type: z.enum(["PF", "PJ"]).nullable().optional(),
  seller_location: z.string().nullable().optional(),
  seller_uf: z.string().length(2).nullable().optional(),
  seller_city: z.string().nullable().optional(),
  listing_url: z.string().url().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  days_online: z.number().int().min(0).nullable().optional(),
  reductions: z.number().int().min(0).nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
  motivation_signals: z.record(z.unknown()).optional(),
});

const webhookBodySchema = z.array(webhookListingSchema).min(1).max(500);

// ─── Fee calculation (mirrors PRD v3 success-fee model) ────────────────────

function calcFee(plan: Plan, savingsVsFipe: number | null | undefined): number {
  if (!savingsVsFipe || savingsVsFipe <= 0) return 0;
  const rate = plan === "enterprise" ? 0.02 : plan === "premium" ? 0.03 : 0.06;
  return Math.round(savingsVsFipe * rate * 100) / 100;
}

// ─── Handler ───────────────────────────────────────────────────────────────

type ProcessedResult = {
  listings_processed: number;
  opportunities_created: number;
  details: { fingerprint: string; matches: number; created: number }[];
};

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SCRAPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "misconfigured", detail: "SCRAPE_WEBHOOK_SECRET not set" },
      { status: 500 },
    );
  }

  const header = request.headers.get("x-scrape-webhook-secret");
  if (header !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof webhookBodySchema>;
  try {
    const raw = await request.json();
    const parsed = webhookBodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_body", issues: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = getSupabaseServiceRole();

  // Fetch all active wishlists + their owning user's plan in one pass.
  const { data: wishlists, error: wlErr } = await supabase
    .from("wishlists")
    .select("*")
    .eq("status", "active");
  if (wlErr) {
    return Response.json({ error: "db_read_failed", detail: wlErr.message }, { status: 500 });
  }

  const { data: users, error: usersErr } = await supabase.from("users").select("id, plan");
  if (usersErr) {
    return Response.json({ error: "db_read_failed", detail: usersErr.message }, { status: 500 });
  }
  const planByUser = new Map<string, Plan>((users ?? []).map((u) => [u.id, u.plan]));

  const result: ProcessedResult = {
    listings_processed: 0,
    opportunities_created: 0,
    details: [],
  };

  for (const listing of body) {
    // Upsert the listing by fingerprint (unique in schema).
    const listingRow = {
      source: listing.source,
      source_listing_id: listing.source_listing_id,
      fingerprint: listing.fingerprint,
      brand: listing.brand ?? null,
      model: listing.model ?? null,
      trim: listing.trim ?? null,
      year: listing.year ?? null,
      km: listing.km ?? null,
      price: listing.price ?? null,
      fipe: listing.fipe ?? null,
      savings_vs_fipe: listing.savings_vs_fipe ?? null,
      savings_pct: listing.savings_pct ?? null,
      seller_type: listing.seller_type ?? null,
      seller_location: listing.seller_location ?? null,
      seller_uf: listing.seller_uf ?? null,
      seller_city: listing.seller_city ?? null,
      listing_url: listing.listing_url ?? null,
      photo_url: listing.photo_url ?? null,
      days_online: listing.days_online ?? null,
      reductions: listing.reductions ?? null,
      attributes: listing.attributes ?? {},
      motivation_signals: listing.motivation_signals ?? {},
      status: "active" as const,
      last_scraped_at: new Date().toISOString(),
    };

    const { data: upserted, error: upErr } = await supabase
      .from("listings")
      .upsert(listingRow, { onConflict: "fingerprint" })
      .select()
      .single();

    if (upErr || !upserted) {
      result.details.push({
        fingerprint: listing.fingerprint,
        matches: 0,
        created: 0,
      });
      continue;
    }
    result.listings_processed += 1;

    const matches = matchListingToWishlists(
      upserted as DbListing,
      (wishlists ?? []) as DbWishlist[],
    ).filter((m) => m.score >= 0.7);

    let createdForThisListing = 0;
    for (const match of matches) {
      const wishlist = (wishlists ?? []).find((w) => w.id === match.wishlist_id);
      if (!wishlist) continue;
      const plan = planByUser.get(wishlist.user_id) ?? "starter";
      const fee = calcFee(plan, upserted.savings_vs_fipe);

      // Dedup by (user_id, wishlist_id, listing_id) unique; insert onConflict
      // ignores duplicates so re-runs are NOOP.
      const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .upsert(
          {
            user_id: wishlist.user_id,
            wishlist_id: match.wishlist_id,
            listing_id: match.listing_id,
            match_score: match.score,
            status: "pending",
            fee_amount: fee,
          },
          { onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true },
        )
        .select()
        .maybeSingle();
      if (!oppErr && oppRow) {
        createdForThisListing += 1;
        result.opportunities_created += 1;
      }
    }

    result.details.push({
      fingerprint: listing.fingerprint,
      matches: matches.length,
      created: createdForThisListing,
    });
  }

  return Response.json(result, { status: 200 });
}
