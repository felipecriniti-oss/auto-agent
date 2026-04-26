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
      expect(m.url.length).toBeGreaterThan(0);
    }
  });

  it("every url matches the WebMotors estoque pattern", () => {
    const re =
      /^https:\/\/www\.webmotors\.com\.br\/carros\/estoque\?marca=[a-z0-9-]+&modelo=[a-z0-9-]+$/;
    for (const m of TARGET_MODELS) {
      expect(m.url).toMatch(re);
    }
  });

  it("brand+model pairs are unique (case-insensitive)", () => {
    const keys = TARGET_MODELS.map((m) => `${m.brand}|${m.model}`.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
