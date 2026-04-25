import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Router mock — onboarding page uses next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// useSupabaseUser must provide a user for the page to render past the gate
vi.mock("@/lib/supabase/hooks/useSupabaseUser", () => ({
  useSupabaseUser: () => ({
    user: { id: "u1", email: "lojista@test.com" },
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

// Supabase client mock — supports `.from("users").update(...).eq(...)`
const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    from: () => ({ update: mockUpdate }),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock the heavy form sheet so we don't pull its full dep graph into this test
vi.mock("@/components/v3/modules/WishlistFormSheet", () => ({
  WishlistFormSheet: ({
    layout,
    onSaved,
    submitLabel,
  }: {
    layout?: string;
    onSaved?: () => void;
    submitLabel?: string;
  }) => (
    <div data-testid="wishlist-form-sheet" data-layout={layout} data-submit-label={submitLabel}>
      <button type="button" onClick={() => onSaved?.()}>
        Saved
      </button>
    </div>
  ),
}));

// Likewise mock useListingsSnapshot in case anything deep imports it
vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
  useListingsSnapshot: () => ({ data: [], isLoading: false, isError: false }),
}));

import OnboardingPage from "./page";

describe("OnboardingPage step 3 (D-08/D-11/D-12 + B5)", () => {
  it("renders 'Passo 1 de 3' on initial load (wizard expanded to 3 steps)", () => {
    render(<OnboardingPage />);
    // Step 1 mounts on first render → badge reads "Passo 1 de 3"
    expect(screen.getByText(/Passo 1 de 3/)).toBeInTheDocument();
  });
});
