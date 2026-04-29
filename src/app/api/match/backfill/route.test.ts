/**
 * Tests for POST /api/match/backfill.
 *
 * Strategy: hand-rolled Supabase service-role mock keyed by table name.
 * Each test seeds the per-table return values, then awaits POST(req) and
 * asserts on response body + the recorded opportunities-upsert calls.
 *
 * The mock chain mirrors the route's actual usage:
 *   wishlists.select("*").eq("id", x).maybeSingle()
 *   users.select("plan").eq("id", x).maybeSingle()
 *   listings.select("*").eq("status","active").gte("created_at", cutoff)  ← terminal
 *   opportunities.upsert(row, opts).select().maybeSingle()
 *
 * The fixtures use realistic listing scores by leaning on the engine's
 * scoring rules (savings_pct + motivation signals). See engine.test.ts for
 * the canonical fixture pattern.
 */

import type { DbListing, DbWishlist } from "@/types/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── per-test mock state ───────────────────────────────────────────────────

type Resolved<T = unknown> = { data: T; error: unknown };

let wishlistResult: Resolved = { data: null, error: null };
let userResult: Resolved = { data: { plan: "starter" }, error: null };
let listingsResult: Resolved = { data: [], error: null };

// Sequence of opportunities upsert results — index by call order so a single
// test can rig "first call returns row (created), second call returns null
// (dedup hit)" patterns.
let opportunitiesUpsertSequence: Resolved[] = [];
const upsertCalls: { row: unknown; opts: unknown }[] = [];

// ─── mock supabase ─────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRole: () => ({
    from: (table: string) => buildBuilder(table),
  }),
}));

function buildBuilder(table: string) {
  // listings query is terminal at .gte(...) — must be a thenable
  const selectChain = {
    eq(_col: string, _val: unknown) {
      return {
        maybeSingle: () => {
          if (table === "wishlists") return Promise.resolve(wishlistResult);
          if (table === "users") return Promise.resolve(userResult);
          return Promise.resolve({ data: null, error: null });
        },
        gte(_col2: string, _val2: unknown) {
          // Only listings query reaches here
          return Promise.resolve(table === "listings" ? listingsResult : { data: [], error: null });
        },
      };
    },
  };
  return {
    select(_args?: unknown) {
      return selectChain;
    },
    upsert(row: unknown, opts: unknown) {
      upsertCalls.push({ row, opts });
      const idx = upsertCalls.length - 1;
      const queued = opportunitiesUpsertSequence[idx] ?? { data: null, error: null };
      return {
        select: () => ({
          maybeSingle: () => Promise.resolve(queued),
        }),
      };
    },
  };
}

// ─── fixture helpers ───────────────────────────────────────────────────────

