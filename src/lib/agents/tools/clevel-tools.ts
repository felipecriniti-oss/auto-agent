/**
 * Shared tools for C-level agents (CTO, CMO, CFO, CLO, CEO).
 *
 * C-levels are routers. They never execute operational work directly —
 * instead they (a) read agent_runs and agent_comms to understand what
 * happened, (b) dispatch tasks downward via agent_comms, and (c)
 * escalate upward via agent_comms (or to a human via priority='critical').
 *
 * The toolset is parameterised by the C-level's allowed_subordinates
 * (factory function) so each clevel can only dispatch within its scope.
 *
 * Tools (factory output):
 *   - list_subordinates: who I can route work to
 *   - get_recent_agent_runs: read agent_runs across my subordinates
 *   - get_recent_agent_comms: read agent_comms addressed to me
 *   - get_pipeline_snapshot: counts of listings by stage + threads + deals
 *   - dispatch_task: agent_comms request from me to a subordinate
 *   - escalate: agent_comms escalation to the CEO (or to a peer for CEO)
 *   - report_clevel_summary: structured final response
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentSlug, AgentTool } from "../types";

export interface CLevelToolFactoryOptions {
  selfSlug: AgentSlug;
  /** Agent slugs the C-level is allowed to dispatch tasks to. */
  allowedSubordinates: AgentSlug[];
  /** Whether escalations route up to CEO (false for CEO itself). */
  canEscalateToCeo: boolean;
}

