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
