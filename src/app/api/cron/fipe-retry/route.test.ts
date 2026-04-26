import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Test state ──────────────────────────────────────────────────────────
type Row = {
  id: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  attributes: Record<string, unknown>;
};
let pendingRows: Row[] = [];
let selectError: { message: string } | null = null;
let updateCalls: { id: string; payload: Record<string, unknown> }[] = [];
let tablesTouched: string[] = [];

function makeBuilder(table: string) {
  tablesTouched.push(table);
  let pendingUpdate: Record<string, unknown> | null = null;
  let pendingId: string | null = null;
  let limit = 100;
  const chain: Record<string, unknown> = {
    select(_cols?: string) {
      return chain;
    },
    update(payload: Record<string, unknown>) {
      pendingUpdate = payload;
      return chain;
    },
    eq(col: string, val: unknown) {
      if (col === "id") pendingId = String(val);
      return chain;
    },
    filter(_col: string, _op: string, _val: string) {
      return chain;
    },
    not(_col: string, _op: string, _val: unknown) {
      return chain;
    },
    is(_col: string, _val: unknown) {
      return chain;
    },
    limit(n: number) {
      limit = n;
      return chain;
    },
    then(resolve: (v: { data: Row[] | null; error: typeof selectError }) => void) {
      // Resolves whichever terminal operation was set up.
      if (pendingUpdate && pendingId) {
        updateCalls.push({ id: pendingId, payload: pendingUpdate });
        return resolve({ data: [{ id: pendingId } as Row], error: null });
      }
      // Otherwise this is the SELECT chain.
      return resolve({ data: pendingRows.slice(0, limit), error: selectError });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRole: () => ({ from: (t: string) => makeBuilder(t) }),
}));

// ─── /api/fipe stub ─────────────────────────────────────────────────────
const fipeMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  pendingRows = [];
  selectError = null;
  updateCalls = [];
  tablesTouched = [];
  fipeMock.mockReset();
  process.env.CRON_SECRET = "test-cron-secret";
  vi.stubGlobal("fetch", fipeMock);
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
  delete process.env.CRON_SECRET;
  vi.unstubAllGlobals();
});

function makeReq(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://localhost/api/cron/fipe-retry", {
    method: "GET",
    headers,
  });
}

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    brand: "Honda",
    model: "Civic",
    year: 2020,
    price: 95000,
    attributes: { fipe_retry_pending: true, color: "Preto" },
    ...overrides,
  };
}

function fipeResponse(fipe: number) {
  return new Response(JSON.stringify({ fipe, marca: "Honda", modelo: "Civic", ano: 2020 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/cron/fipe-retry — auth", () => {
  it("returns 500 when CRON_SECRET is not set", async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer anything"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("misconfigured");
  });

  it("returns 401 on missing Authorization header", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when header lacks 'Bearer ' prefix", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq("test-cron-secret"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/fipe-retry — happy paths", () => {
  it("returns processed:0 when no pending rows", async () => {
    pendingRows = [];
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; succeeded: number; failed: number };
    expect(body).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(fipeMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("processes 5 rows: 4 succeed, 1 fails, only 4 update", async () => {
    pendingRows = [row("1"), row("2"), row("3"), row("4"), row("5")];
    fipeMock
      .mockResolvedValueOnce(fipeResponse(110000))
      .mockResolvedValueOnce(fipeResponse(115000))
      .mockResolvedValueOnce(new Response("oops", { status: 500 }))
      .mockResolvedValueOnce(fipeResponse(112000))
      .mockResolvedValueOnce(fipeResponse(108000));
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; succeeded: number; failed: number };
    expect(body.processed).toBe(5);
    expect(body.succeeded).toBe(4);
    expect(body.failed).toBe(1);
    expect(updateCalls).toHaveLength(4);
    // Verify update payload shape on at least one row
    const u = updateCalls[0];
    expect(u.payload).toMatchObject({ fipe: expect.any(Number) });
    expect(u.payload.attributes).toBeDefined();
    expect(
      (u.payload.attributes as Record<string, unknown>).fipe_retry_pending,
    ).toBeUndefined();
    expect((u.payload.attributes as Record<string, unknown>).color).toBe("Preto");
  });

  it("computes savings_vs_fipe and savings_pct correctly", async () => {
    pendingRows = [row("1", { price: 70000, year: 2020 })];
    fipeMock.mockResolvedValueOnce(fipeResponse(110000));
    const { GET } = await import("./route");
    await GET(makeReq("Bearer test-cron-secret"));
    expect(updateCalls[0].payload).toMatchObject({
      fipe: 110000,
      savings_vs_fipe: 40000,
    });
    expect((updateCalls[0].payload as { savings_pct: number }).savings_pct).toBeCloseTo(36.36, 1);
  });

  it("chunks at 10 max concurrent (15 rows → 2 chunks)", async () => {
    // Track concurrency by counting in-flight fetches.
    let inFlight = 0;
    let peak = 0;
    fipeMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return fipeResponse(110000);
    });
    pendingRows = Array.from({ length: 15 }, (_, i) => row(String(i)));
    const { GET } = await import("./route");
    await GET(makeReq("Bearer test-cron-secret"));
    expect(peak).toBeLessThanOrEqual(10);
    expect(fipeMock).toHaveBeenCalledTimes(15);
  });

  it("skips rows missing brand/model/year (cannot enrich)", async () => {
    pendingRows = [row("1", { brand: null }), row("2", { model: null }), row("3", { year: null })];
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; succeeded: number; failed: number };
    // All three are skipped (counted as failed since they cannot be enriched)
    expect(body.processed).toBe(3);
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(3);
    expect(fipeMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("touches only the listings table (privilege confinement)", async () => {
    pendingRows = [row("1")];
    fipeMock.mockResolvedValueOnce(fipeResponse(110000));
    const { GET } = await import("./route");
    await GET(makeReq("Bearer test-cron-secret"));
    expect(tablesTouched.length).toBeGreaterThan(0);
    for (const t of tablesTouched) {
      expect(t).toBe("listings");
    }
  });
});

describe("GET /api/cron/fipe-retry — db error path", () => {
  it("returns 500 when supabase select errors", async () => {
    selectError = { message: "connection refused" };
    const { GET } = await import("./route");
    const res = await GET(makeReq("Bearer test-cron-secret"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("db_read_failed");
  });
});
