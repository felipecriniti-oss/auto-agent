---
plan_id: "07-03"
phase: 7
slug: wishlist-ui
wave: 1
title: "/api/fipe GET branch — brands + models endpoints"
depends_on: []
files_modified:
  - src/app/api/fipe/route.ts
  - src/app/api/fipe/route.test.ts
requirements_addressed:
  - D-03
  - D-04
  - D-05
  - GOAL-FIPE
autonomous: true
must_haves:
  truths:
    - "GET /api/fipe?type=brands returns { brands: [{codigo, nome}] } on Parallelum success"
    - "GET /api/fipe?type=models&brand=Honda returns { models: [{codigo, nome}] } after fuzzy-matching brand"
    - "Rate limit + timeout protections from existing POST handler are reused"
    - "Upstream 5xx surfaces as 502 upstream_failed"
    - "Unknown brand surfaces as 404 not_found"
    - "Missing brand param surfaces as 400 missing_brand"
    - "Invalid type surfaces as 400 invalid_type"
  artifacts:
    - path: "src/app/api/fipe/route.ts"
      provides: "GET handler for brands + models"
      contains: "export async function GET"
    - path: "src/app/api/fipe/route.test.ts"
      provides: "GET test coverage — success + 400/404/502"
      contains: "describe(\"GET /api/fipe"
  key_links:
    - from: "scripts/sync-fipe-brands.ts (plan 07-04)"
      to: "GET /api/fipe?type=brands"
      via: "fetch to localhost:3000"
      pattern: "type=brands"
    - from: "src/components/forms/FipeModelCombobox.tsx (plan 07-07)"
      to: "GET /api/fipe?type=models&brand=X"
      via: "React Query queryFn fetch"
      pattern: "type=models"
---

