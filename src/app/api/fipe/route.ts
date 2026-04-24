import {
  anosResponseSchema,
  marcaSchema,
  modelosResponseSchema,
  valorResponseSchema,
} from "@/lib/schemas/fipe";
import { listingSchema } from "@/lib/schemas/listing";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { parseFipeValor } from "@/lib/utils/fipe";
import { z } from "zod";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const fipeRequestSchema = listingSchema.pick({ marca: true, modelo: true, ano: true });

const PARALLELUM_BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const UPSTREAM_TIMEOUT_MS = 10_000;

type ErrorBody = { error: string; retryAfter?: number };
type SuccessBody = { fipe: number; marca: string; modelo: string; ano: number };

function genericError(status: number, body: ErrorBody): Response {
  return Response.json(body, {
    status,
    headers: body.retryAfter !== undefined ? { "Retry-After": String(body.retryAfter) } : undefined,
  });
}

function extractIp(request: Request): string {
  const h = request.headers.get("x-forwarded-for");
  return h?.split(",")[0]?.trim() || "unknown";
}

const UPSTREAM_FAIL = { __upstreamFailed: true } as const;
type UpstreamFail = typeof UPSTREAM_FAIL;

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T | UpstreamFail> {
  try {
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      return UPSTREAM_FAIL;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return UPSTREAM_FAIL;
    }
    const data = await res.json();
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.warn("Parallelum schema mismatch:", url, parsed.error.message);
      return UPSTREAM_FAIL;
    }
    return parsed.data;
  } catch (err) {
    console.warn("Parallelum fetch failed:", url, String(err));
    return UPSTREAM_FAIL;
  }
}

