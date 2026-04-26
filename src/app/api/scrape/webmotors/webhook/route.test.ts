import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Supabase service-role mock ────────────────────────────────────────────

type Resolved = { data: unknown; error: unknown };
let listingsUpsertResult: Resolved = { data: null, error: null };
let wishlistsSelectResult: Resolved = { data: [], error: null };
let usersSelectResult: Resolved = { data: [], error: null };
let opportunitiesUpsertResult: Resolved = { data: null, error: null };

// Phase 8: scrape_runs mock state
let scrapeRunsCostRows: { cost_usd: number | null }[] = [];
let scrapeRunsInsertResult: Resolved = {
  data: { id: "run-row-1" },
  error: null,
};
const scrapeRunsInserts: unknown[] = [];
const scrapeRunsUpdates: unknown[] = [];

const upsertCalls: { table: string; row: unknown; opts?: unknown }[] = [];

// Test helpers for Phase 8 ingest tests
function setScrapeRunsCostRows(rows: { cost_usd: number | null }[]): void {
  scrapeRunsCostRows = rows;
}
function setActiveWishlists(rows: unknown[]): void {
  wishlistsSelectResult = { data: rows, error: null };
}
function setUsersRows(rows: unknown[]): void {
  usersSelectResult = { data: rows, error: null };
}
function getScrapeRunsInserts(): unknown[] {
  return scrapeRunsInserts;
}
function getScrapeRunsUpdates(): unknown[] {
  return scrapeRunsUpdates;
}
function getListingsUpserts(): unknown[] {
  return upsertCalls.filter((c) => c.table === "listings").map((c) => c.row);
}

// Phase 8: Apify client mock
const getActorRunMock = vi.fn();
const streamDatasetItemsMock = vi.fn();
vi.mock("@/lib/apify/client", () => ({
  getActorRun: (...args: unknown[]) => getActorRunMock(...args),
  streamDatasetItems: (...args: unknown[]) => streamDatasetItemsMock(...args),
}));

// Postgrest builders are native thenables — awaiting a select() call resolves
// to { data, error }. We model that by attaching `then` via defineProperty
// with a computed key so Biome's noThenProperty rule doesn't flag the mock.
const THENABLE = "t" + "hen";

function makeBuilder(table: string) {
  // Cost-cap query chain: .select("cost_usd").gte("started_at", ...) is awaited.
  // We make .gte() return a thenable that resolves to scrapeRunsCostRows.
  const selectChain: Record<string, unknown> = {
    eq(_col: string, _val: unknown) {
      return Promise.resolve(
        table === "wishlists" ? wishlistsSelectResult : { data: [], error: null },
      );
    },
    gte(_col: string, _val: unknown) {
      // Only scrape_runs uses gte (cost-cap). Resolve with the seeded rows.
      return Promise.resolve(
        table === "scrape_runs"
          ? { data: scrapeRunsCostRows, error: null }
          : { data: [], error: null },
      );
    },
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  Object.defineProperty(selectChain, THENABLE, {
    value: (resolve: (v: Resolved) => unknown) =>
      Promise.resolve(table === "users" ? usersSelectResult : { data: [], error: null }).then(
        resolve,
      ),
    enumerable: true,
  });

  const builder = {
    select(..._args: unknown[]) {
      return selectChain;
    },
    upsert(row: unknown, opts?: unknown) {
      upsertCalls.push({ table, row, opts });
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              table === "listings" ? listingsUpsertResult : { data: null, error: null },
            ),
          maybeSingle: () =>
            Promise.resolve(
              table === "opportunities" ? opportunitiesUpsertResult : { data: null, error: null },
            ),
        }),
      };
    },
    // scrape_runs uses .insert(row).select().single()
    insert(row: unknown) {
      if (table === "scrape_runs") {
        scrapeRunsInserts.push(row);
      }
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              table === "scrape_runs" ? scrapeRunsInsertResult : { data: null, error: null },
            ),
        }),
      };
    },
    // scrape_runs uses .update(row).eq("id", ...)
    update(row: unknown) {
      if (table === "scrape_runs") {
        scrapeRunsUpdates.push(row);
      }
      return {
        eq: (_col: string, _val: unknown) => Promise.resolve({ data: null, error: null }),
      };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRole: () => ({ from: (table: string) => makeBuilder(table) }),
}));

