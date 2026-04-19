import { describe, expect, it } from "vitest";
import { parseFipeValor } from "./fipe";

describe("parseFipeValor", () => {
  it("parses R$ 268.000,00 to 268000", () => {
    expect(parseFipeValor("R$ 268.000,00")).toBe(268000);
  });

  it("parses R$ 52.000,00 to 52000", () => {
    expect(parseFipeValor("R$ 52.000,00")).toBe(52000);
  });

  it("rounds R$ 1.234,56 to 1235", () => {
    expect(parseFipeValor("R$ 1.234,56")).toBe(1235);
  });

  it("rounds R$ 999,99 to 1000", () => {
    expect(parseFipeValor("R$ 999,99")).toBe(1000);
  });

  it("throws on empty string", () => {
    expect(() => parseFipeValor("")).toThrow();
  });

  it("throws on non-numeric input", () => {
    expect(() => parseFipeValor("foo")).toThrow();
  });

  it("throws on malformed Brazilian number", () => {
    expect(() => parseFipeValor("R$ abc,de")).toThrow();
  });

  it("handles extra whitespace", () => {
    expect(parseFipeValor("R$   268.000,00")).toBe(268000);
  });
});