<objective>
Close landmine L1 (critical discovery: `/api/fipe` has NO GET endpoint today — RESEARCH.md finding #1). Extend the existing POST-only route to accept `GET` with a union-shaped request: `?type=brands` returns all Parallelum marcas; `?type=models&brand=X` fuzzy-matches the brand then returns the modelos for the matched codigo. Reuses every helper (rate limit, timeout, fetchJson, fuzzyMatch, genericError) already in `route.ts`.

Purpose: D-03 (static snapshot generator) and D-04 (on-demand models fetch) both depend on this endpoint. Without it, Plan 07-04's sync script has no source; Plan 07-07's FipeModelCombobox has no backend.
Output: 2 files modified (route adds GET export; test file adds 2 describe blocks covering 6 cases).
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@src/app/api/fipe/route.ts
@src/app/api/fipe/route.test.ts
@src/lib/schemas/fipe.ts
</context>

<interfaces>
<!-- Existing helpers in src/app/api/fipe/route.ts (verified by RESEARCH.md source map) — MUST REUSE, do not recreate -->

extractIp(request: Request): string
checkRateLimit(ip: string, opts: { bucket: string; max: number; windowMs: number }): { ok: boolean; retryAfter?: number }
fetchJson<T>(url: string, schema: z.ZodSchema<T>, signal: AbortSignal): Promise<T | UpstreamFailure>
fuzzyMatch<T extends { nome: string }>(items: T[], query: string): T | null
fuzzyMatchAll<T extends { nome: string }>(items: T[], query: string): T[]
genericError(status: number, body: Record<string, unknown>): Response
isUpstreamFail(res: unknown): boolean
PARALLELUM_BASE: string   // "https://parallelum.com.br/fipe/api/v1/carros"
UPSTREAM_TIMEOUT_MS: number
marcaSchema: z.ZodObject<{ codigo: z.ZodString; nome: z.ZodString }>
modelosResponseSchema: z.ZodObject<{ modelos: z.ZodArray<{codigo, nome}> }>
</interfaces>

<tasks>

<task id="07-03-01" type="auto" tdd="true">
  <name>Task 1: Extend /api/fipe with GET handler (brands + models branches)</name>
  <files>src/app/api/fipe/route.ts</files>
  <read_first>
    - src/app/api/fipe/route.ts (read all 201 lines — confirm helpers listed in <interfaces> exist exactly, confirm current file has only POST export)
    - src/lib/schemas/fipe.ts (confirm marcaSchema + modelosResponseSchema exports)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-03, §D-04, §D-05 (FIPE cascade, on-demand, degraded fallback)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §api/fipe/route.ts modifications (exact GET implementation at lines 1531-1574)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Summary finding #1 + §Landmines L1
  </read_first>
  <behavior>
    - GET ?type=brands → 200 { brands: marcaSchema[] }
    - GET ?type=models&brand=Honda → 200 { models: {codigo, nome}[] }
    - GET ?type=models → 400 { error: "missing_brand" }
    - GET ?type=models&brand=NopeCarCo → 404 { error: "not_found" } (fuzzy match fails)
    - GET ?type=foo → 400 { error: "invalid_type" }
    - GET with rate limit exhausted → 429 { error: "rate_limited", retryAfter: number }
    - GET ?type=brands when Parallelum /marcas returns 500 → 502 { error: "upstream_failed" }
    - GET ?type=models&brand=Honda when Parallelum /modelos returns 500 → 502 { error: "upstream_failed" }
    - Existing POST behavior is UNCHANGED
  </behavior>
  <action>
    Append a new `export async function GET` to `src/app/api/fipe/route.ts`. Do NOT remove or modify the existing POST export.

    Exact implementation (paste VERBATIM, adjusting only to imports/helpers actually present in the file — names verified from existing POST handler):

    ```typescript
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
        const marcas = await fetchJson(
          `${PARALLELUM_BASE}/marcas`,
          z.array(marcaSchema),
          signal,
        );
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
        const marcas = await fetchJson(
          `${PARALLELUM_BASE}/marcas`,
          z.array(marcaSchema),
          signal,
        );
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
    ```

    Notes:
    - If the existing file doesn't export `PARALLELUM_BASE` / `UPSTREAM_TIMEOUT_MS` / `marcaSchema` / `modelosResponseSchema` as top-level symbols, they may be inlined in the POST handler. In that case, refactor the POST to pull them out to module scope (unchanged values) so both handlers share.
    - Ensure `z` is imported (it already is for POST usage).
    - Do NOT introduce new dependencies. All helpers exist.
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function GET" src/app/api/fipe/route.ts` returns exactly 1 match
    - `grep -n "type === \"brands\"" src/app/api/fipe/route.ts` returns 1 match
    - `grep -n "type === \"models\"" src/app/api/fipe/route.ts` returns 1 match
    - `grep -n "missing_brand" src/app/api/fipe/route.ts` returns 1 match
    - `grep -n "invalid_type" src/app/api/fipe/route.ts` returns 1 match
    - `grep -n "upstream_failed" src/app/api/fipe/route.ts` returns ≥2 matches
    - `grep -n "export async function POST" src/app/api/fipe/route.ts` still returns 1 match (POST preserved)
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
</task>

<task id="07-03-02" type="auto" tdd="true">
  <name>Task 2: Add GET route tests — brands + models success/failure paths</name>
  <files>src/app/api/fipe/route.test.ts</files>
  <read_first>
    - src/app/api/fipe/route.test.ts (read all lines — confirm existing POST test harness: jsonResponse helper at top, beforeEach with vi.unstubAllGlobals, vi.stubGlobal("fetch", mockFetch) pattern)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 4 §api/fipe/route.test.ts (new describe blocks outline, lines 1577-1591)
    - .planning/phases/07-wishlist-ui/07-VALIDATION.md (entry for `/api/fipe` GET — success + 502 + 404 paths)
  </read_first>
  <behavior>
    - Existing POST tests remain green
    - New GET brands success test: fetch mock returns 200 with marca array → GET returns 200 with { brands: [...] }
    - New GET brands 502 test: fetch mock returns 500 → GET returns 502 { error: "upstream_failed" }
    - New GET models success test: fetch mock returns marcas + modelos → GET returns 200 with { models: [...] }
    - New GET models missing_brand test: no brand param → 400 { error: "missing_brand" }
    - New GET models unknown brand test: fuzzy match fails → 404 { error: "not_found" }
    - New GET models upstream 500 on modelos fetch → 502 { error: "upstream_failed" }
    - Rate limit test: 31 GET requests in 60s window → 31st returns 429
  </behavior>
  <action>
    Open `src/app/api/fipe/route.test.ts`. Add TWO new `describe` blocks after the existing POST-related tests. Reuse the existing `jsonResponse` helper and the `vi.stubGlobal("fetch", ...)` pattern.

    Import `GET` alongside existing POST import:
    ```typescript
    import { GET, POST } from "./route";
    ```

    Append:

    ```typescript
    describe("GET /api/fipe — brands", () => {
      it("returns 200 with brands on Parallelum success", async () => {
        const marcas = [{ codigo: "26", nome: "Honda" }, { codigo: "56", nome: "Toyota" }];
        const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(marcas));
        vi.stubGlobal("fetch", fetchMock);

        const req = new Request("http://localhost/api/fipe?type=brands");
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.brands).toEqual(marcas);
      });

      it("returns 502 when Parallelum responds 500", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "oops" }, { status: 500 }));
        vi.stubGlobal("fetch", fetchMock);

        const req = new Request("http://localhost/api/fipe?type=brands");
        const res = await GET(req);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe("upstream_failed");
      });

      it("returns 400 invalid_type for unknown ?type=", async () => {
        const req = new Request("http://localhost/api/fipe?type=chassis");
        const res = await GET(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("invalid_type");
      });
    });

    describe("GET /api/fipe — models", () => {
      it("returns 200 with models after fuzzy-matching brand", async () => {
        const marcas = [{ codigo: "26", nome: "Honda" }];
        const modelos = { modelos: [{ codigo: "1", nome: "Civic" }, { codigo: "2", nome: "Fit" }] };
        const fetchMock = vi.fn()
          .mockResolvedValueOnce(jsonResponse(marcas))
          .mockResolvedValueOnce(jsonResponse(modelos));
        vi.stubGlobal("fetch", fetchMock);

        const req = new Request("http://localhost/api/fipe?type=models&brand=Honda");
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.models).toEqual(modelos.modelos);
      });

      it("returns 400 missing_brand when brand param absent", async () => {
        const req = new Request("http://localhost/api/fipe?type=models");
        const res = await GET(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("missing_brand");
      });

      it("returns 404 not_found when brand fuzzy-match fails", async () => {
        const marcas = [{ codigo: "26", nome: "Honda" }];
        const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(marcas));
        vi.stubGlobal("fetch", fetchMock);

        const req = new Request("http://localhost/api/fipe?type=models&brand=NopeCarCo");
        const res = await GET(req);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("not_found");
      });

      it("returns 502 when Parallelum modelos fetch fails", async () => {
        const marcas = [{ codigo: "26", nome: "Honda" }];
        const fetchMock = vi.fn()
          .mockResolvedValueOnce(jsonResponse(marcas))
          .mockResolvedValueOnce(jsonResponse({ error: "oops" }, { status: 500 }));
        vi.stubGlobal("fetch", fetchMock);

        const req = new Request("http://localhost/api/fipe?type=models&brand=Honda");
        const res = await GET(req);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe("upstream_failed");
      });
    });
    ```

    If the existing test file has a `resetRateLimitForTest()` helper, call it in `beforeEach` for these tests too (so the 30-req-per-min bucket doesn't bleed across tests).
  </action>
  <verify>
    <automated>pnpm test src/app/api/fipe/route.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "describe(\"GET /api/fipe — brands\"" src/app/api/fipe/route.test.ts` returns 1 match
    - `grep -n "describe(\"GET /api/fipe — models\"" src/app/api/fipe/route.test.ts` returns 1 match
    - `grep -n "missing_brand" src/app/api/fipe/route.test.ts` returns ≥1 match
    - `grep -n "not_found" src/app/api/fipe/route.test.ts` returns ≥1 match
    - `grep -n "upstream_failed" src/app/api/fipe/route.test.ts` returns ≥2 matches (brands 502 + models 502)
    - `pnpm test src/app/api/fipe/route.test.ts --run` exits 0 with existing POST tests + ≥6 new GET tests all green
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/app/api/fipe/route.test.ts --run` exits 0
- `pnpm typecheck && pnpm lint` both green
- Manual smoke (optional, via plan 07-04 script runtime): `curl localhost:3000/api/fipe?type=brands` returns JSON with brands array
</verification>

<success_criteria>
- L1 landmine closed: GET endpoint exists for both branches
- Every helper reused from existing POST (no duplication)
- Six new tests green, existing POST tests untouched
- Downstream plans 07-04 and 07-07 can now consume the route
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-03-SUMMARY.md` with:
- New GET handler signature + branches
- Test count delta (existing + 6 new)
- Any helpers that had to be hoisted to module scope
</output>
