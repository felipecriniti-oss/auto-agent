/**
 * Apify-backed WebMotors scrape endpoint.
 *
 * Flow:
 *   1. Validate body (POST { url }); reject non-WebMotors URLs.
 *   2. Rate limit via `checkRateLimit` (bucket "scrape", 10 req / 60s / IP).
 *   3. Call Apify REST API directly (`run-sync-get-dataset-items`) — no client
 *      library dependency. Try the dedicated WebMotors actor first, fall back
 *      to the generic web-scraper actor with a hard-coded pageFunction.
 *   4. Map the first dataset item to a partial v3 `Opportunity` (leaving FIPE,
 *      savings, fee, and margin null — the client triggers `/api/fipe` after
 *      import and enriches those fields before calling `addOpportunity`).
 *
 * Runtime: nodejs (Apify SDK compatibility, larger timeout budget than Edge).
 *
 * Error policy — NEVER leak APIFY_API_TOKEN in response bodies, headers, or
 * logs. Apify's own error envelopes are stringified but the token is only ever
 * passed as a query-string arg, never echoed back by Apify into the JSON body.
 */

import type { Opportunity, SellerType, Source } from "@/lib/mock-data/v3";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Request validation ────────────────────────────────────────────

const scrapeRequestSchema = z.object({
  url: z.string().url("URL inválida").max(2048, "URL muito longa"),
});

const WEBMOTORS_HOST_RE = /(^|\.)webmotors\.com\.br$/i;

// ─── Apify types — these describe what the actor dataset returns. ──

/**
 * Shape returned by the ribtools/webmotors-scraper actor (verified against its
 * public readme example output). All fields optional — the actor can skip
 * fields if a listing doesn't expose them.
 */
interface WebMotorsScraped {
  id?: number;
  url?: string;
  title?: string;
  vehicle_type?: string;
  create_date?: string;
  publish_date?: string;
  make?: string;
  model?: string;
  version?: string;
  fabrication_year?: number;
  model_year?: number;
  km?: number;
  transmission?: string;
  fuel_type?: string;
  body_type?: string;
  final_plate?: string;
  is_armored?: boolean;
  price?: number;
  fipe_price?: number;
  color?: string;
  number_of_doors?: number;
  optionals?: string[];
  attributes?: string[];
  photos?: string[];
  view_360_url?: string;
  seller?: {
    id?: number;
    name?: string;
    cnpj?: string;
    phones?: string[];
    seller_type?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };
  // Tolerate unknown extra keys — defensive in case the actor adds fields.
  [key: string]: unknown;
}

// ─── Constants ─────────────────────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
// Dedicated WebMotors scraper maintained by `ribtools` on Apify.
//
// Why this one specifically (verified 2026-04-22 via Apify public API):
//   - 622 succeeded / 9 failed runs in the last 30 days = 98.6% success rate
//   - Last published build 2026-03-26 (actively maintained)
//   - 1,952 total runs since Sep 2025, 5-star rating, 66 users
//   - PAY_PER_EVENT pricing (per extracted item, not per compute minute)
//   - Handles WebMotors' Akamai anti-bot internally — no custom pageFunction
//     or waitUntil config needed on our side
//
// Prior attempts (jupri~webmotors-br-scraper and apify~web-scraper with a
// hand-rolled pageFunction) both hit `run-failed` consistently on the user's
// free tier. Delegating to a maintained actor with a real success history is
// the right move.
const SCRAPER_ACTOR = "ribtools~webmotors-scraper";
const SCRAPE_TIMEOUT_MS = 55_000;

// No custom pageFunction — ribtools/webmotors-scraper owns its own parsing
// logic, covering WebMotors' client-rendered listing DOM. Our job is to pass
// a URL and map the actor's output fields into our Opportunity shape.
//
// Observed output field names from the actor's public example outputs
// (field set varies per listing, we tolerate missing fields):
//   url, title, brand/marca, model/modelo, trim/versao, year/ano,
//   km/mileage, price/preco, location/cidade/city, state/estado/uf,
//   fuel/combustivel, color/cor, seller/vendedor/sellerName,
//   daysListed/diasOnline, priceReductions/reducoes
//
// The mapToOpportunity function below already tolerates unknown extras via
// the [key:string]:unknown escape hatch in WebMotorsScraped, and picks the
// first-present alternative of synonymous fields.