function makeWishlistRow(overrides: Partial<DbWishlist> = {}): DbWishlist {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    name: "Honda Civic 2018+",
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
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeListingRow(overrides: Partial<DbListing> = {}): DbListing {
  const now = new Date().toISOString();
  return {
    id: "listing-default",
    source: "webmotors",
    source_listing_id: "wm-default",
    fingerprint: "fp-default",
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
    seller_location: "São Paulo - SP",
    seller_uf: "SP",
    seller_city: "São Paulo",
    listing_url: "https://example.com",
    photo_url: null,
    days_online: 30,
    reductions: 0,
    attributes: {},
    motivation_signals: {},
    first_seen_at: now,
    last_scraped_at: now,
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/match/backfill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return await import("./route");
}

// ─── lifecycle ─────────────────────────────────────────────────────────────

const ORIGINAL_THRESHOLD = process.env.MATCH_SCORE_THRESHOLD;

beforeEach(() => {
  vi.resetModules();
  upsertCalls.length = 0;
  wishlistResult = { data: null, error: null };
  userResult = { data: { plan: "starter" }, error: null };
  listingsResult = { data: [], error: null };
  opportunitiesUpsertSequence = [];
});

afterEach(() => {
  if (ORIGINAL_THRESHOLD === undefined) {
    Reflect.deleteProperty(process.env, "MATCH_SCORE_THRESHOLD");
  } else {
    process.env.MATCH_SCORE_THRESHOLD = ORIGINAL_THRESHOLD;
  }
});

// ─── tests ─────────────────────────────────────────────────────────────────

describe("POST /api/match/backfill — validation", () => {
  it("returns 400 when wishlist_id is missing", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 when wishlist_id is not a uuid", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: "abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });
});

describe("POST /api/match/backfill — wishlist lookup", () => {
  it("returns 404 when wishlist does not exist", async () => {
    wishlistResult = { data: null, error: null };
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: "33333333-3333-3333-3333-333333333333" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("wishlist_not_found");
  });
});

describe("POST /api/match/backfill — counter semantics (D-06 / B-04)", () => {
  it("returns matched=3, opportunities_created=1 for 3 engine matches with 1 above threshold + dedup", async () => {
    // Fixture engineering — three buckets, one per listing:
    //   - Listing A: savings_pct 32, motivated → score ~0.93 (clears 0.7) → upsert returns row (CREATED)
    //   - Listing B: savings_pct 5    → score ~0.55 (engine-pass but BELOW 0.7) → no upsert (matched++ only)
    //   - Listing C: savings_pct 32, motivated → score ~0.93 (clears 0.7) → upsert returns null (DEDUP hit)
    // Expected response: { matched: 3, opportunities_created: 1 }
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    userResult = { data: { plan: "starter" }, error: null };
    listingsResult = {
      data: [
        makeListingRow({
          id: "listing-A",
          source_listing_id: "A",
          fingerprint: "A",
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-B",
          source_listing_id: "B",
          fingerprint: "B",
          savings_pct: 5,
          motivation_signals: {},
        }),
        makeListingRow({
          id: "listing-C",
          source_listing_id: "C",
          fingerprint: "C",
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    // First above-threshold upsert: row returned (CREATED).
    // Second above-threshold upsert: null returned (DEDUP hit).
    opportunitiesUpsertSequence = [
      { data: { id: "opp-A" }, error: null },
      { data: null, error: null },
    ];

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matched: 3, opportunities_created: 1 });
    // Only TWO upserts attempted (above-threshold listings A and C); B was filtered out.
    expect(upsertCalls).toHaveLength(2);
    expect((upsertCalls[0].row as { listing_id: string }).listing_id).toBe("listing-A");
    expect((upsertCalls[1].row as { listing_id: string }).listing_id).toBe("listing-C");
  });

  it("returns matched=2, opportunities_created=2 when 2 listings pass engine and clear threshold with no dedup", async () => {
    // 3 listings: 2 are matching Civics, 1 is wrong-model (Toyota Corolla → engine fails)
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    listingsResult = {
      data: [
        makeListingRow({
          id: "listing-civic-1",
          source_listing_id: "civ1",
          fingerprint: "civ1",
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-corolla",
          source_listing_id: "cor1",
          fingerprint: "cor1",
          brand: "Toyota",
          model: "Corolla",
          savings_pct: 35,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-civic-2",
          source_listing_id: "civ2",
          fingerprint: "civ2",
          savings_pct: 30,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    opportunitiesUpsertSequence = [
      { data: { id: "opp-1" }, error: null },
      { data: { id: "opp-2" }, error: null },
    ];

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matched: 2, opportunities_created: 2 });
    expect(upsertCalls).toHaveLength(2);
  });

  it("is idempotent — re-call with same wishlist returns matched preserved, opportunities_created=0", async () => {
    // Same fixture as test 4 minus the below-threshold listing — 3 above-threshold listings,
    // but every upsert returns null (everything is a dedup hit on re-call).
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    listingsResult = {
      data: [
        makeListingRow({
          id: "listing-D",
          source_listing_id: "D",
          fingerprint: "D",
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-E",
          source_listing_id: "E",
          fingerprint: "E",
          savings_pct: 30,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-F",
          source_listing_id: "F",
          fingerprint: "F",
          savings_pct: 35,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    opportunitiesUpsertSequence = [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matched: 3, opportunities_created: 0 });
    expect(upsertCalls).toHaveLength(3);
  });

  it("inherits PJ rejection from the engine — PJ listings do not increment matched", async () => {
    // 1 PF Civic that scores well + 1 PJ Civic that would otherwise score above threshold.
    // Engine short-circuits PJ → engineMatches is empty → matched is NOT incremented.
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    listingsResult = {
      data: [
        makeListingRow({
          id: "listing-pf",
          source_listing_id: "pf",
          fingerprint: "pf",
          seller_type: "PF",
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
        makeListingRow({
          id: "listing-pj",
          source_listing_id: "pj",
          fingerprint: "pj",
          seller_type: "PJ",
          savings_pct: 40,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    opportunitiesUpsertSequence = [{ data: { id: "opp-pf" }, error: null }];

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matched: 1, opportunities_created: 1 });
    expect(upsertCalls).toHaveLength(1);
    expect((upsertCalls[0].row as { listing_id: string }).listing_id).toBe("listing-pf");
  });
});

describe("POST /api/match/backfill — threshold env override", () => {
  it("uses getMatchScoreThreshold() — env override changes the cutoff", async () => {
    // 3 listings, all engine-pass with scores in [0.85, 0.95). Default threshold 0.7 lets
    // them all create; env-override 0.95 blocks all of them.
    process.env.MATCH_SCORE_THRESHOLD = "0.95";
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    listingsResult = {
      data: [
        // savings_pct 25 + motivated → 0.5 + 0.25 + 0.08 = 0.83
        makeListingRow({
          id: "listing-83",
          source_listing_id: "s83",
          fingerprint: "s83",
          savings_pct: 25,
          motivation_signals: { motivated: true },
        }),
        // savings_pct 30 → 0.5 + 0.35 = 0.85
        makeListingRow({
          id: "listing-85",
          source_listing_id: "s85",
          fingerprint: "s85",
          savings_pct: 30,
          motivation_signals: {},
        }),
        // savings_pct 30 + motivated → 0.5 + 0.35 + 0.08 = 0.93
        makeListingRow({
          id: "listing-93",
          source_listing_id: "s93",
          fingerprint: "s93",
          savings_pct: 30,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    // No upsert results queued — no upsert should be called anyway.

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matched: 3, opportunities_created: 0 });
    // No upsert was attempted (all were below 0.95)
    expect(upsertCalls).toHaveLength(0);
  });
});

describe("POST /api/match/backfill — fee computation", () => {
  it("computes fee_amount per plan tier", async () => {
    // premium plan → 3% of savings_vs_fipe = 10000 × 0.03 = 300
    const wishlist = makeWishlistRow();
    wishlistResult = { data: wishlist, error: null };
    userResult = { data: { plan: "premium" }, error: null };
    listingsResult = {
      data: [
        makeListingRow({
          id: "listing-fee",
          source_listing_id: "fee",
          fingerprint: "fee",
          savings_vs_fipe: 10000,
          savings_pct: 32,
          motivation_signals: { motivated: true },
        }),
      ],
      error: null,
    };
    opportunitiesUpsertSequence = [{ data: { id: "opp-fee" }, error: null }];

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ wishlist_id: wishlist.id }));
    expect(res.status).toBe(200);
    expect(upsertCalls).toHaveLength(1);
    expect((upsertCalls[0].row as { fee_amount: number }).fee_amount).toBe(300);
  });
});
