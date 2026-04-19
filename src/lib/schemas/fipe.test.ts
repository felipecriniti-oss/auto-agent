import { describe, expect, it } from "vitest";
import {
  anosResponseSchema,
  fipeApiResponseSchema,
  marcaSchema,
  modelosResponseSchema,
  valorResponseSchema,
} from "./fipe";

describe("Parallelum v1 schemas", () => {
  it("marcaSchema accepts a brand object", () => {
    expect(marcaSchema.safeParse({ codigo: "59", nome: "VW - VolksWagen" }).success).toBe(true);
  });

  it("marcaSchema rejects missing nome", () => {
    expect(marcaSchema.safeParse({ codigo: "59" }).success).toBe(false);
  });

  it("modelosResponseSchema accepts full cascade step-2 shape", () => {
    const ok = modelosResponseSchema.safeParse({
      modelos: [{ codigo: 5585, nome: "Gol 1.6" }],
      anos: [{ codigo: "2020-1", nome: "2020 Gasolina" }],
    });
    expect(ok.success).toBe(true);
  });

  it("anosResponseSchema accepts array of year codes", () => {
    expect(
      anosResponseSchema.safeParse([{ codigo: "2020-1", nome: "2020 Gasolina" }]).success,
    ).toBe(true);
  });

  it("valorResponseSchema accepts full valor payload", () => {
    const ok = valorResponseSchema.safeParse({
      Valor: "R$ 52.000,00",
      Marca: "VW",
      Modelo: "Gol 1.6",
      AnoModelo: 2020,
      Combustivel: "Gasolina",
      CodigoFipe: "005340-6",
      MesReferencia: "abril de 2026",
      TipoVeiculo: 1,
      SiglaCombustivel: "G",
    });
    expect(ok.success).toBe(true);
  });

  it("valorResponseSchema rejects missing Valor field", () => {
    const bad = valorResponseSchema.safeParse({ Marca: "VW" });
    expect(bad.success).toBe(false);
  });

  it("fipeApiResponseSchema accepts our internal shape", () => {
    expect(
      fipeApiResponseSchema.safeParse({ fipe: 52000, marca: "VW", modelo: "Gol 1.6", ano: 2020 })
        .success,
    ).toBe(true);
  });

  it("fipeApiResponseSchema rejects negative fipe", () => {
    expect(
      fipeApiResponseSchema.safeParse({ fipe: -1, marca: "VW", modelo: "Gol 1.6", ano: 2020 })
        .success,
    ).toBe(false);
  });
});
