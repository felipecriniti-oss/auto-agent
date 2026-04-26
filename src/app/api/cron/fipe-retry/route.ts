/**
 * GET /api/cron/fipe-retry
 *
 * D-04 retry queue. Vercel Cron calls this hourly. Drains the queue of
 * listings inserted with `fipe=null + attributes.fipe_retry_pending=true`
 * (set by the webhook route when Parallelum was unreachable).
 *
 * For each pending row (max 100/run): call /api/fipe; on success, UPDATE
 * with the fipe value + recomputed savings + clear the retry flag.
 *
 * Concurrency: chunked at 10 (anti Promise.all-explosion — see RESEARCH §
 * Pitfalls #4 / commit 75b3177 lesson from Phase 1).
 *
 * Auth: Authorization: Bearer $CRON_SECRET (Vercel Cron contract).
 * Compared in constant time via verifySharedSecret to defeat timing attacks.
 *
 * Runtime: nodejs (service-role Supabase client + outbound fetch budget).
 */

import { verifySharedSecret } from "@/lib/apify/webhook-auth";
import { getSupabaseServiceRole } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BEARER_PREFIX = "Bearer ";
const MAX_PER_RUN = 100;
const CHUNK = 10;

interface PendingRow {
  id: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  attributes: Record<string, unknown>;
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "misconfigured", detail: "CRON_SECRET not set" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith(BEARER_PREFIX)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const provided = auth.slice(BEARER_PREFIX.length);
  if (!verifySharedSecret(provided, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceRole();

  const { data: rows, error: selErr } = await supabase
    .from("listings")
    .select("id, brand, model, year, price, attributes")
    .filter("attributes->>fipe_retry_pending", "eq", "true")
    .is("fipe", null)
    .limit(MAX_PER_RUN);

  if (selErr) {
    console.error(`fipe_retry_select_failed reason=${selErr.message}`);
    return Response.json({ error: "db_read_failed", detail: selErr.message }, { status: 500 });
  }

  const pending = (rows ?? []) as PendingRow[];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    await Promise.allSettled(
      slice.map(async (row) => {
        if (!row.brand || !row.model || row.year === null) {
          failed += 1;
          return;
        }
        const fipe = await callFipeOrNull(row.brand, row.model, row.year);
        if (fipe === null) {
          failed += 1;
          return;
        }
        const savingsVsFipe = row.price !== null ? fipe - row.price : null;
        const savingsPct =
          row.price !== null && fipe > 0 ? ((fipe - row.price) / fipe) * 100 : null;
        const nextAttrs: Record<string, unknown> = { ...row.attributes };
        // biome-ignore lint/performance/noDelete: removing the retry flag from JSONB requires actual key removal
        delete nextAttrs.fipe_retry_pending;

        const { error: upErr } = await supabase
          .from("listings")
          .update({
            fipe,
            savings_vs_fipe: savingsVsFipe,
            savings_pct: savingsPct,
            attributes: nextAttrs,
          })
          .eq("id", row.id);
        if (upErr) {
          failed += 1;
          return;
        }
        succeeded += 1;
      }),
    );
  }

  return Response.json({ processed: pending.length, succeeded, failed }, { status: 200 });
}

async function callFipeOrNull(brand: string, model: string, year: number): Promise<number | null> {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/fipe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marca: brand, modelo: model, ano: year }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { fipe?: number };
    return typeof json.fipe === "number" ? json.fipe : null;
  } catch {
    return null;
  }
}
