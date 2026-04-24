import { z } from "zod";

/** Integer reais (no cents). Documentation alias to make the unit explicit at call-sites (D-06). */
export type Reais = number;

const CURRENT_YEAR = new Date().getFullYear();
const SAFE_TEXT = /^[^<>{}]*$/;

export const wishlistSchema = z
  .object({
    name: z
      .string()
      .max(120, "Nome: máximo 120 caracteres")
      .regex(SAFE_TEXT, "Nome contém caracteres inválidos")
      .refine((s) => !s.includes("\n\n"), "Nome contém caracteres inválidos")
      .optional()
      .default(""),
    brand: z
      .string()
      .min(1, "Informe a marca")
      .max(60, "Marca: máximo 60 caracteres")
      .regex(SAFE_TEXT, "Marca contém caracteres inválidos"),
    model: z
      .string()
      .min(1, "Informe o modelo")
      .max(60, "Modelo: máximo 60 caracteres")
      .regex(SAFE_TEXT, "Modelo contém caracteres inválidos"),
    trim: z
      .string()
      .max(60, "Versão: máximo 60 caracteres")
      .regex(SAFE_TEXT, "Versão contém caracteres inválidos")
      .nullable()
      .optional()
      .default(null),
    year_min: z
      .number()
      .int()
      .min(1990)
      .max(CURRENT_YEAR + 1)
      .nullable()
      .optional()
      .default(null),
    year_max: z
      .number()
      .int()
      .min(1990)
      .max(CURRENT_YEAR + 1)
      .nullable()
      .optional()
      .default(null),
    km_max: z
      .number()
      .int()
      .min(0)
      .max(1_000_000, "KM muito alto")
      .nullable()
      .optional()
      .default(null),
    price_max: z
      .number()
      .int()
      .min(0)
      .max(5_000_000, "Preço muito alto")
      .nullable()
      .optional()
      .default(null),
    fuel_type: z.array(z.enum(["flex", "gasolina", "diesel", "híbrido", "elétrico"])).default([]),
    transmission: z.array(z.enum(["automático", "manual", "CVT"])).default([]),
    armored: z.boolean().nullable().default(null),
    region_uf: z.array(z.string()).default([]),
    region_cities: z.array(z.string()).default([]),
  })
  .refine((v) => v.year_min == null || v.year_max == null || v.year_min <= v.year_max, {
    message: "Ano mínimo não pode ser maior que o máximo",
    path: ["year_min"],
  });

export type WishlistFormValues = z.infer<typeof wishlistSchema>;
