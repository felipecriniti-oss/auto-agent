/**
 * Phase 8 — Pure normalization: WebMotorsScraped → DbListing.Insert.
 *
 * Discriminated union output:
 *   { ok: true, row, needsFipe }   when the listing is valid and accepted
 *   { ok: false, reason }          when the listing is rejected (filter or missing required)
 *
 * Pure function: no I/O, no console, no DB access. Filtros eliminatorios are
 * delegated to `./filters.ts`. FIPE enrichment is a separate concern (handled
 * by the caller — see `src/app/api/scrape/webmotors/webhook/route.ts`).
 *
 * Threat mitigations (per plan threat_model):
 *   T-08-04-01: every field access uses `typeof`/`Array.isArray` guards;
 *               malformed actor JSON returns typed rejection, never throws.
 *   T-08-04-02: seller phones are intentionally NOT mapped into the row.
 *               Only city + state + seller_type are persisted.
 *   T-08-04-05: fingerprint is sha256("webmotors:" + raw.id) — collision-resistant.
 */
import { createHash } from "node:crypto";
import type { Tables } from "@/types/database";
import { type FilterReason, detectBlockingFilter } from "./filters";
import type { WebMotorsScraped } from "./types";

export type NormalizeResult =
  | { ok: true; row: Tables["listings"]["Insert"]; needsFipe: boolean }
  | { ok: false; reason: FilterReason | "missing_required" | "invalid_data" };

function extractUf(state: string | undefined): string | null {
  if (!state) return null;
  const withParens = state.match(/\(([A-Z]{2})\)/)?.[1];
  if (withParens) return withParens;
  if (/^[A-Z]{2}$/.test(state.trim())) return state.trim();
  return null;
}

function parseSellerType(raw: string | undefined): "PF" | "PJ" | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === "PF" || up === "PJ") return up;
  return null;
}

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildMotivationSignals(item: WebMotorsScraped): Record<string, unknown> {
  const days = daysSince(item.publish_date) ?? daysSince(item.create_date);
  const signals: Record<string, unknown> = {};
  if (days !== null && days >= 14) signals.days_online_threshold = days;
  if (
    Array.isArray(item.attributes) &&
    item.attributes.some((a): a is string => typeof a === "string" && /aceita\s*troca/i.test(a))
  ) {
    signals.aceita_troca = true;
  }
  return signals;
}

export function normalizeWebMotorsItem(raw: WebMotorsScraped): NormalizeResult {
  const blocked = detectBlockingFilter(raw);
  if (blocked) return { ok: false, reason: blocked };

  if (raw.id == null) return { ok: false, reason: "missing_required" };
  const sourceListingId = String(raw.id);
  const fingerprint = createHash("sha256").update(`webmotors:${sourceListingId}`).digest("hex");

  const year =
    typeof raw.fabrication_year === "number"
      ? raw.fabrication_year
      : typeof raw.model_year === "number"
        ? raw.model_year
        : null;

  const price = typeof raw.price === "number" ? raw.price : null;
  const fipe = typeof raw.fipe_price === "number" ? raw.fipe_price : null;
  const savingsVsFipe = price !== null && fipe !== null ? fipe - price : null;
  const savingsPct =
    price !== null && fipe !== null && fipe > 0 ? ((fipe - price) / fipe) * 100 : null;

  const photo =
    Array.isArray(raw.photos) && typeof raw.photos[0] === "string" ? raw.photos[0] : null;

  const row: Tables["listings"]["Insert"] = {
    source: "webmotors",
    source_listing_id: sourceListingId,
    fingerprint,
    brand: typeof raw.make === "string" ? raw.make : null,
    model: typeof raw.model === "string" ? raw.model : null,
    trim: typeof raw.version === "string" ? raw.version : null,
    year,
    km: typeof raw.km === "number" ? raw.km : null,
    price,
    fipe,
    savings_vs_fipe: savingsVsFipe,
    savings_pct: savingsPct,
    seller_type: parseSellerType(raw.seller?.seller_type),
    seller_location: null,
    seller_uf: extractUf(raw.seller?.state),
    seller_city: raw.seller?.city ?? null,
    listing_url: typeof raw.url === "string" ? raw.url : null,
    photo_url: photo,
    days_online: daysSince(raw.publish_date) ?? daysSince(raw.create_date),
    reductions: null,
    attributes: {
      color: raw.color ?? null,
      fuel_type: raw.fuel_type ?? null,
      body_type: raw.body_type ?? null,
      transmission: raw.transmission ?? null,
      doors: raw.number_of_doors ?? null,
      plate: raw.final_plate ?? null,
      armored: raw.is_armored ?? null,
      optionals: Array.isArray(raw.optionals) ? raw.optionals : [],
    },
    motivation_signals: buildMotivationSignals(raw),
    status: "active",
  };

  const needsFipe = row.fipe == null && row.brand != null && row.model != null && row.year != null;
  return { ok: true, row, needsFipe };
}
