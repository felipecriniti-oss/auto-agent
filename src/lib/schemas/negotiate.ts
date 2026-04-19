import { z } from "zod";
import { listingSchema } from "./listing";

export const negotiateRequestSchema = z.object({
  listing: listingSchema,
  fipe: z.number().int().positive(),
  targetPrice: z.number().int().positive(),
  walkAwayPrice: z.number().int().positive(),
  maxRounds: z.number().int().min(1).max(20),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(40),
});

export type NegotiateRequest = z.infer<typeof negotiateRequestSchema>;
