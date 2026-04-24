import { describe, expect, it } from "vitest";
import { PREVIEW_LISTINGS } from "./preview-listings";

describe("PREVIEW_LISTINGS", () => {
  it("has at least 20 entries", () => {
    expect(PREVIEW_LISTINGS.length).toBeGreaterThanOrEqual(20);
  });

  it("every entry has status='active' (engine short-circuit guard)", () => {
    for (const l of PREVIEW_LISTINGS) {
      expect(l.status).toBe("active");
    }
  });

  it("every entry has seller_type='PF'", () => {
    for (const l of PREVIEW_LISTINGS) {
      expect(l.seller_type).toBe("PF");
    }
  });

  it("covers at least 3 distinct UFs", () => {
    const ufs = new Set(PREVIEW_LISTINGS.map((l) => l.seller_uf).filter(Boolean));
    expect(ufs.size).toBeGreaterThanOrEqual(3);
  });

  it("every price is between 30k and 250k reais", () => {
    for (const l of PREVIEW_LISTINGS) {
      if (l.price != null) {
        expect(l.price).toBeGreaterThanOrEqual(30_000);
        expect(l.price).toBeLessThanOrEqual(250_000);
      }
    }
  });

  it("every entry has canonical brand spelling", () => {
    const allowed = new Set([
      "Honda",
      "Toyota",
      "Chevrolet",
      "Hyundai",
      "Jeep",
      "Ford",
      "Volkswagen",
      "Fiat",
      "Renault",
      "Nissan",
    ]);
    for (const l of PREVIEW_LISTINGS) {
      if (l.brand) expect(allowed.has(l.brand)).toBe(true);
    }
  });
});
