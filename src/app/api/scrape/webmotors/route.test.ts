import { resetRateLimitForTest } from "@/lib/server/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validBody = { url: "https://www.webmotors.com.br/comprar/vw/gol/1.6-2020" };

function makeRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/scrape/webmotors", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function importRoute() {
  // Fresh import each test so env reads at module top-level (we don't have any)
  // and the handler's closure over `process.env.APIFY_API_TOKEN` always sees
  // the stubbed value. `process.env.X = undefined` does not work — must delete.
  return await import("./route");
}

beforeEach(() => {
  resetRateLimitForTest();
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env.APIFY_API_TOKEN = "apify_api_test_token_DO_NOT_LEAK";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.APIFY_API_TOKEN = undefined;
});

describe("POST /api/scrape/webmotors — validation", () => {
  it("returns 400 on missing url (invalid_body)", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_body");
  });

  it("returns 400 on malformed JSON body", async () => {
    const { POST } = await importRoute();
    const bad = new Request("http://localhost/api/scrape/webmotors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 only_webmotors_supported on non-WebMotors URL", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ url: "https://www.mercadolivre.com.br/veiculos/some-listing" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("only_webmotors_supported");
  });

  it("accepts the webmotors.com.br apex and subdomains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            marca: "VW",
            modelo: "Gol",
            ano: 2020,
            km: 45000,
            precoPedido: 52000,
            cidade: "São Paulo",
            uf: "SP",
          },
        ]),
      ),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ url: "https://webmotors.com.br/anuncio/123" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/scrape/webmotors — missing env", () => {
  it("returns 500 when APIFY_API_TOKEN is not set", async () => {
    // Reflect.deleteProperty avoids biome's noDelete rule while still
    // producing a true "missing" env var (assigning undefined stringifies
    // to "undefined" in Node's process.env).
    Reflect.deleteProperty(process.env, "APIFY_API_TOKEN");
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("apify_token_missing");
  });
});

describe("POST /api/scrape/webmotors — success", () => {
  it("returns 200 with mapped opportunity shape when Apify returns a dataset item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            url: validBody.url,
            marca: "Volkswagen",
            modelo: "Gol 1.6",
            trim: "MSI",
            ano: 2020,
            km: 45000,
            precoPedido: 52000,
            cidade: "Campinas",
            uf: "SP",
            sellerName: "João S.",
            diasOnline: 80,
            reducoes: 3,
            cor: "Prata",
            combustivel: "Flex",
          },
        ]),
      ),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.opportunity).toMatchObject({
      vehicle: "Volkswagen Gol 1.6 MSI",
      year: 2020,
      km: 45000,
      dealPrice: 52000,
      location: "Campinas, SP",
      sellerName: "João S.",
      source: "WebMotors",
      timeLeft: "7d 00h",
    });
    expect(data.opportunity.motivationSignals).toContain("80 dias online");
    expect(data.opportunity.motivationSignals).toContain("3 reduções de preço");
    // FIPE-dependent fields are intentionally absent — client fills them after FIPE lookup.
    expect(data.opportunity.fipe).toBeUndefined();
    expect(data.opportunity.savings).toBeUndefined();
    expect(data.opportunity.fee).toBeUndefined();
    expect(data.opportunity.margin).toBeUndefined();
  });
});

describe("POST /api/scrape/webmotors — Apify failures", () => {
  it("returns 502 scrape_failed when Apify returns non-404 HTTP error (no fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("internal error", { status: 500 })),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("scrape_failed");
  });

  it("returns 502 when Apify returns an empty dataset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("scrape_failed");
    expect(data.detail).toBe("no_items_returned");
  });

  it("does NOT leak APIFY_API_TOKEN in 502 error bodies (T-scrape-leak)", async () => {
    const tokenProbe = "apify_api_test_token_DO_NOT_LEAK";
    // Simulate Apify echoing the token in an error body (paranoid — it doesn't
    // today, but the handler should still scrub it).
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(`unauthorized: token ${tokenProbe} invalid`, { status: 401 }),
        ),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    const text = await res.text();
    expect(text).not.toContain(tokenProbe);
  });
});

describe("POST /api/scrape/webmotors — rate limit", () => {
  it("blocks the 11th request from the same IP with 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ marca: "VW", modelo: "Gol", precoPedido: 50000 }])),
    );
    const { POST } = await importRoute();
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest(validBody, "5.5.5.5"));
    }
    const res = await POST(makeRequest(validBody, "5.5.5.5"));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
