/**
 * Tools available to the Analista agent.
 *
 * The Analista validates FIPE pricing for scraped listings, computes a
 * 0-100 quality score (green/yellow/red traffic light), persists the
 * analysis back into `listings.attributes.analysis`, and aggregates
 * market statistics per brand/model.
 *
 * Tools:
 *   - query_listings_for_analysis: fetch active listings needing analysis
 *   - lookup_fipe: canonical FIPE price for a brand+model+year
 *   - compute_market_stats: median price / savings / days_online per brand+model
 *   - score_listing: pure scoring (savings, days_online, seller, reductions)
 *   - set_listing_analysis: persist score + traffic light + max_offer to listings JSONB
 *   - report_analysis_summary: final structured run summary
 */

import {
  anosResponseSchema,
  marcaSchema,
  modelosResponseSchema,
  valorResponseSchema,
} from "@/lib/schemas/fipe";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import { parseFipeValor } from "@/lib/utils/fipe";
import { z } from "zod";
import type { AgentTool } from "../types";

// ─── Tool: query_listings_for_analysis ────────────────────────────

const queryListingsForAnalysis: AgentTool = {
  name: "query_listings_for_analysis",
  description:
    "Fetch active listings that need analytical scoring. Returns id, brand, model, year, km, price, fipe, savings_pct, seller_type, days_online, listing_url, and existing analysis (if any). Use needs_score=true to only return listings without analysis or with analysis older than 24h.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string", description: "Filter by brand (case-insensitive)" },
      model: { type: "string", description: "Filter by model (case-insensitive)" },
      uf: { type: "string", description: "Filter by seller UF (2-letter, e.g. SP)" },
      seller_type: {
        type: "string",
        enum: ["PJ", "PF"],
        description: "Filter by seller type",
      },
      needs_score: {
        type: "boolean",
        description:
          "If true (default), return only listings without analysis or with analysis older than 24h.",
      },
      limit: {
        type: "number",
        description: "Max rows to return (default 25, max 100)",
      },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 25, 100);
    const needsScore = input.needs_score !== false;

    let query = supabase
      .from("listings")
      .select(
        "id, brand, model, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, days_online, reductions, listing_url, attributes, last_scraped_at",
      )
      .eq("status", "active")
      .order("savings_pct", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (input.brand) query = query.ilike("brand", input.brand as string);
    if (input.model) query = query.ilike("model", input.model as string);
    if (input.uf) query = query.eq("seller_uf", (input.uf as string).toUpperCase());
    if (input.seller_type) query = query.eq("seller_type", input.seller_type as "PF" | "PJ");

    const { data, error } = await query;
    if (error) return { error: error.message, listings: [] };

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = needsScore
      ? (data ?? []).filter((row) => {
          const analysis = (row.attributes as Record<string, unknown> | null)?.analysis as
            | { analyzed_at?: string }
            | undefined;
          if (!analysis?.analyzed_at) return true;
          const analyzedAt = Date.parse(analysis.analyzed_at);
          return Number.isFinite(analyzedAt) ? analyzedAt < cutoff : true;
        })
      : (data ?? []);

    return {
      listings: filtered.map((row) => ({
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
        reductions: row.reductions,
        listing_url: row.listing_url,
        existing_analysis: (row.attributes as Record<string, unknown> | null)?.analysis ?? null,
      })),
      total: filtered.length,
    };
  },
};

// ─── Tool: lookup_fipe ────────────────────────────────────────────

const PARALLELUM_BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const FIPE_TIMEOUT_MS = 9_000;
const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

function fuzzyMatchAll<T extends { nome: string }>(items: T[], needle: string): T[] {
  const q = needle.trim().toLowerCase();
  if (q.length === 0) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const regexes = tokens.map((t) => new RegExp(`\\b${t.replace(REGEX_ESCAPE, "\\$&")}\\b`));
  const boundaryHits = items.filter((x) => regexes.every((re) => re.test(x.nome.toLowerCase())));
  const pool =
    boundaryHits.length > 0 ? boundaryHits : items.filter((x) => x.nome.toLowerCase().includes(q));
  return [...pool].sort((a, b) => a.nome.length - b.nome.length);
}

