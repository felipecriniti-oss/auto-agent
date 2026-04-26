import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function importClient() {
  return await import("./client");
}

describe("getActorRun", () => {
  it("calls /v2/actor-runs/{runId} with token query and returns parsed data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: "run-1",
          status: "SUCCEEDED",
          defaultDatasetId: "ds-1",
          usageTotalUsd: 0.42,
          startedAt: "2026-04-25T10:00:00Z",
          finishedAt: "2026-04-25T10:05:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getActorRun } = await importClient();
    const ctrl = new AbortController();
    const result = await getActorRun("run-1", "tok-xyz", ctrl.signal);
    expect(result.id).toBe("run-1");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.defaultDatasetId).toBe("ds-1");
    expect(result.usageTotalUsd).toBe(0.42);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.apify.com/v2/actor-runs/run-1?token=tok-xyz");
    expect(callArgs[1]).toMatchObject({ headers: { Accept: "application/json" } });
    expect(callArgs[1].signal).toBe(ctrl.signal);
  });

  it("throws apify_run_meta_404 on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getActorRun } = await importClient();
    const ctrl = new AbortController();
    await expect(getActorRun("missing", "tok-xyz", ctrl.signal)).rejects.toThrow(
      "apify_run_meta_404",
    );
  });

  it("throws apify_run_meta_500 on 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getActorRun } = await importClient();
    const ctrl = new AbortController();
    await expect(getActorRun("run-1", "tok-xyz", ctrl.signal)).rejects.toThrow(
      "apify_run_meta_500",
    );
  });

  it("never includes the token in the thrown error message", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new Error("network exploded while reaching token=super-secret-token endpoint"),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { getActorRun } = await importClient();
    const ctrl = new AbortController();
    try {
      await getActorRun("r", "super-secret-token", ctrl.signal);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(String(err)).not.toMatch(/super-secret-token/);
    }
  });

  it("forwards the AbortSignal into fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: "r",
          status: "SUCCEEDED",
          defaultDatasetId: "ds",
          usageTotalUsd: 0,
          startedAt: "2026-04-25T10:00:00Z",
          finishedAt: "2026-04-25T10:01:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getActorRun } = await importClient();
    const ctrl = new AbortController();
    await getActorRun("r", "tok", ctrl.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(ctrl.signal);
  });
});

describe("streamDatasetItems", () => {
  it("paginates 1000 + 500 + 0 → yields 1500 items total", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 500 }, (_, i) => ({ id: 1000 + i }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    const items: { id: number }[] = [];
    for await (const it of streamDatasetItems<{ id: number }>("ds-1", "tok-xyz", ctrl.signal)) {
      items.push(it);
    }
    expect(items).toHaveLength(1500);
    // 500 < 1000 page size triggers early-return — no third fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Verify offset progression
    expect(fetchMock.mock.calls[0][0]).toContain("offset=0");
    expect(fetchMock.mock.calls[1][0]).toContain("offset=1000");
  });

  it("yields nothing when first page is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    const items: unknown[] = [];
    for await (const it of streamDatasetItems("ds-empty", "tok-xyz", ctrl.signal)) {
      items.push(it);
    }
    expect(items).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after a partial page (no second fetch)", async () => {
    const small = Array.from({ length: 7 }, (_, i) => ({ id: i }));
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(small));
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    const items: { id: number }[] = [];
    for await (const it of streamDatasetItems<{ id: number }>("ds-small", "tok-xyz", ctrl.signal)) {
      items.push(it);
    }
    expect(items).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws apify_dataset_404 on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    const run = async () => {
      for await (const _ of streamDatasetItems("ds-bad", "tok-xyz", ctrl.signal)) {
        // exhaust
      }
    };
    await expect(run()).rejects.toThrow("apify_dataset_404");
  });

  it("never includes the token in any thrown error message", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("connection lost — token=supersecret-leaky-token in transit"),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    try {
      for await (const _ of streamDatasetItems("ds", "supersecret-leaky-token", ctrl.signal)) {
        // exhaust
      }
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(String(err)).not.toMatch(/supersecret-leaky-token/);
    }
  });

  it("forwards the AbortSignal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { streamDatasetItems } = await importClient();
    const ctrl = new AbortController();
    for await (const _ of streamDatasetItems("ds", "tok", ctrl.signal)) {
      // empty
    }
    expect(fetchMock.mock.calls[0][1].signal).toBe(ctrl.signal);
  });
});
