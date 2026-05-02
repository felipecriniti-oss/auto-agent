/**
 * Custos Agent API Route — daily 09:00 BRT via Vercel cron.
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { CUSTOS_AGENT_CONFIG } from "@/lib/agents/configs/custos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_TASK = `Execute o relatorio diario de custos.

Passos:
1. aggregate_daily_spend (24h)
2. get_agent_budget_status
3. Para cada agente critico, alert_overspend para o C-level dele
4. compute_deal_pl (30d)
5. report_costs_summary`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runAgent(CUSTOS_AGENT_CONFIG, DEFAULT_TASK);
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
  const result = await runAgent(CUSTOS_AGENT_CONFIG, task, context);
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
