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
            title: "VOLKSWAGEN GOL 1.6 MSI",
            make: "Volkswagen",
            model: "Gol",
            version: "1.6 MSI",
            fabrication_year: 2020,
            model_year: 2020,
            km: 45000,
            price: 52000,
            fipe_price: 65000,
            fuel_type: "Flex",
            color: "Prata",
            seller: {
              name: "João S.",
              city: "Campinas",
              state: "São Paulo (SP)",
            },
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
      fipe: 65000,
      location: "Campinas, SP",
      sellerName: "João S.",
      source: "WebMotors",
      timeLeft: "7d 00h",
      fuel: "Flex",
      color: "Prata",
      negotiationStatus: "pending",
    });
    // FIPE-derived fields now come straight from the actor, computed server-side.
    expect(data.opportunity.savings).toBe(13000); // 65000 - 52000
    expect(data.opportunity.margin).toBe(20); // 13000/65000 = 0.2
    // Fee is still plan-dependent; the client fills this via calcFee.
    expect(data.opportunity.fee).toBe(0);
  });
});

describe("POST /api/scrape/webmotors — field enrichment", () => {
  it("maps neighborhood, photoUrl, listingUrl, sellerType, transmission, bodyType, optionals", async () => {
    const publishDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            url: "https://www.webmotors.com.br/comprar/audi/a3/x",
            title: "AUDI A3 SPORTBACK",
            make: "Audi",
            model: "A3",
            version: "Sportback",
            fabrication_year: 2023,
            km: 20000,
            price: 200000,
            fipe_price: 250000,
            fuel_type: "Gasolina",
            color: "Cinza",
            body_type: "Hatchback",
            transmission: "Automática",
            is_armored: false,
            photos: [
              "https://image.webmotors.com.br/photo1.jpg",
              "https://image.webmotors.com.br/photo2.jpg",
            ],
            optionals: ["Teto solar", "Bancos em couro"],
            attributes: ["Aceita troca"],
            publish_date: publishDate,
            seller: {
              name: "Carla T.",
              neighborhood: "Moema",
              city: "São Paulo",
              state: "São Paulo (SP)",
              seller_type: "PF",
            },
          },
        ]),
      ),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const { opportunity } = await res.json();
    expect(opportunity.location).toBe("São Paulo, SP");
    expect(opportunity.neighborhood).toBe("Moema");
    expect(opportunity.photoUrl).toBe("https://image.webmotors.com.br/photo1.jpg");
    expect(opportunity.listingUrl).toBe("https://www.webmotors.com.br/comprar/audi/a3/x");
    expect(opportunity.sellerType).toBe("PF");
    expect(opportunity.transmission).toBe("Automática");
    expect(opportunity.bodyType).toBe("Hatchback");
    expect(opportunity.optionals).toEqual(["Teto solar", "Bancos em couro"]);
    // publish_date ~45 days ago → motivation signal "Anúncio há N dias"
    expect(opportunity.motivationSignals.some((s: string) => /Anúncio há \d+ dias/.test(s))).toBe(
      true,
    );
    // "Aceita troca" attribute lifted into motivation signals
    expect(opportunity.motivationSignals).toContain("Aceita troca");
    // PF sellers → ddStatus "review" (needs docs check before close)
    expect(opportunity.ddStatus).toBe("review");
    // Body type "Hatchback" → 🚗 emoji fallback for img
    expect(opportunity.img).toBe("🚗");
  });

  it("marks PJ sellers as ddStatus=ok and picks SUV emoji for body_type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            make: "Jeep",
            model: "Compass",
            fabrication_year: 2024,
            km: 5000,
            price: 180000,
            fipe_price: 210000,
            body_type: "SUV",
            seller: { name: "Auto Center", city: "Curitiba", seller_type: "PJ" },
          },
        ]),
      ),
    );
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    const { opportunity } = await res.json();
    expect(opportunity.ddStatus).toBe("ok");
    expect(opportunity.img).toBe("🚙");
    expect(opportunity.sellerType).toBe("PJ");
    expect(opportunity.location).toBe("Curitiba");
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
