import type { DbListing, DbWishlist } from "@/types/database";
import { describe, expect, it } from "vitest";
import { matchListingToWishlists, opportunitiesWorthCreating } from "./engine";

// ─── fixtures ───────────────────────────────────────────────────────────────

function makeListing(overrides: Partial<DbListing> = {}): DbListing {
  const now = new Date().toISOString();
  return {
    id: "listing-1",
    source: "webmotors",
    source_listing_id: "wm-1",
    fingerprint: "fp-1",
    brand: "Honda",
    model: "Civic",
    trim: "EXL",
    year: 2019,
    km: 52000,
    price: 95000,
    fipe: 115000,
    savings_vs_fipe: 20000,
    savings_pct: 17.39,
    seller_type: "PF",
    seller_location: "São Paulo - SP",
    seller_uf: "SP",
    seller_city: "São Paulo",
    listing_url: "https://example.com",
    photo_url: "https://example.com/photo.jpg",
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

function makeWishlist(overrides: Partial<DbWishlist> = {}): DbWishlist {
  const now = new Date().toISOString();
  return {
    id: "wishlist-1",
    user_id: "user-1",
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

// ─── happy path ─────────────────────────────────────────────────────────────

describe("matchListingToWishlists — happy path", () => {
  it("matches an exact listing to a compatible wishlist", () => {
    const results = matchListingToWishlists(makeListing(), [makeWishlist()]);
    expect(results).toHaveLength(1);
    expect(results[0].hard_pass).toBe(true);
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it("includes reasons describing why it matched", () => {
    const results = matchListingToWishlists(makeListing(), [makeWishlist()]);
    expect(results[0].reasons.length).toBeGreaterThan(0);
    expect(results[0].reasons.some((r) => r.toLowerCase().includes("modelo"))).toBe(true);
  });

  it("matches multiple wishlists if all compatible", () => {
    const results = matchListingToWishlists(makeListing(), [
      makeWishlist({ id: "w1", price_max: 100000 }),
      makeWishlist({ id: "w2", price_max: 120000 }),
    ]);
    expect(results).toHaveLength(2);
  });
});

// ─── hard fail conditions ───────────────────────────────────────────────────

describe("matchListingToWishlists — hard fails", () => {
  it("rejects different brand", () => {
    const r = matchListingToWishlists(makeListing({ brand: "Toyota" }), [makeWishlist()]);
    expect(r).toHaveLength(0);
  });

  it("rejects different model", () => {
    const r = matchListingToWishlists(makeListing({ model: "Fit" }), [makeWishlist()]);
    expect(r).toHaveLength(0);
  });

  it("accepts fuzzy model match (typo)", () => {
    const r = matchListingToWishlists(makeListing({ model: "Civicc" }), [makeWishlist()]);
    expect(r).toHaveLength(1);
  });

  it("rejects year below min", () => {
    const r = matchListingToWishlists(makeListing({ year: 2017 }), [makeWishlist()]);
    expect(r).toHaveLength(0);
  });

  it("rejects year above max", () => {
    const r = matchListingToWishlists(makeListing({ year: 2025 }), [
      makeWishlist({ year_max: 2024 }),
    ]);
    expect(r).toHaveLength(0);
  });

  it("rejects km over limit", () => {
    const r = matchListingToWishlists(makeListing({ km: 100000 }), [
      makeWishlist({ km_max: 80000 }),
    ]);
    expect(r).toHaveLength(0);
  });

  it("rejects price over limit", () => {
    const r = matchListingToWishlists(makeListing({ price: 150000 }), [
      makeWishlist({ price_max: 130000 }),
    ]);
    expect(r).toHaveLength(0);
  });

  it("rejects seller in different UF", () => {
    const r = matchListingToWishlists(makeListing({ seller_uf: "RJ" }), [
      makeWishlist({ region_uf: ["SP"] }),
    ]);
    expect(r).toHaveLength(0);
  });

  it("rejects PJ listings by default", () => {
    const r = matchListingToWishlists(makeListing({ seller_type: "PJ" }), [makeWishlist()]);
    expect(r).toHaveLength(0);
  });

  it("allows PJ if enforcePfOnly=false", () => {
    const r = matchListingToWishlists(makeListing({ seller_type: "PJ" }), [makeWishlist()], {
      enforcePfOnly: false,
    });
    expect(r).toHaveLength(1);
  });

  it("rejects removed listings", () => {
    const r = matchListingToWishlists(makeListing({ status: "removed" }), [makeWishlist()]);
    expect(r).toHaveLength(0);
  });

  it("rejects against paused wishlists", () => {
    const r = matchListingToWishlists(makeListing(), [makeWishlist({ status: "paused" })]);
    expect(r).toHaveLength(0);
  });

  it("rejects when city specified and doesn't match", () => {
    const r = matchListingToWishlists(makeListing({ seller_city: "Campinas" }), [
      makeWishlist({ region_cities: ["São Paulo"] }),
    ]);
    expect(r).toHaveLength(0);
  });
});

// ─── score components ───────────────────────────────────────────────────────

describe("matchListingToWishlists — scoring", () => {
  it("higher savings_pct → higher score", () => {
    const low = matchListingToWishlists(makeListing({ savings_pct: 5 }), [makeWishlist()])[0];
    const mid = matchListingToWishlists(makeListing({ savings_pct: 22 }), [makeWishlist()])[0];
    const high = matchListingToWishlists(makeListing({ savings_pct: 32 }), [makeWishlist()])[0];
    expect(mid.score).toBeGreaterThan(low.score);
    expect(high.score).toBeGreaterThan(mid.score);
  });

  it("motivated vendor flag boosts score", () => {
    const base = matchListingToWishlists(makeListing({ motivation_signals: {} }), [
      makeWishlist(),
    ])[0];
    const motivated = matchListingToWishlists(
      makeListing({ motivation_signals: { motivated: true } }),
      [makeWishlist()],
    )[0];
    expect(motivated.score).toBeGreaterThan(base.score);
  });

  it("reductions + old listing compound score bonus", () => {
    const fresh = matchListingToWishlists(makeListing({ days_online: 5, reductions: 0 }), [
      makeWishlist(),
    ])[0];
    const stale = matchListingToWishlists(makeListing({ days_online: 60, reductions: 2 }), [
      makeWishlist(),
    ])[0];
    expect(stale.score).toBeGreaterThan(fresh.score);
  });

  it("score is clamped to [0, 1]", () => {
    const r = matchListingToWishlists(
      makeListing({
        savings_pct: 40,
        days_online: 90,
        reductions: 3,
        motivation_signals: { motivated: true },
        attributes: { accept_trade: true },
      }),
      [makeWishlist({ region_cities: ["São Paulo"] })],
    );
    expect(r[0].score).toBeLessThanOrEqual(1);
    expect(r[0].score).toBeGreaterThanOrEqual(0);
  });
});

// ─── opportunitiesWorthCreating ─────────────────────────────────────────────

describe("opportunitiesWorthCreating", () => {
  it("filters below default 0.7 threshold", () => {
    const r = opportunitiesWorthCreating(
      makeListing({ savings_pct: 2 }), // low-savings baseline = 0.5 + tiny
      [makeWishlist()],
    );
    expect(r).toHaveLength(0);
  });

  it("includes matches above threshold", () => {
    const r = opportunitiesWorthCreating(
      makeListing({ savings_pct: 32, motivation_signals: { motivated: true } }),
      [makeWishlist()],
    );
    expect(r).toHaveLength(1);
  });

  it("respects custom threshold", () => {
    const r = opportunitiesWorthCreating(makeListing({ savings_pct: 15 }), [makeWishlist()], {
      threshold: 0.5,
    });
    expect(r).toHaveLength(1);
  });
});
