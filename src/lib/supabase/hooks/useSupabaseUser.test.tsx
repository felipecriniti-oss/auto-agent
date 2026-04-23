import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

import { useSupabaseUser } from "./useSupabaseUser";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}

describe("useSupabaseUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user when authenticated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@x" } },
      error: null,
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupabaseUser(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe("user-1"));
  });

  it("returns null user on error", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "nope" } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupabaseUser(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("signOut calls supabase.auth.signOut()", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@x" } },
      error: null,
    });
    signOutMock.mockResolvedValue({ error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupabaseUser(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe("user-1"));
    await result.current.signOut();
    expect(signOutMock).toHaveBeenCalled();
  });

  it("subscribes to auth state changes on mount", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { Wrapper } = makeWrapper();
    renderHook(() => useSupabaseUser(), { wrapper: Wrapper });
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());
  });
});
