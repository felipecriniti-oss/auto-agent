import { describe, expect, it } from "vitest";
import { formValuesToPendingWishlist } from "./formValuesToPendingWishlist";

describe("formValuesToPendingWishlist", () => {
  it("stamps status='active' (engine short-circuit guard)", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
    expect(result.status).toBe("active");
  });

  it("synthesizes id + user_id as 'pending'", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
    expect(result.id).toBe("pending");
    expect(result.user_id).toBe("pending");
  });

  it("defaults arrays to [] when undefined", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
    expect(result.fuel_type).toEqual([]);
    expect(result.transmission).toEqual([]);
    expect(result.region_uf).toEqual([]);
    expect(result.region_cities).toEqual([]);
  });

  it("preserves optional nulls", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
    expect(result.year_min).toBeNull();
    expect(result.year_max).toBeNull();
    expect(result.km_max).toBeNull();
    expect(result.price_max).toBeNull();
    expect(result.trim).toBeNull();
    expect(result.armored).toBeNull();
  });

  it("preserves provided values verbatim", () => {
    const result = formValuesToPendingWishlist({
      brand: "Toyota",
      model: "Corolla",
      year_min: 2018,
      year_max: 2022,
      km_max: 80000,
      price_max: 120000,
      fuel_type: ["flex"],
      transmission: ["automático"],
      armored: false,
      region_uf: ["SP"],
      region_cities: ["São Paulo"],
    });
    expect(result.brand).toBe("Toyota");
    expect(result.year_min).toBe(2018);
    expect(result.fuel_type).toEqual(["flex"]);
    expect(result.region_uf).toEqual(["SP"]);
  });

  it("synthesizes name='pending' when empty (schema allows empty name)", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic", name: "" });
    expect(result.name).toBe("pending");
  });

  it("preserves non-empty name", () => {
    const result = formValuesToPendingWishlist({
      brand: "Honda",
      model: "Civic",
      name: "Meu Civic",
    });
    expect(result.name).toBe("Meu Civic");
  });

  it("sets timestamps as ISO strings", () => {
    const result = formValuesToPendingWishlist({ brand: "Honda", model: "Civic" });
    expect(Number.isNaN(Date.parse(result.created_at))).toBe(false);
    expect(Number.isNaN(Date.parse(result.updated_at))).toBe(false);
  });
});
