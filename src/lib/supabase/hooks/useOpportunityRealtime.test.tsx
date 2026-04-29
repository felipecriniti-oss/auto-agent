import { useAppStore } from "@/lib/stores/app";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
// vi.mock(...) is hoisted to top-of-file, so all referenced state must be
// declared via vi.hoisted(...) — otherwise we hit "Cannot access X before
// initialization" at module-init time.
const mocks = vi.hoisted(() => {
  type Handler = (payload: { new: { id: string; wishlist_id: string } }) => void;
  type EventOpts = {
    event?: string;
    schema?: string;
    table?: string;
    filter?: string;
  };
  const state = {
    capturedHandler: null as Handler | null,
    capturedEventOpts: {} as EventOpts,
    enrichedFixture: null as Record<string, unknown> | null,
    mockUser: { id: "user-1" } as { id: string } | null,
  };
  return {
    state,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    subscribeMock: vi.fn(),
    removeChannelMock: vi.fn(),
    channelMock: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    channel: (name: string) => {
      mocks.channelMock(name);
      return {
        on: (
          _evt: string,
          opts: { event?: string; schema?: string; table?: string; filter?: string },
          handler: (payload: { new: { id: string; wishlist_id: string } }) => void,
        ) => {
          mocks.state.capturedHandler = handler;
          mocks.state.capturedEventOpts = opts;
          return { subscribe: mocks.subscribeMock };
        },
      };
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => Promise.resolve({ data: mocks.state.enrichedFixture, error: null }),
        }),
      }),
    }),
    removeChannel: mocks.removeChannelMock,
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("./useSupabaseUser", () => ({
  useSupabaseUser: () => ({
    user: mocks.state.mockUser,
    isLoading: false,
    signOut: async () => {},
  }),
}));

// Import AFTER mocks
import { buildToastTitle, useOpportunityRealtime } from "./useOpportunityRealtime";

// ── shared state reset ─────────────────────────────────────────────────────

beforeEach(() => {
  mocks.state.capturedHandler = null;
  mocks.state.capturedEventOpts = {};
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.subscribeMock.mockReset();
  mocks.removeChannelMock.mockReset();
  mocks.channelMock.mockReset();
  mocks.state.enrichedFixture = null;
  mocks.state.mockUser = { id: "user-1" };
  useAppStore.getState().resetMarketplaceUnread();
});

afterEach(() => {
  vi.useRealTimers();
});

