---
phase: 08-scraping-pipeline
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/app/api/scrape/webmotors/webhook/route.ts
  - src/app/api/scrape/webmotors/webhook/route.test.ts
  - src/lib/apify/webhook-auth.ts
  - src/lib/apify/webhook-auth.test.ts
  - src/lib/apify/client.ts
  - src/lib/apify/client.test.ts
  - src/lib/apify/webmotors-normalize.ts
  - src/lib/apify/webmotors-normalize.test.ts
  - src/lib/apify/filters.ts
  - src/lib/apify/filters.test.ts
  - src/lib/apify/types.ts
  - src/lib/apify/target-models.ts
  - src/lib/apify/target-models.test.ts
  - scripts/setup-apify-schedule.ts
  - scripts/sync-fipe-brands.ts
  - src/app/api/cron/listings-cleanup/route.ts
  - src/app/api/cron/listings-cleanup/route.test.ts
  - src/app/api/cron/fipe-retry/route.ts
  - src/app/api/cron/fipe-retry/route.test.ts
  - vercel.json
findings:
  critical: 1
  high: 4
  medium: 6
  low: 4
  nit: 3
  total: 18
status: issues_found
---

# Phase 8: Code Review Report — scraping-pipeline

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 17 (excludes vercel.json which is config; counted in list above)
**Status:** issues_found
**Production state:** live since 2026-04-29 (cron fix `505e7a8`); first scheduled Apify run scheduled 2026-04-30 03:00 BRT.

## Summary

Phase 8 ships a clean, well-modeled pipeline: pure normalization, generator-based dataset streaming, token-scrubbing discipline, constant-time secret compare, FIPE graceful degradation, and a production-shape webhook contract. Tests are dense and behavior-driven. Three concerns dominate this review:

1. **Apify can retry the same run-succeeded webhook.** The DB schema (`supabase/migrations/0001_init.sql:303`) does NOT have a unique constraint on `scrape_runs.apify_run_id`, and the route does not check for an existing row before INSERT. A duplicate delivery (Apify 5xx-then-retry pattern is real) will produce a second `scrape_runs` row, re-stream the entire dataset, and double-bill against the daily cap.
2. **The cost-cap window is racy by design and counts in-flight runs at $0.** The route inserts the new `scrape_runs` row with `cost_usd=null` (default), then updates `cost_usd` only at the end. Two concurrent webhooks that both pass the cap check (each computing the same `totalToday`) will both run to completion, then both write their cost — the cap is enforced post-hoc. For tomorrow's first real run this is mostly academic (single scheduled invocation) but matters once prod doubles to 2 fires/day or webhook retries collide.
3. **A handful of error paths can leave `scrape_runs.status='running'` forever.** A throw between the `running` insert (route.ts:293-307) and entering the try block (route.ts:323) leaves the row stuck. Specifically: `supabase.from("scrape_runs")...insert(...).select().single()` succeeded, then a synchronous error (e.g., `getSupabaseServiceRole()` re-call inside the wishlists pre-load) before the try block aborts the route — no `finally` block re-targets the running row.

Beyond those, several smaller correctness gaps surfaced (described below). None block tomorrow's first run, but the dedup fix should land before the prod schedule (D-03: 2 runs/day) goes live, because Apify's retry-on-non-2xx behavior plus prod cadence is exactly when duplicate-delivery surfaces.

---

## Critical Issues

### CR-01: `scrape_runs.apify_run_id` lacks a unique constraint — webhook retries cause duplicate ingest + double cost-cap consumption

**Files:**
- `supabase/migrations/0001_init.sql:297-310` (schema; no unique on `apify_run_id`)
- `src/app/api/scrape/webmotors/webhook/route.ts:293-307` (insert path; no pre-check)

