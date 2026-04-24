import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
import type { WishlistFormValues } from "@/lib/schemas/wishlist";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { type Control, FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock useListingsSnapshot to return our curated mocks deterministically
vi.mock("@/lib/supabase/hooks/useListingsSnapshot", () => ({
  useListingsSnapshot: () => ({ data: PREVIEW_LISTINGS, isLoading: false, isError: false }),
}));

import { WishlistPreviewPane } from "./WishlistPreviewPane";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

function FormHarness({
  defaults,
  children,
}: {
  defaults?: Partial<WishlistFormValues>;
  children: (control: Control<WishlistFormValues>) => ReactNode;
}) {
  const form = useForm<WishlistFormValues>({
    defaultValues: {
      name: "",
      brand: "",
      model: "",
      trim: null,
      year_min: null,
      year_max: null,
      km_max: null,
      price_max: null,
      fuel_type: [],
      transmission: [],
      armored: null,
      region_uf: [],
      region_cities: [],
      ...(defaults ?? {}),
    },
  });
  return <FormProvider {...form}>{children(form.control)}</FormProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WishlistPreviewPane", () => {
  it("renders Skeleton while brand/model are empty", () => {
    const { Wrapper } = makeWrapper();
    render(<FormHarness>{(control) => <WishlistPreviewPane control={control} />}</FormHarness>, {
      wrapper: Wrapper,
    });
    // Debounce: advance past 400ms — still no brand/model → count=null → Skeleton
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("Prévia de resultados")).toBeInTheDocument();
  });

  it("renders 'acharíamos X anúncios' when form has matching brand+model", () => {
    // Honda Civic exists in PREVIEW_LISTINGS
    const { Wrapper } = makeWrapper();
    render(
      <FormHarness defaults={{ brand: "Honda", model: "Civic" }}>
        {(control) => <WishlistPreviewPane control={control} />}
      </FormHarness>,
      { wrapper: Wrapper },
    );
    act(() => {
      vi.advanceTimersByTime(450);
    });
    // After debounce, count should be > 0 for Honda Civic
    expect(screen.getByText(/acharíamos/)).toBeInTheDocument();
    expect(screen.getByText(/anúncios/)).toBeInTheDocument();
  });

  it("renders zero-match copy when wishlist is over-restrictive", () => {
    const { Wrapper } = makeWrapper();
    render(
      <FormHarness defaults={{ brand: "Honda", model: "Civic", price_max: 1 }}>
        {(control) => <WishlistPreviewPane control={control} />}
      </FormHarness>,
      { wrapper: Wrapper },
    );
    act(() => {
      vi.advanceTimersByTime(450);
    });
    // price_max=1 R$ matches nothing
    expect(screen.getByText(/Ainda não achamos anúncios compatíveis/)).toBeInTheDocument();
  });

  it("has aria-live='polite' on the section (a11y)", () => {
    const { Wrapper } = makeWrapper();
    const { container } = render(
      <FormHarness>{(control) => <WishlistPreviewPane control={control} />}</FormHarness>,
      { wrapper: Wrapper },
    );
    const section = container.querySelector("section[aria-live='polite']");
    expect(section).not.toBeNull();
  });

  it("count span uses text-[#4C46DC] accent class (UI-SPEC color exception)", () => {
    const { Wrapper } = makeWrapper();
    const { container } = render(
      <FormHarness defaults={{ brand: "Honda", model: "Civic" }}>
        {(control) => <WishlistPreviewPane control={control} />}
      </FormHarness>,
      { wrapper: Wrapper },
    );
    act(() => {
      vi.advanceTimersByTime(450);
    });
    // Find the span with accent class
    const accentSpan = container.querySelector("span.text-\\[\\#4C46DC\\]");
    expect(accentSpan).not.toBeNull();
  });
});
