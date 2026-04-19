import { z } from "zod";

export const marcaSchema = z.object({
  codigo: z.string(),
  nome: z.string(),
});

export const modelosResponseSchema = z.object({
  modelos: z.array(z.object({ codigo: z.number(), nome: z.string() })),
  anos: z.array(z.object({ codigo: z.string(), nome: z.string() })),
});

export const anosResponseSchema = z.array(z.object({ codigo: z.string(), nome: z.string() }));

export const valorResponseSchema = z.object({
  Valor: z.string(),
  Marca: z.string(),
  Modelo: z.string(),
  AnoModelo: z.number(),
  Combustivel: z.string(),
  CodigoFipe: z.string(),
  MesReferencia: z.string(),
  TipoVeiculo: z.number(),
  SiglaCombustivel: z.string(),
});

export const fipeApiResponseSchema = z.object({
  fipe: z.number().int().positive(),
  marca: z.string(),
  modelo: z.string(),
  ano: z.number().int(),
});

export type FipeApiResponse = z.infer<typeof fipeApiResponseSchema>;
