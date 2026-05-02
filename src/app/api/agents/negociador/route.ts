/**
 * Negociador Agent API Route — every 2h during business hours via Vercel cron.
 *
 * GET  /api/agents/negociador   — Run the negotiator agent
 * POST /api/agents/negociador   — Run with custom task/context
 *
 * Protected by CRON_SECRET. Runtime nodejs / 180s (Opus + many threads).
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { NEGOCIADOR_AGENT_CONFIG } from "@/lib/agents/configs/negociador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const DEFAULT_TASK = `Execute uma rodada de avanco de negociacoes em curso.

Passos:
1. Busque ate 8 threads que esperam nossa resposta (status='awaiting_agent_response') ou estao paradas ha > 48h aguardando o PF
2. Para cada thread: carregue o contexto completo, decida o proximo movimento (avancar round / re-engajar / fechar como converged/lost/escalated)
3. Compoe a mensagem alinhada ao playbook do round, persiste via enqueue_outbound_message, atualiza o estado
4. Ao final, report_negotiator_summary com totais e escalations

Lembre: NUNCA exceder band.max_offer. Em duvida, escalar.`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[negociador-agent] CRON_SECRET not set — rejecting request");
    return false;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAgent(NEGOCIADOR_AGENT_CONFIG, DEFAULT_TASK);
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

  const result = await runAgent(NEGOCIADOR_AGENT_CONFIG, task, context);
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