**Issue:** Apify retries any webhook that doesn't return a 2xx (per Apify docs, up to 11 retries with exponential backoff). Phase 8 returns **502** when `finalStatus === "failed"` (route.ts:459) — that is a non-2xx and Apify WILL re-deliver. There is also a transient-network case where Apify retries even on a delivered 200 if it didn't see the ACK in time. On retry, the route:
1. Passes the cost-cap (the prior run's cost was already written, so daily total is correct)
2. Inserts a SECOND `scrape_runs` row for the same `apify_run_id` (no unique constraint, no pre-check)
3. Re-streams the entire dataset (Apify dataset items are still there)
4. Re-upserts every listing (idempotent on fingerprint, so DB stays sane)
5. Doubles `cost_usd` against the daily cap by writing another row

The smoke test on 2026-04-29 already exhibited the retry-on-400 path twice (per `08-09-SUMMARY.md` line 196: "First delivery returned 400 ... second returned 200 after fixing the template"). That's the exact behavior at scale.

**Fix:** Two-layer defense.

1. Schema-level (correct fix):
```sql
-- new migration
alter table public.scrape_runs
  add constraint scrape_runs_apify_run_id_unique unique (apify_run_id);
```
2. Application-level (immediate hot-fix until migration ships):
```ts
// route.ts:293, before insert
const { data: existing } = await supabase
  .from("scrape_runs")
  .select("id, status")
  .eq("apify_run_id", payload.resource.id)
  .maybeSingle();
if (existing) {
  return Response.json(
    { ok: true, run_id: payload.resource.id, deduped: true, prior_status: existing.status },
    { status: 200 }, // 200 so Apify stops retrying
  );
}
```

Note that returning **200** on dedup is essential — returning 409 or 4xx will keep Apify retrying until backoff exhausts.

---

## High

### HI-01: `scrape_runs` row can stay `status='running'` forever on early throw

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:293-425`

**Issue:** The lifecycle is:
1. Line 293-307: insert `status='running'` (writes a row)
2. Line 323: `try {` begins
3. Line 423-425: `} finally { clearTimeout(timeoutId); }`
4. Line 437-449: update `status='completed'|'failed'`

The `finally` block only clears the timeout — it does NOT re-target the running row. The final `update(...status, ended_at...)` runs only if the function reaches line 437. Several plausible failure modes between insert (line 307) and the try (line 323) leave the row orphaned:
- A throw from `clearTimeout`/`setTimeout` itself (unlikely but defensive)
- An out-of-memory or process-kill mid-stream (Vercel function killed at `maxDuration`)
- The await on `runMeta` throws a non-Error object that bypasses catch... actually it doesn't; `catch (err)` catches everything. But Vercel kill-on-timeout cuts the function before `finally` always runs reliably — Vercel docs note `finally` can be skipped on hard timeout.

Combined with Vercel's hard kill at `maxDuration` (default 300s for the route per project default; see Vercel concern below), a long-running scrape that exceeds budget leaves the row stuck.

**Fix:** Move the final update into a `finally` block AND add a "stuck-runs reaper" cron, or use `try/finally` with a stuck-detection retry.

```ts
let finalStatus: "completed" | "failed" = "failed";
try {
  // ... existing try body ...
  finalStatus =
    crashedReason !== null || (total > 0 && technical_errors / total > 0.2)
      ? "failed"
      : "completed";
} finally {
  clearTimeout(timeoutId);
  // ALWAYS attempt to close out the row, even on hard error
  await supabase
    .from("scrape_runs")
    .update({
      status: finalStatus,
      ended_at: new Date().toISOString(),
      cost_usd: runMeta?.usageTotalUsd ?? null,
      listings_new,
      listings_updated,
      listings_error,
      notes: crashedReason ?? (listings_error > 0 ? `${listings_error} normalization failures` : null),
    })
    .eq("id", runRow.id);
}
```

Plus a cleanup cron that flips `status='running' AND started_at < now() - interval '1 hour'` to `'failed'`.

### HI-02: Cost-cap race window — concurrent webhook retries both pass the check

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:267-290`

**Issue:** The cost cap is a check-then-act with the new `cost_usd` value not yet written:
1. Webhook A reads `SUM(cost_usd) WHERE today = $49`. Passes ($49 < $50).
2. Webhook A inserts `scrape_runs` with `cost_usd=null` (default).
3. Webhook B (Apify retry of A, or B is a separate scheduled run) reads `SUM(cost_usd)`. Still `$49` (A's cost not yet written). Passes.
4. Both A and B run to completion, each writing their `cost_usd`. Daily total exceeds cap, but billing already happened.

Compounded by HI-01 (running row's null cost): since `cost_usd` is `null` until the final update, **multiple concurrent runs all see `$49` until the FIRST one finishes**. The cap is best-effort, not enforced.

For tomorrow's first real run this won't fire (single invocation). But once prod cron is `0 2,14 * * *` (D-03) AND retries are possible, this becomes real.

**Fix:** Two viable options:

1. Reserve cost upfront — INSERT the running row with a worst-case estimate (e.g., $5/run typical) so concurrent checks see it:
```ts
.insert({
  source: "webmotors",
  status: "running",
  apify_run_id: payload.resource.id,
  cost_usd: 5.0, // pessimistic reservation; corrected at end
})
```
2. Atomic check-and-insert via Postgres `SELECT FOR UPDATE` or a stored procedure. Heavier; option 1 is the pragmatic fix.

### HI-03: `runMeta.usageTotalUsd` written as `null` masks failed runs as $0 against cap

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:442`

**Issue:** `cost_usd: runMeta?.usageTotalUsd ?? null` — if Apify returned `null` for usage (which it does for runs still being billed, or the `getActorRun` fetch failed and we fell into catch), the row records `cost_usd=null`. The cost-cap query `(costRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)` treats null as 0. So a run that crashed mid-stream (where we DO know it consumed Apify credits because the actor ran for some time) writes null and consumes $0 of the cap — meaning subsequent runs that should have been blocked aren't.

**Fix:** Treat null/missing usage as a conservative non-zero default in the row:
```ts
cost_usd: runMeta?.usageTotalUsd ?? (crashedReason ? 1.0 : 0),
```
Or store `null` but COALESCE with a fallback in the cost-cap query.

### HI-04: `câmbio fundido` regex misses common variants — Phase 8.10 backlog issue

**File:** `src/lib/apify/filters.ts:31`

**Issue:** Regex `/c[âa]mbio\s+fundid[oa]/i` requires a literal whitespace between "câmbio" and "fundido". Real listings on WebMotors use:
- `cambio.fundido` (period)
- `cambio-fundido` (hyphen)
- `câmbiofundido` (no separator, less common but seen)
- `cambio fundido` with non-breaking space ` `

Same issue applies to `motor\s+fundid[oa]`, `caixa\s+fundid[oa]`, and `chassis?\s+danific`.

Each of these allows a sinistrado listing to slip past the filter and create a real opportunity for a lojista — not safety-critical but breaks the marketplace promise (Phase 13 is when "recall" lands; sinistro is supposed to be solid in v1).

**Fix:** Replace `\s+` with a more permissive separator class:
```ts
// "Whitespace, hyphen, period, NBSP, or zero-width" — common WebMotors slug-ish patterns
const SEP = "[\\s\\-._\\u00A0]+";
const SINISTRO_TERMS: RegExp[] = [
  /sinistr[ao]/i,
  /salvad[oa]/i,
  /recuperad[oa]/i,
  /batid[oa]/i,
  /colidi[uo]?/i,
  /capotad[oa]/i,
  new RegExp(`motor${SEP}fundid[oa]`, "i"),
  new RegExp(`c[âa]mbio${SEP}fundid[oa]`, "i"),
  new RegExp(`caixa${SEP}fundid[oa]`, "i"),
  new RegExp(`chassis?${SEP}danific`, "i"),
];
```

---

## Medium

### MD-01: Cron secret comparison via `verifySharedSecret` is bound to `expectedSecret.length` — leaks secret length but only after auth handshake (acceptable). However bearer-prefix check is case-sensitive

**File:**
- `src/app/api/cron/listings-cleanup/route.ts:34`
- `src/app/api/cron/fipe-retry/route.ts:48`

**Issue:** `auth.startsWith(BEARER_PREFIX)` where `BEARER_PREFIX = "Bearer "` is case-sensitive. Some HTTP intermediaries normalize headers but Vercel Cron sends `Bearer <secret>` literally — confirmed in tests at `route.test.ts:86-88`. This is fine for the controlled Vercel→Vercel call. But if anyone (debugging, curl) sends `bearer ` (lowercase) or `BEARER `, we 401. Not a security issue, just a footgun for ops.

**Fix:**
```ts
if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
const provided = auth.slice("bearer ".length);
```

### MD-02: `verifyHmacSha256` is dead code — wired nowhere, untested in production paths

**File:** `src/lib/apify/webhook-auth.ts:43-55`, `webhook-auth.test.ts:41-79`

**Issue:** The HMAC scaffold is intentionally not wired (per docstring + RESEARCH note: "Apify does not natively support HMAC"). It has tests but no caller. Dead code that's tested is harmless but creates two risks:
1. Future agent assumes it's wired and refactors something into it (low probability, real surface)
2. Static-analysis tools warn on unused exports

The docstring already notes "NOT yet wired into any route". This is acceptable but flag for cleanup decision.

**Fix:** Either wire it via a feature flag (`APIFY_USE_HMAC=true`) and use a Headers-template variant, OR delete in Phase 13 and unblock this dead-code warning. Recommend documenting in `deferred-items.md`.

### MD-03: `extractUf` does not normalize lowercase or strip surrounding whitespace consistently

**File:** `src/lib/apify/webmotors-normalize.ts:28-34`

**Issue:**
```ts
function extractUf(state: string | undefined): string | null {
  if (!state) return null;
  const withParens = state.match(/\(([A-Z]{2})\)/)?.[1];   // FAILS on "(sp)"
  if (withParens) return withParens;
  if (/^[A-Z]{2}$/.test(state.trim())) return state.trim(); // FAILS on "sp"
  return null;
}
```

The actor returns `seller.state` as observed in the smoke test fixture at `route.test.ts:543` (`state: "SP"`) — so the live data is uppercase. But `WebMotorsScraped.seller.state` is documented as `string` with no contract on case. If the actor changes (e.g., a future scrape variant returns "São Paulo - SP" or "sp"), `seller_uf` silently becomes null and the matching engine's `region_uf` filter misses the listing.

**Fix:** Normalize to uppercase first:
```ts
function extractUf(state: string | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim().toUpperCase();
  const withParens = trimmed.match(/\(([A-Z]{2})\)/)?.[1];
  if (withParens) return withParens;
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  // Also try "Anything - SP" trailing-suffix pattern
  const suffix = trimmed.match(/\b([A-Z]{2})\b\s*$/)?.[1];
  return suffix ?? null;
}
```

### MD-04: 20% technical-error threshold has divide-by-zero handled, but logic invariant under "all rejected as sinistro" is wrong-status

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:432-435`

**Issue:**
```ts
const finalStatus: "completed" | "failed" =
  crashedReason !== null || (total > 0 && technical_errors / total > 0.2)
    ? "failed"
    : "completed";
```

`total = listings_new + listings_updated + listings_error`. If 100% of items are filter-rejected as `sinistro`, `total = listings_error = 100`, `technical_errors = 0` (clean rejects don't count). Math: `0 / 100 = 0 < 0.2`, status = "completed". Correct behavior. ✓

But if dataset is empty (Apify returned 0 items), `total = 0`, `technical_errors = 0`. Math: short-circuits on `total > 0`, status = "completed". Also correct (smoke-test scenario yesterday — 0 listings, run was completed).

The math is actually fine. **However**: consider the case where `runMeta.status !== 'SUCCEEDED'` (Apify run failed but webhook still fired). The route doesn't check `runMeta.status`. If Apify says the run was `'FAILED'` or `'TIMED-OUT'` and the dataset is empty/partial, we mark `completed` because there are no items to error on. This is a silent-failure path.

**Fix:** Surface Apify-side run state into the final-status decision:
```ts
const apifyRunFailed =
  runMeta?.status && runMeta.status !== "SUCCEEDED" && runMeta.status !== "RUNNING";
const finalStatus: "completed" | "failed" =
  crashedReason !== null ||
  apifyRunFailed ||
  (total > 0 && technical_errors / total > 0.2)
    ? "failed"
    : "completed";
```

### MD-05: Internal FIPE call from webhook uses `https://${VERCEL_URL}` — VERCEL_URL is the deployment URL, not the prod alias

**Files:**
- `src/app/api/scrape/webmotors/webhook/route.ts:473-475`
- `src/app/api/cron/fipe-retry/route.ts:117-119`

**Issue:** `process.env.VERCEL_URL` is the per-deployment URL like `autoagent-abc123.vercel.app`, NOT the production domain `autoagente.ai`. This is fine in normal operation (Vercel injects it for the running deployment), but on prod every webhook call invokes `/api/fipe` against the deployment-specific URL — fine within the same deployment, but if someone uses the on-demand route as a debugging tool from a stale Vercel preview, the FIPE round-trip could leak across deployments.

More importantly: this is a **cross-API call within the same Vercel function host**. The latency is at minimum one full edge-to-origin round-trip (Vercel routes /api/fipe to its own serverless function). For 2000 listings × FIPE-needed: even at 100ms each, that's 200s — eating into the 300s `maxDuration`.

**Fix:** Hoist FIPE logic into a shared library function callable directly from the webhook:
```ts
// src/lib/fipe/lookup.ts
export async function lookupFipe(brand: string, model: string, year: number): Promise<number | null> { ... }

// route.ts
import { lookupFipe } from "@/lib/fipe/lookup";
const fipe = await lookupFipe(row.brand, row.model, row.year);
```
This avoids the HTTP round-trip and saves ~100ms × N items. Logged in deferred-items but the perf impact at 2000 items is real on tomorrow's first run.

### MD-06: `last_scraped_at IS NULL` rows are NOT reaped by listings-cleanup

**File:** `src/app/api/cron/listings-cleanup/route.ts:45-50`

**Issue:** The query is `.lt("last_scraped_at", cutoff).neq("status", "removed")`. Postgres `last_scraped_at < cutoff` evaluates to `unknown` when `last_scraped_at IS NULL` — Postgres treats `unknown` in WHERE as false, so rows with NULL `last_scraped_at` are NEVER reaped.

How does a listing get NULL `last_scraped_at`? If `webhook/route.ts` somehow upserts without it (line 372 explicitly sets it, so seems safe), OR if Phase 6 seed data inserted listings without it, OR if a future migration adds rows. Defensive question: should NULL be treated as "stale"?

**Fix:** Add OR clause to also catch NULL:
```ts
const { data, error } = await supabase
  .from("listings")
  .update({ status: "removed" })
  .or(`last_scraped_at.lt.${cutoff},last_scraped_at.is.null`)
  .neq("status", "removed")
  .select("id");
```
Or document explicitly that NULL `last_scraped_at` is impossible-by-construction.

---

## Low

### LO-01: Body parse `request.json().catch(() => null)` is fine, but invalid_body responses for the Apify shape leak no info — inconsistent for stub shape

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:113-135`

**Issue:** Invalid stub-shape body returns `{ error, issues: stubParsed.error.issues.slice(0, 5) }` — leaks Zod path info (line 132). Invalid Apify-shape body (or unrecognized body) silently goes through to the stub branch and emits Zod errors that won't match the Apify shape (so Apify sees a confusing error). The Apify webhook is a trusted source post-secret-check, so the leak is bounded, but the diagnostic path is asymmetric.

**Fix:** When neither shape parses, also include a hint:
```ts
return Response.json(
  {
    error: "invalid_body",
    detail: "expected Apify event { resource: { id } } or listing array",
    issues: stubParsed.error.issues.slice(0, 5),
  },
  { status: 400 },
);
```

### LO-02: `Plan` cast to `Plan` in users.map is unsafe if DB has unexpected enum value

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:329-331`, `:156`

**Issue:**
```ts
new Map<string, Plan>((users ?? []).map((u: { id: string; plan: Plan }) => [u.id, u.plan]));
```
The annotation `(u: { id: string; plan: Plan })` is a **type assertion via parameter signature** — it does not enforce runtime correctness. If the DB ever has `plan='unknown_tier'`, calc-fee assumes it's `'starter'` (silent fallback at line 218), which is the cheapest tier — actually wrong direction for a billing issue.

**Fix:** Validate at the boundary:
```ts
function isPlan(p: unknown): p is Plan {
  return p === "starter" || p === "premium" || p === "enterprise";
}
const planByUser = new Map<string, Plan>(
  (users ?? [])
    .filter((u): u is { id: string; plan: Plan } => isPlan(u.plan))
    .map((u) => [u.id, u.plan]),
);
```

### LO-03: `daysSince` clock-skew handling silently masks future dates as 0 — could mask Apify-side bug

**File:** `src/lib/apify/webmotors-normalize.ts:43-50`

**Issue:**
```ts
const diffMs = Date.now() - t;
if (diffMs < 0) return 0;
```
A "future" `publish_date` is silently treated as 0 days ago. This satisfies T-08-04 invariants (defensive) but if the actor ever returns wrong-timezone dates that look like future, the bug is invisible. Phase 9 motivation_signals depends on this for `days_online_threshold >= 14`, which decides match score.

**Fix:** Return null on future dates instead of 0; let downstream decide:
```ts
if (diffMs < 0) return null;
```
The match engine treats null as "unknown" which is already correct semantics.

### LO-04: `photo_url` validation doesn't sanity-check the URL string content

**File:** `src/lib/apify/webmotors-normalize.ts:86-87`

**Issue:**
```ts
const photo =
  Array.isArray(raw.photos) && typeof raw.photos[0] === "string" ? raw.photos[0] : null;
```
If actor returns `[""]` (empty string), photo becomes `""` which is then upserted as `photo_url=""`. The DB column is `text` so it stores it. Downstream UI then renders an `<img src="">` which most browsers treat as a self-reference — it'll spam the page with broken-image requests.

**Fix:** Reject empty/whitespace strings:
```ts
const photo =
  Array.isArray(raw.photos) && typeof raw.photos[0] === "string" && raw.photos[0].trim().length > 0
    ? raw.photos[0]
    : null;
```

---

## Nit

### NI-01: `vercel.json` has no maxDuration entry for `/api/scrape/webmotors/webhook` — relies on Vercel default

**File:** `vercel.json`

**Issue:** Functions block configures `negotiate/stream` (60s) and `fipe` (30s). The webhook is the longest-running route (2000 items × FIPE round-trip × upsert) but inherits the project default (300s on Hobby/Pro, 10s on legacy free). At 100ms FIPE round-trip × 2000 items = 200s — within budget, but if FIPE retries or the dataset stream is slow, easy to exceed.

**Fix:** Pin explicitly:
```json
"src/app/api/scrape/webmotors/webhook/route.ts": { "maxDuration": 300 }
```

### NI-02: `console.error` line in route.ts:282 includes `payload.resource.id` post-auth — fine but ensure run IDs aren't sensitive

**File:** `src/app/api/scrape/webmotors/webhook/route.ts:282`

**Issue:** Apify run IDs are alphanumeric tokens (e.g., `k70PIrEEaNG9N4wbA`). Per Apify docs they're not sensitive. Logging them is fine — useful for tracing. No fix.

### NI-03: `setup-apify-schedule.ts` JSON.stringify of `result` will include the schedule body which contains `runInput.body` — that body has no secret, but defensive printing would `omit` `runInput`

**File:** `scripts/setup-apify-schedule.ts:288`

**Issue:** `logOut(JSON.stringify(result, null, 2), token)` — `result` is the Apify response, which echoes back the schedule we sent including `runInput.body` (a JSON-stringified blob of `startUrls`, `maxRequests`, proxy config). None of that is sensitive. The `scrub()` wrapper would catch any accidental token leak. No fix, but consider a `--quiet` flag for production logs.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Closing assessment

**Overall health (production-live now, what could go wrong on tomorrow's first real run):** The pipeline is well-engineered for the happy path. Tomorrow's 03h BRT scheduled run (20 startUrls × maxRequests=2000) most likely succeeds — single invocation, no concurrent retries to expose the cost-cap race, Apify usually marks runs SUCCEEDED, FIPE is healthy. The two highest-probability failure modes for the FIRST real run are: (a) total runtime exceeds 300s `maxDuration` because FIPE is called via cross-function HTTP (MD-05) — at 2000 items needing FIPE this is a real risk, not theoretical; (b) if the run technical-errors out 21%+ of items (e.g., DB transient), the route returns 502, Apify retries, and CR-01 fires — duplicate `scrape_runs` row + double cost cap. Filter-coverage gaps (HI-04) and `extractUf` lowercase (MD-03) won't crash but will silently degrade match quality.

**Top 3 must-fix items (in priority order):**
1. **CR-01 — Add unique constraint on `scrape_runs.apify_run_id` and idempotent insert.** This is the single highest-leverage fix — it eliminates the duplicate-ingest path that becomes inevitable once prod is on `0 2,14 * * *` and any run returns non-2xx. Both schema migration and application-level pre-check are needed.
2. **HI-01 — Wrap the final `scrape_runs` update in `finally`.** Prevents stuck `'running'` rows from polluting the `scrape_runs` table and confusing the cost-cap query (which sums all rows including running ones, but those have null `cost_usd` so it currently undercounts — fix HI-03 in tandem).
3. **HI-04 — Expand sinistro keyword separators.** Filter is the thing protecting the marketplace's reputation; PJ + sinistro slipping past = lojista assumes a deal that's unsalvageable. The `[\\s\\-._\\u00A0]+` separator class catches the realistic WebMotors title formats.

**Recommendations for follow-up:**
- File a Phase 8.10 task pinning `maxDuration: 300` in `vercel.json` for the webhook route (NI-01) before next prod cron change.
- After the Vercel Pro upgrade restores hourly fipe-retry, also tackle MD-05 by hoisting `/api/fipe` into a library (avoids cross-function latency tax that compounds at 2000 listings).
- Track filter expansion (HI-04) and `extractUf` normalization (MD-03) as data-quality improvements; both will silently degrade match precision until fixed.
- Open a discussion on cost-cap semantics (HI-02 + HI-03): pessimistic-reservation vs strict atomic check. The pessimistic-reservation approach is the lowest-friction fix consistent with shipping speed.
- Document the dead-code status of `verifyHmacSha256` (MD-02) in `deferred-items.md` so a future agent doesn't accidentally wire it incorrectly.
