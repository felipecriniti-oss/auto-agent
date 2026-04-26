# Phase 08: scraping-pipeline — Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 14 (10 NEW, 2 EXTEND, 2 PRESERVE-and-cite)
**Analogs found:** 12 / 14 strong matches; 2 file have no exact analog (but role-match analogs identified)

---

## File Classification

| New/Modified File | Action | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/app/api/scrape/webmotors/webhook/route.ts` | EXTEND | API route handler | event-driven (webhook) + request-response | self (Phase 7 stub) | exact (extend in place) |
| `src/app/api/scrape/webmotors/webhook/route.test.ts` | EXTEND | test | request-response (mocked) | self (Phase 7) | exact |
| `src/app/api/cron/listings-cleanup/route.ts` | NEW | API route handler | batch / cron-trigger | `src/app/api/scrape/webmotors/webhook/route.ts` | role-match (Node runtime + service-role + header secret); no existing cron in repo |
| `src/app/api/cron/listings-cleanup/route.test.ts` | NEW | test | request-response (mocked) | `src/app/api/scrape/webmotors/webhook/route.test.ts` | exact |
| `src/lib/apify/types.ts` | NEW (move) | type module | n/a | `src/app/api/scrape/webmotors/route.ts:38-82` (`WebMotorsScraped`) | exact (literal move-and-export) |
| `src/lib/apify/target-models.ts` | NEW | config / data | n/a | `src/lib/mock-data/v3.ts` (constants pattern) | role-match (static literal export) |
| `src/lib/apify/target-models.test.ts` | NEW | test | n/a | `src/lib/matching/engine.test.ts` | role-match (pure-data assertions) |
| `src/lib/apify/webmotors-normalize.ts` | NEW | pure utility | transform | `src/app/api/scrape/webmotors/route.ts:261-423` (`mapToOpportunity` + helpers) | exact (extract & adapt) |
| `src/lib/apify/webmotors-normalize.test.ts` | NEW | test | unit | `src/lib/matching/engine.test.ts` | role-match (pure-fn unit tests) |
| `src/lib/apify/filters.ts` | NEW | pure utility | predicate | inline filters in `route.ts` (none yet — minimal new code) | role-match (token-scan pattern) |
| `src/lib/apify/filters.test.ts` | NEW | test | unit | `src/lib/matching/engine.test.ts` | role-match |
| `src/lib/apify/client.ts` | NEW | service / fetch wrapper | request-response (REST) + streaming (async generator) | `src/app/api/scrape/webmotors/route.ts:165-257` (`fetchRunDiagnostics` + `callApifyActor`) | exact (same Apify REST conventions, token-scrub, AbortSignal) |
| `src/lib/apify/client.test.ts` | NEW | test | unit (mocked fetch) | `src/app/api/scrape/webmotors/route.test.ts` | role-match |
| `src/lib/apify/webhook-auth.ts` | NEW | pure utility | predicate | header-secret check at `src/app/api/scrape/webmotors/webhook/route.ts:86-98` | role-match (hardened with `crypto.timingSafeEqual`) |
| `src/lib/apify/webhook-auth.test.ts` | NEW | test | unit | `src/app/api/scrape/webmotors/webhook/route.test.ts` (auth describe block) | role-match |

---

## Pattern Assignments

### `src/app/api/scrape/webmotors/webhook/route.ts` — EXTEND in place (event-driven webhook)

**Analog:** itself (Phase 7 stub at the same path) + Apify-client patterns from `src/app/api/scrape/webmotors/route.ts`.

**Rule:** Add a top-level body-shape discriminator that routes the existing pre-normalized array shape (Phase 7 contract — Phase 9 tests depend on it) to a renamed `handleDirectListings()` and routes the Apify `{resource:{id}}` shape to a new `handleApifyRun()`. Do NOT replace the stub's existing logic.

**Imports pattern (lines 33-39 — KEEP, ADD `crypto` + new lib/apify modules):**
```typescript
import { matchListingToWishlists } from "@/lib/matching/engine";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { DbListing, DbWishlist, Plan } from "@/types/database";
import { z } from "zod";

