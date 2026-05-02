/**
 * Analista Agent API Route — daily 08:00 BRT via Vercel cron.
 *
 * GET  /api/agents/analista   — Run the analista agent (cron-triggered)
 * POST /api/agents/analista   — Run with custom task/context (admin)
 *
 * Protected by CRON_SECRET. Runtime nodejs / 120s.
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { ANALISTA_AGENT_CONFIG } from "@/lib/agents/configs/analista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_TASK = `Execute uma rodada de analise de listings ativos.

Passos:
1. Busque um lote de 15-20 listings que precisam de score (sem analise ou com analise > 24h)
2. Calcule market_stats por brand+model no lote (uma vez por par)
3. Para cada listing: chame lookup_fipe se necessario, score_listing com contexto de peers, e set_listing_analysis
4. Ao final, report_analysis_summary com totais e top 3 oportunidades verdes

Seja eficiente — distribua o trabalho ao longo do dia, nao precisa analisar TODOS de uma vez.`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[analista-agent] CRON_SECRET not set — rejecting request");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAgent(ANALISTA_AGENT_CONFIG, DEFAULT_TASK);

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

  const result = await runAgent(ANALISTA_AGENT_CONFIG, task, context);

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