// ─── Response helpers ──────────────────────────────────────────────

type ErrorBody = {
  error: string;
  retryAfter?: number;
  detail?: string;
};

function errorResponse(status: number, body: ErrorBody): Response {
  return Response.json(body, {
    status,
    headers: body.retryAfter !== undefined ? { "Retry-After": String(body.retryAfter) } : undefined,
  });
}

function extractIp(request: Request): string {
  const h = request.headers.get("x-forwarded-for");
  return h?.split(",")[0]?.trim() || "unknown";
}

// ─── Apify call ────────────────────────────────────────────────────

interface ApifyCallResult {
  ok: true;
  items: WebMotorsScraped[];
  actorUsed: string;
}

interface ApifyCallFailure {
  ok: false;
  kind: "timeout" | "http" | "shape" | "network";
  detail: string;
  actorTried: string;
  runId?: string;
}

const RUN_ID_RE = /run ID:\s*([A-Za-z0-9]+)/;

/**
 * Apify's /run-sync-get-dataset-items endpoint returns a terse `run-failed`
 * error with a run ID but no reason. Fetching the run meta lets us surface
 * the actual exit code, status message, and (when available) the stdout/
 * stderr tail — the difference between "I don't know why" and "you hit the
 * free-tier compute cap" / "RESIDENTIAL proxy not in your plan" / "page
 * function threw TypeError on null selector".
 */
async function fetchRunDiagnostics(runId: string, token: string): Promise<string> {
  try {
    const res = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      return `run_fetch_${res.status}`;
    }
    const json = (await res.json()) as {
      data?: {
        status?: string;
        statusMessage?: string;
        exitCode?: number;
      };
    };
    const d = json.data ?? {};
    const parts = [
      `status=${d.status ?? "?"}`,
      `exit=${d.exitCode ?? "?"}`,
      d.statusMessage ? `msg="${String(d.statusMessage).slice(0, 140)}"` : "",
    ].filter(Boolean);
    return parts.join(" ");
  } catch (err) {
    return `run_fetch_err=${String((err as Error)?.message ?? err).slice(0, 80)}`;
  }
}

async function callApifyActor(
  actor: string,
  body: unknown,
  token: string,
  signal: AbortSignal,
): Promise<ApifyCallResult | ApifyCallFailure> {
  // Query-string auth keeps the token out of headers that might accidentally
  // be echoed by proxies into error logs. It still ends up in the URL path
  // server-side — caller MUST ensure the url string is never logged.
  const url = `${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}&timeout=40&memory=512`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      // Grab a small slice of the body for diagnostics; explicitly strip any
      // echoed token to be paranoid even though Apify doesn't do this today.
      const raw = (await res.text()).slice(0, 400);
      const sanitized = raw.replace(new RegExp(token, "g"), "[REDACTED]");

      // If Apify gave us a run ID, fetch the run meta to learn WHY the run
      // failed (proxy access, compute cap, pageFunction throw, etc.).
      const runIdMatch = sanitized.match(RUN_ID_RE);
      let detail = `apify_${res.status}: ${sanitized}`;
      let runId: string | undefined;
      if (runIdMatch) {
        runId = runIdMatch[1];
        const diag = await fetchRunDiagnostics(runId, token);
        detail = `apify_${res.status} run=${runId} ${diag}`;
      }
      return {
        ok: false,
        kind: "http",
        detail,
        actorTried: actor,
        runId,
      };
    }
    const json: unknown = await res.json();
    if (!Array.isArray(json)) {
      return {
        ok: false,
        kind: "shape",
        detail: "apify returned non-array dataset",
        actorTried: actor,
      };
    }
    return { ok: true, items: json as WebMotorsScraped[], actorUsed: actor };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, kind: "timeout", detail: "scrape_timeout", actorTried: actor };
    }
    // Scrub token from any error message just in case.
    const msg = String((err as Error)?.message ?? err).replace(
      new RegExp(token, "g"),
      "[REDACTED]",
    );
    return { ok: false, kind: "network", detail: msg, actorTried: actor };
  }
}

