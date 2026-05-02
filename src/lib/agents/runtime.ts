/**
 * Agent Runtime — executes an agent by calling the Anthropic API in a
 * tool-use loop until the agent finishes or hits a limit.
 *
 * Flow:
 *   1. Send system prompt + user task to Claude
 *   2. If Claude responds with tool_use blocks, execute them and send results back
 *   3. Repeat until Claude responds with only text (no tool calls) or max turns hit
 *   4. Return structured AgentRunResult with metrics
 *
 * This is the core engine — individual agents just provide config (prompt, tools, model).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentConfig,
  AgentRunResult,
  RunStatus,
  ToolCallRecord,
} from "./types";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TURNS = 15;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set — add it to .env.local and Vercel env vars"
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Run an agent with a given task. The agent will use its tools in a loop
 * until it produces a final text response or hits maxTurns.
 */
export async function runAgent(
  config: AgentConfig,
  task: string,
  context?: Record<string, unknown>
): Promise<AgentRunResult> {
  const client = getClient();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Build Anthropic tool definitions from our AgentTool format
  const anthropicTools: Anthropic.Tool[] = config.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool["input_schema"],
  }));

  // Build the user message with optional context
  let userMessage = task;
  if (context && Object.keys(context).length > 0) {
    userMessage = `## Context\n${JSON.stringify(context, null, 2)}\n\n## Task\n${task}`;
  }

  // Conversation history for the agentic loop
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const toolCalls: ToolCallRecord[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turns = 0;
  let finalResponse: string | null = null;
  let status: RunStatus = "running";
  let error: string | null = null;

  try {
    while (turns < maxTurns) {
      turns++;

      const response = await client.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        system: config.systemPrompt,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Check if the response contains tool calls
      const toolUseBlocks = response.content.filter(
        (b) => b.type === "tool_use"
      ) as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>;

      // Extract text blocks
      const textBlocks = response.content.filter(
        (b) => b.type === "text"
      ) as Array<{ type: "text"; text: string }>;

      if (toolUseBlocks.length === 0) {
        // No tool calls — agent is done
        finalResponse = textBlocks.map((b) => b.text).join("\n") || null;
        status = "completed";
        break;
      }

      // Agent wants to use tools — execute them
      // Add the assistant's response to conversation
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      // Execute each tool call and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const tool = config.tools.find((t) => t.name === toolUse.name);
        const toolStart = Date.now();

        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: Unknown tool "${toolUse.name}"`,
            is_error: true,
          });
          continue;
        }

        try {
          const input = toolUse.input;
          const output = await tool.execute(input);
          const toolDuration = Date.now() - toolStart;

          toolCalls.push({
            toolName: tool.name,
            input,
            output,
            durationMs: toolDuration,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(output),
          });
        } catch (err) {
          const toolDuration = Date.now() - toolStart;
          const errMsg =
            err instanceof Error ? err.message : String(err);

          toolCalls.push({
            toolName: tool.name,
            input: toolUse.input,
            output: { error: errMsg },
            durationMs: toolDuration,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${errMsg}`,
            is_error: true,
          });
        }
      }

      // Send tool results back to the model
      messages.push({ role: "user", content: toolResults });

      // If stop_reason is end_turn after tool use, check next iteration
      if (response.stop_reason === "end_turn" && toolUseBlocks.length === 0) {
        finalResponse = textBlocks.map((b) => b.text).join("\n") || null;
        status = "completed";
        break;
      }
    }

    // If we exhausted turns without completing
    if (status === "running") {
      status = "completed";
      finalResponse =
        "Agent reached maximum turns. Last tool calls were executed successfully.";
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
  }

  const endedAt = new Date().toISOString();

  return {
    runId,
    agent: config.slug,
    status,
    turns,
    tokensUsed: {
      input: totalInputTokens,
      output: totalOutputTokens,
    },
    toolCalls,
    finalResponse,
    error,
    durationMs: Date.now() - start,
    startedAt,
    endedAt,
  };
}
