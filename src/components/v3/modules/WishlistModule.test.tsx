import type { DbWishlist } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteMutate = vi.fn();
const mockUpdateMutate = vi.fn();
let mockData: DbWishlist[] = [];
let mockIsLoading = false;
let mockIsError = false;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/supabase/hooks/useWishlists", () => ({
  useWishlists: () => ({ data: mockData, isLoading: mockIsLoading, isError: mockIsError }),
  useCreateWishlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWishlist: () => ({ mutate: mockUpdateMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteWishlist: () => ({ mutate: mockDeleteMutate, mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
  useListingsSnapshot: () => ({ data: [], isLoading: false, isError: false }),
}));

// Mock the form sheet so the module test stays focused on grid + states + dialog,
// not on full RHF/Zod render. WishlistFormSheet has its own integration test.
vi.mock("./WishlistFormSheet", () => ({
  WishlistFormSheet: ({
    open,
    onOpenChange,
  }: {
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <div data-testid="mock-form-sheet">
        <button type="button" onClick={() => onOpenChange?.(false)}>
          mock-close-sheet
        </button>
      </div>
    ) : null,
}));

import { WishlistModule } from "./WishlistModule";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper };
}

function makeWishlist(overrides: Partial<DbWishlist> = {}): DbWishlist {
  return {
    id: "w1",
    user_id: "u1",
    name: "Meu Civic",
    brand: "Honda",
    model: "Civic",
    trim: null,
    year_min: 2018,
    year_max: null,
    km_max: null,
    price_max: null,
    fuel_type: [],
    transmission: [],
    armored: null,
    region_uf: ["SP"],
    region_cities: ["São Paulo"],
    status: "active",
    created_at: "2026-04-20T10:00:00Z",
    updated_at: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockData = [];
  mockIsLoading = false;
  mockIsError = false;
});

describe("WishlistModule", () => {
  it("renders empty state when wishlists=[]", () => {
    mockData = [];
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    expect(screen.getByText("Ainda sem wishlists")).toBeInTheDocument();
    expect(screen.getByText(/Descreva o primeiro carro que você quer comprar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar primeira wishlist" })).toBeInTheDocument();
  });

  it("renders module h1 'Minhas Wishlists'", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    expect(screen.getByText("Minhas Wishlists")).toBeInTheDocument();
  });

  it("renders cards when wishlists has data", () => {
    mockData = [
      makeWishlist({ id: "w1", name: "Civic" }),
      makeWishlist({ id: "w2", name: "Corolla" }),
    ];
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    expect(screen.getByText("Civic")).toBeInTheDocument();
    expect(screen.getByText("Corolla")).toBeInTheDocument();
  });

  it("renders error card when isError is true", () => {
    mockIsError = true;
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    expect(screen.getByText(/Não carregou suas wishlists/)).toBeInTheDocument();
  });

  it("renders '+ Nova Wishlist' CTA button", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /Nova Wishlist/ })).toBeInTheDocument();
  });

  it("opens AlertDialog with 'Apagar wishlist?' on delete click", () => {
    mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    // Card delete button uses aria-label "Apagar"
    const deleteBtn = screen.getByRole("button", { name: "Apagar" });
    fireEvent.click(deleteBtn);
    expect(screen.getByText("Apagar wishlist?")).toBeInTheDocument();
    // name interpolated into description (also rendered in the card title — assert ≥1 match)
    expect(screen.getAllByText(/Meu Civic/).length).toBeGreaterThanOrEqual(2);
  });

  it("AlertDialog Manter (cancel) closes dialog without calling deleteMut", () => {
    mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    const manterBtn = screen.getByRole("button", { name: "Manter" });
    fireEvent.click(manterBtn);
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("AlertDialog Apagar (confirm) calls deleteMut.mutate with id", () => {
    mockData = [makeWishlist({ id: "w1", name: "Meu Civic" })];
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    // Click card delete (aria-label "Apagar") — opens dialog
    const cardDeleteBtn = screen.getByRole("button", { name: "Apagar" });
    fireEvent.click(cardDeleteBtn);
    // Now there are 2 buttons named "Apagar": original card + dialog confirm
    const allApagar = screen.getAllByRole("button", { name: "Apagar" });
    // The dialog's Apagar is the last one to appear
    fireEvent.click(allApagar[allApagar.length - 1]);
    expect(mockDeleteMutate).toHaveBeenCalledWith("w1", expect.any(Object));
  });

  it("clicking '+ Nova Wishlist' opens form sheet", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistModule />, { wrapper: Wrapper });
    const novaBtn = screen.getByRole("button", { name: /Nova Wishlist/ });
    fireEvent.click(novaBtn);
    expect(screen.getByTestId("mock-form-sheet")).toBeInTheDocument();
  });
});