export const runtime = "nodejs";              // line 38 — KEEP (service-role + Apify timeouts)
export const dynamic = "force-dynamic";       // line 39 — KEEP
```
Phase 8 ADDS:
```typescript
import { verifySharedSecret } from "@/lib/apify/webhook-auth";
import { getActorRun, streamDatasetItems } from "@/lib/apify/client";
import { normalizeWebMotorsItem } from "@/lib/apify/webmotors-normalize";
import type { WebMotorsScraped } from "@/lib/apify/types";
```

**Auth pattern — KEEP existing, replace `===` with timing-safe compare (lines 86-98):**
```typescript
// CURRENT — Phase 7 stub:
const secret = process.env.SCRAPE_WEBHOOK_SECRET;
if (!secret) {
  return Response.json(
    { error: "misconfigured", detail: "SCRAPE_WEBHOOK_SECRET not set" },
    { status: 500 },
  );
}
const header = request.headers.get("x-scrape-webhook-secret");
if (header !== secret) {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
```
Phase 8: replace `header !== secret` with `verifySharedSecret(header, secret)` (constant-time). Header name unchanged. Apify dashboard Headers template configured to send `X-AutoAgent-Webhook-Secret: <value>` at deploy time.

**Body-shape discriminator (NEW top-level, before existing schema parse at line 100):**
```typescript
// NEW pattern (per RESEARCH § Pattern 1):
const apifyEventSchema = z.object({
  resource: z.object({ id: z.string() }),
  eventType: z.string().optional(),
});
const stubArraySchema = z.array(webhookListingSchema).min(1).max(500);

const raw = await request.json().catch(() => null);
if (raw === null) return Response.json({ error: "invalid_body" }, { status: 400 });

if (apifyEventSchema.safeParse(raw).success) {
  return handleApifyRun(raw as { resource: { id: string } });
}
const stubParsed = stubArraySchema.safeParse(raw);
if (stubParsed.success) {
  return handleDirectListings(stubParsed.data);  // existing flow lines 115-225 wrapped
}
return Response.json({ error: "invalid_body" }, { status: 400 });
```

**Cost-cap pattern (NEW — apply BEFORE creating scrape_runs row):**
```typescript
// In handleApifyRun, after auth gate:
const today = new Date().toISOString().slice(0, 10);
const { data: rows } = await supabase
  .from("scrape_runs")
  .select("cost_usd")
  .gte("started_at", `${today}T00:00:00Z`);
const totalToday = (rows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
const cap = Number(process.env.MAX_DAILY_SCRAPE_COST_USD ?? 50);
if (totalToday >= cap) {
  console.error(`scrape_cost_cap_hit total=${totalToday} cap=${cap}`);
  return Response.json({ error: "cost_cap_exceeded" }, { status: 429 });
}
```

**scrape_runs lifecycle pattern (NEW — RESEARCH § Pattern 5, lines 478-507):**
```typescript
const { data: runRow } = await supabase
  .from("scrape_runs")
  .insert({ source: "webmotors", status: "running", apify_run_id: payload.resource.id })
  .select()
  .single();
// ... process dataset ...
await supabase
  .from("scrape_runs")
  .update({
    status: errors > total * 0.2 ? "failed" : "completed",
    ended_at: new Date().toISOString(),
    cost_usd: runMeta.usageTotalUsd ?? null,
    listings_new, listings_updated, listings_error,
    notes: errors > 0 ? `${errors} normalization failures` : null,
  })
  .eq("id", runRow.id);
```

**Upsert pattern — REUSE from existing stub (lines 167-171):**
```typescript
const { data: upserted, error: upErr } = await supabase
  .from("listings")
  .upsert(listingRow, { onConflict: "fingerprint" })
  .select()
  .single();
```

**Matching engine call — REUSE (lines 183-186):**
```typescript
const matches = matchListingToWishlists(
  upserted as DbListing,
  (wishlists ?? []) as DbWishlist[],
).filter((m) => m.score >= 0.7);
```

**Opportunity upsert with dedup — REUSE (lines 197-211):**
```typescript
const { data: oppRow } = await supabase
  .from("opportunities")
  .upsert(
    { user_id, wishlist_id, listing_id, match_score, status: "pending", fee_amount },
    { onConflict: "user_id,wishlist_id,listing_id", ignoreDuplicates: true },
  )
  .select()
  .maybeSingle();
```

**Fee calc — REUSE (lines 72-76 already correct; do not duplicate):**
```typescript
function calcFee(plan: Plan, savingsVsFipe: number | null | undefined): number {
  if (!savingsVsFipe || savingsVsFipe <= 0) return 0;
  const rate = plan === "enterprise" ? 0.02 : plan === "premium" ? 0.03 : 0.06;
  return Math.round(savingsVsFipe * rate * 100) / 100;
}
```

**Error logging discipline — propagate from existing route.ts:215-216:**
```typescript
const sanitized = raw.replace(new RegExp(token, "g"), "[REDACTED]");
```
Apply same regex-replace to ANY string before `console.error` if it touched `APIFY_API_TOKEN` or `SCRAPE_WEBHOOK_SECRET`.

---

### `src/app/api/scrape/webmotors/webhook/route.test.ts` — EXTEND

**Analog:** itself, current Phase 7 tests at this path (lines 1-274).

**Keep:** all 7 existing `describe` blocks for auth + validation + happy path (stub-array shape).

**Add three new describes:**
1. `apify_run shape — auth` (401 on bad secret, 200 on valid header for the new payload shape)
2. `apify_run shape — dataset ingest` (mock `getActorRun` + `streamDatasetItems` from `@/lib/apify/client`, assert `scrape_runs` insert + listings upsert)
3. `cost_cap` (seed `scrape_runs` rows summing to >= $50, expect 429)

**Mock pattern — REUSE existing test infra (lines 36-61):**
```typescript
function makeBuilder(table: string) {
  // Postgrest thenable mock; existing pattern works for both shapes.
  // Add `gte` to the select chain to mock the cost-cap query.
}
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRole: () => ({ from: (table: string) => makeBuilder(table) }),
}));
```

**Apify-client mocks (NEW):**
```typescript
vi.mock("@/lib/apify/client", () => ({
  getActorRun: vi.fn(),
  streamDatasetItems: vi.fn(async function* () { yield mockRawItem; }),
}));
```

---

### `src/app/api/cron/listings-cleanup/route.ts` — NEW (cron trigger, batch UPDATE)

**Analog (closest):** `src/app/api/scrape/webmotors/webhook/route.ts` — same nodejs runtime + service-role + header-secret-gate pattern. (No prior cron route exists in repo — verified via Glob `src/app/api/cron/**`.)

**Imports (copy structure from webhook route lines 33-39):**
```typescript
import { getSupabaseServiceRole } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

**Auth pattern — Vercel Cron uses `Authorization: Bearer <CRON_SECRET>`:**
```typescript
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "misconfigured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // ... cleanup logic ...
}
```
**Note:** Vercel Cron sends `GET` with `Authorization: Bearer $CRON_SECRET` header; we should accept `GET` (not `POST`) to match the platform contract. Use `crypto.timingSafeEqual` via the same `verifySharedSecret` helper from `lib/apify/webhook-auth.ts` for the bearer-stripped value.

**Core batch-UPDATE pattern (D-05 — TTL 72h):**
```typescript
const supabase = getSupabaseServiceRole();
const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
const { data, error } = await supabase
  .from("listings")
  .update({ status: "removed" })
  .lt("last_scraped_at", cutoff)
  .neq("status", "removed")
  .select("id");
if (error) {
  console.error("listings_cleanup_failed", error.message);
  return Response.json({ error: "db_update_failed" }, { status: 500 });
}
return Response.json({ removed: data?.length ?? 0 }, { status: 200 });
```

**Error envelope — same shape as webhook route (lines 89-98):** `Response.json({ error, detail? }, { status })`.

**vercel.json crons entry (mention in plan, edited at infra setup time):**
```json
{ "crons": [{ "path": "/api/cron/listings-cleanup", "schedule": "0 4 * * *" }] }
```

---

### `src/app/api/cron/listings-cleanup/route.test.ts` — NEW

**Analog:** `src/app/api/scrape/webmotors/webhook/route.test.ts` (auth describe block at lines 113-140 + supabase mock at lines 18-61).

**Imports — copy verbatim:**
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

**Cases to cover (mirroring webhook auth describe block):**
- 500 misconfigured when `CRON_SECRET` unset
- 401 on missing `Authorization` header
- 401 on `Authorization: Bearer wrong`
- 200 + `removed: N` on valid bearer with mocked `update().lt().neq().select()` chain
- 500 on supabase error

**Helper:** `function makeRequest(secret = "testsecret") { return new Request("http://localhost/api/cron/listings-cleanup", { method: "GET", headers: { authorization: `Bearer ${secret}` } }); }`

---

### `src/lib/apify/types.ts` — NEW (move + re-export)

**Analog:** `src/app/api/scrape/webmotors/route.ts:43-82` — verbatim move of the `WebMotorsScraped` interface.

**Action:** literal cut + paste:
```typescript
// src/lib/apify/types.ts
export interface WebMotorsScraped {
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
  [key: string]: unknown;
}
```

**Then update `src/app/api/scrape/webmotors/route.ts` (line 43-82):** delete inline interface, replace with `import type { WebMotorsScraped } from "@/lib/apify/types";`. Run existing `route.test.ts` to confirm zero behavioral change.

---

### `src/lib/apify/target-models.ts` — NEW (static config)

**Analog:** `src/lib/mock-data/v3.ts` (constant exports — only static-data file in repo).

**Pattern:**
```typescript
// src/lib/apify/target-models.ts
export interface TargetModel {
  brand: string;
  model: string;
  /** WebMotors estoque URL slug — the actor accepts startUrls of this shape. */
  url: string;
}

