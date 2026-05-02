/**
 * Agent Run Logger — persists agent execution results to Supabase.
 *
 * Logs go to the `agent_runs` table (created by migration).
 * Provides structured observability for all agent executions.
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentRunResult } from "./types";

export async function logAgentRun(result: AgentRunResult): Promise<void> {
  try {
    const supabase = getSupabaseServiceRole();

    await supabase.from("agent_runs").insert({
      run_id: result.runId,
      agent: result.agent,
      status: result.status,
      turns: result.turns,
      input_tokens: result.tokensUsed.input,
      output_tokens: result.tokensUsed.output,
      tool_calls: result.toolCalls.length,
      tool_call_details: JSON.stringify(
        result.toolCalls.map((tc) => ({
          name: tc.toolName,
          durationMs: tc.durationMs,
          // Don't persist full input/output — just tool name + timing
        }))
      ),
      final_response: result.finalResponse?.slice(0, 2000) ?? null,
      error: result.error?.slice(0, 1000) ?? null,
      duration_ms: result.durationMs,
      started_at: result.startedAt,
      ended_at: result.endedAt,
    });
  } catch (err) {
    // Logger should never throw and kill the caller
    console.error(
      `[agent-logger] Failed to log run ${result.runId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Log an inter-agent message (for observability of agent communication).
 */
export async function logAgentMessage(msg: {
  from: string;
  to: string;
  type: string;
  priority: string;
  dealId: string | null;
  summary: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseServiceRole();

    await supabase.from("agent_comms").insert({
      from_agent: msg.from,
      to_agent: msg.to,
      message_type: msg.type as "request" | "response" | "escalation" | "notification",
      priority: msg.priority as "low" | "medium" | "high" | "critical",
      deal_id: msg.dealId,
      summary: msg.summary,
    });
  } catch (err) {
    console.error(
      `[agent-logger] Failed to log message ${msg.from} → ${msg.to}:`,
      err instanceof Error ? err.message : err
    );
  }
}
