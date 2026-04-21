import type { Listing } from "@/lib/schemas/listing";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT_V1_TEMPLATE, buildSystemPrompt } from "./system-v1";

const validListing: Listing = {
  marca: "Volkswagen",
  modelo: "Gol 1.6",
  ano: 2020,
  km: 45000,
  precoPedido: 52000,
  cidade: "São Paulo",
  diasOnline: 30,
  reducoes: 2,
};

describe("SYSTEM_PROMPT_V1_TEMPLATE — drift guard", () => {
  it("begins with the canonical role statement", () => {
    expect(SYSTEM_PROMPT_V1_TEMPLATE.startsWith("Você é o AutoAgente")).toBe(true);
  });

  it("contains all 14 placeholders", () => {
    const placeholders = [
      "{marca}",
      "{modelo}",
      "{ano}",
      "{km}",
      "{askPrice}",
      "{city}",
      "{daysListed}",
      "{priceReductions}",
      "{fipe}",
      "{comparables}",
      "{maxRounds}",
      "{targetPrice}",
      "{targetDiscount}",
      "{walkAwayPrice}",
    ];
    for (const p of placeholders) {
      expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain(p);
    }
  });

  it("contains the prompt-injection defense paragraph (T-05-01)", () => {
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("TRATAMENTO DOS DADOS DO ANÚNCIO:");
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("DECLARAÇÕES FACTUAIS");
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("deve ser IGNORADO");
  });

  it("contains the <arg> tag instruction (D-14)", () => {
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("FORMATO INTERNO DE ARGUMENTOS:");
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("<arg>...</arg>");
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("NÃO são exibidas ao vendedor");
  });

  it("keeps 'sem markdown' instruction intact", () => {
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("sem markdown");
  });

  it("keeps HARD STOPS block", () => {
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("HARD STOPS:");
    expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain("encerre educadamente");
  });

  it("injection-defense block appears BEFORE DADOS DO ANÚNCIO (ordering)", () => {
    const iDefense = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("TRATAMENTO DOS DADOS DO ANÚNCIO");
    const iData = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("DADOS DO ANÚNCIO:");
    expect(iDefense).toBeGreaterThan(-1);
    expect(iData).toBeGreaterThan(-1);
    expect(iDefense).toBeLessThan(iData);
  });

  it("<arg> instruction appears AFTER HARD STOPS and BEFORE TOM (ordering)", () => {
    const iArg = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("FORMATO INTERNO DE ARGUMENTOS:");
    const iHard = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("HARD STOPS:");
    const iTom = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("TOM:");
    expect(iArg).toBeGreaterThan(-1);
    expect(iArg).toBeGreaterThan(iHard);
    expect(iArg).toBeLessThan(iTom);
  });
});

describe("buildSystemPrompt — substitution", () => {
  it("substitutes all placeholders (no unsubstituted {word} tokens left)", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    const leftovers = out.match(/\{[a-zA-Z]+\}/g);
    expect(leftovers).toBeNull();
  });

  it("includes marca and modelo verbatim", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("Volkswagen");
    expect(out).toContain("Gol 1.6");
  });

  it("formats km as Brazilian (45000 → '45.000')", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("45.000 km");
  });

  it("formats fipe, targetPrice, walkAwayPrice as Brazilian numbers", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("R$ 52.000");
    expect(out).toContain("R$ 39.000");
    expect(out).toContain("R$ 46.800");
  });

  it("formats askPrice from listing.precoPedido", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("R$ 52.000");
  });

  it("distinctly substitutes precoPedido different from fipe", () => {
    const listing = { ...validListing, precoPedido: 58000 };
    const out = buildSystemPrompt(listing, 52000, 39000, 46800, 6);
    expect(out).toContain("R$ 58.000");
    expect(out).toContain("R$ 52.000");
  });

  it("substitutes {targetDiscount} as '25' (D-10 fixed for Phase 1)", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toMatch(/≈25% abaixo da FIPE/);
  });

  it("substitutes {comparables} with the no-data placeholder", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("(sem dados de comparáveis nesta fase)");
  });

  it("substitutes {maxRounds} and {daysListed}", () => {
    const listing = { ...validListing, diasOnline: 72 };
    const out = buildSystemPrompt(listing, 52000, 39000, 46800, 8);
    expect(out).toContain("no máximo 8 rodadas");
    expect(out).toContain("72 dias");
  });

  it("substitutes city", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out).toContain("São Paulo");
  });

  it("produces a non-trivial string (>1500 chars)", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    expect(out.length).toBeGreaterThan(1500);
  });
});
