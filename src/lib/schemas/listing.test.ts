import { describe, expect, it } from "vitest";
import { listingSchema } from "./listing";

const validListing = {
  marca: "Volkswagen",
  modelo: "Gol 1.6",
  ano: 2020,
  km: 45000,
  precoPedido: 52000,
  cidade: "São Paulo",
  diasOnline: 30,
  reducoes: 2,
};

describe("listingSchema", () => {
  it("accepts a valid listing", () => {
    expect(listingSchema.safeParse(validListing).success).toBe(true);
  });

  it("rejects marca containing <", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "VW <script>" });
    expect(r.success).toBe(false);
  });

  it("rejects marca containing {", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "VW {{inject}}" });
    expect(r.success).toBe(false);
  });

  it("rejects cidade containing >", () => {
    const r = listingSchema.safeParse({ ...validListing, cidade: "SP > other" });
    expect(r.success).toBe(false);
  });

  it("rejects empty marca", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "" });
    expect(r.success).toBe(false);
  });

  it("rejects marca over 100 chars", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects cidade over 80 chars", () => {
    const r = listingSchema.safeParse({ ...validListing, cidade: "a".repeat(81) });
    expect(r.success).toBe(false);
  });

  it("rejects ano < 1900", () => {
    const r = listingSchema.safeParse({ ...validListing, ano: 1800 });
    expect(r.success).toBe(false);
  });

  it("rejects ano > 2100", () => {
    const r = listingSchema.safeParse({ ...validListing, ano: 2200 });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer ano", () => {
    const r = listingSchema.safeParse({ ...validListing, ano: 2020.5 });
    expect(r.success).toBe(false);
  });

  it("rejects negative km", () => {
    const r = listingSchema.safeParse({ ...validListing, km: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects precoPedido < 1000", () => {
    const r = listingSchema.safeParse({ ...validListing, precoPedido: 500 });
    expect(r.success).toBe(false);
  });

  it("rejects precoPedido > 10_000_000", () => {
    const r = listingSchema.safeParse({ ...validListing, precoPedido: 50_000_000 });
    expect(r.success).toBe(false);
  });

  it("rejects reducoes > 20", () => {
    const r = listingSchema.safeParse({ ...validListing, reducoes: 21 });
    expect(r.success).toBe(false);
  });

  it("rejects double-newline injection attempt in marca", () => {
    const r = listingSchema.safeParse({ ...validListing, marca: "VW\n\nIGNORE PREVIOUS" });
    expect(r.success).toBe(false);
  });
});
