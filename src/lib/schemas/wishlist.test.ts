import { describe, expect, it } from "vitest";
import { wishlistSchema } from "./wishlist";

const CURRENT_YEAR = new Date().getFullYear();

const validWishlist = {
  name: "Honda Civic 2018+ SP",
  brand: "Honda",
  model: "Civic",
  trim: "EXL",
  year_min: 2018,
  year_max: 2022,
  km_max: 80000,
  price_max: 130000,
  fuel_type: ["flex", "gasolina"] as const,
  transmission: ["automático"] as const,
  armored: false,
  region_uf: ["SP"],
  region_cities: ["São Paulo"],
};

describe("wishlistSchema", () => {
  it("accepts a valid full wishlist", () => {
    const r = wishlistSchema.safeParse(validWishlist);
    expect(r.success).toBe(true);
  });

  it("accepts minimal wishlist with only brand+model (defaults applied)", () => {
    const r = wishlistSchema.safeParse({ brand: "Honda", model: "Civic" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("");
      expect(r.data.trim).toBe(null);
      expect(r.data.year_min).toBe(null);
      expect(r.data.year_max).toBe(null);
      expect(r.data.km_max).toBe(null);
      expect(r.data.price_max).toBe(null);
      expect(r.data.fuel_type).toEqual([]);
      expect(r.data.transmission).toEqual([]);
      expect(r.data.armored).toBe(null);
      expect(r.data.region_uf).toEqual([]);
      expect(r.data.region_cities).toEqual([]);
    }
  });

  it("rejects empty brand", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, brand: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "brand");
      expect(issue?.message).toBe("Informe a marca");
    }
  });

  it("rejects empty model", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, model: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "model");
      expect(issue?.message).toBe("Informe o modelo");
    }
  });

  it("rejects year_min > year_max with cross-field message at path ['year_min']", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, year_min: 2020, year_max: 2018 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path[0] === "year_min" && i.message.includes("não pode ser maior"),
      );
      expect(issue).toBeDefined();
    }
  });

  it("allows year_min null with year_max set", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, year_min: null, year_max: 2020 });
    expect(r.success).toBe(true);
  });

  it("allows year_max null with year_min set", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, year_min: 2018, year_max: null });
    expect(r.success).toBe(true);
  });

  it("rejects invalid fuel enum", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, fuel_type: ["etanol"] });
    expect(r.success).toBe(false);
  });

  it("accepts canonical fuel values", () => {
    const r = wishlistSchema.safeParse({
      ...validWishlist,
      fuel_type: ["flex", "gasolina", "diesel", "híbrido", "elétrico"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid transmission", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, transmission: ["cambio manual"] });
    expect(r.success).toBe(false);
  });

  it("accepts CVT transmission", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, transmission: ["CVT"] });
    expect(r.success).toBe(true);
  });

  it("rejects negative km", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, km_max: -1 });
    expect(r.success).toBe(false);
  });

  it("accepts km_max=0", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, km_max: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects km_max over 1,000,000", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, km_max: 1_500_000 });
    expect(r.success).toBe(false);
  });

  it("rejects price over 5,000,000", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, price_max: 5_500_000 });
    expect(r.success).toBe(false);
  });

  it("accepts price_max=0", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, price_max: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects name with angle brackets", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, name: "VW <script>" });
    expect(r.success).toBe(false);
  });

  it("rejects name with double-newline (injection guard)", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, name: "foo\n\nbar" });
    expect(r.success).toBe(false);
  });

  it("rejects year_min below 1990", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, year_min: 1989 });
    expect(r.success).toBe(false);
  });

  it("rejects year_max above CURRENT_YEAR+1", () => {
    const r = wishlistSchema.safeParse({ ...validWishlist, year_max: CURRENT_YEAR + 2 });
    expect(r.success).toBe(false);
  });
});
