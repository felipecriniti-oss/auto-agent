/**
 * Tools available to the Scraper agent.
 *
 * These wrap existing infrastructure (Apify client, Supabase, filters)
 * into the AgentTool format so the agent can call them via Claude tool_use.
 *
 * Tools:
 *   - search_webmotors: Search WebMotors via Apify for a brand/model
 *   - save_listings: Batch-save new listings to Supabase
 *   - check_listing_filters: Run blocking filters (leilão, sinistro)
 *   - get_active_listings_count: Check how many active listings exist for a model
 *   - report_run_summary: Log a summary of the scraping run
 */

import { TARGET_MODELS } from "@/lib/apify/target-models";
import { detectBlockingFilter } from "@/lib/apify/filters";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { WebMotorsScraped } from "@/lib/apify/types";
import type { AgentTool } from "../types";

// ─── Tool: get_target_models ──────────────────────────────────────

const getTargetModels: AgentTool = {
  name: "get_target_models",
  description:
    "Returns the list of target car models (brand + model + WebMotors URL) that should be scraped. Use this first to know which models to search for.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async () => {
    return {
      models: TARGET_MODELS.map((m) => ({
        brand: m.brand,
        model: m.model,
        url: m.url,
      })),
      total: TARGET_MODELS.length,
    };
  },
};

// ─── Tool: search_webmotors ───────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
const SCRAPER_ACTOR = "ribtools~webmotors-scraper";

const searchWebmotors: AgentTool = {
  name: "search_webmotors",
  description:
    "Search WebMotors for car listings of a specific brand/model. Pass the WebMotors estoque URL from get_target_models. Returns raw listing data. Limited to 50 results per call.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description:
          "WebMotors estoque URL (e.g., https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=polo)",
      },
      max_items: {
        type: "number",
        description: "Maximum items to fetch (default 50, max 100)",
      },
    },
    required: ["url"],
  },
  execute: async (input) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      return { error: "APIFY_API_TOKEN not configured", listings: [] };
    }

    const url = input.url as string;
    const maxItems = Math.min((input.max_items as number) || 50, 100);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);

    try {
      const res = await fetch(
        `${APIFY_BASE}/acts/${SCRAPER_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=45&memory=512`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            startUrls: [{ url }],
            proxyConfig: { useApifyProxy: true },
            maxItems,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!res.ok) {
        return {
          error: `Apify returned ${res.status}`,
          listings: [],
        };
      }

      const items = (await res.json()) as WebMotorsScraped[];
      return {
        listings: items.map((item) => ({
          source_id: item.id?.toString() ?? null,
          url: item.url ?? null,
          title: item.title ?? null,
          brand: item.make ?? null,
          model: item.model ?? null,
          version: item.version ?? null,
          year_manufacture: item.fabrication_year ?? null,
          year_model: item.model_year ?? null,
          km: item.km ?? null,
          price: item.price ?? null,
          fipe_price: item.fipe_price ?? null,
          transmission: item.transmission ?? null,
          fuel: item.fuel_type ?? null,
          color: item.color ?? null,
          body_type: item.body_type ?? null,
          seller_name: item.seller?.name ?? null,
          seller_type: item.seller?.seller_type ?? null,
          seller_city: item.seller?.city ?? null,
          seller_state: item.seller?.state ?? null,
          seller_phone: item.seller?.phones?.[0] ?? null,
          photos: item.photos?.slice(0, 5) ?? [],
          published_at: item.publish_date ?? null,
          is_armored: item.is_armored ?? false,
          optionals: item.optionals ?? [],
          attributes: item.attributes ?? [],
          _raw_for_filters: item, // Pass raw item for filter checks
        })),
        total: items.length,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        return { error: "Scrape timeout (50s)", listings: [] };
      }
      return {
        error: err instanceof Error ? err.message : String(err),
        listings: [],
      };
    }
  },
};

// ─── Tool: check_listing_filters ──────────────────────────────────

const checkListingFilters: AgentTool = {
  name: "check_listing_filters",
  description:
    "Check if a listing should be blocked (leilão, sinistro). Pass the listing's attributes and title. Returns 'clean' or the blocking reason.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Listing title" },
      attributes: {
        type: "array",
        items: { type: "string" },
        description: "Listing attributes array",
      },
    },
    required: ["title"],
  },
  execute: async (input) => {
    const item: WebMotorsScraped = {
      title: input.title as string,
      attributes: (input.attributes as string[]) ?? [],
    };
    const reason = detectBlockingFilter(item);
    return {
      status: reason ? "blocked" : "clean",
      reason: reason ?? null,
    };
  },
};

// ─── Tool: save_listings ──────────────────────────────────────────

