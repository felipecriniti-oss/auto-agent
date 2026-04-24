import type { DbWishlist } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────

const mockOrder = vi.fn();
const mockNeq = vi.fn(() => ({ order: mockOrder }));
// Final eq in update/delete chain resolves to a PromiseLike { error: null }
const mockEqTerminal = vi.fn(() => Promise.resolve({ error: null }));
const mockEq1 = vi.fn(() => ({
  // list query: .eq("user_id", x).neq("status", "archived").order(...)
  neq: mockNeq,
  order: mockOrder,
  // update/delete path: .eq("id", x).eq("user_id", y) — final eq resolves
  eq: mockEqTerminal,
}));
const mockSelect = vi.fn(() => ({ eq: mockEq1, order: mockOrder }));
const mockInsert = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockEq1 }));
const mockDelete = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
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
import { useDeleteWishlist, useWishlists } from "./useWishlists";

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

  it("useWishlists applies .neq('status', 'archived') on list query (D-14 filter)", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = makeWrapper();
    renderHook(() => useWishlists(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(mockNeq).toHaveBeenCalledWith("status", "archived");
    });
  });

  it("useDeleteWishlist issues update({status:'archived'}) not delete() (D-14 soft-delete)", async () => {
    // Seed list so the hook has a query to invalidate
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = makeWrapper();
    // Render both hooks — useWishlists forces the session to resolve so
    // useDeleteWishlist's closed-over `user` is populated before we mutate.
    const { result } = renderHook(
      () => {
        useWishlists();
        return useDeleteWishlist();
      },
      { wrapper: Wrapper },
    );
    // Wait for the session query to resolve (mockFrom gets called when
    // useWishlists' queryFn runs, which only happens after user loads).
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync("w1");
    });
    expect(mockUpdate).toHaveBeenCalledWith({ status: "archived" });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