async function fetchJsonOrNull<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal) {
  try {
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const lookupFipe: AgentTool = {
  name: "lookup_fipe",
  description:
    "Get the canonical FIPE price (in BRL integer) for a brand+model+year. Calls Parallelum's FIPE API directly with fuzzy matching on brand/model. Returns null on upstream failure or no match — never throws.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string", description: "Brand (e.g. 'Volkswagen')" },
      model: { type: "string", description: "Model (e.g. 'Polo Highline')" },
      year: { type: "number", description: "Model year (4 digits)" },
    },
    required: ["brand", "model", "year"],
  },
  execute: async (input) => {
    const brand = String(input.brand ?? "").trim();
    const model = String(input.model ?? "").trim();
    const year = Number(input.year);
    if (!brand || !model || !Number.isFinite(year)) {
      return { error: "missing_or_invalid_args", fipe: null };
    }

    const signal = AbortSignal.timeout(FIPE_TIMEOUT_MS);
    const marcas = await fetchJsonOrNull(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
    if (!marcas) return { error: "upstream_failed_marcas", fipe: null };

    const marcaCandidates = fuzzyMatchAll(marcas, brand);
    const marcaMatch = marcaCandidates[0];
    if (!marcaMatch) return { error: "brand_not_found", fipe: null };

    const modelosRes = await fetchJsonOrNull(
      `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos`,
      modelosResponseSchema,
      signal,
    );
    if (!modelosRes) return { error: "upstream_failed_modelos", fipe: null };

    const modeloCandidates = fuzzyMatchAll(modelosRes.modelos, model);
    if (modeloCandidates.length === 0) return { error: "model_not_found", fipe: null };

    const yearStr = String(year);
    const probeList = modeloCandidates.slice(0, 40);
    const CHUNK = 10;
    let modeloMatch: (typeof modeloCandidates)[number] | null = null;
    let anoMatch: { codigo: string; nome: string } | null = null;

    for (let start = 0; start < probeList.length; start += CHUNK) {
      const chunk = probeList.slice(start, start + CHUNK);
      const anosResults = await Promise.all(
        chunk.map((c) =>
          fetchJsonOrNull(
            `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos/${encodeURIComponent(String(c.codigo))}/anos`,
            anosResponseSchema,
            signal,
          ),
        ),
      );
      for (let i = 0; i < chunk.length; i++) {
        const anos = anosResults[i];
        if (!anos) continue;
        const anoMatches = anos.filter((a) => a.codigo.startsWith(`${yearStr}-`));
        if (anoMatches.length > 0) {
          modeloMatch = chunk[i];
          anoMatch = anoMatches.find((a) => a.codigo.endsWith("-1")) ?? anoMatches[0];
          break;
        }
      }
      if (modeloMatch) break;
    }

    if (!modeloMatch || !anoMatch) return { error: "year_not_found", fipe: null };

    const valorRes = await fetchJsonOrNull(
      `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos/${encodeURIComponent(String(modeloMatch.codigo))}/anos/${encodeURIComponent(anoMatch.codigo)}`,
      valorResponseSchema,
      signal,
    );
    if (!valorRes) return { error: "upstream_failed_valor", fipe: null };

    let fipe: number;
    try {
      fipe = parseFipeValor(valorRes.Valor);
    } catch {
      return { error: "invalid_valor_format", fipe: null };
    }

    return {
      fipe,
      marca: valorRes.Marca,
      modelo: valorRes.Modelo,
      ano: valorRes.AnoModelo,
    };
  },
};

// ─── Tool: compute_market_stats ───────────────────────────────────

const computeMarketStats: AgentTool = {
  name: "compute_market_stats",
  description:
    "Aggregate market statistics for a brand+model across all active listings: count, median price, median savings_pct, median days_online, distribution by seller_type and UF. Use this to contextualize a single listing's score against its peer group.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string", description: "Brand name (case-insensitive)" },
      model: { type: "string", description: "Model name (case-insensitive)" },
    },
    required: ["brand"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    let query = supabase
      .from("listings")
      .select("price, fipe, savings_pct, days_online, seller_type, seller_uf")
      .eq("status", "active")
      .ilike("brand", input.brand as string);

    if (input.model) query = query.ilike("model", input.model as string);

    const { data, error } = await query;
    if (error) return { error: error.message };

    const rows = data ?? [];
    if (rows.length === 0) {
      return { count: 0, brand: input.brand, model: input.model ?? null };
    }

    const median = (arr: number[]): number | null => {
      const filtered = arr.filter((n): n is number => Number.isFinite(n));
      if (filtered.length === 0) return null;
      const sorted = [...filtered].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
    };

    const tallyBy = <K extends string>(arr: Array<K | null>): Record<K, number> => {
      const out = {} as Record<K, number>;
      for (const v of arr) {
        if (!v) continue;
        out[v] = (out[v] ?? 0) + 1;
      }
      return out;
    };

    return {
      brand: input.brand,
      model: input.model ?? null,
      count: rows.length,
      price_median: median(rows.map((r) => r.price ?? Number.NaN)),
      savings_pct_median: median(rows.map((r) => r.savings_pct ?? Number.NaN)),
      days_online_median: median(rows.map((r) => r.days_online ?? Number.NaN)),
      seller_type_distribution: tallyBy(rows.map((r) => r.seller_type)),
      uf_distribution: tallyBy(rows.map((r) => r.seller_uf)),
    };
  },
};

