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

  it("walks modelo candidates when the shortest one doesn't cover the ano", async () => {
    // Two Gol variants — shortest has old anos only, second has 2020.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([{ codigo: "59", nome: "VW - VolksWagen" }]))
        .mockResolvedValueOnce(
          jsonResponse({
            modelos: [
              { codigo: 100, nome: "Gol 1.8 Mi" },
              { codigo: 200, nome: "Gol 1.6 MSI Flex 8V 5p" },
            ],
            anos: [],
          }),
        )
        // shortest modelo's anos — no 2020
        .mockResolvedValueOnce(jsonResponse([{ codigo: "2003-1", nome: "2003 Gasolina" }]))
        // next modelo's anos — has 2020
        .mockResolvedValueOnce(jsonResponse([{ codigo: "2020-1", nome: "2020 Flex" }]))
        .mockResolvedValueOnce(
          jsonResponse({
            Valor: "R$ 48.000,00",
            Marca: "VW - VolksWagen",
            Modelo: "Gol 1.6 MSI Flex 8V 5p",
            AnoModelo: 2020,
            Combustivel: "Flex",
            CodigoFipe: "005340-6",
            MesReferencia: "abril de 2026",
            TipoVeiculo: 1,
            SiglaCombustivel: "F",
          }),
        ),
    );
    const res = await POST(makeRequest({ marca: "Volkswagen", modelo: "Gol", ano: 2020 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ fipe: 48000, ano: 2020, modelo: "Gol 1.6 MSI Flex 8V 5p" });
  });

  it("prefers word-boundary matches over substring (Gol does not swallow Golf)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([{ codigo: "59", nome: "VW" }]))
        .mockResolvedValueOnce(
          jsonResponse({
            modelos: [
              // "Golf" would win on length if substring matching were used
              { codigo: 10, nome: "Golf GTi" },
              { codigo: 20, nome: "Gol 1.6 MSI 5p" },
            ],
            anos: [],
          }),
        )
        .mockResolvedValueOnce(jsonResponse([{ codigo: "2020-1", nome: "2020 Flex" }]))
        .mockResolvedValueOnce(
          jsonResponse({
            Valor: "R$ 48.000,00",
            Marca: "VW",
            Modelo: "Gol 1.6 MSI 5p",
            AnoModelo: 2020,
            Combustivel: "Flex",
            CodigoFipe: "005340-6",
            MesReferencia: "abril de 2026",
            TipoVeiculo: 1,
            SiglaCombustivel: "F",
          }),
        ),
    );
    const res = await POST(makeRequest({ marca: "VW", modelo: "Gol", ano: 2020 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.modelo).toBe("Gol 1.6 MSI 5p");
  });

  it("probes beyond the old 20-cap so a year match far down the sort still resolves (Bug A fix)", async () => {
    // 40 ancient-years Gol variants (all pre-2010) followed by one that has 2015.
    // Pre-fix (cap=20) this returned 404; post-fix (cap=120) it resolves.
    const modelos: Array<{ codigo: number; nome: string }> = [];
    for (let i = 0; i < 40; i++) {
      // Pad names with index-specific suffix so sort-by-length is deterministic.
      modelos.push({ codigo: 1000 + i, nome: `Gol ${i.toString().padStart(4, "x")}` });
    }
    // The 2015-covering variant is intentionally longer → sorted last.
    const HIT_CODIGO = 9999;
    modelos.push({ codigo: HIT_CODIGO, nome: "Gol City Trend 1.0 Mi Total Flex 8V 2p" });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/marcas")) {
        return jsonResponse([{ codigo: "59", nome: "VW - VolksWagen" }]);
      }
      if (url.endsWith("/modelos")) {
        return jsonResponse({ modelos, anos: [] });
      }
      // /anos endpoint — return 2015 only for HIT_CODIGO, else pre-2010.
      const match = url.match(/\/modelos\/(\d+)\/anos$/);
      if (match) {
        const codigo = Number(match[1]);
        if (codigo === HIT_CODIGO) {
          return jsonResponse([
            { codigo: "2015-1", nome: "2015 Gasolina" },
            { codigo: "2014-1", nome: "2014 Gasolina" },
          ]);
        }
        return jsonResponse([
          { codigo: "2004-1", nome: "2004 Gasolina" },
          { codigo: "2003-1", nome: "2003 Gasolina" },
        ]);
      }
      // /valor endpoint
      return jsonResponse({
        Valor: "R$ 30.000,00",
        Marca: "VW - VolksWagen",
        Modelo: "Gol City Trend 1.0 Mi Total Flex 8V 2p",
        AnoModelo: 2015,
        Combustivel: "Gasolina",
        CodigoFipe: "005340-6",
        MesReferencia: "abril de 2026",
        TipoVeiculo: 1,
        SiglaCombustivel: "G",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ marca: "Volkswagen", modelo: "Gol", ano: 2015 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ fipe: 30000, ano: 2015 });
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => jsonResponse([{ codigo: "59", nome: "VW" }])),
    );
    for (let i = 0; i < 20; i++) {
      const res = await POST(makeRequest({ ...validBody, marca: "Tucker" }, "9.9.9.9"));
      expect([200, 404, 502]).toContain(res.status);
    }
  });

  it("blocks the 21st request with 429 + Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => jsonResponse([])),
    );
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
