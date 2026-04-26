import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Supabase service role mock — chain: from('listings').update(...).lt(...).neq(...).select(...) → { data, error }
let updateCalls: { table: string; payload: Record<string, unknown> }[] = [];
let listingsUpdateRows: { id: string }[] = [];
let listingsUpdateError: { message: string } | null = null;
let lastFilters: { lt?: [string, string]; neq?: [string, string] } = {};

function makeBuilder(table: string) {
  let pendingUpdate: Record<string, unknown> | null = null;
  const chain = {
    update(payload: Record<string, unknown>) {
      pendingUpdate = payload;
      return chain;
    },
    lt(col: string, val: string) {
      lastFilters.lt = [col, val];
      return chain;
    },
    neq(col: string, val: string) {
      lastFilters.neq = [col, val];
      return chain;
    },
    select(_cols?: string) {
      if (pendingUpdate) {
        updateCalls.push({ table, payload: pendingUpdate });
      }
      return Promise.resolve({ data: listingsUpdateRows, error: listingsUpdateError });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRole: () => ({ from: (t: string) => makeBuilder(t) }),
}));

beforeEach(() => {
  vi.resetModules();
  updateCalls = [];
  listingsUpdateRows = [];
  listingsUpdateError = null;
  lastFilters = {};
  process.env.CRON_SECRET = "test-cron-secret";
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
  delete process.env.CRON_SECRET;
});

function makeReq(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://localhost/api/cron/listings-cleanup", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/listings-cleanup — auth", () => {
  it("returns 500 when CRON_SECRET is not set", async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer anything"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("misconfigured");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer value", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when header lacks 'Bearer ' prefix", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("test-cron-secret"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/listings-cleanup — happy path", () => {
  it("returns 200 + removed count when valid bearer + rows updated", async () => {
    listingsUpdateRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: number };
    expect(body.removed).toBe(3);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("listings");
    expect(updateCalls[0].payload).toMatchObject({ status: "removed" });
    // Filter: lt on last_scraped_at, neq on status
    expect(lastFilters.lt?.[0]).toBe("last_scraped_at");
    expect(lastFilters.neq).toEqual(["status", "removed"]);
  });

  it("returns 200 + removed: 0 when no rows match", async () => {
    listingsUpdateRows = [];
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: number };
    expect(body.removed).toBe(0);
  });

  it("uses a 72-hour cutoff (lt filter timestamp is ~72h before now)", async () => {
    listingsUpdateRows = [];
    const before = Date.now();
    const { GET } = await import("./route");
    await GET(makeReq("Bearer test-cron-secret"));
    const after = Date.now();
    const cutoffStr = lastFilters.lt?.[1];
    expect(cutoffStr).toBeDefined();
    if (!cutoffStr) return;
    const cutoffMs = Date.parse(cutoffStr);
    const expectedMin = before - 72 * 60 * 60 * 1000 - 1000;
    const expectedMax = after - 72 * 60 * 60 * 1000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });
});

describe("GET /api/cron/listings-cleanup — db error path", () => {
  it("returns 500 when supabase update errors", async () => {
    listingsUpdateError = { message: "connection refused" };
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("db_update_failed");
  });
});
