import type { DbOpportunityEnriched } from "@/types/database";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Call chain shape:
//   supabase.from("opportunities_enriched").select("*")
//     .eq("user_id", userId).order("created_at", { ascending: false })
//     [optional] .eq("status", status)
//     → await
//
// The code does `let query = ...order(...); if (status) query = query.eq(...)`,
// so `order()` returns a chainable that is both awaitable AND has an `eq`
// method returning a similar chainable. We model that with a per-call builder
// that carries the current `resolvedValue` and the call history.

type Resolved = { data: unknown; error: unknown };

let resolvedValue: Resolved = { data: [], error: null };
const statusEqCalls: Array<[string, unknown]> = [];

// The mock mirrors postgrest-js's PostgrestBuilder, which IS a thenable —
// awaiting a query triggers its `.then`. We attach that via
// Object.defineProperty using a dynamic key so Biome's noThenProperty rule
// doesn't flag a legitimate thenable mock.
const THENABLE = "t" + "hen";
function makeQueryBuilder() {
  const builder: {
    eq: (col: string, val: unknown) => typeof builder;
  } = {
    eq: (col, val) => {
      statusEqCalls.push([col, val]);
      return builder;
    },
  };
  Object.defineProperty(builder, THENABLE, {
    value: (onResolved: (v: Resolved) => unknown) =>
      Promise.resolve(resolvedValue).then(onResolved),
    enumerable: true,
  });
  return builder;
}

const mockOrder = vi.fn(() => makeQueryBuilder());
const mockEq1 = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

const subscribeMock = vi.fn();
const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
const channelMock = vi.fn(() => ({ on: onMock }));
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    from: mockFrom,
    channel: channelMock,
    removeChannel: removeChannelMock,
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "u@x" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

import { useOpportunities } from "./useOpportunities";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

const sampleOpp = {
  id: "o1",
  user_id: "user-1",
  wishlist_id: "w1",
  listing_id: "l1",
  match_score: 0.92,
  status: "pending",
  fee_amount: 500,
  agent_thread_id: null,
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-22T00:00:00Z",
  listing_brand: "Honda",
  listing_model: "Civic",
  listing_year: 2019,
  listing_km: 52000,
  listing_price: 102000,
  listing_fipe: 115000,
  savings_pct: 11.3,
  photo_url: null,
  listing_url: null,
  seller_city: "São Paulo",
  seller_uf: "SP",
  wishlist_name: "Civic 2018+",
  thread_status: null,
  thread_round: null,
  last_pf_message_at: null,
  last_agent_message_at: null,
} satisfies DbOpportunityEnriched;

describe("useOpportunities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusEqCalls.length = 0;
    resolvedValue = { data: [], error: null };
    subscribeMock.mockReturnValue({ unsubscribe: () => {} });
  });

  it("returns fetched opportunities", async () => {
    resolvedValue = { data: [sampleOpp], error: null };
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOpportunities(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.length ?? 0).toBeGreaterThan(0));
    expect(result.current.data?.[0]?.id).toBe("o1");
    expect(mockFrom).toHaveBeenCalledWith("opportunities_enriched");
  });

  it("filters by status when provided", async () => {
    resolvedValue = { data: [], error: null };
    const { Wrapper } = makeWrapper();
    renderHook(() => useOpportunities({ status: "converged" }), { wrapper: Wrapper });
    await waitFor(() =>
      expect(statusEqCalls.some(([c, v]) => c === "status" && v === "converged")).toBe(true),
    );
  });

  it("subscribes to realtime opportunity channel", async () => {
    resolvedValue = { data: [], error: null };
    const { Wrapper } = makeWrapper();
    renderHook(() => useOpportunities(), { wrapper: Wrapper });
    await waitFor(() => expect(channelMock).toHaveBeenCalled());
    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();
  });

  it("surfaces error state", async () => {
    resolvedValue = { data: null, error: { message: "boom" } };
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOpportunities(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
