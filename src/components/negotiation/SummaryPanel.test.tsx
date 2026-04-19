import { useNegotiationStore } from "@/lib/stores/negotiation";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SummaryPanel, computeSummaryPrices } from "./SummaryPanel";

function makeEndedSession(messages: { role: "agent" | "seller"; content: string }[] = []) {
  return {
    id: "sess-r",
    listing: {
      marca: "VW",
      modelo: "Gol 1.6",
      ano: 2020,
      km: 45000,
      precoPedido: 52000,
      cidade: "SP",
      diasOnline: 30,
      reducoes: 2,
    },
    fipe: 52000,
    targetPrice: 39000,
    walkAwayPrice: 46800,
    maxRounds: 6 as const,
    messages: messages.map((m, i) => ({
      id: `m-${i}`,
      role: m.role,
      round: Math.floor(i / 2) + 1,
      content: m.content,
      timestamp: "2026-04-19T00:00:00Z",
      isStreaming: false,
    })),
    round: 2,
    status: "ended" as const,
    startedAt: "2026-04-19T00:00:00Z",
    endedAt: "2026-04-19T00:05:00Z",
    endReason: "user_stopped" as const,
  };
}

beforeEach(() => {
  useNegotiationStore.setState({ currentSession: null, history: [] });
});
afterEach(() => {
  // Reset inside act() — cleanup order runs this before RTL unmount, so the
  // component is still subscribed when state changes.
  act(() => {
    useNegotiationStore.setState({ currentSession: null, history: [] });
  });
});

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

// React error #185 regression: calling a method that returns a new array
// inside a Zustand useShallow selector causes an infinite re-render loop.
// This test catches that by mounting the component and firing a store update;
// an infinite loop surfaces as "Maximum update depth exceeded" (jsdom throws).
describe("SummaryPanel — render-loop regression (React #185)", () => {
  it("mounts with an ended session without throwing", () => {
    useNegotiationStore.setState({
      currentSession: makeEndedSession([
        { role: "agent", content: "Oferta <arg>FIPE-vs-ask</arg> R$ 39.000." },
      ]),
      history: [],
    });
    expect(() => render(<SummaryPanel />)).not.toThrow();
    expect(screen.getByText(/Resumo da negociação/)).toBeInTheDocument();
  });

  it("survives a store update that changes messages without looping", () => {
    useNegotiationStore.setState({
      currentSession: makeEndedSession([{ role: "agent", content: "Inicial R$ 39.000." }]),
      history: [],
    });
    render(<SummaryPanel />);
    act(() => {
      useNegotiationStore.setState((prev) => {
        const s = prev.currentSession;
        if (!s) return prev;
        return {
          ...prev,
          currentSession: {
            ...s,
            messages: [
              ...s.messages,
              {
                id: "m-extra",
                role: "agent",
                round: 2,
                content: "Final R$ 42.000.",
                timestamp: "2026-04-19T00:06:00Z",
                isStreaming: false,
              },
            ],
          },
        };
      });
    });
    expect(screen.getByText(/Resumo da negociação/)).toBeInTheDocument();
  });
});
