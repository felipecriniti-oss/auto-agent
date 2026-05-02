/**
 * Compliance Agent API Route — weekly Friday 10:00 BRT via Vercel cron.
 *
 * GET  /api/agents/compliance   — Run the compliance agent
 * POST /api/agents/compliance   — Run with custom task/context
 *
 * Protected by CRON_SECRET. Runtime nodejs / 90s.
 */

import { logAgentRun, runAgent } from "@/lib/agents";
import { COMPLIANCE_AGENT_CONFIG } from "@/lib/agents/configs/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const DEFAULT_TASK = `Execute uma rodada de auditoria de compliance.

Passos:
1. Busque listings com pricing.decision='go' que ainda nao tem veredito de compliance (limit 15-20)
2. Para cada um: check_vehicle_status (filtros + heuristicas), audit_whatsapp_consent (se houver phone), e check_kyc_lojista (se houver opportunity vinculada)
3. Combine os sinais e set_compliance_decision (approved/review/blocked)
4. Ao final, report_compliance_summary com totais e lista de blocked

Em duvida, prefira 'review' a 'approved' — risco juridico tem peso muito maior que velocidade do funil.`;

function verifyCronAuth(request: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[compliance-agent] CRON_SECRET not set — rejecting request");
    return false;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAgent(COMPLIANCE_AGENT_CONFIG, DEFAULT_TASK);
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

  const result = await runAgent(COMPLIANCE_AGENT_CONFIG, task, context);
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