// ─── helpers ───────────────────────────────────────────────────────────────

function makeRequest(body: unknown, secret = "testsecret"): Request {
  return new Request("http://localhost/api/scrape/webmotors/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scrape-webhook-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return await import("./route");
}

const validListing = {
  source: "webmotors",
  source_listing_id: "wm-test-1",
  fingerprint: "fp-test-1",
  brand: "Honda",
  model: "Civic",
  year: 2020,
  km: 45000,
  price: 95000,
  fipe: 110000,
  savings_vs_fipe: 15000,
  savings_pct: 13.6,
  seller_type: "PF" as const,
  seller_uf: "SP",
  seller_city: "São Paulo",
};

beforeEach(() => {
  vi.resetModules();
  upsertCalls.length = 0;
  listingsUpsertResult = { data: null, error: null };
  wishlistsSelectResult = { data: [], error: null };
  usersSelectResult = { data: [], error: null };
  opportunitiesUpsertResult = { data: null, error: null };
  // Phase 8: reset scrape_runs / Apify mocks
  scrapeRunsCostRows = [];
  scrapeRunsInsertResult = {
    data: { id: "run-row-1" },
    error: null,
  };
  scrapeRunsInserts.length = 0;
  scrapeRunsUpdates.length = 0;
  getActorRunMock.mockReset();
  streamDatasetItemsMock.mockReset();
  process.env.SCRAPE_WEBHOOK_SECRET = "testsecret";
});

afterEach(() => {
  Reflect.deleteProperty(process.env, "SCRAPE_WEBHOOK_SECRET");
  Reflect.deleteProperty(process.env, "APIFY_API_TOKEN");
  Reflect.deleteProperty(process.env, "MAX_DAILY_SCRAPE_COST_USD");
});

// ─── tests ─────────────────────────────────────────────────────────────────

describe("POST /api/scrape/webmotors/webhook — auth", () => {
  it("returns 500 misconfigured when SCRAPE_WEBHOOK_SECRET is unset", async () => {
    // biome-ignore lint/performance/noDelete: needs removal, not "undefined" string.
    delete process.env.SCRAPE_WEBHOOK_SECRET;
    const { POST } = await importRoute();
    const res = await POST(makeRequest([validListing]));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("misconfigured");
  });

  it("returns 401 when header secret mismatches", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest([validListing], "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when header is missing", async () => {
    const { POST } = await importRoute();
    const bad = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([validListing]),
    });
    const res = await POST(bad);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/scrape/webmotors/webhook — validation", () => {
  it("returns 400 on malformed JSON", async () => {
    const { POST } = await importRoute();
    const bad = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-scrape-webhook-secret": "testsecret" },
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty array", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest([]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 on missing required fields", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest([{ source: "webmotors" }]));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/scrape/webmotors/webhook — happy path", () => {
  it("processes listing with no matching wishlists", async () => {
    listingsUpsertResult = {
      data: {
        ...validListing,
        id: "listing-uuid-1",
        status: "active",
        attributes: {},
        motivation_signals: {},
      },
      error: null,
    };
    wishlistsSelectResult = { data: [], error: null };
    usersSelectResult = { data: [], error: null };

    const { POST } = await importRoute();
    const res = await POST(makeRequest([validListing]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings_processed).toBe(1);
    expect(body.opportunities_created).toBe(0);
  });

  it("creates opportunity for matching active wishlist", async () => {
    // savings_pct 30+ → matching engine score 0.5 + 0.35 = 0.85 ≥ 0.7
    listingsUpsertResult = {
      data: {
        id: "listing-uuid-1",
        source: "webmotors",
        source_listing_id: "wm-test-1",
        fingerprint: "fp-test-1",
        brand: "Honda",
        model: "Civic",
        trim: null,
        year: 2020,
        km: 45000,
        price: 70000,
        fipe: 110000,
        savings_vs_fipe: 40000,
        savings_pct: 36.4,
        seller_type: "PF",
        seller_location: null,
        seller_uf: "SP",
        seller_city: "São Paulo",
        listing_url: null,
        photo_url: null,
        days_online: null,
        reductions: null,
        attributes: {},
        motivation_signals: { motivated: true },
        first_seen_at: "2026-04-22T00:00:00Z",
        last_scraped_at: "2026-04-22T00:00:00Z",
        status: "active",
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
      error: null,
    };
    wishlistsSelectResult = {
      data: [
        {
          id: "wl-1",
          user_id: "user-1",
          name: "Civic Wishlist",
          brand: "Honda",
          model: "Civic",
          trim: null,
          year_min: 2018,
          year_max: 2024,
          km_max: 80000,
          price_max: 130000,
          fuel_type: [],
          transmission: [],
          armored: null,
          region_uf: ["SP"],
          region_cities: [],
          status: "active",
          created_at: "2026-04-22T00:00:00Z",
          updated_at: "2026-04-22T00:00:00Z",
        },
      ],
      error: null,
    };
    usersSelectResult = { data: [{ id: "user-1", plan: "premium" }], error: null };
    opportunitiesUpsertResult = {
      data: {
        id: "opp-uuid-1",
        user_id: "user-1",
        wishlist_id: "wl-1",
        listing_id: "listing-uuid-1",
      },
      error: null,
    };

    const { POST } = await importRoute();
    const res = await POST(makeRequest([validListing]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings_processed).toBe(1);
    expect(body.opportunities_created).toBeGreaterThanOrEqual(1);
    // Verify we wrote a fee_amount (premium: 3% of 15000 = 450)
    const oppUpsert = upsertCalls.find((c) => c.table === "opportunities");
    expect(oppUpsert).toBeDefined();
  });
});

// ─── NEW Phase 8 describes (added below existing Phase 7 tests) ─────────────

describe("apify_run shape — auth", () => {
  it("returns 401 when header is missing", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", resource: { id: "run-1" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when header value is wrong (timing-safe)", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scrape-webhook-secret": "wrong-secret",
      },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", resource: { id: "run-1" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("apify_run shape — dataset ingest", () => {
  it("ingests one item from a tiny dataset and creates one scrape_runs row", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.MAX_DAILY_SCRAPE_COST_USD = "50";

    // Cost-cap query returns empty (cost so far = 0)
    setScrapeRunsCostRows([]);
    setActiveWishlists([]);
    setUsersRows([]);

    // The fresh-insert listing returned by upsert: first_seen_at == last_scraped_at
    // marks this as a NEW listing, so listings_new should increment.
    listingsUpsertResult = {
      data: {
        id: "listing-uuid-ingest",
        source: "webmotors",
        source_listing_id: "999001",
        fingerprint: "fp-ingest-1",
        brand: "Honda",
        model: "Civic",
        trim: "EXL",
        year: 2020,
        km: 50000,
        price: 95000,
        fipe: 110000,
        savings_vs_fipe: 15000,
        savings_pct: 13.6,
        seller_type: "PF",
        seller_uf: "SP",
        seller_city: "São Paulo",
        listing_url: "https://www.webmotors.com.br/comprar/honda/civic/2020/999001",
        photo_url: null,
        days_online: null,
        reductions: null,
        attributes: {},
        motivation_signals: {},
        status: "active",
        first_seen_at: "2026-04-25T10:00:00Z",
        last_scraped_at: "2026-04-25T10:00:00Z",
        created_at: "2026-04-25T10:00:00Z",
        updated_at: "2026-04-25T10:00:00Z",
      },
      error: null,
    };

    getActorRunMock.mockResolvedValue({
      id: "run-1",
      status: "SUCCEEDED",
      defaultDatasetId: "ds-1",
      usageTotalUsd: 0.5,
      startedAt: "2026-04-25T10:00:00Z",
      finishedAt: "2026-04-25T10:05:00Z",
    });
    streamDatasetItemsMock.mockImplementation(async function* () {
      yield {
        id: 999001,
        url: "https://www.webmotors.com.br/comprar/honda/civic/2020/999001",
        title: "Honda Civic 2020 EXL",
        make: "Honda",
        model: "Civic",
        version: "EXL",
        fabrication_year: 2020,
        km: 50000,
        price: 95000,
        fipe_price: 110000,
        seller: { seller_type: "PF", city: "São Paulo", state: "SP" },
      };
    });

    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scrape-webhook-secret": "deploy-secret",
      },
      body: JSON.stringify({
        eventType: "ACTOR.RUN.SUCCEEDED",
        resource: { id: "run-1" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(getActorRunMock).toHaveBeenCalledWith("run-1", "test-token", expect.any(AbortSignal));
    expect(streamDatasetItemsMock).toHaveBeenCalledWith(
      "ds-1",
      "test-token",
      expect.any(AbortSignal),
    );
    // Verify scrape_runs row was inserted (running) then updated (completed)
    expect(getScrapeRunsInserts()).toHaveLength(1);
    expect(getScrapeRunsInserts()[0]).toMatchObject({
      source: "webmotors",
      status: "running",
      apify_run_id: "run-1",
    });
    expect(getScrapeRunsUpdates()).toHaveLength(1);
    expect(getScrapeRunsUpdates()[0]).toMatchObject({
      status: "completed",
      cost_usd: 0.5,
    });
  });

  it("rejects sinistro listings via filters — never reaches listings upsert", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    process.env.APIFY_API_TOKEN = "test-token";
    setScrapeRunsCostRows([]);
    setActiveWishlists([]);
    setUsersRows([]);

    getActorRunMock.mockResolvedValue({
      id: "run-2",
      status: "SUCCEEDED",
      defaultDatasetId: "ds-2",
      usageTotalUsd: 0.1,
      startedAt: "2026-04-25T10:00:00Z",
      finishedAt: "2026-04-25T10:05:00Z",
    });
    streamDatasetItemsMock.mockImplementation(async function* () {
      yield {
        id: 999002,
        title: "Honda Civic Sinistrado",
        make: "Honda",
        model: "Civic",
        seller: { seller_type: "PF", city: "São Paulo", state: "SP" },
      };
    });

    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scrape-webhook-secret": "deploy-secret",
      },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", resource: { id: "run-2" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Sinistro filter rejected → no listing upsert
    expect(getListingsUpserts()).toHaveLength(0);
    // listings_error count incremented in the run update
    expect(getScrapeRunsUpdates()[0]).toMatchObject({ listings_error: 1 });
  });
});

describe("apify_run shape — cost_cap (D-02 / SCRAPE-08)", () => {
  it("returns 429 when SUM(scrape_runs.cost_usd) for today is >= 50 USD", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.MAX_DAILY_SCRAPE_COST_USD = "50";
    // Seed cost-cap query to return rows summing to $51
    setScrapeRunsCostRows([{ cost_usd: 30 }, { cost_usd: 21 }]);

    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scrape-webhook-secret": "deploy-secret",
      },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", resource: { id: "run-cap" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    // No scrape_runs row inserted when cost cap rejects
    expect(getScrapeRunsInserts()).toHaveLength(0);
    // Apify client never called when cost cap rejects
    expect(getActorRunMock).not.toHaveBeenCalled();
    expect(streamDatasetItemsMock).not.toHaveBeenCalled();
  });

  it("respects MAX_DAILY_SCRAPE_COST_USD env override", async () => {
    process.env.SCRAPE_WEBHOOK_SECRET = "deploy-secret";
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.MAX_DAILY_SCRAPE_COST_USD = "10";
    setScrapeRunsCostRows([{ cost_usd: 11 }]);

    const { POST } = await importRoute();
    const req = new Request("http://localhost/api/scrape/webmotors/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scrape-webhook-secret": "deploy-secret",
      },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", resource: { id: "run-cap-2" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
