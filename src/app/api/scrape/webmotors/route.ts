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

import type { Opportunity, Source } from "@/lib/mock-data/v3";
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
 * Minimal shape we rely on from Apify — both the dedicated WebMotors actor and
 * the generic web-scraper pageFunction fallback conform to this.
 * All fields are optional because scrapers degrade gracefully (missing fields
 * on a listing are common).
 */
interface WebMotorsScraped {
  url?: string;
  marca?: string;
  modelo?: string;
  trim?: string;
  ano?: number;
  anoModelo?: number;
  km?: number;
  precoPedido?: number;
  preco?: number;
  cidade?: string;
  uf?: string;
  sellerName?: string;
  vendedor?: string;
  diasOnline?: number;
  reducoes?: number;
  cor?: string;
  combustivel?: string;
  // Tolerate unknown extra keys — Apify actors often ship extras.
  [key: string]: unknown;
}

// ─── Constants ─────────────────────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
// Primary actor (dedicated WebMotors scraper). If the actor ID 404s we fall
// back to the generic web-scraper below.
const PRIMARY_ACTOR = "jupri~webmotors-br-scraper";
const FALLBACK_ACTOR = "apify~web-scraper";
const SCRAPE_TIMEOUT_MS = 45_000;

// Reasonable pageFunction for the generic actor. Kept inline (string) — Apify
// receives it as the `pageFunction` input field and executes in a headless
// browser. Covers the WebMotors price markup variants we saw during research.
const FALLBACK_PAGE_FUNCTION = `async function pageFunction(context) {
  const { request, $, log } = context;
  const text = (sel) => ($(sel).first().text() || "").trim();
  const num = (s) => {
    if (!s) return undefined;
    const digits = String(s).replace(/[^0-9]/g, "");
    return digits ? Number(digits) : undefined;
  };
  const priceRaw =
    $("[data-price]").attr("data-price") ||
    text(".price") ||
    text("[class*='price']") ||
    text("[class*='Price']");
  const title = text("h1") || text("[class*='title']");
  const kmRaw =
    text("[data-km]") ||
    text("[class*='km']") ||
    text("[class*='odometer']");
  const cidadeRaw =
    text("[class*='city']") ||
    text("[class*='location']") ||
    text("[data-city]");
  return {
    url: request.url,
    title,
    precoPedido: num(priceRaw),
    km: num(kmRaw),
    cidade: cidadeRaw,
    marca: text("[data-brand]") || undefined,
    modelo: text("[data-model]") || title || undefined,
    ano: num(text("[data-year]")),
    reducoes: num(text("[class*='priceChange']")),
    diasOnline: num(text("[class*='daysOnline']")),
  };
}`;

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
      return {
        ok: false,
        kind: "http",
        detail: `apify_${res.status}: ${sanitized}`,
        actorTried: actor,
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
  const parts = [item.marca, item.modelo, item.trim].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  if (parts.length === 0 && typeof item.title === "string") {
    return item.title;
  }
  return parts.join(" ").trim() || "Veículo importado";
}

function buildLocation(item: WebMotorsScraped): string {
  const cidade = typeof item.cidade === "string" ? item.cidade : null;
  const uf = typeof item.uf === "string" ? item.uf : null;
  if (cidade && uf) return `${cidade}, ${uf}`;
  if (cidade) return cidade;
  if (uf) return uf;
  return "Localização não informada";
}

function buildMotivationSignals(item: WebMotorsScraped): string[] {
  const signals: string[] = [];
  if (typeof item.diasOnline === "number" && item.diasOnline > 0) {
    signals.push(`${item.diasOnline} dias online`);
  }
  if (typeof item.reducoes === "number" && item.reducoes > 0) {
    signals.push(`${item.reducoes} reduções de preço`);
  }
  return signals;
}

/**
 * Rough score heuristic — the UI can refine once FIPE is fetched client-side,
 * but we still want a sensible initial value so the card looks populated.
 * We can't compare to FIPE yet (FIPE is resolved on the client post-scrape),
 * so fall back to signal-based scoring.
 */
function crudeScore(item: WebMotorsScraped): number {
  let score = 70;
  if (typeof item.diasOnline === "number" && item.diasOnline >= 60) score += 10;
  if (typeof item.reducoes === "number" && item.reducoes >= 2) score += 10;
  if (typeof item.precoPedido === "number" && item.precoPedido > 0) score += 5;
  return Math.min(95, score);
}

/**
 * Partial Opportunity shape produced by the scrape. FIPE / savings / fee /
 * margin intentionally omitted — the client fills those in after POST /api/fipe.
 */
export type ScrapedOpportunity = Omit<Opportunity, "fipe" | "savings" | "fee" | "margin">;

function mapToOpportunity(item: WebMotorsScraped): ScrapedOpportunity {
  const ano =
    typeof item.ano === "number"
      ? item.ano
      : typeof item.anoModelo === "number"
        ? item.anoModelo
        : 0;
  const km = typeof item.km === "number" ? item.km : 0;
  const dealPrice =
    typeof item.precoPedido === "number"
      ? item.precoPedido
      : typeof item.preco === "number"
        ? item.preco
        : 0;
  const sellerName =
    (typeof item.sellerName === "string" && item.sellerName) ||
    (typeof item.vendedor === "string" && item.vendedor) ||
    "Anunciante";

  const source: Source = "WebMotors";

  return {
    id: Date.now(),
    vehicle: buildVehicleString(item),
    year: ano,
    km,
    dealPrice,
    score: crudeScore(item),
    location: buildLocation(item),
    sellerName,
    img: "🚗",
    color: typeof item.cor === "string" ? item.cor : "—",
    fuel: typeof item.combustivel === "string" ? item.combustivel : "—",
    rounds: 0,
    motivationSignals: buildMotivationSignals(item),
    ddStatus: "review",
    timeLeft: "7d 00h",
    source,
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

  // First attempt: dedicated WebMotors actor.
  let result = await callApifyActor(
    PRIMARY_ACTOR,
    { startUrls: [{ url: cleanUrl }], maxItems: 1 },
    token,
    signal,
  );

  // Fall back to generic web-scraper on 404 / unknown-actor responses only.
  // Other failures (timeout, network, http 5xx) are propagated — a fallback
  // attempt after a timeout would exceed the overall 45s budget.
  if (
    !result.ok &&
    result.kind === "http" &&
    (result.detail.startsWith("apify_404") || result.detail.includes("actor-not-found"))
  ) {
    result = await callApifyActor(
      FALLBACK_ACTOR,
      {
        startUrls: [{ url: cleanUrl }],
        pageFunction: FALLBACK_PAGE_FUNCTION,
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
      },
      token,
      signal,
    );
  }

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
