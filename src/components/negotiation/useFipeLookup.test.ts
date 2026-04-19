import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFipeLookup } from "./useFipeLookup";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const validInput = { marca: "VW", modelo: "Gol 1.6", ano: 2020 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useFipeLookup", () => {
  it("resolves to {status: 'success', fipe: 268000} on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { fipe: 268000, marca: "VW", modelo: "Gol 1.6", ano: 2020 }),
        ),
    );

    const { result } = renderHook(() => useFipeLookup());
    expect(result.current.status).toBe("idle");

    act(() => {
      result.current.lookup(validInput);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe("success");
    expect(result.current.fipe).toBe(268000);
    expect(result.current.error).toBeNull();
  });

  it("resolves to {status: 'not_found'} on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_found" })));

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe("not_found");
    expect(result.current.fipe).toBeNull();
  });

  it("resolves to {status: 'upstream_failed'} on 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(502, { error: "upstream_failed" })),
    );

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe("upstream_failed");
    expect(result.current.fipe).toBeNull();
  });

  it("resolves to {status: 'error'} on other non-ok (e.g. 500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" })));

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe("error");
  });

  it("debounces 300ms — fetch is NOT called before the window elapses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { fipe: 1, marca: "x", modelo: "y", ano: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid successive lookups (debounce resets) — fetch fires only once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { fipe: 1, marca: "x", modelo: "y", ano: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts in-flight fetch on unmount (T-07-02 cleanup)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined;
      return await new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup(validInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("no-op when any of marca/modelo/ano is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFipeLookup());
    act(() => {
      result.current.lookup({ marca: "", modelo: "Gol 1.6", ano: 2020 });
    });
    act(() => {
      result.current.lookup({ marca: "VW", modelo: "", ano: 2020 });
    });
    act(() => {
      result.current.lookup({ marca: "VW", modelo: "Gol 1.6", ano: 0 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});
