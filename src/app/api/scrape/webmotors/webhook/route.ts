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

async function handleDirectListings(body: z.infer<typeof webhookBodySchema>): Promise<Response> {
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

// ─── handleApifyRun — NEW Phase 8 ─────────────────────────────────────────

async function handleApifyRun(payload: z.infer<typeof apifyEventSchema>): Promise<Response> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return Response.json(
      { error: "misconfigured", detail: "APIFY_API_TOKEN not set" },
      { status: 500 },
    );
  }

  const supabase = getSupabaseServiceRole();

  // ─── Cost cap (D-02 / SCRAPE-08) ───────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const { data: costRows, error: costErr } = await supabase
    .from("scrape_runs")
    .select("cost_usd")
    .gte("started_at", `${today}T00:00:00Z`);
  if (costErr) {
    return Response.json({ error: "db_read_failed", detail: costErr.message }, { status: 500 });
  }
  const totalToday = (costRows ?? []).reduce(
    (s: number, r: { cost_usd: number | null }) => s + (r.cost_usd ?? 0),
    0,
  );
  const cap = Number(process.env.MAX_DAILY_SCRAPE_COST_USD ?? 50);
  if (totalToday >= cap) {
    console.error(`scrape_cost_cap_hit total=${totalToday} cap=${cap} run=${payload.resource.id}`);
    return Response.json(
      {
        error: "cost_cap_exceeded",
        detail: `$${totalToday.toFixed(2)} / $${cap} cap`,
      },
      { status: 429 },
    );
  }

  // ─── scrape_runs row: status='running' on entry ────────────────────────
  const { data: runRow, error: runInsertErr } = await supabase
    .from("scrape_runs")
    .insert({
      source: "webmotors",
      status: "running",
      apify_run_id: payload.resource.id,
    })
    .select()
    .single();
  if (runInsertErr || !runRow) {
    return Response.json(
      { error: "db_insert_failed", detail: runInsertErr?.message ?? "no row" },
      { status: 500 },
    );
  }

  // ─── Fetch run meta + dataset stream ──────────────────────────────────
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), APIFY_FETCH_TIMEOUT_MS);

  let listings_new = 0;
  let listings_updated = 0;
  let listings_error = 0;
  // Technical errors (DB upsert failures, normalize invalid_data) — distinct
  // from clean filter rejects (sinistro/leilao). Only technical errors count
  // toward the 20% failure threshold; clean filter rejects are normal behavior.
  let technical_errors = 0;
  let runMeta: Awaited<ReturnType<typeof getActorRun>> | null = null;
  let crashedReason: string | null = null;

  try {
    runMeta = await getActorRun(payload.resource.id, apifyToken, ctrl.signal);

    // Pre-load wishlists + users plan map (mirrors handleDirectListings pattern).
    const { data: wishlists } = await supabase.from("wishlists").select("*").eq("status", "active");
    const { data: users } = await supabase.from("users").select("id, plan");
    const planByUser = new Map<string, Plan>(
      (users ?? []).map((u: { id: string; plan: Plan }) => [u.id, u.plan]),
    );

    for await (const raw of streamDatasetItems<WebMotorsScraped>(
      runMeta.defaultDatasetId,
      apifyToken,
      ctrl.signal,
    )) {
      const norm = normalizeWebMotorsItem(raw);
      if (!norm.ok) {
        listings_error += 1;
        // Clean filter rejects (sinistro/leilao/recall) are expected/normal —
        // they do NOT count as technical failures for the 20% threshold.
        if (norm.reason !== "sinistro" && norm.reason !== "leilao" && norm.reason !== "recall") {
          technical_errors += 1;
        }
        continue;
      }

      const row = norm.row;
      // ─── FIPE enrichment with graceful degradation (D-04 / SCRAPE-04) ──
      if (norm.needsFipe && row.brand && row.model && row.year) {
        const fipe = await callFipeOrNull(row.brand, row.model, row.year, ctrl.signal);
        if (fipe !== null) {
          row.fipe = fipe;
          row.savings_vs_fipe =
            row.price !== null && row.price !== undefined ? row.price - fipe : null;
          row.savings_pct =
            row.price !== null && row.price !== undefined && fipe > 0
              ? ((fipe - row.price) / fipe) * 100
              : null;
        } else {
          // D-04: insert with fipe=null + retry flag; cron picks it up later
          row.attributes = {
            ...((row.attributes as Record<string, unknown>) ?? {}),
            fipe_retry_pending: true,
          };
        }
      }

      const { data: upserted, error: upErr } = await supabase
        .from("listings")
        .upsert(
          { ...row, last_scraped_at: new Date().toISOString() },
          { onConflict: "fingerprint" },
        )
        .select()
        .single();
      if (upErr || !upserted) {
        listings_error += 1;
        technical_errors += 1;
        continue;
      }

      // Crude new-vs-updated detection: if first_seen_at == last_scraped_at,
      // this is a fresh insert. Otherwise it was already in DB.
      if (
        upserted.first_seen_at &&
        upserted.last_scraped_at &&
        upserted.first_seen_at === upserted.last_scraped_at
      ) {
        listings_new += 1;
      } else {
        listings_updated += 1;
      }

      // Matching engine — REUSE Phase 7 contract
      const matches = matchListingToWishlists(
        upserted as DbListing,
        (wishlists ?? []) as DbWishlist[],
      ).filter((m) => m.score >= 0.7);

      for (const match of matches) {
        const wishlist = (wishlists ?? []).find((w) => w.id === match.wishlist_id);
        if (!wishlist) continue;
        const plan = planByUser.get(wishlist.user_id) ?? "starter";
        const fee = calcFee(plan, upserted.savings_vs_fipe);
        await supabase.from("opportunities").upsert(
          {
            user_id: wishlist.user_id,
            wishlist_id: match.wishlist_id,
            listing_id: match.listing_id,
            match_score: match.score,
            status: "pending",
            fee_amount: fee,
          },
          { onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true },
        );
      }
    }
  } catch (err) {
    crashedReason = String(err).replace(new RegExp(apifyToken, "g"), "[REDACTED]").slice(0, 500);
    console.error(`apify_run_failed run=${payload.resource.id} reason=${crashedReason}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // ─── scrape_runs final update ──────────────────────────────────────────
  const total = listings_new + listings_updated + listings_error;
  // Failure threshold: only TECHNICAL errors count (DB upsert failures,
  // invalid_data normalization). Clean filter rejects (sinistro/leilao) are
  // expected behavior and do NOT trigger a failed status.
  const finalStatus: "completed" | "failed" =
    crashedReason !== null || (total > 0 && technical_errors / total > 0.2)
      ? "failed"
      : "completed";

  await supabase
    .from("scrape_runs")
    .update({
      status: finalStatus,
      ended_at: new Date().toISOString(),
      cost_usd: runMeta?.usageTotalUsd ?? null,
      listings_new,
      listings_updated,
      listings_error,
      notes:
        crashedReason ?? (listings_error > 0 ? `${listings_error} normalization failures` : null),
    })
    .eq("id", runRow.id);

  return Response.json(
    {
      ok: finalStatus === "completed",
      run_id: payload.resource.id,
      listings_new,
      listings_updated,
      listings_error,
    },
    { status: finalStatus === "completed" ? 200 : 502 },
  );
}

// FIPE call — graceful failure per D-04. Internal fetch to /api/fipe.
async function callFipeOrNull(
  brand: string,
  model: string,
  year: number,
  signal: AbortSignal,
): Promise<number | null> {
  try {
    // Resolve our own host. In Vercel runtime, VERCEL_URL is set.
    // Falls back to localhost for dev / tests.
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/fipe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marca: brand, modelo: model, ano: year }),
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { fipe?: number };
    return typeof json.fipe === "number" ? json.fipe : null;
  } catch {
    return null;
  }
}