function isUpstreamFail<T>(v: T | UpstreamFail): v is UpstreamFail {
  return typeof v === "object" && v !== null && "__upstreamFailed" in v;
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

// Prefer word-boundary token matches (so "Gol" doesn't swallow "Golf").
// Falls back to raw substring match if no boundary candidate survives,
// preserving tolerance for odd inputs like "gol1.6".
function fuzzyMatchAll<T extends { nome: string }>(items: T[], needle: string): T[] {
  const q = needle.trim().toLowerCase();
  if (q.length === 0) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  // Boundary on BOTH sides — `\bgol` alone still matches "golf" because "gol"
  // is a prefix of "golf" at a word start. `\bgol\b` requires a non-word char
  // after the last token char too (space, end-of-string, punctuation).
  const regexes = tokens.map((t) => new RegExp(`\\b${t.replace(REGEX_ESCAPE, "\\$&")}\\b`));
  const boundaryHits = items.filter((x) => {
    const name = x.nome.toLowerCase();
    return regexes.every((re) => re.test(name));
  });
  const pool =
    boundaryHits.length > 0 ? boundaryHits : items.filter((x) => x.nome.toLowerCase().includes(q));
  return [...pool].sort((a, b) => a.nome.length - b.nome.length);
}

function fuzzyMatch<T extends { nome: string }>(items: T[], needle: string): T | null {
  const hits = fuzzyMatchAll(items, needle);
  return hits.length > 0 ? hits[0] : null;
}

export async function GET(request: Request): Promise<Response> {
  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "fipe", max: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return genericError(429, { error: "rate_limited", retryAfter: rl.retryAfter });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  if (type === "brands") {
    const marcas = await fetchJson(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
    if (isUpstreamFail(marcas)) {
      return genericError(502, { error: "upstream_failed" });
    }
    return Response.json({ brands: marcas }, { status: 200 });
  }

  if (type === "models") {
    const brand = url.searchParams.get("brand");
    if (!brand) {
      return genericError(400, { error: "missing_brand" });
    }
    const marcas = await fetchJson(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
    if (isUpstreamFail(marcas)) {
      return genericError(502, { error: "upstream_failed" });
    }
    const marcaMatch = fuzzyMatch(marcas, brand);
    if (!marcaMatch) {
      return genericError(404, { error: "not_found" });
    }
    const modelosRes = await fetchJson(
      `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos`,
      modelosResponseSchema,
      signal,
    );
    if (isUpstreamFail(modelosRes)) {
      return genericError(502, { error: "upstream_failed" });
    }
    return Response.json({ models: modelosRes.modelos }, { status: 200 });
  }

  return genericError(400, { error: "invalid_type" });
}

export async function POST(request: Request): Promise<Response> {
  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "fipe", max: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return genericError(429, { error: "rate_limited", retryAfter: rl.retryAfter });
  }

  let body: z.infer<typeof fipeRequestSchema>;
  try {
    const raw = await request.json();
    const parsed = fipeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return genericError(400, { error: "invalid_body" });
    }
    body = parsed.data;
  } catch {
    return genericError(400, { error: "invalid_body" });
  }

  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  const marcasRes = await fetchJson(`${PARALLELUM_BASE}/marcas`, z.array(marcaSchema), signal);
  if (isUpstreamFail(marcasRes)) return genericError(502, { error: "upstream_failed" });
  const marcaMatch = fuzzyMatch(marcasRes, body.marca);
  if (!marcaMatch) return genericError(404, { error: "not_found" });

  const modelosRes = await fetchJson(
    `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos`,
    modelosResponseSchema,
    signal,
  );
  if (isUpstreamFail(modelosRes)) return genericError(502, { error: "upstream_failed" });
  const modeloCandidates = fuzzyMatchAll(modelosRes.modelos, body.modelo);
  if (modeloCandidates.length === 0) return genericError(404, { error: "not_found" });

  // Picking only the shortest name often maps to a trim that doesn't cover the
  // requested ano. Probe candidates in chunks with early-break: fan out
  // CHUNK_SIZE fetches per wave and stop as soon as a chunk yields a year
  // match. Pure Promise.all over 120 candidates saturates Vercel Edge's
  // outbound connection pool under production latency — the 10s AbortSignal
  // fires before most fetches settle and every candidate returns
  // UPSTREAM_FAIL, producing a false-negative 404 for valid queries. Chunking
  // keeps concurrency tractable while still resolving the common case in one
  // upstream RTT (most marca+modelo+ano hits are in the first 10 candidates).
  //
  // The cap must be generous: popular marca+modelo pairs (e.g. Volkswagen + Gol)
  // produce 100+ boundary hits in Parallelum, and the shortest names skew toward
  // 1990s/2000s trims that don't cover recent anos. A low cap (20) silently
  // returned 404 for common queries like "Gol 2015". 120 is a safe band that
  // covers every marca's realistic modelo set without saturating upstream.
  const yearStr = String(body.ano);
  const MAX_MODELO_CANDIDATES = 120;
  const CHUNK_SIZE = 10;
  const probeList = modeloCandidates.slice(0, MAX_MODELO_CANDIDATES);

  let modeloMatch: (typeof modeloCandidates)[number] | null = null;
  let anoMatch: { codigo: string; nome: string } | null = null;

  for (let start = 0; start < probeList.length; start += CHUNK_SIZE) {
    const chunk = probeList.slice(start, start + CHUNK_SIZE);
    const anosResults = await Promise.all(
      chunk.map((candidate) =>
        fetchJson(
          `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos/${encodeURIComponent(String(candidate.codigo))}/anos`,
          anosResponseSchema,
          signal,
        ),
      ),
    );
    for (let i = 0; i < chunk.length; i++) {
      const anosRes = anosResults[i];
      if (isUpstreamFail(anosRes)) continue; // tolerate a subset of upstream errors
      const anoMatches = anosRes.filter((a) => a.codigo.startsWith(`${yearStr}-`));
      if (anoMatches.length > 0) {
        modeloMatch = chunk[i];
        anoMatch = anoMatches.find((a) => a.codigo.endsWith("-1")) ?? anoMatches[0];
        break;
      }
    }
    if (modeloMatch) break;
  }

  if (!modeloMatch || !anoMatch) return genericError(404, { error: "not_found" });

  const valorRes = await fetchJson(
    `${PARALLELUM_BASE}/marcas/${encodeURIComponent(marcaMatch.codigo)}/modelos/${encodeURIComponent(String(modeloMatch.codigo))}/anos/${encodeURIComponent(anoMatch.codigo)}`,
    valorResponseSchema,
    signal,
  );
  if (isUpstreamFail(valorRes)) return genericError(502, { error: "upstream_failed" });

  let fipe: number;
  try {
    fipe = parseFipeValor(valorRes.Valor);
  } catch {
    return genericError(502, { error: "upstream_failed" });
  }

  const payload: SuccessBody = {
    fipe,
    marca: valorRes.Marca,
    modelo: valorRes.Modelo,
    ano: valorRes.AnoModelo,
  };
  return Response.json(payload, { status: 200 });
}
