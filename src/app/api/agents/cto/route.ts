/** CTO Agent API Route — daily 08:30 BRT (oversees scraper/analista/negociador). */
import { logAgentRun, runAgent } from "@/lib/agents";
import { CTO_AGENT_CONFIG } from "@/lib/agents/configs/cto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const DEFAULT_TASK = `Execute uma rodada de oversight tecnico.
1. list_subordinates
2. get_recent_agent_comms (24h)
3. get_recent_agent_runs (24h, only_failed)
4. get_pipeline_snapshot
5. Para problemas: dispatch_task para o subordinado certo OU escalate para CEO se for material
6. report_clevel_summary`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runAgent(CTO_AGENT_CONFIG, DEFAULT_TASK);
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
  const result = await runAgent(CTO_AGENT_CONFIG, task, context);
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
