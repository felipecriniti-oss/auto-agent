import { describe, expect, it } from "vitest";
import { summarize } from "./summarize";

describe("summarize (D-08 auto-name)", () => {
  it("full: brand + model + year_min + region_uf[0]", () => {
    expect(summarize({ brand: "Honda", model: "Civic", year_min: 2018, region_uf: ["SP"] })).toBe(
      "Honda Civic 2018+ SP",
    );
  });

  it("no UF: brand + model + year_min+", () => {
    expect(summarize({ brand: "Honda", model: "Civic", year_min: 2018, region_uf: [] })).toBe(
      "Honda Civic 2018+",
    );
  });

  it("no year_min: brand + model + UF", () => {
    expect(summarize({ brand: "Honda", model: "Civic", year_min: null, region_uf: ["SP"] })).toBe(
      "Honda Civic SP",
    );
  });

  it("no year, no UF: brand + model only", () => {
    expect(summarize({ brand: "Honda", model: "Civic", year_min: null, region_uf: [] })).toBe(
      "Honda Civic",
    );
  });

  it("both brand and model empty → 'Wishlist sem nome' fallback", () => {
    expect(summarize({ brand: "", model: "", year_min: null, region_uf: [] })).toBe(
      "Wishlist sem nome",
    );
  });

  it("tolerates undefined / null inputs", () => {
    expect(summarize({})).toBe("Wishlist sem nome");
    expect(summarize({ brand: null, model: null })).toBe("Wishlist sem nome");
  });

  it("trims whitespace from brand/model", () => {
    expect(
      summarize({ brand: "  Honda  ", model: "  Civic  ", year_min: 2020, region_uf: ["RJ"] }),
    ).toBe("Honda Civic 2020+ RJ");
  });
});
