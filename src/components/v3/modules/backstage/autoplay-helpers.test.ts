import type { Opportunity } from "@/lib/mock-data/v3";
import { describe, expect, it } from "vitest";
import {
  detectAgentOutcome,
  detectPfOutcome,
  pickPersonaFromOpportunity,
  stripArgTags,
} from "./autoplay-helpers";

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 1,
    vehicle: "Test Vehicle",
    year: 2023,
    km: 10000,
    dealPrice: 100_000,
    fipe: 120_000,
    savings: 20_000,
    fee: 1_000,
    score: 90,
    location: "São Paulo, SP",
    sellerName: "Fulano S.",
    img: "🚗",
    color: "Preto",
    fuel: "Gasolina",
    rounds: 3,
    motivationSignals: [],
    ddStatus: "ok",
    timeLeft: "7d",
    source: "WebMotors",
    margin: 17,
    ...overrides,
  };
}

describe("pickPersonaFromOpportunity", () => {
  it("returns resistente when no motivation signals", () => {
    expect(pickPersonaFromOpportunity(makeOpp())).toBe("resistente");
  });

  it("returns urgente for international move signals", () => {
    expect(
      pickPersonaFromOpportunity(makeOpp({ motivationSignals: ["Mudança internacional (EUA)"] })),
    ).toBe("urgente");
  });

  it("returns urgente for 5+ price reductions", () => {
    expect(
      pickPersonaFromOpportunity(makeOpp({ motivationSignals: ["5 reduções de preço"] })),
    ).toBe("urgente");
  });

  it("returns urgente for 60+ days online", () => {
    expect(pickPersonaFromOpportunity(makeOpp({ motivationSignals: ["78 dias online"] }))).toBe(
      "urgente",
    );
  });

  it("returns ansioso for 'troca por elétrico' signal", () => {
    expect(
      pickPersonaFromOpportunity(
        makeOpp({ motivationSignals: ["Troca por elétrico confirmada", "52 dias online"] }),
      ),
    ).toBe("ansioso");
  });

  it("returns ansioso for 3 reductions and no urgent markers", () => {
    expect(
      pickPersonaFromOpportunity(makeOpp({ motivationSignals: ["3 reduções de preço"] })),
    ).toBe("ansioso");
  });
});

describe("detectAgentOutcome", () => {
  it("returns walkaway for 'obrigado pela conversa'", () => {
    expect(detectAgentOutcome("Entendo. Obrigado pela conversa, boa sorte!")).toBe("walkaway");
  });

  it("returns walkaway for 'infelizmente não conseguimos chegar'", () => {
    expect(detectAgentOutcome("Infelizmente não conseguimos chegar num valor que fechasse.")).toBe(
      "walkaway",
    );
  });

  it("returns in_progress for a regular negotiation reply", () => {
    expect(detectAgentOutcome("Posso subir para R$ 180 mil, mas preciso de resposta hoje.")).toBe(
      "in_progress",
    );
  });
});

describe("detectPfOutcome", () => {
  it("detects PF acceptance", () => {
    expect(detectPfOutcome("Tá fechado então. Pode vir aqui.")).toBe("deal_closed");
  });

  it("detects PF 'aceito'", () => {
    expect(detectPfOutcome("Aceito a proposta.")).toBe("deal_closed");
  });

  it("returns in_progress for a counter", () => {
    expect(detectPfOutcome("R$ 185 mil e fechamos hoje mesmo.")).toBe("in_progress");
  });
});

describe("stripArgTags", () => {
  it("removes <arg> and </arg> tags but keeps content", () => {
    const input = "Veja <arg>45 dias online acima da média.</arg> Dá pra acelerar?";
    expect(stripArgTags(input)).toBe("Veja 45 dias online acima da média. Dá pra acelerar?");
  });

  it("handles text with no tags", () => {
    expect(stripArgTags("plain text")).toBe("plain text");
  });
});
