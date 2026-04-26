/**
 * POST /api/scrape/webmotors/webhook
 *
 * Two-shape ingest endpoint — bridges Phase 8's scraper output into the matching
 * engine + DB. Body-shape discriminator routes:
 *
 *   1. Apify event payload `{ eventType, resource: { id, ... } }`  → handleApifyRun
 *   2. Pre-normalized listing array (Phase 7 stub contract)        → handleDirectListings
 *
 * Flow (handleDirectListings — UNCHANGED Phase 7 contract):
 *   1. Auth: x-scrape-webhook-secret header (timing-safe compare).
 *   2. Body: array of listings matching WebhookListing (zod-validated).
 *   3. For each listing: upsert into `listings` by fingerprint.
 *   4. For each upserted listing, run matchListingToWishlists.
 *   5. For each match with score >= 0.7, insert into `opportunities` with a
 *      computed fee_amount from plan tier + savings.
 *   6. Return { listings_processed, opportunities_created, details }.
 *
 * Flow (handleApifyRun — NEW Phase 8):
 *   1. Auth (same shared-secret header).
 *   2. Cost cap (D-02 / SCRAPE-08): SUM(scrape_runs.cost_usd) for today UTC;
 *      429 if >= MAX_DAILY_SCRAPE_COST_USD (default 50).
 *   3. scrape_runs lifecycle (SCRAPE-05): insert status='running' on entry;
 *      update with counts + cost_usd + ended_at on exit.
 *   4. Run meta (SCRAPE-02): getActorRun → defaultDatasetId + usageTotalUsd.
 *   5. Stream dataset items one-at-a-time → normalize → upsert → match.
 *   6. FIPE failure path (D-04): insert with fipe=null + attributes.fipe_retry_pending=true.
 *
 * Runtime: nodejs (service-role client + Apify timeouts).
 */

import { getActorRun, streamDatasetItems } from "@/lib/apify/client";
import type { WebMotorsScraped } from "@/lib/apify/types";
import { verifySharedSecret } from "@/lib/apify/webhook-auth";
import { normalizeWebMotorsItem } from "@/lib/apify/webmotors-normalize";
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

// ─── Phase 8 — Apify scheduled-run discriminator ────────────────────────────

const apifyEventSchema = z.object({
  resource: z.object({ id: z.string().min(1) }),
  eventType: z.string().optional(),
});

const APIFY_FETCH_TIMEOUT_MS = 55_000;

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
  if (!verifySharedSecret(header, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw: unknown = await request.json().catch(() => null);
  if (raw === null) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // Discriminator: Apify event payload (object with resource.id) vs Phase 7 stub (array).
  const apifyParsed = apifyEventSchema.safeParse(raw);
  if (apifyParsed.success) {
    return await handleApifyRun(apifyParsed.data);
  }

  const stubParsed = webhookBodySchema.safeParse(raw);
  if (stubParsed.success) {
    return await handleDirectListings(stubParsed.data);
  }

  return Response.json(
    {
      error: "invalid_body",
      issues: stubParsed.error.issues.slice(0, 5),
    },
    { status: 400 },
  );
}

// ─── handleDirectListings — UNCHANGED Phase 7 contract ────────────────────

async function handleDirectListings(
  body: z.infer<typeof webhookBodySchema>,
): Promise<Response> {
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

// ─── handleApifyRun — NEW Phase 8 (full impl in Task 2) ───────────────────

async function handleApifyRun(
  payload: z.infer<typeof apifyEventSchema>,
): Promise<Response> {
  // Implemented in Task 2 — Wave 1 imports referenced here so the module
  // remains type-correct until the implementation lands.
  void getActorRun;
  void streamDatasetItems;
  void normalizeWebMotorsItem;
  void APIFY_FETCH_TIMEOUT_MS;
  void ({} as WebMotorsScraped);
  return Response.json(
    { error: "not_implemented", run_id: payload.resource.id },
    { status: 501 },
  );
}
