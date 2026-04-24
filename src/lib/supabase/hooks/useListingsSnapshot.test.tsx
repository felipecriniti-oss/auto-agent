import type { DbListing } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────
//
// The hook shape is:
//   supabase.from("listings").select("*").limit(500).order("created_at", {...})
// so the mock chain terminates on .order() returning the resolved query result.

const mockOrder = vi.fn();
const mockLimit = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ limit: mockLimit, order: mockOrder }));
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

import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
import { useListingsSnapshot } from "./useListingsSnapshot";

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

// ── tests ──────────────────────────────────────────────────────────────────

describe("useListingsSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns real listings when Supabase has rows (NOT mocks)", async () => {
    const realListing: DbListing = {
      ...PREVIEW_LISTINGS[0],
      id: "real-1",
      source: "WebMotors",
    };
    mockOrder.mockResolvedValue({ data: [realListing], error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.data?.[0]?.id).toBe("real-1");
    expect(mockFrom).toHaveBeenCalledWith("listings");
  });

  it("falls back to PREVIEW_LISTINGS when Supabase returns [] (D-01)", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data?.length).toBe(PREVIEW_LISTINGS.length));
    expect(result.current.data).toEqual(PREVIEW_LISTINGS);
  });

  it("enters error state when Supabase errors", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "db down" } });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("calls .limit(500) on the query", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { Wrapper } = makeWrapper();
    renderHook(() => useListingsSnapshot(), { wrapper: Wrapper });

    await waitFor(() => expect(mockLimit).toHaveBeenCalledWith(500));
  });
});
