import { describe, expect, it } from "vitest";
import snapshot from "./fipe-brands-snapshot.json";

describe("fipe-brands-snapshot", () => {
  it("has a generated_at ISO timestamp", () => {
    expect(typeof snapshot.generated_at).toBe("string");
    expect(Number.isNaN(Date.parse(snapshot.generated_at))).toBe(false);
  });

  it("has source url documented", () => {
    expect(typeof snapshot.source).toBe("string");
    expect(snapshot.source.length).toBeGreaterThan(0);
  });

  it("contains at least 50 brands", () => {
    expect(snapshot.brands.length).toBeGreaterThanOrEqual(50);
  });

  it("every brand has codigo + nome (non-empty strings)", () => {
    for (const b of snapshot.brands) {
      expect(typeof b.codigo).toBe("string");
      expect(b.codigo.length).toBeGreaterThan(0);
      expect(typeof b.nome).toBe("string");
      expect(b.nome.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate codigos", () => {
    const set = new Set(snapshot.brands.map((b: { codigo: string }) => b.codigo));
    expect(set.size).toBe(snapshot.brands.length);
  });
});