/**
 * Top-20 best-selling cars in Brazil 2025 (Fenabrave registration data).
 * D-06 LOCKED in CONTEXT. Update when usage analytics warrant.
 * Each entry produces one `startUrl` for the Apify scheduled run.
 */
export const TARGET_MODELS: readonly TargetModel[] = [
  { brand: "Volkswagen", model: "Polo", url: "https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=polo" },
  { brand: "Hyundai", model: "HB20", url: "https://www.webmotors.com.br/carros/estoque?marca=hyundai&modelo=hb20" },
  // ... 18 more — full list in RESEARCH.md § Locked Decisions D-06
] as const;
```
Type `readonly` + `as const` ensures the array is immutable and length-checkable in the test file.

---

### `src/lib/apify/target-models.test.ts` — NEW

**Analog:** `src/lib/matching/engine.test.ts` (pure-data assertions; no mocks needed).

**Cases:**
```typescript
import { describe, expect, it } from "vitest";
import { TARGET_MODELS } from "./target-models";

describe("TARGET_MODELS", () => {
  it("contains exactly 20 entries", () => {
    expect(TARGET_MODELS.length).toBe(20);
  });
  it("every entry has non-empty brand + model + url", () => {
    for (const m of TARGET_MODELS) {
      expect(m.brand.length).toBeGreaterThan(0);
      expect(m.model.length).toBeGreaterThan(0);
      expect(m.url).toMatch(/^https:\/\/www\.webmotors\.com\.br\/carros\/estoque/);
    }
  });
  it("brand+model pairs are unique", () => {
    const keys = TARGET_MODELS.map((m) => `${m.brand}|${m.model}`.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

---

### `src/lib/apify/webmotors-normalize.ts` — NEW (pure transform)

**Analog:** `src/app/api/scrape/webmotors/route.ts:261-423` — `mapToOpportunity` + helpers `extractUf`, `parseSellerType`, `daysSince`, `buildMotivationSignals`, `buildVehicleString`, `pickBodyTypeEmoji`, `deriveDdStatus`, `computeScore`. **Reuse the helper bodies; change the OUTPUT shape from `Opportunity` to `Tables["listings"]["Insert"]`.**

**Key helpers to LIFT verbatim from `route.ts`:**

`extractUf` (lines 274-282) — already correct for `seller_uf`:
```typescript
function extractUf(state: string | undefined): string | null {
  if (!state) return null;
  const withParens = state.match(/\(([A-Z]{2})\)/)?.[1];
  if (withParens) return withParens;
  if (/^[A-Z]{2}$/.test(state.trim())) return state.trim();
  return null;
}
```

`parseSellerType` (lines 308-313) — note return narrowing for DB enum:
```typescript
function parseSellerType(raw: string | undefined): "PF" | "PJ" | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === "PF" || up === "PJ") return up;
  return null;
}
```

`daysSince` (lines 315-322):
```typescript
function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
```

`buildMotivationSignals` (lines 324-341) — reuse, but return as `Record<string, unknown>` keyed object since `listings.motivation_signals` is a JSON object, not an array. Adapt:
```typescript
function buildMotivationSignals(item: WebMotorsScraped): Record<string, unknown> {
  const days = daysSince(item.publish_date) ?? daysSince(item.create_date);
  const signals: Record<string, unknown> = {};
  if (days !== null && days >= 14) signals.days_online_threshold = days;
  if (Array.isArray(item.attributes) &&
      item.attributes.some((a): a is string => typeof a === "string" && /aceita\s*troca/i.test(a))) {
    signals.aceita_troca = true;
  }
  return signals;
}
```

**Output shape — discriminated union (RESEARCH § Pattern 3):**
```typescript
import { createHash } from "node:crypto";
import type { Tables } from "@/types/database";
import type { WebMotorsScraped } from "./types";
import { detectBlockingFilter } from "./filters";

export type NormalizeResult =
  | { ok: true; row: Tables["listings"]["Insert"]; needsFipe: boolean }
  | { ok: false; reason: "sinistro" | "leilao" | "recall" | "missing_required" | "invalid_data" };

export function normalizeWebMotorsItem(raw: WebMotorsScraped): NormalizeResult {
  const blocked = detectBlockingFilter(raw);
  if (blocked) return { ok: false, reason: blocked };

  if (raw.id == null) return { ok: false, reason: "missing_required" };
  const sourceListingId = String(raw.id);
  const fingerprint = createHash("sha256").update(`webmotors:${sourceListingId}`).digest("hex");

  const year =
    typeof raw.fabrication_year === "number" ? raw.fabrication_year :
    typeof raw.model_year === "number" ? raw.model_year : null;

  const price = typeof raw.price === "number" ? raw.price : null;
  const fipe = typeof raw.fipe_price === "number" ? raw.fipe_price : null;
  const savingsVsFipe = (price !== null && fipe !== null) ? fipe - price : null;
  const savingsPct =
    (price !== null && fipe !== null && fipe > 0) ? ((fipe - price) / fipe) * 100 : null;

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
    photo_url: Array.isArray(raw.photos) && typeof raw.photos[0] === "string" ? raw.photos[0] : null,
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
```

---

### `src/lib/apify/webmotors-normalize.test.ts` — NEW

**Analog:** `src/lib/matching/engine.test.ts` for the pure-fn-with-table-driven-cases pattern.

**Cases (from RESEARCH § Validation matrix SCRAPE-03):**
1. Full-happy PF → `ok: true`, all fields populated, `needsFipe: false` when `fipe_price` present
2. Missing `id` → `ok: false, reason: "missing_required"`
3. `attributes` includes "Leilão" → `ok: false, reason: "leilao"` (delegated to filters)
4. `title` includes "sinistrado" → `ok: false, reason: "sinistro"`
5. PJ + `is_armored: true` → `ok: true`, `attributes.armored: true` preserved
6. Year fallback: no `fabrication_year`, has `model_year` → uses model_year
7. `savings_pct` correctly computed: price=70k fipe=110k → ~36.36%
8. Empty optionals array tolerated

---

### `src/lib/apify/filters.ts` — NEW (predicate)

**Analog:** RESEARCH.md § Code Examples Example 3 (lines 753-772). No existing in-repo predicate matches this exactly; closest is the regex-driven `WEBMOTORS_HOST_RE` at `src/app/api/scrape/webmotors/route.ts:34`.

**Pattern:**
```typescript
import type { WebMotorsScraped } from "./types";

const LEILAO_TERMS = [/leil[aã]o/i, /procedencia\s+leilao/i];
const SINISTRO_TERMS = [/sinistr[ao]/i, /salvad[oa]/i, /recuperad[oa]/i, /batid[oa]/i];

export type FilterReason = "leilao" | "sinistro" | "recall";

export function detectBlockingFilter(item: WebMotorsScraped): FilterReason | null {
  const haystacks = [
    item.title ?? "",
    ...(Array.isArray(item.attributes)
      ? item.attributes.filter((a): a is string => typeof a === "string")
      : []),
  ];
  const text = haystacks.join(" | ").toLowerCase();
  if (LEILAO_TERMS.some((re) => re.test(text))) return "leilao";
  if (SINISTRO_TERMS.some((re) => re.test(text))) return "sinistro";
  // Recall: no reliable signal — Phase 13 will add FAB API. Return null for now.
  return null;
}
```

**Discipline:** PURE function. No I/O. No `console.*`. Empty/missing fields = pass-through (return null).

---

### `src/lib/apify/filters.test.ts` — NEW

**Analog:** `src/lib/matching/engine.test.ts` (pure unit tests).

**Cases:**
1. `attributes: ["Leilão"]` → `"leilao"`
2. `attributes: ["Procedência leilão"]` → `"leilao"`
3. `title: "Honda Civic 2020 Sinistrado"` → `"sinistro"`
4. `title: "carro batido"` → `"sinistro"`
5. Clean listing (no flagged keywords) → `null`
6. Empty/undefined attributes → `null` (no throw)
7. Case insensitivity: `"SINISTRO"` matches

---

### `src/lib/apify/client.ts` — NEW (Apify REST wrappers + AsyncGenerator stream)

**Analog:** `src/app/api/scrape/webmotors/route.ts:165-257` (`fetchRunDiagnostics`, `callApifyActor`). Same conventions: `APIFY_BASE` constant, `encodeURIComponent(token)` in URL, `AbortSignal`, header `Accept: "application/json"`, regex-replace token in errors before throwing.

**Imports + constants — copy verbatim:**
```typescript
const APIFY_BASE = "https://api.apify.com/v2";
```

**`getActorRun` — adapt from `fetchRunDiagnostics` (lines 165-191):**
```typescript
export interface RunMeta {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
  defaultDatasetId: string;
  usageTotalUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function getActorRun(
  runId: string,
  token: string,
  signal: AbortSignal,
): Promise<RunMeta> {
  const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    // SCRUB token before throwing — same discipline as route.ts:215-216
    throw new Error(`apify_run_meta_${res.status}`);
  }
  const json = (await res.json()) as { data: RunMeta };
  return json.data;
}
```

**`streamDatasetItems` — async generator (RESEARCH § Code Examples Example 1):**
```typescript
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
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`apify_dataset_${res.status}`);
    const items = (await res.json()) as T[];
    if (items.length === 0) return;
    for (const item of items) yield item;
    if (items.length < pageSize) return;
    offset += pageSize;
  }
}
```

**Token-scrub policy (apply on EVERY catch in this module):** mirror `route.ts:251-254`:
```typescript
const msg = String(err).replace(new RegExp(token, "g"), "[REDACTED]");
```

---

### `src/lib/apify/client.test.ts` — NEW

**Analog:** `src/app/api/scrape/webmotors/route.test.ts` (lines 1-39 fetch-mock setup + `vi.stubGlobal("fetch", ...)`).

**Pattern (copy verbatim):**
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
```

**Cases:**
1. `getActorRun` happy path — returns parsed `data` object
2. `getActorRun` 404 → throws `apify_run_meta_404`
3. `streamDatasetItems` paginates: page 1 returns 1000, page 2 returns 500 → 1500 total yielded
4. `streamDatasetItems` empty first page → zero yields, no throw
5. `streamDatasetItems` < pageSize on first page → all yielded then return
6. AbortSignal triggers — fetch rejects, error propagates
7. Token NEVER appears in any thrown error message (assert via regex on `error.message`)

---

### `src/lib/apify/webhook-auth.ts` — NEW

**Analog:** RESEARCH § Code Examples Example 2 (lines 721-749). No prior `crypto.timingSafeEqual` use in repo (Grep confirmed); brand-new file.

**Pattern:**
```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for shared-secret webhook auth.
 * D-01 (revised): Apify supplies secret in `X-AutoAgent-Webhook-Secret` header.
 */
export function verifySharedSecret(
  headerValue: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!headerValue) return false;
  const provided = Buffer.from(headerValue, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  // Length-mismatch fails fast (still safe — leaks length only, which is fixed).
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * HMAC-SHA256 verification — scaffolded for Phase 13 hardening when Apify
 * Headers template is configured to send `sha256(body, secret)` as a header.
 * NOT wired into the route yet (D-01 caveat).
 */
export function verifyHmacSha256(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string,
): boolean {
  if (!headerValue) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

---

### `src/lib/apify/webhook-auth.test.ts` — NEW

**Analog:** `src/app/api/scrape/webmotors/webhook/route.test.ts:113-140` (auth describe block).

**Cases:**
1. `verifySharedSecret(null, "x")` → `false`
2. `verifySharedSecret("", "x")` → `false`
3. Equal strings → `true`
4. Different lengths → `false`
5. Same length, different content → `false`
6. `verifyHmacSha256` — known body+secret → produces expected hex; mismatched body → `false`
7. Timing: not directly testable, but presence of `timingSafeEqual` in import is an architectural assertion (skip)

---

## Shared Patterns

### Auth: header-secret with constant-time compare

**Source of new helper:** `src/lib/apify/webhook-auth.ts` (NEW)
**Apply to:** `src/app/api/scrape/webmotors/webhook/route.ts` (replace `===` at line 96), and `src/app/api/cron/listings-cleanup/route.ts` (NEW; for `Bearer <CRON_SECRET>` strip-and-compare).

```typescript
import { verifySharedSecret } from "@/lib/apify/webhook-auth";
const header = request.headers.get("x-scrape-webhook-secret"); // or strip "Bearer "
if (!verifySharedSecret(header, process.env.SCRAPE_WEBHOOK_SECRET ?? "")) {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
```

### Service-role Supabase access

**Source:** `src/lib/supabase/server.ts:47-52` (`getSupabaseServiceRole`)
**Apply to:** every NEW server route that touches `listings` / `scrape_runs` cross-tenant (webhook + cron). Edge runtime is INCOMPATIBLE; declare `runtime = "nodejs"`.

```typescript
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = getSupabaseServiceRole();
```

### Error response envelope

**Source:** `src/app/api/scrape/webmotors/webhook/route.ts:88-92` and `src/app/api/scrape/webmotors/route.ts:127-132`.
**Apply to:** all new routes. Always:

```typescript
return Response.json({ error: "<machine_code>", detail?: "<human>" }, { status });
// 400 invalid_body | 401 unauthorized | 429 rate_limited | 500 misconfigured | 502 upstream_failed | 504 timeout
```

`Retry-After` header pattern when applicable (route.ts:130-131):
```typescript
headers: body.retryAfter !== undefined ? { "Retry-After": String(body.retryAfter) } : undefined,
```

### Token / secret scrubbing in logs

**Source:** `src/app/api/scrape/webmotors/route.ts:215-216, 251-254`.
**Apply to:** every `console.error`, every `throw new Error(...)` in `lib/apify/client.ts`. Pattern:

```typescript
const safeMsg = String(err).replace(new RegExp(token, "g"), "[REDACTED]");
console.error(safeMsg);
```

### FIPE enrichment with chunked fan-out (anti-Promise.all-explosion)

**Source:** `src/app/api/fipe/route.ts:200-222` — chunks of 10, sequential between chunks, parallel within chunk, early-break.
**Apply to:** any code in webhook handler that needs to FIPE-enrich >10 listings. **Recommended Phase 8 alternative:** insert with `fipe=null + attributes.fipe_retry_pending=true` (D-04) and run a separate `/api/cron/fipe-retry` (out of Phase 8 scope per current plan; surface in plan as a deferred TODO). For Phase 8 itself, MAX 10 concurrent FIPE calls.

### vitest mock conventions

**Source:** `src/app/api/scrape/webmotors/webhook/route.test.ts:1-78` (Postgrest thenable mock + module reset).
**Apply to:** every NEW route test (`webhook/route.test.ts` extension, `cron/listings-cleanup/route.test.ts`).

```typescript
beforeEach(() => { vi.resetModules(); /* ... reset state ... */ });
afterEach(() => { /* ... clean env ... */ });
async function importRoute() { return await import("./route"); }
```

### Test fetch-stub pattern

**Source:** `src/app/api/scrape/webmotors/route.test.ts:71-95` (`vi.stubGlobal("fetch", vi.fn().mockResolvedValue(...))`).
**Apply to:** `src/lib/apify/client.test.ts` for streamDatasetItems pagination tests.

### z.safeParse + early 400 envelope

**Source:** `src/app/api/scrape/webmotors/webhook/route.ts:100-113` and `src/app/api/scrape/webmotors/route.ts:434-444`.
**Apply to:** every NEW route handler. Pattern:

```typescript
const raw = await request.json().catch(() => null);
if (raw === null) return Response.json({ error: "invalid_body" }, { status: 400 });
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  return Response.json(
    { error: "invalid_body", issues: parsed.error.issues.slice(0, 5) },
    { status: 400 },
  );
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason | Mitigation |
|------|------|-----------|--------|-----------|
| `src/app/api/cron/listings-cleanup/route.ts` | API route (Vercel Cron) | batch | No prior cron route in repo (Glob `src/app/api/cron/**` returned 0 hits) | Use webhook route as nearest analog (same nodejs runtime + service-role + header-gate pattern). Cron-specific concerns: `GET` not `POST`; `Authorization: Bearer` not custom header (per Vercel docs). |
| `src/lib/apify/target-models.ts` | Static config data | n/a | No prior `lib/apify/` config module exists | Follow `src/lib/mock-data/v3.ts` shape (named const exports + `as const` type-narrowing). |

---

## Metadata

**Analog search scope:**
- `src/app/api/scrape/**` (existing on-demand route + webhook stub + tests)
- `src/app/api/cron/**` (none found)
- `src/lib/server/**` (rate-limit pattern)
- `src/lib/supabase/**` (server clients + env)
- `src/lib/matching/**` (matching engine — cross-phase contract verifier)
- `src/lib/apify/**` (verified does not exist yet — Phase 8 creates the directory)
- `src/types/database.ts` (DbListing + DbScrapeRun + Tables)
- `src/app/api/fipe/**` (chunked-probe pattern reference)

**Files scanned (read fully or targeted):** 11 — webhook/route.ts, webhook/route.test.ts, scrape/webmotors/route.ts, scrape/webmotors/route.test.ts, fipe/route.ts (targeted), rate-limit.ts, supabase/server.ts, supabase/env.ts, matching/engine.ts (targeted), types/database.ts (targeted), CONTEXT/RESEARCH/SEED.

**Pattern extraction date:** 2026-04-25

**Cross-phase contracts that must remain unbroken:**
- Phase 7 webhook stub array-shape (Phase 9 matching tests rely on it) → preserved by body-shape discriminator pattern (RESEARCH § Pattern 1).
- `WebMotorsScraped` type identity (existing on-demand route imports it) → preserved by literal move + re-import.
- `matchListingToWishlists` PF-only enforcement (`engine.ts:170`) → unchanged; webhook continues to insert PF + PJ; matcher filters at score time.
- `listings.fingerprint` unique constraint (migration 0001) + onConflict upsert idempotency → unchanged.
