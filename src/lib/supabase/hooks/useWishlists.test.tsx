import type { DbWishlist } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from "sonner";

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
import { useCreateWishlist, useDeleteWishlist, useWishlists } from "./useWishlists";

// Fetch mock — used by useCreateWishlist's onSuccess backfill branch.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

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

// ── useCreateWishlist — backfill branch (D-05, D-06) ──────────────────────

describe("useCreateWishlist — backfill", () => {
  // Helper: rig the supabase insert chain to resolve { data: created, error: null }
  // useCreateWishlist calls .from("wishlists").insert({...}).select().single()
  // The shared mockInsert is consumed by reassigning its return for this branch.
  function rigInsertSuccess(
    created: DbWishlist = {
      ...sampleWishlist,
      id: "w-new",
      user_id: "user-1",
    },
  ) {
    const single = vi.fn().mockResolvedValue({ data: created, error: null });
    const select = vi.fn(() => ({ single }));
    mockInsert.mockReturnValue({ select });
    // Also make the list query resolve (the mutation hook also touches user via
    // the session mock; the wishlist list query may run when both hooks render).
    mockOrder.mockResolvedValue({ data: [], error: null });
    return created;
  }

  // Render useCreateWishlist + useWishlists in tandem so the user-1 session
  // resolves before mutateAsync — mirrors the pattern in the existing
  // useDeleteWishlist test.
  function renderCreateHook(qc?: QueryClient) {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider
        client={
          qc ??
          new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    );
    return renderHook(
      () => {
        useWishlists();
        return useCreateWishlist();
      },
      { wrapper: Wrapper },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
  });

  it("calls /api/match/backfill with the inserted wishlist_id after successful insert", async () => {
    const created = rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: 0, opportunities_created: 0 }),
    });

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync({
        name: created.name,
        brand: created.brand,
        model: created.model,
        year_min: created.year_min,
        year_max: created.year_max,
        km_max: created.km_max,
        price_max: created.price_max,
        fuel_type: created.fuel_type,
        transmission: created.transmission,
        region_uf: created.region_uf,
        region_cities: created.region_cities,
        status: created.status,
      });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/match/backfill",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wishlist_id: "w-new" }),
      }),
    );
  });

  it("fires a sonner toast when opportunities_created > 0", async () => {
    rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: 5, opportunities_created: 3 }),
    });

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/Encontramos 3 oportunidades para essa wishlist/),
      { duration: 5000 },
    );
  });

  it("uses singular form when opportunities_created === 1", async () => {
    rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: 1, opportunities_created: 1 }),
    });

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/Encontramos 1 oportunidade para essa wishlist/),
      { duration: 5000 },
    );
    // Make sure the plural form did NOT leak in.
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringMatching(/oportunidades/),
      expect.anything(),
    );
  });

  it("does NOT fire a toast when opportunities_created === 0", async () => {
    rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: 0, opportunities_created: 0 }),
    });

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("logs and continues silently when backfill fetch fails (network error)", async () => {
    rigInsertSuccess();
    fetchMock.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    let mutationResult: DbWishlist | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy).toHaveBeenCalledWith("backfill_failed", expect.any(Error));
    // Mutation still resolved — wishlist insert is NOT rolled back.
    expect(mutationResult?.id).toBe("w-new");
    expect(toast.success).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs and continues silently when backfill returns non-200", async () => {
    rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderCreateHook();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    let mutationResult: DbWishlist | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy).toHaveBeenCalledWith("backfill_failed", {
      status: 500,
      wishlist_id: "w-new",
    });
    expect(mutationResult?.id).toBe("w-new");
    expect(toast.success).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("invalidates opportunities query with exact key when opportunities_created > 0", async () => {
    rigInsertSuccess();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: 5, opportunities_created: 3 }),
    });

    // W-05 fix: capture the exact QueryClient instance the hook uses, then
    // spy on its invalidateQueries method for an exact-key assertion (not a
    // loose `containing` matcher).
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderCreateHook(queryClient);
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("wishlists"));
    await act(async () => {
      await result.current.mutateAsync({ name: "x" } as never);
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());

    // W-05: exact-key match — not loose `containing`.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["supabase", "opportunities", "user-1"],
    });
    // Also assert the wishlists key invalidation still fires.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["supabase", "wishlists", "user-1"],
    });
  });
});
