/**
 * Conteudo Agent API Route — weekly Wednesday 14:00 BRT.
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { CONTEUDO_AGENT_CONFIG } from "@/lib/agents/configs/conteudo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const DEFAULT_TASK = `Execute uma rodada de curadoria de conteudo.
1. list_templates
2. get_outbound_message_stats (7d)
3. get_recent_agent_messages (sample)
4. propose_template_variant para use_cases com poucas variantes
5. record_ab_test_result para testes concluidos
6. report_conteudo_summary`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runAgent(CONTEUDO_AGENT_CONFIG, DEFAULT_TASK);
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
  if (!verifyCronAuth(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let task = DEFAULT_TASK;
  let context: Record<string, unknown> | undefined;
  try {
    const body = await request.json();
    if (body.task && typeof body.task === "string") task = body.task;
    if (body.context && typeof body.context === "object") context = body.context;
  } catch {
    // use defaults
  }
  const result = await runAgent(CONTEUDO_AGENT_CONFIG, task, context);
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
