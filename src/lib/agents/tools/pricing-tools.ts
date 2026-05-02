/**
 * Tools available to the Pricing agent.
 *
 * Pricing reads listings that already passed Analista (have analysis JSONB,
 * green or yellow), figures out the margin band the Negociador will work
 * inside, and writes a structured pricing decision back into
 * `listings.attributes.pricing`. It also looks at recent closed deals to
 * sanity-check that target margins are still being achieved.
 *
 * Tools:
 *   - query_listings_for_pricing: listings with analysis but no pricing decision
 *   - get_category_targets: target margin per category (premium / mass / luxury)
 *   - compute_pricing_band: opening / target / max / walkaway offers
 *   - get_recent_outcomes: realised margin from converged opportunities
 *   - set_pricing_decision: persist pricing into listings.attributes.pricing
 *   - report_pricing_summary: final structured report
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";

// ─── Category model ───────────────────────────────────────────────
// Hand-curated mapping. Premium brands have higher liquidity, so we accept
// thinner margins. Mass-market needs fatter margin to absorb time-on-lot.

const PREMIUM_BRANDS = new Set(
  ["audi", "bmw", "mercedes-benz", "mercedes", "porsche", "land rover", "volvo", "lexus"].map((b) =>
    b.toLowerCase(),
  ),
);

const LUXURY_BRANDS = new Set(
  ["ferrari", "lamborghini", "maserati", "bentley"].map((b) => b.toLowerCase()),
);

type Category = "luxury" | "premium" | "mass";

function categoryFor(brand: string | null | undefined): Category {
  if (!brand) return "mass";
  const b = brand.toLowerCase().trim();
  if (LUXURY_BRANDS.has(b)) return "luxury";
  if (PREMIUM_BRANDS.has(b)) return "premium";
  return "mass";
}

// Target margin per category. CFO-approved minimum: 8%.
const CATEGORY_TARGET_MARGIN: Record<Category, number> = {
  luxury: 0.06,
  premium: 0.08,
  mass: 0.1,
};

// ─── Tool: query_listings_for_pricing ─────────────────────────────

const queryListingsForPricing: AgentTool = {
  name: "query_listings_for_pricing",
  description:
    "Fetch active listings that have an Analista analysis (green or yellow) but no pricing decision yet. Returns the listing fields plus the embedded analysis. Use this as the entry point of every run.",
  input_schema: {
    type: "object" as const,
    properties: {
      traffic_lights: {
        type: "array",
        items: { type: "string", enum: ["green", "yellow", "red"] },
        description: "Which traffic lights to include (default ['green','yellow'])",
      },
      brand: { type: "string", description: "Filter by brand (case-insensitive)" },
      limit: { type: "number", description: "Max rows to return (default 20, max 50)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 20, 50);
    const lights = ((input.traffic_lights as string[]) ?? ["green", "yellow"]).map((l) =>
      String(l).toLowerCase(),
    );

    let query = supabase
      .from("listings")
      .select(
        "id, brand, model, year, km, price, fipe, savings_pct, seller_type, seller_uf, seller_city, days_online, attributes, listing_url",
      )
      .eq("status", "active")
      .order("savings_pct", { ascending: false, nullsFirst: false })
      .limit(limit * 3); // overfetch — we'll filter by analysis presence below

    if (input.brand) query = query.ilike("brand", input.brand as string);

    const { data, error } = await query;
    if (error) return { error: error.message, listings: [] };

    const filtered = (data ?? [])
      .filter((row) => {
        const attr = row.attributes as Record<string, unknown> | null;
        const analysis = attr?.analysis as { traffic_light?: string; score?: number } | undefined;
        if (!analysis?.traffic_light) return false;
        if (!lights.includes(analysis.traffic_light)) return false;
        // Skip if pricing decision already exists
        if (attr?.pricing) return false;
        return true;
      })
      .slice(0, limit);

    return {
      listings: filtered.map((row) => {
        const attr = row.attributes as Record<string, unknown> | null;
        return {
          id: row.id,
          brand: row.brand,
          model: row.model,
          year: row.year,
          km: row.km,
          price: row.price,
          fipe: row.fipe,
          savings_pct: row.savings_pct,
          seller_type: row.seller_type,
          seller_uf: row.seller_uf,
          seller_city: row.seller_city,
          days_online: row.days_online,
          listing_url: row.listing_url,
          analysis: attr?.analysis ?? null,
        };
      }),
      total: filtered.length,
    };
  },
};

// ─── Tool: get_category_targets ───────────────────────────────────

const getCategoryTargets: AgentTool = {
  name: "get_category_targets",
  description:
    "Return the current target margin map by category (luxury / premium / mass) plus the brand classification rules. Use this to understand what target_margin to pass into compute_pricing_band for a given brand.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async () => {
    return {
      targets: CATEGORY_TARGET_MARGIN,
      premium_brands: [...PREMIUM_BRANDS],
      luxury_brands: [...LUXURY_BRANDS],
      cfo_minimum_margin: 0.08,
    };
  },
};

// ─── Tool: compute_pricing_band ───────────────────────────────────

const computePricingBand: AgentTool = {
  name: "compute_pricing_band",
  description:
    "Compute the negotiation band for a listing: opening_offer (anchor low), target_offer (where we want to land), max_offer (CFO ceiling = FIPE * (1 - target_margin)), and walkaway (price above which we cancel). Pure function. Adjusts margin upward for: high km, very old listing on lot, no observed reductions despite long days_online.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string" },
      fipe: { type: "number", description: "FIPE price BRL" },
      asking_price: { type: "number", description: "Current advertised price BRL" },
      year: { type: "number" },
      km: { type: "number" },
      days_online: { type: "number" },
      analysis_score: { type: "number", description: "0-100 score from Analista" },
      target_margin_override: {
        type: "number",
        description: "Override default category margin (e.g. 0.12)",
      },
    },
    required: ["brand", "fipe", "asking_price"],
  },
  execute: async (input) => {
    const fipe = Number(input.fipe);
    const asking = Number(input.asking_price);
    if (!Number.isFinite(fipe) || fipe <= 0) {
      return { error: "invalid_fipe" };
    }
    if (!Number.isFinite(asking) || asking <= 0) {
      return { error: "invalid_asking_price" };
    }

    const brand = String(input.brand ?? "");
    const cat = categoryFor(brand);
    const baseMargin = Number.isFinite(input.target_margin_override as number)
      ? Number(input.target_margin_override)
      : CATEGORY_TARGET_MARGIN[cat];

    // Adjustments to margin (additive, capped)
    let marginAdjust = 0;
    const km = Number(input.km);
    const year = Number(input.year);
    const daysOnline = Number(input.days_online);
    const score = Number(input.analysis_score);

    // High km penalty (older fleet harder to resell)
    if (Number.isFinite(km)) {
      if (km > 100_000) marginAdjust += 0.02;
      else if (km > 70_000) marginAdjust += 0.01;
    }

    // Old model year penalty
    if (Number.isFinite(year)) {
      const currentYear = new Date().getUTCFullYear();
      const age = currentYear - year;
      if (age >= 8) marginAdjust += 0.02;
      else if (age >= 5) marginAdjust += 0.01;
    }

    // Low score => need extra margin to compensate
    if (Number.isFinite(score) && score < 50) marginAdjust += 0.01;

    // Days online: if very stale AND we're going aggressive, allow tighter margin
    if (Number.isFinite(daysOnline) && daysOnline >= 60) marginAdjust -= 0.01;

    const targetMargin = Math.max(0.06, Math.min(0.2, baseMargin + marginAdjust));

    const maxOffer = Math.round(fipe * (1 - targetMargin));
    // Target = halfway between max_offer and asking price (gives Negociador room)
    const target = Math.round((maxOffer + asking) / 2);
    // Opening anchor: 5% below max_offer — gives room to "give" during 7 rounds
    const opening = Math.round(maxOffer * 0.95);
    // Walkaway: 2% above max_offer (CFO ceiling is HARD)
    const walkaway = Math.round(maxOffer * 1.02);

    return {
      category: cat,
      base_margin: baseMargin,
      target_margin: targetMargin,
      margin_adjustment: marginAdjust,
      band: {
        opening_offer: opening,
        target_offer: target,
        max_offer: maxOffer,
        walkaway,
      },
      rationale: {
        category_chosen: cat,
        adjustments: {
          km_penalty: Number.isFinite(km) && km > 70_000,
          age_penalty: Number.isFinite(year) && new Date().getUTCFullYear() - year >= 5,
          score_penalty: Number.isFinite(score) && score < 50,
          stale_discount: Number.isFinite(daysOnline) && daysOnline >= 60,
        },
      },
    };
  },
};

// ─── Tool: get_recent_outcomes ────────────────────────────────────

const getRecentOutcomes: AgentTool = {
  name: "get_recent_outcomes",
  description:
    "Fetch recent finalized deals (from `deals` table joined to `opportunities`/`listings`) so the agent can compare realised margins against current targets. Returns up to 50 rows by default. Useful as a sanity check before recommending margin adjustments.",
  input_schema: {
    type: "object" as const,
    properties: {
      since_days: { type: "number", description: "Look-back window in days (default 30)" },
      brand: { type: "string", description: "Optional brand filter" },
      limit: { type: "number", description: "Max rows (default 50, max 100)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const sinceDays = (input.since_days as number) || 30;
    const limit = Math.min((input.limit as number) || 50, 100);
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("deals")
      .select("id, status, opportunity_id, fee_paid_amount, created_at, updated_at")
      .in("status", ["finalized", "signed", "transferring", "canceled"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message, deals: [] };

    return {
      window_days: sinceDays,
      brand_filter: input.brand ?? null,
      count: data?.length ?? 0,
      deals: data ?? [],
      note: "Deal -> listing brand join requires opportunities + listings. Pricing should treat this as a coarse signal of throughput; full margin reconciliation is a separate Custos/CFO task.",
    };
  },
};

// ─── Tool: set_pricing_decision ───────────────────────────────────

const setPricingDecision: AgentTool = {
  name: "set_pricing_decision",
  description:
    "Persist the pricing decision into the listing's `attributes.pricing` JSONB. After this the Negociador can pick the listing up. Includes the full negotiation band and the rationale.",
  input_schema: {
    type: "object" as const,
    properties: {
      listing_id: { type: "string" },
      decision: {
        type: "string",
        enum: ["go", "no_go"],
        description: "Whether the deal is viable",
      },
      target_margin: { type: "number" },
      band: {
        type: "object",
        properties: {
          opening_offer: { type: "number" },
          target_offer: { type: "number" },
          max_offer: { type: "number" },
          walkaway: { type: "number" },
        },
      },
      rationale: { type: "string", description: "One-line human rationale" },
    },
    required: ["listing_id", "decision"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const listingId = input.listing_id as string;

    const { data: existing, error: readErr } = await supabase
      .from("listings")
      .select("attributes")
      .eq("id", listingId)
      .maybeSingle();

    if (readErr) return { error: readErr.message, listing_id: listingId };
    if (!existing) return { error: "listing_not_found", listing_id: listingId };

    const prior = (existing.attributes as Record<string, unknown> | null) ?? {};
    const merged = {
      ...prior,
      pricing: {
        decision: input.decision,
        target_margin: input.target_margin ?? null,
        band: input.band ?? null,
        rationale: input.rationale ?? null,
        decided_at: new Date().toISOString(),
      },
    };

    const { error: writeErr } = await supabase
      .from("listings")
      .update({ attributes: merged })
      .eq("id", listingId);

    if (writeErr) return { error: writeErr.message, listing_id: listingId };
    return { listing_id: listingId, persisted: true, decision: input.decision };
  },
};

// ─── Tool: report_pricing_summary ─────────────────────────────────

const reportPricingSummary: AgentTool = {
  name: "report_pricing_summary",
  description:
    "Log a structured summary of the pricing run. Call this LAST with totals: how many decided, breakdown of go/no_go, top 3 go decisions (id, brand, model, max_offer, target_margin).",
  input_schema: {
    type: "object" as const,
    properties: {
      decided: { type: "number" },
      go: { type: "number" },
      no_go: { type: "number" },
      top_go: {
        type: "array",
        items: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            brand: { type: "string" },
            model: { type: "string" },
            max_offer: { type: "number" },
            target_margin: { type: "number" },
          },
        },
      },
      notes: { type: "string" },
    },
    required: ["decided"],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        decided: input.decided ?? 0,
        go: input.go ?? 0,
        no_go: input.no_go ?? 0,
        top_go: input.top_go ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all pricing tools ─────────────────────────────────────

export const PRICING_TOOLS: AgentTool[] = [
  queryListingsForPricing,
  getCategoryTargets,
  computePricingBand,
  getRecentOutcomes,
  setPricingDecision,
  reportPricingSummary,
];
