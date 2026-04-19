import { resetRateLimitForTest } from "@/lib/server/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const validBody = { marca: "Volkswagen", modelo: "Gol 1.6", ano: 2020 };

function makeRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/fipe", {
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

beforeEach(() => {
  resetRateLimitForTest();
  vi.unstubAllGlobals();
});

describe("POST /api/fipe — happy path", () => {
  it("returns 200 with {fipe, marca, modelo, ano} on full cascade success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ codigo: "59", nome: "VW - VolksWagen" }]))
      .mockResolvedValueOnce(
        jsonResponse({
          modelos: [{ codigo: 5585, nome: "Gol 1.6 Mi Total Flex 8V 5p" }],
          anos: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([{ codigo: "2020-1", nome: "2020 Gasolina" }]))
      .mockResolvedValueOnce(
        jsonResponse({
          Valor: "R$ 52.000,00",
          Marca: "VW - VolksWagen",
          Modelo: "Gol 1.6 Mi Total Flex 8V 5p",
          AnoModelo: 2020,
          Combustivel: "Gasolina",
          CodigoFipe: "005340-6",
          MesReferencia: "abril de 2026",
          TipoVeiculo: 1,
          SiglaCombustivel: "G",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ fipe: 52000, ano: 2020 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("POST /api/fipe — validation failures", () => {
  it("returns 400 on missing marca (invalid_body)", async () => {
    const res = await POST(makeRequest({ modelo: "Gol", ano: 2020 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_body");
  });

  it("returns 400 on marca with denylist char (<)", async () => {
    const res = await POST(makeRequest({ ...validBody, marca: "VW<script>" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    const bad = new Request("http://localhost/api/fipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/fipe — not found", () => {
  it("returns 404 when marca does not match anything", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ codigo: "59", nome: "Fiat" }])),
    );
    const res = await POST(makeRequest({ ...validBody, marca: "Tucker" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not_found");
  });

  it("returns 404 when modelo does not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([{ codigo: "59", nome: "VW" }]))
        .mockResolvedValueOnce(jsonResponse({ modelos: [{ codigo: 1, nome: "Up" }], anos: [] })),
    );
    const res = await POST(makeRequest({ ...validBody, modelo: "Gol" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when ano prefix does not match any codigo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([{ codigo: "59", nome: "VW" }]))
        .mockResolvedValueOnce(
          jsonResponse({ modelos: [{ codigo: 1, nome: "Gol 1.6" }], anos: [] }),
        )
        .mockResolvedValueOnce(jsonResponse([{ codigo: "2015-1", nome: "2015 Gasolina" }])),
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/fipe — upstream failures (T-04-04, T-04-05)", () => {
  it("returns 502 when Parallelum returns non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("upstream_failed");
  });

  it("returns 502 when Parallelum returns HTML (content-type text/html)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>degraded</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it("returns 502 when Zod rejects malformed JSON shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ totally: "unexpected" })));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it("returns 502 on fetch throw (network/timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it("does NOT leak upstream error details in response body (T-04-04)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sk-ant-LEAK-KEY-123")));
    const res = await POST(makeRequest(validBody));
    const text = await res.text();
    expect(text).not.toContain("sk-ant-LEAK-KEY-123");
    expect(text).not.toContain("network");
  });
});

describe("POST /api/fipe — rate limit (INFRA-03 fipe bucket, T-04-03)", () => {
  it("allows 20 requests in one window", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ codigo: "59", nome: "VW" }])));
    for (let i = 0; i < 20; i++) {
      const res = await POST(makeRequest({ ...validBody, marca: "Tucker" }, "9.9.9.9"));
      expect([200, 404, 502]).toContain(res.status);
    }
  });

  it("blocks the 21st request with 429 + Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    for (let i = 0; i < 20; i++) {
      await POST(makeRequest(validBody, "8.8.8.8"));
    }
    const res = await POST(makeRequest(validBody, "8.8.8.8"));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
    expect(data.retryAfter).toBeGreaterThan(0);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
