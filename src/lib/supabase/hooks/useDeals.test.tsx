import type { DbDeal } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

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

import { useDeals } from "./useDeals";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

const sampleDeal: DbDeal = {
  id: "d1",
  user_id: "user-1",
  opportunity_id: "o1",
  status: "contract_pending",
  fee_paid_amount: null,
  stripe_charge_id: null,
  contract_url: null,
  zapsign_document_id: null,
  seller_contact_shared_at: null,
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-22T00:00:00Z",
};

describe("useDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fetched deals", async () => {
    mockOrder.mockResolvedValue({ data: [sampleDeal], error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeals(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.length ?? 0).toBeGreaterThan(0));
    expect(result.current.data?.[0]?.id).toBe("d1");
    expect(mockFrom).toHaveBeenCalledWith("deals");
  });

  it("returns empty array on no rows", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeals(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it("surfaces error state", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "db down" } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeals(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
