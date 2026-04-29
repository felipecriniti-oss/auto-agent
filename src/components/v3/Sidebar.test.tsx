import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sidebar reads activeModule, setActiveModule, marketplaceUnreadCount, and
// resetMarketplaceUnread from the app store. Selector-shaped factory keeps
// the tests free of a real Zustand store.
//
// 09-05: D-15 removed Marketplace from the sidebar; 09-05 reintroduces it
// (with a live unread badge) as a non-negotiable navigation entry between
// Wishlists and Backstage.
const storeState = {
  activeModule: "wishlists" as string,
  setActiveModule: vi.fn(),
  marketplaceUnreadCount: 0,
  resetMarketplaceUnread: vi.fn(),
};
vi.mock("@/lib/stores/app", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: selector-shaped mock for Zustand
  useAppStore: (selector: (state: any) => unknown) => selector(storeState),
}));

// useProfile is fetched on render; provide a minimal stub.
vi.mock("@/lib/supabase/hooks/useProfile", () => ({
  useProfile: () => ({ data: { name: "Tester", city: "São Paulo", plan: "starter" } }),
}));

// ThemeToggle is a leaf client component; render-only stub.
vi.mock("@/components/v3/ThemeToggle", () => ({
  default: () => <div data-testid="mock-theme-toggle" />,
}));

import Sidebar from "./Sidebar";

beforeEach(() => {
  storeState.activeModule = "wishlists";
  storeState.marketplaceUnreadCount = 0;
  storeState.setActiveModule.mockReset();
  storeState.resetMarketplaceUnread.mockReset();
});

describe("Sidebar (09-05)", () => {
  it("renders label 'Minhas Wishlists'", () => {
    render(<Sidebar />);
    const matches = screen.getAllByText("Minhas Wishlists");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Marketplace' nav item (09-05 reintroduction)", () => {
    render(<Sidebar />);
    expect(screen.getByText("Marketplace")).toBeInTheDocument();
  });

  it("places Marketplace between Wishlists and Backstage in Operação", () => {
    render(<Sidebar />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const wishIdx = labels.findIndex((l) => l.includes("Minhas Wishlists"));
    const mpIdx = labels.findIndex((l) => l.includes("Marketplace"));
    const bsIdx = labels.findIndex((l) => l.includes("Backstage"));
    expect(wishIdx).toBeGreaterThanOrEqual(0);
    expect(mpIdx).toBeGreaterThan(wishIdx);
    expect(bsIdx).toBeGreaterThan(mpIdx);
  });

  it("does not render the unread badge when count is 0", () => {
    storeState.marketplaceUnreadCount = 0;
    render(<Sidebar />);
    expect(screen.queryByLabelText(/novas oportunidades/)).toBeNull();
  });

  it("renders the unread badge with the count when > 0", () => {
    storeState.marketplaceUnreadCount = 7;
    render(<Sidebar />);
    const badge = screen.getByLabelText(/7 novas oportunidades/);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("7");
  });

  it("clamps the badge label at 99+ when count exceeds 99", () => {
    storeState.marketplaceUnreadCount = 142;
    render(<Sidebar />);
    const badge = screen.getByLabelText(/142 novas oportunidades/);
    expect(badge.textContent).toBe("99+");
  });
});
