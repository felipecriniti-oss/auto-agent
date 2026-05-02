/**
 * Tools available to the Custos agent.
 *
 * Custos aggregates spending across the agent fleet (and adjacent infra
 * costs proxied through agent_runs token usage) into daily and per-deal
 * P&L. It produces alerts when an agent exceeds its monthly budget pace.
 *
 * Tools:
 *   - aggregate_daily_spend: token usage by agent for the past N days
 *   - get_agent_budget_status: monthly budget progress per agent
 *   - estimate_token_cost: rough USD cost of a token bucket given tier prices
 *   - compute_deal_pl: cost-side picture for a deal (negotiator+analista cost)
 *   - alert_overspend: write an agent_comms notification to the agent's C-level
 *   - report_costs_summary: structured run summary
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";

// Budgets by slug (tokens/month). Mirrors what each agent config declares.
const AGENT_MONTHLY_BUDGET: Record<string, number> = {
  scraper: 3_000_000,
  analista: 3_000_000,
  pricing: 3_000_000,
  compliance: 3_000_000,
  negociador: 5_000_000,
  contratos: 3_000_000,
  custos: 1_000_000,
  captacao: 3_000_000,
  conteudo: 3_000_000,
  ceo: 5_000_000,
  cto: 3_000_000,
  cmo: 3_000_000,
  cfo: 3_000_000,
  clo: 3_000_000,
};

// Approximate USD per million tokens by model tier (Anthropic public pricing
// rough averages; actual billing reconciliation is a separate task).
const PRICE_PER_M_TOKENS_USD: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

const SLUG_MODEL: Record<string, string> = {
  scraper: "claude-haiku-4-5-20251001",
  custos: "claude-haiku-4-5-20251001",
  ceo: "claude-opus-4-6",
  negociador: "claude-opus-4-6",
};
const DEFAULT_MODEL = "claude-sonnet-4-6";

function modelFor(slug: string) {
  return SLUG_MODEL[slug] ?? DEFAULT_MODEL;
}

// ─── Tool: aggregate_daily_spend ──────────────────────────────────

const aggregateDailySpend: AgentTool = {
  name: "aggregate_daily_spend",
  description:
    "Aggregate token usage from agent_runs in a given window (default last 7 days). Returns per-agent totals: input_tokens, output_tokens, runs, est_cost_usd. Useful for the daily report.",
  input_schema: {
    type: "object" as const,
    properties: {
      days: { type: "number", description: "Look-back window in days (default 7, max 30)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const days = Math.min((input.days as number) || 7, 30);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("agent_runs")
      .select("agent, input_tokens, output_tokens, status")
      .gte("started_at", since);

    if (error) return { error: error.message, agents: [] };

    type Bucket = { agent: string; runs: number; input: number; output: number };
    const map = new Map<string, Bucket>();
    for (const row of data ?? []) {
      const b = map.get(row.agent) ?? { agent: row.agent, runs: 0, input: 0, output: 0 };
      b.runs += 1;
      b.input += row.input_tokens ?? 0;
      b.output += row.output_tokens ?? 0;
      map.set(row.agent, b);
    }

    const buckets = [...map.values()].map((b) => {
      const model = modelFor(b.agent);
      const price = PRICE_PER_M_TOKENS_USD[model] ?? PRICE_PER_M_TOKENS_USD[DEFAULT_MODEL];
      const cost = (b.input / 1_000_000) * price.input + (b.output / 1_000_000) * price.output;
      return {
        agent: b.agent,
        model,
        runs: b.runs,
        input_tokens: b.input,
        output_tokens: b.output,
        est_cost_usd: Math.round(cost * 100) / 100,
      };
    });

    return {
      window_days: days,
      total_runs: (data ?? []).length,
      agents: buckets.sort((a, b) => b.est_cost_usd - a.est_cost_usd),
      grand_total_usd: Math.round(buckets.reduce((acc, x) => acc + x.est_cost_usd, 0) * 100) / 100,
    };
  },
};

// ─── Tool: get_agent_budget_status ────────────────────────────────

const getAgentBudgetStatus: AgentTool = {
  name: "get_agent_budget_status",
  description:
    "For each agent, compute month-to-date token spend and compare against monthly budget. Returns burn_pct (0..100+) and a status flag (ok / warning >=80 / critical >=95).",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async () => {
    const supabase = getSupabaseServiceRole();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { data, error } = await supabase
      .from("agent_runs")
      .select("agent, input_tokens, output_tokens")
      .gte("started_at", monthStart);

    if (error) return { error: error.message, agents: [] };

    type B = { input: number; output: number };
    const map = new Map<string, B>();
    for (const row of data ?? []) {
      const b = map.get(row.agent) ?? { input: 0, output: 0 };
      b.input += row.input_tokens ?? 0;
      b.output += row.output_tokens ?? 0;
      map.set(row.agent, b);
    }

    const agents = Object.keys(AGENT_MONTHLY_BUDGET).map((slug) => {
      const used = map.get(slug) ?? { input: 0, output: 0 };
      const total = used.input + used.output;
      const budget = AGENT_MONTHLY_BUDGET[slug];
      const burnPct = budget > 0 ? Math.round((total / budget) * 1000) / 10 : 0;
      let status: "ok" | "warning" | "critical" = "ok";
      if (burnPct >= 95) status = "critical";
      else if (burnPct >= 80) status = "warning";
      return {
        agent: slug,
        used_tokens: total,
        budget_tokens: budget,
        burn_pct: burnPct,
        status,
      };
    });

    return {
      month_start: monthStart,
      agents: agents.sort((a, b) => b.burn_pct - a.burn_pct),
      critical: agents.filter((a) => a.status === "critical").map((a) => a.agent),
      warning: agents.filter((a) => a.status === "warning").map((a) => a.agent),
    };
  },
};

// ─── Tool: estimate_token_cost ────────────────────────────────────

const estimateTokenCost: AgentTool = {
  name: "estimate_token_cost",
  description:
    "Estimate USD cost for a token bucket given a model tier. Pure function. Use to project the cost of a planned run before dispatching it.",
  input_schema: {
    type: "object" as const,
    properties: {
      model: { type: "string", enum: Object.keys(PRICE_PER_M_TOKENS_USD) },
      input_tokens: { type: "number" },
      output_tokens: { type: "number" },
    },
    required: ["model", "input_tokens"],
  },
  execute: async (input) => {
    const model = input.model as string;
    const inT = Number(input.input_tokens) || 0;
    const outT = Number(input.output_tokens) || 0;
    const price = PRICE_PER_M_TOKENS_USD[model];
    if (!price) return { error: "unknown_model", supported: Object.keys(PRICE_PER_M_TOKENS_USD) };
    const cost = (inT / 1_000_000) * price.input + (outT / 1_000_000) * price.output;
    return {
      model,
      input_tokens: inT,
      output_tokens: outT,
      est_cost_usd: Math.round(cost * 1000) / 1000,
    };
  },
};

// ─── Tool: compute_deal_pl ────────────────────────────────────────

const computeDealPl: AgentTool = {
  name: "compute_deal_pl",
  description:
    "Coarse cost picture for a deal: sum tokens spent by analista + pricing + negociador + contratos in the period since the listing's first_seen_at, then convert to USD. Real margin reconciliation lives in CFO + ledger; this is just the agent-cost side.",
  input_schema: {
    type: "object" as const,
    properties: {
      since_iso: { type: "string", description: "ISO timestamp lower bound (default 30 days ago)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const since =
      (input.since_iso as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();

    const dealAgents = ["analista", "pricing", "negociador", "contratos", "compliance"];

    const { data, error } = await supabase
      .from("agent_runs")
      .select("agent, input_tokens, output_tokens")
      .gte("started_at", since)
      .in("agent", dealAgents);

    if (error) return { error: error.message };

    type Sum = { input: number; output: number; runs: number };
    const map = new Map<string, Sum>();
    for (const row of data ?? []) {
      const s = map.get(row.agent) ?? { input: 0, output: 0, runs: 0 };
      s.input += row.input_tokens ?? 0;
      s.output += row.output_tokens ?? 0;
      s.runs += 1;
      map.set(row.agent, s);
    }

    let totalUsd = 0;
    const breakdown = [...map.entries()].map(([agent, s]) => {
      const model = modelFor(agent);
      const price = PRICE_PER_M_TOKENS_USD[model] ?? PRICE_PER_M_TOKENS_USD[DEFAULT_MODEL];
      const cost = (s.input / 1_000_000) * price.input + (s.output / 1_000_000) * price.output;
      totalUsd += cost;
      return {
        agent,
        runs: s.runs,
        input_tokens: s.input,
        output_tokens: s.output,
        est_cost_usd: Math.round(cost * 100) / 100,
      };
    });

    const { count: dealsClosed } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .in("status", ["finalized", "signed"]);

    return {
      window_since: since,
      breakdown,
      total_agent_cost_usd: Math.round(totalUsd * 100) / 100,
      deals_closed_in_window: dealsClosed ?? 0,
      avg_agent_cost_per_deal_usd:
        dealsClosed && dealsClosed > 0 ? Math.round((totalUsd / dealsClosed) * 100) / 100 : null,
    };
  },
};

// ─── Tool: alert_overspend ────────────────────────────────────────

const alertOverspend: AgentTool = {
  name: "alert_overspend",
  description:
    "Write an agent_comms notification escalating overspend to the agent's C-level. Use when get_agent_budget_status returns critical (>=95% burn) for an agent.",
  input_schema: {
    type: "object" as const,
    properties: {
      agent: { type: "string" },
      to_c_level: { type: "string", enum: ["ceo", "cto", "cmo", "cfo", "clo"] },
      burn_pct: { type: "number" },
      summary: { type: "string" },
    },
    required: ["agent", "to_c_level", "burn_pct"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();

    const { error } = await supabase.from("agent_comms").insert({
      from_agent: "custos",
      to_agent: input.to_c_level as string,
      message_type: "escalation",
      priority: (input.burn_pct as number) >= 100 ? "critical" : "high",
      summary:
        (input.summary as string) ??
        `Overspend: ${input.agent} at ${input.burn_pct}% of monthly budget`,
    });

    if (error) return { error: error.message };
    return { logged: true, agent: input.agent, escalated_to: input.to_c_level };
  },
};

// ─── Tool: report_costs_summary ───────────────────────────────────

const reportCostsSummary: AgentTool = {
  name: "report_costs_summary",
  description:
    "Final summary: total daily spend USD, top spending agents, agents in warning/critical, deals_closed cost-per-deal.",
  input_schema: {
    type: "object" as const,
    properties: {
      total_usd_24h: { type: "number" },
      top_agents: {
        type: "array",
        items: {
          type: "object",
          properties: { agent: { type: "string" }, est_cost_usd: { type: "number" } },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
      critical: { type: "array", items: { type: "string" } },
      avg_cost_per_deal_usd: { type: "number" },
      notes: { type: "string" },
    },
    required: [],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        total_usd_24h: input.total_usd_24h ?? 0,
        top_agents: input.top_agents ?? [],
        warnings: input.warnings ?? [],
        critical: input.critical ?? [],
        avg_cost_per_deal_usd: input.avg_cost_per_deal_usd ?? null,
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all custos tools ──────────────────────────────────────

export const CUSTOS_TOOLS: AgentTool[] = [
  aggregateDailySpend,
  getAgentBudgetStatus,
  estimateTokenCost,
  computeDealPl,
  alertOverspend,
  reportCostsSummary,
];
