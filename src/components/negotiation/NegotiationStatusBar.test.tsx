import { useNegotiationStore } from "@/lib/stores/negotiation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NegotiationStatusBar } from "./NegotiationStatusBar";

function makeSession() {
  return {
    id: "sess-1",
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
    targetPrice: 39000, // fipe * 0.75
    walkAwayPrice: 46800, // fipe * 0.90
    maxRounds: 6 as const,
    messages: [],
    round: 3,
    status: "negotiating" as const,
    startedAt: null,
    endedAt: null,
    endReason: null,
  };
}

function seedSession(overrides: Partial<ReturnType<typeof makeSession>> = {}) {
  const base = makeSession();
  useNegotiationStore.setState({
    currentSession: { ...base, ...overrides },
    history: [],
  });
}

beforeEach(() => {
  useNegotiationStore.setState({ currentSession: null, history: [] });
});

describe("NegotiationStatusBar (D-04)", () => {
  it("renders nothing when currentSession is null", () => {
    render(<NegotiationStatusBar />);
    expect(screen.queryByTestId("negotiation-status-bar")).toBeNull();
  });

  it("renders the FIPE value from the store", () => {
    seedSession();
    render(<NegotiationStatusBar />);
    const badge = screen.getByTestId("status-fipe");
    expect(badge.textContent).toContain("FIPE:");
    expect(badge.textContent).toContain("52.000");
  });

  it("renders the targetPrice derived (fipe * 0.75)", () => {
    seedSession();
    render(<NegotiationStatusBar />);
    const badge = screen.getByTestId("status-target");
    expect(badge.textContent).toContain("Target:");
    expect(badge.textContent).toContain("39.000");
  });

  it("renders the walkAwayPrice derived (fipe * 0.90)", () => {
    seedSession();
    render(<NegotiationStatusBar />);
    const badge = screen.getByTestId("status-walkaway");
    expect(badge.textContent).toContain("Walk-away:");
    expect(badge.textContent).toContain("46.800");
  });

  it("renders the round counter as N/maxRounds", () => {
    seedSession();
    render(<NegotiationStatusBar />);
    const badge = screen.getByTestId("status-round");
    expect(badge.textContent).toContain("Rodada 3/6");
  });

  it("renders all 4 D-04 labels simultaneously", () => {
    seedSession();
    render(<NegotiationStatusBar />);
    expect(screen.getByTestId("status-fipe")).toBeInTheDocument();
    expect(screen.getByTestId("status-target")).toBeInTheDocument();
    expect(screen.getByTestId("status-walkaway")).toBeInTheDocument();
    expect(screen.getByTestId("status-round")).toBeInTheDocument();
  });
});