export function createCLevelTools(opts: CLevelToolFactoryOptions): AgentTool[] {
  const { selfSlug, allowedSubordinates, canEscalateToCeo } = opts;

  const listSubordinates: AgentTool = {
    name: "list_subordinates",
    description:
      "Return the list of agent slugs this C-level is allowed to dispatch tasks to. Use this to validate your routing decisions before calling dispatch_task.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => ({ self: selfSlug, subordinates: allowedSubordinates }),
  };

  const getRecentAgentRuns: AgentTool = {
    name: "get_recent_agent_runs",
    description:
      "Read recent agent_runs rows. Default = last 24h, all my subordinates. Returns runId, agent, status, turns, tokens, durationMs, summary (truncated), error.",
    input_schema: {
      type: "object" as const,
      properties: {
        agent: { type: "string", description: "Restrict to a single agent slug" },
        hours: { type: "number", description: "Look-back window (default 24, max 168)" },
        only_failed: { type: "boolean" },
        limit: { type: "number", description: "Max rows (default 25, max 100)" },
      },
      required: [],
    },
    execute: async (input) => {
      const supabase = getSupabaseServiceRole();
      const hours = Math.min((input.hours as number) || 24, 168);
      const limit = Math.min((input.limit as number) || 25, 100);
      const since = new Date(Date.now() - hours * 3_600_000).toISOString();

      const targetAgents = input.agent
        ? [input.agent as string].filter((a) => allowedSubordinates.includes(a as AgentSlug))
        : allowedSubordinates;

      if (targetAgents.length === 0) {
        return { error: "no_subordinate_in_scope", agent: input.agent ?? null };
      }

      let query = supabase
        .from("agent_runs")
        .select(
          "run_id, agent, status, turns, input_tokens, output_tokens, duration_ms, final_response, error, started_at",
        )
        .in("agent", targetAgents)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (input.only_failed === true) query = query.in("status", ["failed", "timeout"]);

      const { data, error } = await query;
      if (error) return { error: error.message, runs: [] };

      return {
        window_hours: hours,
        runs: (data ?? []).map((r) => ({
          run_id: r.run_id,
          agent: r.agent,
          status: r.status,
          turns: r.turns,
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          duration_ms: r.duration_ms,
          summary: r.final_response?.slice(0, 200) ?? null,
          error: r.error?.slice(0, 200) ?? null,
          started_at: r.started_at,
        })),
        total: data?.length ?? 0,
      };
    },
  };

  const getRecentAgentComms: AgentTool = {
    name: "get_recent_agent_comms",
    description:
      "Read agent_comms rows addressed to me (to_agent=self) in a window (default last 24h). Returns from_agent, type, priority, deal_id, summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        hours: { type: "number" },
        priority_min: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Filter by minimum priority",
        },
        limit: { type: "number" },
      },
      required: [],
    },
    execute: async (input) => {
      const supabase = getSupabaseServiceRole();
      const hours = Math.min((input.hours as number) || 24, 168);
      const limit = Math.min((input.limit as number) || 25, 100);
      const since = new Date(Date.now() - hours * 3_600_000).toISOString();

      const PRIO_ORDER = ["low", "medium", "high", "critical"];
      const minPrioIdx = input.priority_min ? PRIO_ORDER.indexOf(input.priority_min as string) : 0;
      const allowedPrios = PRIO_ORDER.slice(minPrioIdx) as Array<
        "low" | "medium" | "high" | "critical"
      >;

      const { data, error } = await supabase
        .from("agent_comms")
        .select("from_agent, message_type, priority, deal_id, summary, created_at")
        .eq("to_agent", selfSlug)
        .in("priority", allowedPrios)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return { error: error.message, comms: [] };

      return {
        window_hours: hours,
        comms: data ?? [],
        total: data?.length ?? 0,
      };
    },
  };

  const getPipelineSnapshot: AgentTool = {
    name: "get_pipeline_snapshot",
    description:
      "High-level pipeline counts: listings active/removed/stale, listings with analysis/pricing/compliance JSONB, threads by status, deals by status. Use this to gauge company health before deciding what to dispatch.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => {
      const supabase = getSupabaseServiceRole();

      const [active, withAnalysis, threads, deals] = await Promise.all([
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("listings").select("attributes").eq("status", "active").limit(500),
        supabase.from("agent_threads").select("status").limit(2000),
        supabase.from("deals").select("status").limit(2000),
      ]);

      const tally = <T extends string | null>(rows: Array<{ status: T }> | null) => {
        const out: Record<string, number> = {};
        for (const r of rows ?? []) {
          if (!r.status) continue;
          out[r.status] = (out[r.status] ?? 0) + 1;
        }
        return out;
      };

      let analysisCount = 0;
      let pricingCount = 0;
      let complianceCount = 0;
      for (const row of withAnalysis.data ?? []) {
        const a = row.attributes as Record<string, unknown> | null;
        if (a?.analysis) analysisCount += 1;
        if (a?.pricing) pricingCount += 1;
        if (a?.compliance) complianceCount += 1;
      }

      return {
        listings: {
          active: active.count ?? 0,
          with_analysis: analysisCount,
          with_pricing: pricingCount,
          with_compliance: complianceCount,
          sampled: withAnalysis.data?.length ?? 0,
        },
        threads: tally(threads.data),
        deals: tally(deals.data),
      };
    },
  };

  const dispatchTask: AgentTool = {
    name: "dispatch_task",
    description: `Dispatch a task to a subordinate by writing an agent_comms request from ${selfSlug}. The target subordinate's next agent run picks up requests addressed to it via its own context. Allowed subordinates: ${allowedSubordinates.join(", ")}.`,
    input_schema: {
      type: "object" as const,
      properties: {
        to_agent: { type: "string", enum: allowedSubordinates },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Default 'medium'",
        },
        deal_id: { type: "string" },
        summary: { type: "string", description: "What needs to happen, in pt-BR" },
      },
      required: ["to_agent", "summary"],
    },
    execute: async (input) => {
      if (!allowedSubordinates.includes(input.to_agent as AgentSlug)) {
        return {
          error: "out_of_scope_subordinate",
          allowed: allowedSubordinates,
          requested: input.to_agent,
        };
      }
      const supabase = getSupabaseServiceRole();
      const { error } = await supabase.from("agent_comms").insert({
        from_agent: selfSlug,
        to_agent: input.to_agent as string,
        message_type: "request",
        priority: (input.priority as "low" | "medium" | "high" | "critical") ?? "medium",
        deal_id: (input.deal_id as string) ?? null,
        summary: input.summary as string,
      });
      if (error) return { error: error.message };
      return { dispatched: true, to_agent: input.to_agent, summary: input.summary };
    },
  };

  const escalate: AgentTool = {
    name: "escalate",
    description: canEscalateToCeo
      ? "Escalate an issue to the CEO. Writes an agent_comms escalation. Use for cross-departmental conflicts, critical risks, or decisions above your authority."
      : "Escalate to a peer C-level (e.g. CFO -> CLO for legal review). For CEO this is the only escalation path; there is no agent above CEO except the human Founder.",
    input_schema: {
      type: "object" as const,
      properties: {
        to_agent: canEscalateToCeo
          ? { type: "string", enum: ["ceo"] }
          : { type: "string", enum: ["cto", "cmo", "cfo", "clo"].filter((s) => s !== selfSlug) },
        priority: { type: "string", enum: ["high", "critical"] },
        deal_id: { type: "string" },
        summary: { type: "string" },
      },
      required: ["to_agent", "summary"],
    },
    execute: async (input) => {
      const supabase = getSupabaseServiceRole();
      const { error } = await supabase.from("agent_comms").insert({
        from_agent: selfSlug,
        to_agent: input.to_agent as string,
        message_type: "escalation",
        priority: (input.priority as "high" | "critical") ?? "high",
        deal_id: (input.deal_id as string) ?? null,
        summary: input.summary as string,
      });
      if (error) return { error: error.message };
      return { escalated: true, to_agent: input.to_agent };
    },
  };

  const reportClevelSummary: AgentTool = {
    name: "report_clevel_summary",
    description:
      "Final summary of this C-level run: subordinates' health (run counts, failures), open agent_comms received, pipeline snapshot, dispatched tasks, escalations issued.",
    input_schema: {
      type: "object" as const,
      properties: {
        subordinates_status: { type: "object" },
        comms_received: { type: "number" },
        dispatched: { type: "number" },
        escalated: { type: "number" },
        pipeline: { type: "object" },
        notes: { type: "string" },
      },
      required: [],
    },
    execute: async (input) => ({
      logged: true,
      summary: {
        subordinates_status: input.subordinates_status ?? null,
        comms_received: input.comms_received ?? 0,
        dispatched: input.dispatched ?? 0,
        escalated: input.escalated ?? 0,
        pipeline: input.pipeline ?? null,
        notes: input.notes ?? null,
      },
    }),
  };

  return [
    listSubordinates,
    getRecentAgentRuns,
    getRecentAgentComms,
    getPipelineSnapshot,
    dispatchTask,
    escalate,
    reportClevelSummary,
  ];
}
