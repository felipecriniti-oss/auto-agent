import type { DbWishlist } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────

const mockOrder = vi.fn();
const mockEq2 = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ order: mockOrder, eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1, order: mockOrder }));
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    from: mockFrom,
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "u@x" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

// user hook pulls the user via our mocked getUser; need a minimal import here
import { useWishlists } from "./useWishlists";

// ── helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

const sampleWishlist: DbWishlist = {
  id: "w1",
  user_id: "user-1",
  name: "Civic 2019",
  brand: "Honda",
  model: "Civic",
  trim: null,
  year_min: 2019,
  year_max: 2022,
  km_max: 60000,
  price_max: 120000,
  fuel_type: ["flex"],
  transmission: ["automático"],
  armored: null,
  region_uf: ["SP"],
  region_cities: [],
  status: "active",
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-22T00:00:00Z",
};

// ── tests ──────────────────────────────────────────────────────────────────

describe("useWishlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array while loading when no data yet", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlists(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it("returns fetched wishlists on success", async () => {
    mockOrder.mockResolvedValue({ data: [sampleWishlist], error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlists(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.length ?? 0).toBeGreaterThan(0));
    expect(result.current.data?.[0]?.id).toBe("w1");
    expect(mockFrom).toHaveBeenCalledWith("wishlists");
  });

  it("surfaces error state on supabase error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlists(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});
