import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Sidebar reads activeModule + setActiveModule from the app store; mock with a
// selector-shaped factory so tests don't need a real Zustand store.
vi.mock("@/lib/stores/app", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: selector-shaped mock for Zustand
  useAppStore: (selector: (state: any) => unknown) =>
    selector({ activeModule: "wishlists", setActiveModule: () => {} }),
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

describe("Sidebar (D-15)", () => {
  it("renders label 'Minhas Wishlists' (D-15 rename)", () => {
    render(<Sidebar />);
    // The mobile nav and desktop nav both render — the sidebar mounts items in
    // a single nav, so this should match exactly once.
    const matches = screen.getAllByText("Minhas Wishlists");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("does not render 'Marketplace' nav item (D-15 removal)", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Marketplace")).toBeNull();
  });
});
