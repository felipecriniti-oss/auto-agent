import { z } from "zod";

const SAFE_TEXT = /^[^<>{}]*$/;

export const listingSchema = z.object({
  marca: z
    .string()
    .min(1, "Marca é obrigatória")
    .max(100, "Marca: máximo 100 caracteres")
    .regex(SAFE_TEXT, "Marca: contém caracteres inválidos")
    .refine((s) => !s.includes("\n\n"), "Marca: contém caracteres inválidos"),
  modelo: z
    .string()
    .min(1, "Modelo é obrigatório")
    .max(100, "Modelo: máximo 100 caracteres")
    .regex(SAFE_TEXT, "Modelo: contém caracteres inválidos")
    .refine((s) => !s.includes("\n\n"), "Modelo: contém caracteres inválidos"),
  ano: z.number().int().min(1900, "Ano deve ser >= 1900").max(2100, "Ano deve ser <= 2100"),
  km: z.number().int().min(0, "KM não pode ser negativo").max(2_000_000, "KM muito alto"),
  precoPedido: z
    .number()
    .int()
    .min(1000, "Preço pedido mínimo R$ 1.000")
    .max(10_000_000, "Preço pedido máximo R$ 10.000.000"),
  cidade: z
    .string()
    .min(1, "Cidade é obrigatória")
    .max(80, "Cidade: máximo 80 caracteres")
    .regex(SAFE_TEXT, "Cidade: contém caracteres inválidos")
    .refine((s) => !s.includes("\n\n"), "Cidade: contém caracteres inválidos"),
  diasOnline: z
    .number()
    .int()
    .min(0, "Dias online não pode ser negativo")
    .max(3650, "Dias online muito alto"),
  reducoes: z
    .number()
    .int()
    .min(0, "Reduções não pode ser negativo")
    .max(20, "Reduções: máximo 20"),
});

export type Listing = z.infer<typeof listingSchema>;
