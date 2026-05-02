/**
 * Scraper Agent API Route — triggered by Vercel cron every 4 hours.
 *
 * GET  /api/agents/scraper         — Run the scraper agent
 * POST /api/agents/scraper         — Run with custom task/context (admin use)
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 * Runtime: nodejs with 120s max duration for agentic loop.
 */

import { runAgent, logAgentRun } from "@/lib/agents";
import { SCRAPER_AGENT_CONFIG } from "@/lib/agents/configs/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_TASK = `Execute uma rodada de scraping dos modelos target no WebMotors.

Passo a passo:
1. Obtenha a lista de modelos target
2. Escolha até 3 modelos para scrappear nesta rodada (alterne entre execuções)
3. Para cada modelo, busque listings no WebMotors
4. Filtre listings bloqueados (leilão, sinistro)
5. Salve os listings limpos no banco
6. Reporte o resumo da execução

Seja eficiente — priorize modelos que ainda não foram scrapeados recentemente.`;

function verifyCronAuth(request: Request): boolean {
  // In development, allow unauthenticated access
  if (process.env.NODE_ENV === "development") return true;

  // Vercel cron sends the secret in the Authorization header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[scraper-agent] CRON_SECRET not set — rejecting request");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAgent(SCRAPER_AGENT_CONFIG, DEFAULT_TASK);

  // Log to Supabase asynchronously — don't block the response
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
    { status: result.status === "failed" ? 500 : 200 }
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
    // Use defaults
  }

  const result = await runAgent(SCRAPER_AGENT_CONFIG, task, context);

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
    { status: result.status === "failed" ? 500 : 200 }
  );
}
