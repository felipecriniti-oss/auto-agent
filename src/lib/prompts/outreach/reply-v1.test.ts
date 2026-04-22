import { describe, expect, it } from "vitest";
import { offerRespectsHardFloor, parseReplyResponse } from "./reply-v1";

describe("parseReplyResponse", () => {
  it("parses a complete well-formed response", () => {
    const raw = `<intent>ongoing</intent>
<offer>85000</offer>
<message>Cara, fecho contigo em 85k no dinheiro.</message>
<rationale>Rodada 3, first offer 8% below asking.</rationale>`;
    const r = parseReplyResponse(raw);
    expect(r).not.toBeNull();
    expect(r?.intent).toBe("ongoing");
    expect(r?.offer).toBe(85000);
    expect(r?.message).toContain("Cara, fecho");
    expect(r?.rationale).toContain("Rodada 3");
  });

  it("parses converged with offer", () => {
    const raw =
      "<intent>converged</intent><offer>87500</offer><message>Fechado!</message><rationale>PF aceitou 87.5k.</rationale>";
    const r = parseReplyResponse(raw);
    expect(r?.intent).toBe("converged");
    expect(r?.offer).toBe(87500);
  });

  it("parses escalated with empty offer", () => {
    const raw = `<intent>escalated</intent>
<offer></offer>
<message>Interessante. Me mostra o CRLV depois?</message>
<rationale>PF asked for CRLV — no access.</rationale>`;
    const r = parseReplyResponse(raw);
    expect(r?.intent).toBe("escalated");
    expect(r?.offer).toBeNull();
  });

  it("parses lost", () => {
    const raw =
      "<intent>lost</intent><offer></offer><message>Sem problema, obrigado.</message><rationale>PF refused 3 times.</rationale>";
    const r = parseReplyResponse(raw);
    expect(r?.intent).toBe("lost");
  });

  it("handles BRL formatting in offer", () => {
    const raw =
      "<intent>ongoing</intent><offer>R$ 85.000</offer><message>proposta</message><rationale>x</rationale>";
    const r = parseReplyResponse(raw);
    expect(r?.offer).toBe(85000);
  });

  it("returns null on missing intent", () => {
    const raw = "<offer>85000</offer><message>x</message>";
    expect(parseReplyResponse(raw)).toBeNull();
  });

  it("returns null on missing message", () => {
    const raw = "<intent>ongoing</intent><offer>85000</offer>";
    expect(parseReplyResponse(raw)).toBeNull();
  });

  it("returns null on invalid intent value", () => {
    const raw = "<intent>bogus</intent><offer>85000</offer><message>x</message>";
    expect(parseReplyResponse(raw)).toBeNull();
  });

  it("handles multi-line message", () => {
    const raw = `<intent>ongoing</intent>
<offer>90000</offer>
<message>Opa, tudo bem?

Consigo fechar em 90 hoje. Pode ser?</message>
<rationale>counter-proposal</rationale>`;
    const r = parseReplyResponse(raw);
    expect(r?.message).toContain("Opa, tudo bem?");
    expect(r?.message).toContain("Consigo fechar");
  });
});

describe("offerRespectsHardFloor", () => {
  it("null offer is always safe", () => {
    expect(offerRespectsHardFloor(null, 80000)).toBe(true);
  });

  it("offer >= floor is safe", () => {
    expect(offerRespectsHardFloor(80000, 80000)).toBe(true);
    expect(offerRespectsHardFloor(85000, 80000)).toBe(true);
  });

  it("offer < floor is unsafe", () => {
    expect(offerRespectsHardFloor(79999, 80000)).toBe(false);
    expect(offerRespectsHardFloor(50000, 80000)).toBe(false);
  });
});
