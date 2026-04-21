import { type PfSimContext, buildPfSimPrompt } from "@/lib/prompts/pf-sim-v1";
import { isNegotiationEnabled } from "@/lib/server/kill-switch";
import { isProviderConfigured, resolveProvider, streamLLM } from "@/lib/server/llm";
import type { LLMMessage } from "@/lib/server/llm/types";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { z } from "zod";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const pfSimPersonaSchema = z.enum(["resistente", "ansioso", "urgente"]);

const pfSimListingSchema = z.object({
  sellerName: z.string().trim().min(1).max(80),
  vehicle: z.string().trim().min(2).max(120),
  year: z.number().int().min(1990).max(2030),
  km: z.number().int().min(0).max(1_000_000),
  precoPedido: z.number().positive().max(10_000_000),
  fipe: z.number().positive().max(10_000_000),
  cidade: z.string().trim().min(1).max(80),
  diasOnline: z.number().int().min(0).max(2000).default(30),
  reducoes: z.number().int().min(0).max(50).default(0),
});

const pfSimMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const pfSimRequestSchema = z.object({
  persona: pfSimPersonaSchema,
  listing: pfSimListingSchema,
  messages: z.array(pfSimMessageSchema).max(30),
});

type PfSimRequest = z.infer<typeof pfSimRequestSchema>;

const MAX_TOKENS = 320;
const UPSTREAM_TIMEOUT_MS = 30_000;

function extractIp(request: Request): string {
  const h = request.headers.get("x-forwarded-for");
  return h?.split(",")[0]?.trim() || "unknown";
}

/**
 * The agent-side uses {role:"user"} for the seller's messages and
 * {role:"assistant"} for its own. When we flip sides for the PF sim, the seller
 * becomes the assistant and the agent becomes the user.
 */
function flipRolesForPfSim(messages: PfSimRequest["messages"]): LLMMessage[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "assistant" : "user",
    content: m.content,
  }));
}

export async function POST(request: Request): Promise<Response> {
  if (!isNegotiationEnabled()) {
    return Response.json(
      { error: "disabled", reason: "Negotiations temporarily disabled" },
      { status: 503 },
    );
  }

  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "simulate-pf", max: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: PfSimRequest;
  try {
    const raw = await request.json();
    const parsed = pfSimRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const provider = resolveProvider();
  if (!isProviderConfigured(provider)) {
    return Response.json({ error: "misconfigured" }, { status: 500 });
  }

  const ctx: PfSimContext = {
    persona: body.persona,
    sellerName: body.listing.sellerName,
    vehicle: body.listing.vehicle,
    year: body.listing.year,
    km: body.listing.km,
    precoPedido: body.listing.precoPedido,
    fipe: body.listing.fipe,
    cidade: body.listing.cidade,
    diasOnline: body.listing.diasOnline ?? 30,
    reducoes: body.listing.reducoes ?? 0,
  };

  const systemPrompt = buildPfSimPrompt(ctx);
  const flippedMessages = flipRolesForPfSim(body.messages);

  const abortCtl = new AbortController();
  request.signal.addEventListener("abort", () => abortCtl.abort());
  const timeout = setTimeout(() => abortCtl.abort(), UPSTREAM_TIMEOUT_MS);

  let accumulated = "";
  try {
    await streamLLM(provider, {
      systemPrompt,
      messages: flippedMessages,
      maxTokens: MAX_TOKENS,
      signal: abortCtl.signal,
      onText: (chunk) => {
        accumulated += chunk;
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (abortCtl.signal.aborted) {
      return Response.json({ error: "timeout" }, { status: 504 });
    }
    console.warn("PF sim LLM call failed:", err);
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
  clearTimeout(timeout);

  const message = accumulated.trim();
  if (message.length === 0) {
    return Response.json({ error: "empty_response" }, { status: 502 });
  }

  return Response.json({
    message,
    persona: body.persona,
  });
}
