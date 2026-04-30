import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockOnOpenChange = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/hooks/useWishlists", () => ({
  useCreateWishlist: () => ({ mutateAsync: mockCreateMutate, isPending: false }),
  useUpdateWishlist: () => ({ mutateAsync: mockUpdateMutate, isPending: false }),
}));

// Sibling-plan primitives (07-07, 07-08, 07-09) are produced by peer agents in
// this wave. We mock them here so the sheet composition is testable in isolation.
vi.mock("@/components/forms/FipeBrandCombobox", () => ({
  FipeBrandCombobox: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input data-testid="mock-fipe-brand" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/forms/FipeModelCombobox", () => ({
  FipeModelCombobox: ({
    brand,
    value,
    onChange,
  }: {
    brand: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid="mock-fipe-model"
      data-brand={brand}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/forms/LocalidadeMultiPicker", () => ({
  LocalidadeMultiPicker: () => <div data-testid="mock-localidade-multi" />,
}));

vi.mock("@/components/forms/WishlistPreviewPane", () => ({
  WishlistPreviewPane: () => <div data-testid="mock-preview-pane" />,
}));

vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
  useListingsSnapshot: () => ({ data: [], isLoading: false, isError: false }),
}));

import { toast } from "sonner";
import { WishlistFormSheet } from "./WishlistFormSheet";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WishlistFormSheet", () => {
  it("renders all 4 section headers", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="inline" />, { wrapper: Wrapper });
    expect(screen.getByText("Qual carro você quer?")).toBeInTheDocument();
    expect(screen.getByText("Faixas aceitas")).toBeInTheDocument();
    expect(screen.getByText("Combustível e câmbio")).toBeInTheDocument();
    expect(screen.getByText("Blindagem e região")).toBeInTheDocument();
  });

  // W8 (fix a): submit-error test with RTL fireEvent, asserting exact UI-SPEC copy AND that onOpenChange(false) is NOT called
  it("toast.error fires with exact UI-SPEC copy and sheet stays open when mutateAsync rejects", async () => {
    mockCreateMutate.mockRejectedValueOnce(new Error("save fail"));

    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="inline" onOpenChange={mockOnOpenChange} />, {
      wrapper: Wrapper,
    });

    // Fill brand + model via mocked comboboxes (sibling primitives)
    const brandInput = screen.getByTestId("mock-fipe-brand");
    fireEvent.change(brandInput, { target: { value: "Honda" } });
    const modelInput = screen.getByTestId("mock-fipe-model");
    fireEvent.change(modelInput, { target: { value: "Civic" } });

    const submitBtn = screen.getByRole("button", { name: /Salvar wishlist|Salvando/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a wishlist. Verifique sua conexão e tente de novo.",
      );
    });

    // Sheet stays open — onOpenChange(false) is NOT called
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("renders 'Salvar wishlist' button (accent color)", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="inline" />, { wrapper: Wrapper });
    const btn = screen.getByRole("button", { name: "Salvar wishlist" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/#4C46DC/);
  });

  it("renders custom submitLabel when provided (B3 — onboarding CTA)", () => {
    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="inline" submitLabel="Salvar e começar" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole("button", { name: "Salvar e começar" })).toBeInTheDocument();
  });

  it("renders 'Cancelar' button in sheet layout but not in inline layout", () => {
    const { Wrapper } = makeWrapper();
    const { rerender } = render(<WishlistFormSheet layout="sheet" open />, {
      wrapper: Wrapper,
    });
    expect(screen.getAllByRole("button", { name: "Cancelar" }).length).toBeGreaterThanOrEqual(1);

    rerender(<WishlistFormSheet layout="inline" />);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("edit mode: initial prop hydrates name field", () => {
    const { Wrapper } = makeWrapper();
    const initial = {
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
      region_uf: [],
      region_cities: [],
      status: "active" as const,
      created_at: "2026-04-20T10:00:00Z",
      updated_at: "2026-04-20T10:00:00Z",
    };
    render(<WishlistFormSheet layout="inline" initial={initial} />, {
      wrapper: Wrapper,
    });
    const nameInput = screen.getByPlaceholderText("Honda Civic 2018+ SP") as HTMLInputElement;
    expect(nameInput.value).toBe("Meu Civic");
  });

  // ─── Phase 7-13 / HUMAN-UAT Test 2 fix ─────────────────────────────────────
  // When the sheet opens on desktop (isDesktop = matchMedia("(min-width: 768px)")
  // matches), pressing Escape must close it via handleCancel(), and on close
  // focus must return to whatever element had focus before the sheet opened.
  // The mobile Radix <Dialog> branch handles Escape natively; our document-level
  // listener is gated to `isDesktop` so it doesn't double-fire there.

  function setMatchMedia(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it("desktop: Escape calls onOpenChange(false) and closes the sheet", async () => {
    setMatchMedia(true);
    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="sheet" open onOpenChange={mockOnOpenChange} />, {
      wrapper: Wrapper,
    });

    // The aside is announced as a modal dialog
    expect(screen.getByRole("dialog", { name: "Nova wishlist" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("desktop: Escape listener is removed when the sheet closes (no leaked handler)", () => {
    setMatchMedia(true);
    const { Wrapper } = makeWrapper();
    const { rerender } = render(
      <WishlistFormSheet layout="sheet" open onOpenChange={mockOnOpenChange} />,
      { wrapper: Wrapper },
    );

    // Close the sheet — desktop listener should detach
    rerender(<WishlistFormSheet layout="sheet" open={false} onOpenChange={mockOnOpenChange} />);

    // Now Escape should NOT call onOpenChange (listener removed)
    mockOnOpenChange.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it("mobile: Escape still closes the sheet (Radix Dialog handles natively)", async () => {
    setMatchMedia(false); // < 768px → mobile branch
    const { Wrapper } = makeWrapper();
    render(<WishlistFormSheet layout="sheet" open onOpenChange={mockOnOpenChange} />, {
      wrapper: Wrapper,
    });

    // We don't attach our document listener on mobile (gated to isDesktop),
    // but Radix Dialog has its own native Escape handler that wires through
    // to our onOpenChange prop. Test asserts the BEHAVIOR works on both
    // branches; the desktop branch is covered by the dedicated test above.
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("desktop: closing the sheet restores focus to the trigger element", async () => {
    setMatchMedia(true);
    const { Wrapper } = makeWrapper();

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="trigger">
            + Nova Wishlist
          </button>
          <WishlistFormSheet layout="sheet" open={open} onOpenChange={mockOnOpenChange} />
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />, { wrapper: Wrapper });

    // Focus the trigger BEFORE the sheet opens — this is what we expect to
    // be restored on close.
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open the sheet — focus moves into the dialog
    rerender(<Harness open={true} />);

    // Close the sheet — focus should restore to the trigger
    rerender(<Harness open={false} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