// ─── Tool: score_listing ──────────────────────────────────────────

const scoreListing: AgentTool = {
  name: "score_listing",
  description:
    "Compute a 0-100 quality score and traffic light (green/yellow/red) for a single listing. Pure function — no DB writes. Inputs are listing fields plus optional market context (peer median savings/days online). Returns score, light, signals (human-readable rationale), and a recommended max_offer based on a target margin. Default target_margin_pct=0.10 (10%).",
  input_schema: {
    type: "object" as const,
    properties: {
      price: { type: "number", description: "Asking price (BRL)" },
      fipe: { type: "number", description: "FIPE price (BRL)" },
      savings_pct: {
        type: "number",
        description: "Savings vs FIPE in percent points (e.g. 12 means 12% below FIPE)",
      },
      seller_type: { type: "string", enum: ["PJ", "PF"] },
      days_online: { type: "number" },
      reductions: { type: "number", description: "How many price reductions observed" },
      market_savings_pct_median: {
        type: "number",
        description: "Median savings_pct across peer listings (optional context)",
      },
      market_days_online_median: {
        type: "number",
        description: "Median days_online across peer listings (optional context)",
      },
      target_margin_pct: {
        type: "number",
        description: "Target margin (default 0.10 = 10%)",
      },
    },
    required: ["price", "fipe"],
  },
  execute: async (input) => {
    const price = Number(input.price);
    const fipe = Number(input.fipe);
    if (!Number.isFinite(price) || !Number.isFinite(fipe) || fipe <= 0) {
      return { error: "invalid_price_or_fipe", score: 0, traffic_light: "red" };
    }

    const savingsPct = Number.isFinite(input.savings_pct as number)
      ? Number(input.savings_pct)
      : Math.round(((fipe - price) / fipe) * 100);
    const sellerType = input.seller_type as "PJ" | "PF" | undefined;
    const daysOnline = Number(input.days_online);
    const reductions = Number(input.reductions);
    const marketSavings = Number(input.market_savings_pct_median);
    const marketDays = Number(input.market_days_online_median);
    const targetMargin = Number.isFinite(input.target_margin_pct as number)
      ? Number(input.target_margin_pct)
      : 0.1;

    // Component scoring (each 0-25 except sellerSignal 0-10, motivationSignal 0-15)
    // 1. Savings component (0-40): heavier weight — this is the main edge
    let savingsScore = 0;
    if (savingsPct >= 25) savingsScore = 40;
    else if (savingsPct >= 18) savingsScore = 32;
    else if (savingsPct >= 12) savingsScore = 24;
    else if (savingsPct >= 6) savingsScore = 14;
    else if (savingsPct >= 2) savingsScore = 6;
    else savingsScore = 0;

    // 2. Peer-relative savings (0-15): outperforming peer median is a big signal
    let peerScore = 0;
    if (Number.isFinite(marketSavings)) {
      const delta = savingsPct - marketSavings;
      if (delta >= 8) peerScore = 15;
      else if (delta >= 4) peerScore = 10;
      else if (delta >= 1) peerScore = 5;
      else if (delta >= -2) peerScore = 2;
      else peerScore = 0;
    } else {
      peerScore = 5; // neutral when no peer context
    }

    // 3. Motivation signals from days_online + reductions (0-25)
    let motivationScore = 0;
    if (Number.isFinite(daysOnline)) {
      if (daysOnline >= 60) motivationScore += 12;
      else if (daysOnline >= 30) motivationScore += 8;
      else if (daysOnline >= 14) motivationScore += 4;
    }
    if (Number.isFinite(reductions)) {
      if (reductions >= 3) motivationScore += 13;
      else if (reductions >= 2) motivationScore += 9;
      else if (reductions >= 1) motivationScore += 5;
    }
    motivationScore = Math.min(motivationScore, 25);

    // 4. Seller signal (0-10): PF is more negotiable typically
    let sellerScore = 0;
    if (sellerType === "PF") sellerScore = 10;
    else if (sellerType === "PJ") sellerScore = 6;
    else sellerScore = 4;

    // 5. Stale-vs-market penalty/bonus (0-10)
    let stalenessScore = 0;
    if (Number.isFinite(daysOnline) && Number.isFinite(marketDays)) {
      if (daysOnline > marketDays * 1.5) stalenessScore = 10;
      else if (daysOnline > marketDays) stalenessScore = 6;
      else if (daysOnline > marketDays * 0.5) stalenessScore = 3;
      else stalenessScore = 0;
    } else {
      stalenessScore = 0;
    }

    const score = Math.max(
      0,
      Math.min(100, savingsScore + peerScore + motivationScore + sellerScore + stalenessScore),
    );

    const trafficLight: "green" | "yellow" | "red" =
      score >= 70 ? "green" : score >= 45 ? "yellow" : "red";

    const maxOffer = Math.round(fipe * (1 - targetMargin));

    const signals: string[] = [];
    if (savingsPct >= 18) signals.push(`savings forte (${savingsPct}% abaixo da FIPE)`);
    else if (savingsPct >= 8) signals.push(`savings moderado (${savingsPct}%)`);
    else if (savingsPct < 2) signals.push(`praticamente FIPE (${savingsPct}%)`);
    if (Number.isFinite(marketSavings) && savingsPct - marketSavings >= 4)
      signals.push(
        `acima da mediana do peer group (+${(savingsPct - marketSavings).toFixed(1)}pp)`,
      );
    if (Number.isFinite(daysOnline) && daysOnline >= 30)
      signals.push(`anuncio antigo (${daysOnline}d) — vendedor pode estar pressionado`);
    if (Number.isFinite(reductions) && reductions >= 2)
      signals.push(`${reductions} reducoes ja aplicadas`);
    if (sellerType === "PF") signals.push("vendedor PF (mais flexivel)");
    if (price > maxOffer)
      signals.push(`preco anuncio (${price}) acima do max_offer alvo (${maxOffer})`);

    return {
      score,
      traffic_light: trafficLight,
      max_offer: maxOffer,
      target_margin_pct: targetMargin,
      components: {
        savings: savingsScore,
        peer_relative: peerScore,
        motivation: motivationScore,
        seller: sellerScore,
        staleness: stalenessScore,
      },
      signals,
    };
  },
};

