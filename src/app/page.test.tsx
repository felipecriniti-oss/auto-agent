import { useNegotiationStore } from "@/lib/stores/negotiation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Page from "./page";

beforeEach(() => {
  localStorage.clear();
  useNegotiationStore.setState({ currentSession: null, history: [] });
});

describe("NegotiationPage (idle state)", () => {
  it("renders the 3-column layout with an idle placeholder in the center", () => {
    render(<Page />);
    // Idle-state center placeholder (unique string; different from ContextPanel's
    // "Preencha o anúncio para iniciar").
    expect(screen.getByText(/Preencha o anúncio à esquerda/i)).toBeInTheDocument();
  });
});
