/**
 * Apify REST API thin wrappers — Phase 8.
 *
 * Two functions used by the webhook route to ingest a scheduled-run payload:
 *   - getActorRun(runId, token, signal): RunMeta — pulls run metadata + cost.
 *   - streamDatasetItems(datasetId, token, signal): AsyncGenerator<T> — paginates dataset.
 *
 * Conventions match the existing on-demand route at
 * `src/app/api/scrape/webmotors/route.ts:165-257`:
 *   - APIFY_BASE = "https://api.apify.com/v2"  (HTTPS only, no override)
 *   - encodeURIComponent everything that goes into the URL
 *   - Accept: application/json
 *   - AbortSignal forwarded into fetch
 *   - Token NEVER appears in thrown error messages (token-scrub on every catch)
 *
 * No npm Apify SDK dependency — direct fetch keeps the surface small and the
 * token-leak risk auditable in one file.
 *
 * Threat-model notes (08-05-PLAN § threat_model):
 *   - T-08-05-01: token scrubbed before throw → see scrubToken().
 *   - T-08-05-02: zero log/print calls in this module (asserted by acceptance grep).
 *   - T-08-05-03: streamDatasetItems is a generator — never accumulates a full page set.
 *   - T-08-05-05: APIFY_BASE is hardcoded HTTPS, no parameter override possible.
 *   - T-08-05-06: AbortSignal forwarded into every fetch call.
 */

const APIFY_BASE = "https://api.apify.com/v2";

export interface RunMeta {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
  defaultDatasetId: string;
  usageTotalUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Replace every literal occurrence of `token` in `String(err)` with `[REDACTED]`
 * and re-wrap in a fresh Error so the original (potentially leaky) error is dropped
 * before propagation. Mirrors the discipline at `route.ts:204-207`.
 */
function scrubToken(err: unknown, token: string): Error {
  const raw = err instanceof Error ? (err.message ?? String(err)) : String(err);
  const safe = raw.replace(new RegExp(token, "g"), "[REDACTED]");
  return new Error(safe);
}

export async function getActorRun(
  runId: string,
  token: string,
  signal: AbortSignal,
): Promise<RunMeta> {
  const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    throw scrubToken(err, token);
  }
  if (!res.ok) {
    // Status code only — no upstream body, no token. Webhook route logs the
    // {runId, status} pair separately on failure.
    throw new Error(`apify_run_meta_${res.status}`);
  }
  let json: { data: RunMeta };
  try {
    json = (await res.json()) as { data: RunMeta };
  } catch (err) {
    throw scrubToken(err, token);
  }
  return json.data;
}

export async function* streamDatasetItems<T>(
  datasetId: string,
  token: string,
  signal: AbortSignal,
  pageSize = 1000,
): AsyncGenerator<T, void, void> {
  let offset = 0;
  while (true) {
    const url =
      `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}` +
      `/items?clean=true&limit=${pageSize}&offset=${offset}` +
      `&token=${encodeURIComponent(token)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (err) {
      throw scrubToken(err, token);
    }
    if (!res.ok) {
      throw new Error(`apify_dataset_${res.status}`);
    }
    let items: T[];
    try {
      items = (await res.json()) as T[];
    } catch (err) {
      throw scrubToken(err, token);
    }
    if (items.length === 0) return;
    for (const item of items) yield item;
    // Short page (less than pageSize) means we exhausted the dataset — return
    // without an extra fetch. Apify guarantees a short page only at the tail.
    if (items.length < pageSize) return;
    offset += pageSize;
  }
}
