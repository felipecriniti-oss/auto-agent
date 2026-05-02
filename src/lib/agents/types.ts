/**
 * Agent system types — shared across all agents.
 *
 * Each agent is defined by:
 *   - A system prompt (from AGENTS.md)
 *   - A set of tools it can call
 *   - A model tier (opus/sonnet/haiku)
 *   - Budget constraints (max tokens per run)
 */

export type AgentModel =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export type AgentSlug =
  | "ceo"
  | "cto"
  | "cmo"
  | "cfo"
  | "clo"
  | "scraper"
  | "negociador"
  | "analista"
  | "captacao"
  | "conteudo"
  | "custos"
  | "pricing"
  | "contratos"
  | "compliance";

export type RunStatus = "running" | "completed" | "failed" | "timeout";

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentConfig {
  slug: AgentSlug;
  name: string;
  model: AgentModel;
  systemPrompt: string;
  tools: AgentTool[];
  maxTokens?: number;
  maxTurns?: number;
  budgetTokens?: number;
}

export interface AgentRunResult {
  runId: string;
  agent: AgentSlug;
  status: RunStatus;
  turns: number;
  tokensUsed: {
    input: number;
    output: number;
  };
  toolCalls: ToolCallRecord[];
  finalResponse: string | null;
  error: string | null;
  durationMs: number;
  startedAt: string;
  endedAt: string;
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
}

export interface AgentMessage {
  from: AgentSlug;
  to: AgentSlug;
  type: "request" | "response" | "escalation" | "notification";
  priority: "low" | "medium" | "high" | "critical";
  dealId: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}