function fireEvent(id: string, wishlist_id: string): void {
  if (!mocks.state.capturedHandler) throw new Error("handler not captured");
  mocks.state.capturedHandler({ new: { id, wishlist_id } });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("useOpportunityRealtime", () => {
  it("subscribes to INSERT-only events on mount", () => {
    renderHook(() => useOpportunityRealtime());
    expect(mocks.channelMock).toHaveBeenCalledWith("opportunities-realtime:user-1");
    expect(mocks.state.capturedEventOpts.event).toBe("INSERT");
    expect(mocks.state.capturedEventOpts.table).toBe("opportunities");
    expect(mocks.state.capturedEventOpts.filter).toBe("user_id=eq.user-1");
  });

  it("does not subscribe when user is null", () => {
    mocks.state.mockUser = null;
    renderHook(() => useOpportunityRealtime());
    expect(mocks.channelMock).not.toHaveBeenCalled();
    expect(mocks.state.capturedHandler).toBeNull();
  });

  it("increments marketplaceUnreadCount on each INSERT event (badge regardless of toast)", async () => {
    vi.useFakeTimers();
    mocks.state.enrichedFixture = {
      id: "opp-1",
      listing_brand: "Honda",
      listing_model: "Civic",
      listing_year: 2020,
      savings_pct: 22.7,
    };
    renderHook(() => useOpportunityRealtime());
    fireEvent("opp-a", "w-1");
    fireEvent("opp-b", "w-2");
    fireEvent("opp-c", "w-3");
    await vi.advanceTimersByTimeAsync(250);
    expect(useAppStore.getState().marketplaceUnreadCount).toBe(3);
  });

  it("fires a single-event toast with the D-12 wording using listing_* fields", async () => {
    vi.useFakeTimers();
    mocks.state.enrichedFixture = {
      id: "opp-1",
      listing_brand: "Honda",
      listing_model: "Civic",
      listing_year: 2020,
      savings_pct: 22.7,
    };
    renderHook(() => useOpportunityRealtime());
    fireEvent("opp-1", "w-1");
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    const [title] = mocks.toastSuccess.mock.calls[0];
    expect(title).toMatch(/Nova oportunidade · Honda Civic 2020 · −23% FIPE/);
  });

  it("strips duplicate brand from model when listing_model already starts with listing_brand", async () => {
    vi.useFakeTimers();
    mocks.state.enrichedFixture = {
      id: "opp-2",
      listing_brand: "Honda",
      listing_model: "Honda Civic",
      listing_year: 2020,
      savings_pct: 18.4,
    };
    renderHook(() => useOpportunityRealtime());
    fireEvent("opp-2", "w-1");
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    const [title] = mocks.toastSuccess.mock.calls[0];
    // Should NOT contain "Honda Honda" — brand prefix dedupes against model.
    expect(title).not.toMatch(/Honda Honda/);
    expect(title).toMatch(/Nova oportunidade · Honda Civic 2020/);
  });

  it("collapses burst of 8+ INSERTs into one summary toast with the full count", async () => {
    vi.useFakeTimers();
    renderHook(() => useOpportunityRealtime());
    // 8 events, mixed wishlist_ids (4× w-1, 4× w-2) — fired synchronously so
    // they all land within the 200ms debounce window. Mixed wishlists DEFEAT
    // same-wishlist suppression, so the summary toast should fire.
    for (let i = 0; i < 4; i++) fireEvent(`opp-${i}`, "w-1");
    for (let i = 4; i < 8; i++) fireEvent(`opp-${i}`, "w-2");
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    const [title] = mocks.toastSuccess.mock.calls[0];
    expect(title).toMatch(/Nova wishlist gerou 8 oportunidades/);
    // Badge still increments per event.
    expect(useAppStore.getState().marketplaceUnreadCount).toBe(8);
  });

  it("suppresses summary toast when all burst events share the same wishlist_id (W-03)", async () => {
    vi.useFakeTimers();
    renderHook(() => useOpportunityRealtime());
    // 8 events ALL on w-shared. The mutation toast in useCreateWishlist
    // already informed the user, so the realtime summary is suppressed.
    for (let i = 0; i < 8; i++) fireEvent(`opp-${i}`, "w-shared");
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // Badge still increments per event (always).
    expect(useAppStore.getState().marketplaceUnreadCount).toBe(8);
  });

  it("removes the channel on unmount + cancels pending flush timer", async () => {
    vi.useFakeTimers();
    mocks.state.enrichedFixture = {
      id: "opp-1",
      listing_brand: "Honda",
      listing_model: "Civic",
      listing_year: 2020,
      savings_pct: 22.7,
    };
    const { unmount } = renderHook(() => useOpportunityRealtime());
    fireEvent("opp-1", "w-1");
    // Unmount BEFORE the 200ms debounce fires.
    unmount();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.removeChannelMock).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("does NOT subscribe to UPDATE events (D-11)", () => {
    renderHook(() => useOpportunityRealtime());
    // Defense in depth — verify the literal string "INSERT" was passed,
    // never "*" or "UPDATE".
    expect(mocks.state.capturedEventOpts.event).toBe("INSERT");
    expect(mocks.state.capturedEventOpts.event).not.toBe("*");
    expect(mocks.state.capturedEventOpts.event).not.toBe("UPDATE");
  });
});

// ── buildToastTitle unit tests ─────────────────────────────────────────────

describe("buildToastTitle", () => {
  it("renders savings_pct rounded to nearest integer", () => {
    const title = buildToastTitle({
      id: "x",
      listing_brand: "Honda",
      listing_model: "Civic",
      listing_year: 2020,
      savings_pct: 22.7,
    } as never);
    expect(title).toBe("Nova oportunidade · Honda Civic 2020 · −23% FIPE");
  });

  it("renders trailing 'FIPE' (no percent) when savings_pct is null", () => {
    const title = buildToastTitle({
      id: "x",
      listing_brand: "Honda",
      listing_model: "Civic",
      listing_year: 2020,
      savings_pct: null,
    } as never);
    expect(title).toBe("Nova oportunidade · Honda Civic 2020 · FIPE");
  });
});