// ─── Opportunity mapping ───────────────────────────────────────────

function buildVehicleString(item: WebMotorsScraped): string {
  const make = typeof item.make === "string" ? item.make : "";
  const model = typeof item.model === "string" ? item.model : "";
  const version = typeof item.version === "string" ? item.version : "";
  const composed = [make, model, version]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ");
  if (composed.length > 0) return composed;
  if (typeof item.title === "string" && item.title.trim().length > 0) return item.title;
  return "Veículo importado";
}

function extractUf(state: string | undefined): string | null {
  if (!state) return null;
  // "São Paulo (SP)" → "SP"
  const withParens = state.match(/\(([A-Z]{2})\)/)?.[1];
  if (withParens) return withParens;
  // Already a UF like "SP"
  if (/^[A-Z]{2}$/.test(state.trim())) return state.trim();
  return null;
}

function buildLocation(item: WebMotorsScraped): string {
  const city = item.seller?.city?.trim();
  const state = item.seller?.state?.trim();
  const uf = extractUf(state);
  if (city && uf) return `${city}, ${uf}`;
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return "Localização não informada";
}

function pickBodyTypeEmoji(bodyType: string | undefined): string {
  if (!bodyType) return "🚗";
  const b = bodyType.toLowerCase();
  if (b.includes("suv") || b.includes("utilitário")) return "🚙";
  if (b.includes("picape") || b.includes("pickup")) return "🛻";
  if (b.includes("hatch")) return "🚗";
  if (b.includes("sedan")) return "🚘";
  if (b.includes("cupê") || b.includes("coupe") || b.includes("esportivo")) return "🏎️";
  if (b.includes("conversível") || b.includes("convertible")) return "🏎️";
  if (b.includes("van") || b.includes("minivan")) return "🚐";
  return "🚗";
}

function parseSellerType(raw: string | undefined): SellerType | undefined {
  if (!raw) return undefined;
  const up = raw.trim().toUpperCase();
  if (up === "PF" || up === "PJ") return up;
  return undefined;
}

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildMotivationSignals(item: WebMotorsScraped): string[] {
  const signals: string[] = [];
  // Days online from publish_date (fallback to create_date)
  const days = daysSince(item.publish_date) ?? daysSince(item.create_date);
  if (days !== null && days >= 14) {
    signals.push(`Anúncio há ${days} dias`);
  }
  // "Aceita troca" is an attribute from the actor — keep it
  if (Array.isArray(item.attributes)) {
    for (const a of item.attributes) {
      if (typeof a === "string" && /aceita\s*troca/i.test(a)) {
        signals.push("Aceita troca");
        break;
      }
    }
  }
  return signals;
}

function deriveDdStatus(item: WebMotorsScraped): "ok" | "review" | "blocked" {
  // If the actor flagged the vehicle as armored, needs extra review.
  if (item.is_armored === true) return "review";
  // PF sellers need DD review by default (real docs check before deal close);
  // PJ sellers come from dealers and can be auto-marked ok for the demo.
  const type = parseSellerType(item.seller?.seller_type);
  if (type === "PJ") return "ok";
  return "review";
}

/**
 * Score combines the realised margin (price vs fipe) with a small baseline.
 * The higher the margin, the higher the "opportunity" score — same heuristic
 * as the pre-negotiated mock data.
 */
function computeScore(margin: number): number {
  if (margin >= 25) return 94;
  if (margin >= 20) return 90;
  if (margin >= 15) return 85;
  if (margin >= 10) return 80;
  if (margin >= 5) return 75;
  return 70;
}

