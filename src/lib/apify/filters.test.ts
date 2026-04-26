import { describe, expect, it } from "vitest";
import type { WebMotorsScraped } from "./types";
import { detectBlockingFilter } from "./filters";

function item(overrides: Partial<WebMotorsScraped> = {}): WebMotorsScraped {
  return { id: 1, title: "Honda Civic 2020", make: "Honda", model: "Civic", ...overrides };
}

describe("detectBlockingFilter", () => {
  it("returns 'leilao' when attributes include 'Leilão'", () => {
    expect(detectBlockingFilter(item({ attributes: ["Leilão"] }))).toBe("leilao");
  });

  it("returns 'leilao' when attributes include 'Procedência leilão'", () => {
    expect(detectBlockingFilter(item({ attributes: ["Procedência leilão"] }))).toBe("leilao");
  });

  it("returns 'leilao' when attributes include lowercase 'leilao' (no diacritic)", () => {
    expect(detectBlockingFilter(item({ attributes: ["leilao"] }))).toBe("leilao");
  });

  it("returns 'sinistro' when title contains 'Sinistrado'", () => {
    expect(detectBlockingFilter(item({ title: "Honda Civic 2020 Sinistrado" }))).toBe("sinistro");
  });

  it("returns 'sinistro' when title contains 'batido'", () => {
    expect(detectBlockingFilter(item({ title: "carro batido" }))).toBe("sinistro");
  });

  it("returns 'sinistro' when title contains 'salvado'", () => {
    expect(detectBlockingFilter(item({ title: "veiculo salvado" }))).toBe("sinistro");
  });

  it("returns 'sinistro' on uppercase 'SINISTRO' (case-insensitive)", () => {
    expect(detectBlockingFilter(item({ attributes: ["SINISTRO"] }))).toBe("sinistro");
  });

  it("returns null on a clean listing", () => {
    expect(detectBlockingFilter(item({ title: "Honda Civic EXL 2020 unico dono" }))).toBeNull();
  });

  it("returns null when attributes is undefined (no throw)", () => {
    expect(() => detectBlockingFilter(item({ attributes: undefined }))).not.toThrow();
    expect(detectBlockingFilter(item({ attributes: undefined }))).toBeNull();
  });

  it("returns null when title is undefined (no throw)", () => {
    expect(() => detectBlockingFilter(item({ title: undefined }))).not.toThrow();
    expect(detectBlockingFilter(item({ title: undefined }))).toBeNull();
  });

  it("returns null for any recall hint (deferred — no signal in payload)", () => {
    // Phase 8: recall detection is intentionally a no-op (no reliable field in WebMotorsScraped).
    // If a future actor schema adds a field, update this test + implementation in Phase 13.
    expect(detectBlockingFilter(item({ title: "carro com recall aberto" }))).toBeNull();
  });

  it("ignores non-string entries inside attributes array", () => {
    // Defensive: actor sometimes returns mixed-type arrays; non-strings should be skipped without throw.
    const raw = { ...item(), attributes: [1, null, "Leilão"] as unknown as string[] };
    expect(() => detectBlockingFilter(raw)).not.toThrow();
    expect(detectBlockingFilter(raw)).toBe("leilao");
  });
});
