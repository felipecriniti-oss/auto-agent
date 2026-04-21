import { buildSystemPrompt } from "@/lib/prompts/system-v1";
import { negotiateRequestSchema } from "@/lib/schemas/negotiate";
import { isNegotiationEnabled } from "@/lib/server/kill-switch";
import { isAnyProviderConfigured, resolveProvider, streamLLMWithFallback } from "@/lib/server/llm";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 1024;

function extractIp(request: Request): string {
  const h = request.headers.get("x-forwarded-for");
  return h?.split(",")[0]?.trim() || "unknown";
}

function encodeFrame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  if (!isNegotiationEnabled()) {
    return Response.json(
      { error: "disabled", reason: "Negotiations temporarily disabled" },
      { status: 503 },
    );
  }

  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "negotiate", max: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: ReturnType<typeof negotiateRequestSchema.parse>;
  try {
    const raw = await request.json();
    const parsed = negotiateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const provider = resolveProvider();
  if (!isAnyProviderConfigured()) {
    console.warn("No LLM provider configured (ANTHROPIC_API_KEY / GEMINI_API_KEY)");
    return Response.json({ error: "misconfigured" }, { status: 500 });
  }

  const abortCtl = new AbortController();
  request.signal.addEventListener("abort", () => abortCtl.abort());

  const systemPrompt = buildSystemPrompt(
    body.listing,
    body.fipe,
    body.targetPrice,
    body.walkAwayPrice,
    body.maxRounds,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await streamLLMWithFallback(provider, {
          systemPrompt,
          messages: body.messages,
          maxTokens: MAX_TOKENS,
          signal: abortCtl.signal,
          onText: (chunk: string) => {
            try {
              controller.enqueue(encodeFrame({ type: "chunk", text: chunk }));
            } catch {
              // controller already closed — ignore
            }
          },
        });
        if (result.fellBack) {
          console.info(
            JSON.stringify({
              scope: "negotiate_stream.fallback",
              provider: result.providerUsed,
            }),
          );
        }
        controller.enqueue(encodeFrame({ type: "done" }));
        controller.close();
      } catch (err) {
        // Structured server log for Vercel Function logs. Never leak upstream
        // error text to the client (T-06-04) — only log it here.
        const e = err as { status?: number; name?: string; message?: string };
        console.warn(
          JSON.stringify({
            scope: "negotiate_stream.upstream",
            provider,
            status: e?.status ?? null,
            name: e?.name ?? null,
            message: e?.message ?? String(err),
          }),
        );
        try {
          controller.enqueue(encodeFrame({ type: "error", message: "upstream_failed" }));
          controller.close();
        } catch {
          // controller already closed — ignore
        }
      }
    },
    cancel() {
      abortCtl.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
