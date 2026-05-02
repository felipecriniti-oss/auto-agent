/**
 * Pricing Agent API Route — daily 09:00 BRT via Vercel cron.
 *
 * GET  /api/agents/pricing   — Run the pricing agent (cron-triggered)
 * POST /api/agents/pricing   — Run with custom task/context (admin)
 *
 * Protected by CRON_SECRET. Runtime nodejs / 90s.
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { PRICING_AGENT_CONFIG } from "@/lib/agents/configs/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const DEFAULT_TASK = `Execute uma rodada de pricing.

Passos:
1. Carregue os category targets atuais (uma vez)
2. Busque 10-15 listings green/yellow sem decisao de pricing
3. Para cada um: compute_pricing_band, decida go/no_go, set_pricing_decision
4. Ao final, report_pricing_summary com top 3 go

Seja eficiente — distribua entre execucoes, nao precisa decidir todos de uma vez.`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[pricing-agent] CRON_SECRET not set — rejecting request");
    return false;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAgent(PRICING_AGENT_CONFIG, DEFAULT_TASK);
  logAgentRun(result).catch(() => {});

  return Response.json(
    {
      runId: result.runId,
      status: result.status,
      turns: result.turns,
      tokens: result.tokensUsed,
      toolCalls: result.toolCalls.length,
      durationMs: result.durationMs,
      summary: result.finalResponse?.slice(0, 500) ?? null,
      error: result.error,
    },
    { status: result.status === "failed" ? 500 : 200 },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let task = DEFAULT_TASK;
  let context: Record<string, unknown> | undefined;

  try {
    const body = await request.json();
    if (body.task && typeof body.task === "string") task = body.task;
    if (body.context && typeof body.context === "object") context = body.context;
  } catch {
    // use defaults
  }

  const result = await runAgent(PRICING_AGENT_CONFIG, task, context);
  logAgentRun(result).catch(() => {});

  return Response.json(
    {
      runId: result.runId,
      status: result.status,
      turns: result.turns,
      tokens: result.tokensUsed,
      toolCalls: result.toolCalls.length,
      toolCallDetails: result.toolCalls.map((tc) => ({
        name: tc.toolName,
        durationMs: tc.durationMs,
      })),
      durationMs: result.durationMs,
      summary: result.finalResponse,
      error: result.error,
    },
    { status: result.status === "failed" ? 500 : 200 },
  );
}
