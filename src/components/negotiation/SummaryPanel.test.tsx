import { describe, expect, it } from "vitest";
import { computeSummaryPrices } from "./SummaryPanel";

describe("computeSummaryPrices", () => {
  it("returns {null, null} when no agent messages", () => {
    const r = computeSummaryPrices([{ role: "seller", content: "R$ 50000" }]);
    expect(r).toEqual({ initialOffer: null, finalOffer: null });
  });

  it("extracts first and last agent offer from 'R$' prices", () => {
    const r = computeSummaryPrices([
      { role: "agent", content: "Minha oferta inicial é R$ 39.000." },
      { role: "seller", content: "não" },
      { role: "agent", content: "Posso chegar a R$ 43.000 na última rodada." },
    ]);
    expect(r.initialOffer).toBe(39000);
    expect(r.finalOffer).toBe(43000);
  });

  it("takes the LAST R$ match when content has multiple prices (including inside arg tags)", () => {
    const r = computeSummaryPrices([
      { role: "agent", content: "Oferta <arg>firmada em R$ 99.999</arg> de R$ 39.000." },
      { role: "agent", content: "Final: R$ 42.500." },
    ]);
    expect(r.initialOffer).toBe(39000);
    expect(r.finalOffer).toBe(42500);
  });

  it("returns null for a message without price", () => {
    const r = computeSummaryPrices([{ role: "agent", content: "Obrigado pela conversa." }]);
    expect(r.initialOffer).toBeNull();
    expect(r.finalOffer).toBeNull();
  });

  it("handles Brazilian number format with cents", () => {
    const r = computeSummaryPrices([
      { role: "agent", content: "Ofereço R$ 39.500,00." },
      { role: "agent", content: "Aceito R$ 41.000,00." },
    ]);
    expect(r.initialOffer).toBe(39500);
    expect(r.finalOffer).toBe(41000);
  });
});