const saveListings: AgentTool = {
  name: "save_listings",
  description:
    "Save a batch of clean (non-blocked) listings to the database. Pass an array of listings with their data. Returns count of new vs updated listings. Deduplicates by source + source_listing_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_id: { type: "string" },
            url: { type: "string" },
            brand: { type: "string" },
            model: { type: "string" },
            version: { type: "string" },
            year: { type: "number" },
            km: { type: "number" },
            price: { type: "number" },
            fipe_price: { type: "number" },
            seller_type: { type: "string" },
            seller_city: { type: "string" },
            seller_state: { type: "string" },
            photo_url: { type: "string" },
          },
        },
        description: "Array of listing objects to save",
      },
    },
    required: ["listings"],
  },
  execute: async (input) => {
    const listings = input.listings as Array<Record<string, unknown>>;
    if (!listings || listings.length === 0) {
      return { new: 0, updated: 0, errors: 0 };
    }

    const supabase = getSupabaseServiceRole();
    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const listing of listings) {
      try {
        const sourceId = String(listing.source_id ?? "");
        if (!sourceId) {
          errorCount++;
          continue;
        }

        // Generate fingerprint for dedup
        const fingerprint = [
          listing.brand,
          listing.model,
          listing.year,
          Math.round(((listing.km as number) ?? 0) / 1000),
          listing.seller_city,
        ]
          .filter(Boolean)
          .join("|")
          .toLowerCase();

        // Extract UF from state
        const state = String(listing.seller_state ?? "");
        const uf = state.match(/\(([A-Z]{2})\)/)?.[1] ??
          (/^[A-Z]{2}$/.test(state.trim()) ? state.trim() : null);

        // Calculate savings if fipe available
        const price = (listing.price as number) ?? null;
        const fipe = (listing.fipe_price as number) ?? null;
        const savings = fipe && price ? Math.max(0, fipe - price) : null;
        const savingsPct =
          fipe && price && fipe > 0
            ? Math.round(((fipe - price) / fipe) * 100)
            : null;

        const { data: existing } = await supabase
          .from("listings")
          .select("id")
          .eq("source", "webmotors")
          .eq("source_listing_id", sourceId)
          .maybeSingle();

        if (existing) {
          // Update price if changed
          await supabase
            .from("listings")
            .update({
              price,
              fipe,
              savings_vs_fipe: savings,
              savings_pct: savingsPct,
              status: "active" as const,
            })
            .eq("id", existing.id);
          updatedCount++;
        } else {
          // Insert new listing
          await supabase.from("listings").insert({
            source: "webmotors",
            source_listing_id: sourceId,
            fingerprint,
            brand: (listing.brand as string) ?? null,
            model: (listing.model as string) ?? null,
            trim: (listing.version as string) ?? null,
            year: (listing.year as number) ?? null,
            km: (listing.km as number) ?? null,
            price,
            fipe,
            savings_vs_fipe: savings,
            savings_pct: savingsPct,
            seller_type: (listing.seller_type as string)?.toUpperCase() === "PJ" ? "PJ" as const : "PF" as const,
            seller_city: (listing.seller_city as string) ?? null,
            seller_uf: uf,
            seller_location: [listing.seller_city, uf]
              .filter(Boolean)
              .join(", ") || null,
            listing_url: (listing.url as string) ?? null,
            photo_url: (listing.photo_url as string) ?? null,
            status: "active" as const,
            days_online: null,
            reductions: null,
            attributes: {},
            motivation_signals: {},
          });
          newCount++;
        }
      } catch {
        errorCount++;
      }
    }

    return { new: newCount, updated: updatedCount, errors: errorCount };
  },
};

// ─── Tool: get_active_listings_count ──────────────────────────────

const getActiveListingsCount: AgentTool = {
  name: "get_active_listings_count",
  description:
    "Get the count of active listings in the database, optionally filtered by brand/model. Useful to track how many listings we have before deciding to scrape more.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string", description: "Filter by brand (optional)" },
      model: { type: "string", description: "Filter by model (optional)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    let query = supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    if (input.brand) query = query.ilike("brand", input.brand as string);
    if (input.model) query = query.ilike("model", input.model as string);

    const { count, error } = await query;
    if (error) return { error: error.message, count: 0 };
    return { count: count ?? 0 };
  },
};

// ─── Tool: report_run_summary ─────────────────────────────────────

const reportRunSummary: AgentTool = {
  name: "report_run_summary",
  description:
    "Log a summary of the scraping run to the scrape_runs table. Call this at the end of each scraping session with totals.",
  input_schema: {
    type: "object" as const,
    properties: {
      listings_new: { type: "number", description: "New listings saved" },
      listings_updated: {
        type: "number",
        description: "Existing listings updated",
      },
      listings_blocked: {
        type: "number",
        description: "Listings blocked by filters",
      },
      listings_error: { type: "number", description: "Listings with errors" },
      models_scraped: {
        type: "number",
        description: "Number of models scraped",
      },
      notes: { type: "string", description: "Any notes about the run" },
    },
    required: ["listings_new", "listings_updated"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const { error } = await supabase.from("scrape_runs").insert({
      source: "webmotors",
      status: "completed",
      listings_new: (input.listings_new as number) ?? 0,
      listings_updated: (input.listings_updated as number) ?? 0,
      listings_error: (input.listings_error as number) ?? 0,
      notes: (input.notes as string) ?? null,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    });

    if (error) return { error: error.message };
    return { logged: true };
  },
};

// ─── Export all scraper tools ─────────────────────────────────────

export const SCRAPER_TOOLS: AgentTool[] = [
  getTargetModels,
  searchWebmotors,
  checkListingFilters,
  saveListings,
  getActiveListingsCount,
  reportRunSummary,
];
