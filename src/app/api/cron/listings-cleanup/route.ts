/**
 * GET /api/cron/listings-cleanup
 *
 * D-05 stale cleanup. Vercel Cron calls this endpoint daily.
 * Updates `listings.status` to 'removed' for any row whose `last_scraped_at`
 * is older than 72 hours and which is not already removed.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron contract).
 * Compared in constant time via verifySharedSecret to defeat timing attacks
 * against the secret.
 *
 * Runtime: nodejs (service-role Supabase client requires Node APIs).
 */

import { verifySharedSecret } from "@/lib/apify/webhook-auth";
import { getSupabaseServiceRole } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_HOURS = 72;
const BEARER_PREFIX = "Bearer ";

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

  const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseServiceRole();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: "removed" })
    .lt("last_scraped_at", cutoff)
    .neq("status", "removed")
    .select("id");

  if (error) {
    console.error(`listings_cleanup_failed cutoff=${cutoff} reason=${error.message}`);
    return Response.json({ error: "db_update_failed", detail: error.message }, { status: 500 });
  }

  return Response.json({ removed: data?.length ?? 0 }, { status: 200 });
}
