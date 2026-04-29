import { describe, expect, it } from "vitest";
import type { WebMotorsScraped } from "./types";
import { normalizeWebMotorsItem } from "./webmotors-normalize";

function happyPf(overrides: Partial<WebMotorsScraped> = {}): WebMotorsScraped {
  return {
    id: 12345,
    url: "https://www.webmotors.com.br/comprar/honda/civic/2020/12345",
    title: "Honda Civic EXL 2020",
    make: "Honda",
    model: "Civic",
    version: "EXL 2.0",
    fabrication_year: 2020,
    model_year: 2020,
    km: 50000,
    price: 95000,
    fipe_price: 110000,
    color: "Preto",
    fuel_type: "Flex",
    body_type: "Sedã",
    transmission: "Automático",
    final_plate: "ABC1D23",
    is_armored: false,
    optionals: ["Ar condicionado", "Direção elétrica"],
    attributes: [],
    photos: ["https://example.com/photo1.jpg"],
    seller: {
      seller_type: "PF",
      city: "São Paulo",
      state: "SP",
    },
    publish_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("normalizeWebMotorsItem — happy paths", () => {
  it("maps a full PF listing to a complete row", () => {
    const result = normalizeWebMotorsItem(happyPf());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.source).toBe("webmotors");
    expect(result.row.source_listing_id).toBe("12345");
    expect(result.row.brand).toBe("Honda");
    expect(result.row.model).toBe("Civic");
    expect(result.row.trim).toBe("EXL 2.0");
    expect(result.row.year).toBe(2020);
    expect(result.row.km).toBe(50000);
    expect(result.row.price).toBe(95000);
    expect(result.row.fipe).toBe(110000);
    expect(result.row.seller_type).toBe("PF");
    expect(result.row.seller_uf).toBe("SP");
    expect(result.row.seller_city).toBe("São Paulo");
    expect(result.row.photo_url).toBe("https://example.com/photo1.jpg");
    expect(result.row.status).toBe("active");
    expect(result.needsFipe).toBe(false);
  });

  it("computes savings_vs_fipe and savings_pct correctly", () => {
    const result = normalizeWebMotorsItem(happyPf({ price: 70000, fipe_price: 110000 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.savings_vs_fipe).toBe(40000);
    expect(result.row.savings_pct).toBeCloseTo(36.36, 1);
  });

  it("derives a deterministic sha256 fingerprint for the same source_listing_id", () => {
    const a = normalizeWebMotorsItem(happyPf({ id: 99 }));
    const b = normalizeWebMotorsItem(happyPf({ id: 99, price: 80000 }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.row.fingerprint).toBe(b.row.fingerprint);
      expect(a.row.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("falls back to model_year when fabrication_year is missing", () => {
    const result = normalizeWebMotorsItem(
      happyPf({ fabrication_year: undefined, model_year: 2018 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.year).toBe(2018);
  });

  it("sets needsFipe=true when fipe is missing but brand/model/year present", () => {
    const result = normalizeWebMotorsItem(happyPf({ fipe_price: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.fipe).toBeNull();
    expect(result.needsFipe).toBe(true);
  });

  it("preserves PJ seller_type and is_armored attribute", () => {
    const result = normalizeWebMotorsItem(
      happyPf({ seller: { seller_type: "PJ", city: "Rio", state: "RJ" }, is_armored: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.seller_type).toBe("PJ");
    expect(result.row.attributes).toMatchObject({ armored: true });
  });

  it("tolerates empty optionals", () => {
    const result = normalizeWebMotorsItem(happyPf({ optionals: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.attributes).toMatchObject({ optionals: [] });
  });

  it("populates motivation_signals.aceita_troca when actor attribute matches", () => {
    const result = normalizeWebMotorsItem(happyPf({ attributes: ["Aceita troca"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.motivation_signals).toMatchObject({ aceita_troca: true });
  });

  it("populates motivation_signals.days_online_threshold when publish_date is >= 14 days old", () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = normalizeWebMotorsItem(happyPf({ publish_date: old }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.motivation_signals).toMatchObject({
      days_online_threshold: expect.any(Number),
    });
  });

  it("does NOT map seller phones into the row (PII redaction — T-08-04-02)", () => {
    const result = normalizeWebMotorsItem(
      happyPf({
        seller: {
          seller_type: "PF",
          city: "São Paulo",
          state: "SP",
          phones: ["11999998888", "11988887777"],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Phones must NOT appear anywhere in the row (Phase 12 will gate phone reveal).
    const serialized = JSON.stringify(result.row);
    expect(serialized).not.toContain("11999998888");
    expect(serialized).not.toContain("11988887777");
    expect(serialized).not.toContain("phones");
  });
});

describe("normalizeWebMotorsItem — rejection paths", () => {
  it("rejects when id is missing", () => {
    const result = normalizeWebMotorsItem(happyPf({ id: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_required");
  });

  it("rejects when attributes contain Leilão (delegates to detectBlockingFilter)", () => {
    const result = normalizeWebMotorsItem(happyPf({ attributes: ["Leilão"] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("leilao");
  });

  it("rejects when title contains sinistrado", () => {
    const result = normalizeWebMotorsItem(happyPf({ title: "Honda Civic Sinistrado" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sinistro");
  });
});