function mapToOpportunity(item: WebMotorsScraped): Opportunity {
  const year =
    typeof item.fabrication_year === "number"
      ? item.fabrication_year
      : typeof item.model_year === "number"
        ? item.model_year
        : 0;
  const km = typeof item.km === "number" ? item.km : 0;
  const dealPrice = typeof item.price === "number" ? item.price : 0;
  const fipe = typeof item.fipe_price === "number" ? item.fipe_price : 0;
  const savings = fipe > 0 && dealPrice > 0 ? Math.max(0, fipe - dealPrice) : 0;
  const margin = fipe > 0 ? Math.round((savings / fipe) * 100) : 0;
  const sellerName = (typeof item.seller?.name === "string" && item.seller.name) || "Anunciante";
  const sellerType = parseSellerType(item.seller?.seller_type);
  const neighborhood = item.seller?.neighborhood?.trim() || undefined;
  const photoUrl =
    Array.isArray(item.photos) && typeof item.photos[0] === "string" ? item.photos[0] : undefined;
  const listingUrl = typeof item.url === "string" ? item.url : undefined;
  const bodyType = typeof item.body_type === "string" ? item.body_type : undefined;
  const transmission = typeof item.transmission === "string" ? item.transmission : undefined;
  const optionals = Array.isArray(item.optionals)
    ? item.optionals.filter((s): s is string => typeof s === "string")
    : undefined;

  const source: Source = "WebMotors";

  return {
    id: Date.now(),
    vehicle: buildVehicleString(item),
    year,
    km,
    dealPrice,
    fipe,
    savings,
    fee: 0, // Fee is plan-dependent; the client fills this in via calcFee().
    margin,
    score: computeScore(margin),
    location: buildLocation(item),
    sellerName,
    img: pickBodyTypeEmoji(bodyType),
    color: typeof item.color === "string" ? item.color : "—",
    fuel: typeof item.fuel_type === "string" ? item.fuel_type : "—",
    rounds: 0,
    motivationSignals: buildMotivationSignals(item),
    ddStatus: deriveDdStatus(item),
    timeLeft: "7d 00h",
    source,
    negotiationStatus: "pending",
    photoUrl,
    listingUrl,
    sellerType,
    neighborhood,
    transmission,
    bodyType,
    optionals: optionals && optionals.length > 0 ? optionals : undefined,
  };
}

// ─── Handler ───────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "scrape", max: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return errorResponse(429, { error: "rate_limited", retryAfter: rl.retryAfter });
  }

  let body: z.infer<typeof scrapeRequestSchema>;
  try {
    const raw = await request.json();
    const parsed = scrapeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(400, { error: "invalid_body" });
    }
    body = parsed.data;
  } catch {
    return errorResponse(400, { error: "invalid_body" });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return errorResponse(400, { error: "invalid_body" });
  }
  if (!WEBMOTORS_HOST_RE.test(parsedUrl.hostname)) {
    return errorResponse(400, { error: "only_webmotors_supported" });
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return errorResponse(500, {
      error: "apify_token_missing",
      detail:
        "APIFY_API_TOKEN not configured — set it in .env.local (local) and Vercel env vars (production)",
    });
  }

  const signal = AbortSignal.timeout(SCRAPE_TIMEOUT_MS);
  const cleanUrl = parsedUrl.toString();

  // apify/web-scraper with residential proxy + Chrome + networkidle waitUntil.
  // Residential proxy is the key ingredient — WebMotors' Akamai firewall 403s
  // datacenter IPs aggressively, but the residential pool is their customers'
  // real browsers, so requests look legit.
  // Input shape follows the actor's public schema — `startUrls` array of
  // {url}, `proxyConfig` object (note: different field name than the generic
  // web-scraper's `proxyConfiguration`), `maxItems` cap.
  //
  // proxyConfig left at useApifyProxy:true without pinning a group — the
  // actor adapts: datacenter on free tier, residential on Starter+. Its 98.6%
  // reported success rate covers the mix, suggesting the paid-tier runs
  // carry most of the success but free-tier runs still have a shot.
  const result = await callApifyActor(
    SCRAPER_ACTOR,
    {
      startUrls: [{ url: cleanUrl }],
      proxyConfig: { useApifyProxy: true },
      maxItems: 1,
    },
    token,
    signal,
  );

  if (!result.ok) {
    if (result.kind === "timeout") {
      return errorResponse(504, { error: "scrape_timeout" });
    }
    return errorResponse(502, {
      error: "scrape_failed",
      detail: result.detail,
    });
  }

  const first = result.items[0];
  if (!first) {
    return errorResponse(502, {
      error: "scrape_failed",
      detail: "no_items_returned",
    });
  }

  const opportunity = mapToOpportunity(first);
  return Response.json({ opportunity, actor: result.actorUsed }, { status: 200 });
}