// ─── Tool: set_listing_analysis ───────────────────────────────────

const setListingAnalysis: AgentTool = {
  name: "set_listing_analysis",
  description:
    "Persist the analysis result back into the listing's `attributes.analysis` JSONB field. Use this AFTER score_listing produced a result. Includes timestamp so subsequent scoring runs can detect staleness. Other attributes are preserved.",
  input_schema: {
    type: "object" as const,
    properties: {
      listing_id: { type: "string", description: "UUID of the listing" },
      score: { type: "number", description: "0-100 score from score_listing" },
      traffic_light: { type: "string", enum: ["green", "yellow", "red"] },
      max_offer: { type: "number", description: "Recommended max offer (BRL)" },
      target_margin_pct: { type: "number" },
      signals: {
        type: "array",
        items: { type: "string" },
        description: "Human-readable rationale strings",
      },
    },
    required: ["listing_id", "score", "traffic_light", "max_offer"],
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
      analysis: {
        score: input.score,
        traffic_light: input.traffic_light,
        max_offer: input.max_offer,
        target_margin_pct: input.target_margin_pct ?? 0.1,
        signals: (input.signals as string[]) ?? [],
        analyzed_at: new Date().toISOString(),
      },
    };

    const { error: writeErr } = await supabase
      .from("listings")
      .update({ attributes: merged })
      .eq("id", listingId);

    if (writeErr) return { error: writeErr.message, listing_id: listingId };
    return { listing_id: listingId, persisted: true };
  },
};

// ─── Tool: report_analysis_summary ────────────────────────────────

const reportAnalysisSummary: AgentTool = {
  name: "report_analysis_summary",
  description:
    "Log a structured summary of the analysis run. Call this LAST with totals: how many listings analyzed, breakdown by traffic light, top 3 green opportunities (with id and score). Persists to `agent_runs` via the standard logger as the final response.",
  input_schema: {
    type: "object" as const,
    properties: {
      analyzed: { type: "number" },
      green: { type: "number" },
      yellow: { type: "number" },
      red: { type: "number" },
      top_opportunities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            score: { type: "number" },
            brand: { type: "string" },
            model: { type: "string" },
            savings_pct: { type: "number" },
          },
        },
      },
      notes: { type: "string" },
    },
    required: ["analyzed"],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        analyzed: input.analyzed ?? 0,
        green: input.green ?? 0,
        yellow: input.yellow ?? 0,
        red: input.red ?? 0,
        top_opportunities: input.top_opportunities ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all analista tools ────────────────────────────────────

export const ANALISTA_TOOLS: AgentTool[] = [
  queryListingsForAnalysis,
  lookupFipe,
  computeMarketStats,
  scoreListing,
  setListingAnalysis,
  reportAnalysisSummary,
];
