import type { DbListing } from "@/types/database";
import { describe, expect, it } from "vitest";
import { computeNegotiationParams } from "./negotiation-params";

function listing(fipe: number | null, price: number | null): DbListing {
  return {
    id: "l",
    source: "webmotors",
    source_listing_id: "x",
    fingerprint: "x",
    brand: null,
    model: null,
    trim: null,
    year: null,
    km: null,
    price,
    fipe,
    savings_vs_fipe: null,
    savings_pct: null,
    seller_type: null,
    seller_location: null,
    seller_uf: null,
    seller_city: null,
    listing_url: null,
    photo_url: null,
    days_online: null,
    reductions: null,
    attributes: {},
    motivation_signals: {},
    first_seen_at: new Date().toISOString(),
    last_scraped_at: new Date().toISOString(),
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("computeNegotiationParams", () => {
  it("computes 25% target and 30% floor by default", () => {
    const p = computeNegotiationParams(listing(100_000, 95_000));
    expect(p.fipe).toBe(100_000);
    expect(p.target_price).toBe(75_000);
    expect(p.hard_floor).toBe(70_000);
  });

  it("clamps to asking price if below computed target", () => {
    const p = computeNegotiationParams(listing(100_000, 60_000));
    expect(p.target_price).toBe(60_000);
    expect(p.hard_floor).toBe(60_000);
  });

  it("falls back to asking price when FIPE missing", () => {
    const p = computeNegotiationParams(listing(null, 80_000));
    expect(p.fipe).toBe(80_000);
    expect(p.target_price).toBe(60_000);
    expect(p.hard_floor).toBe(56_000);
  });

  it("returns zero params when both FIPE and price missing", () => {
    const p = computeNegotiationParams(listing(null, null));
    expect(p.fipe).toBe(0);
    expect(p.target_price).toBe(0);
    expect(p.hard_floor).toBe(0);
  });

  it("respects custom discounts", () => {
    const p = computeNegotiationParams(listing(100_000, 100_000), {
      target_discount: 0.2,
      max_discount: 0.25,
    });
    expect(p.target_price).toBe(80_000);
    expect(p.hard_floor).toBe(75_000);
  });
});
