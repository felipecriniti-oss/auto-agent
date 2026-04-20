import Anthropic from "@anthropic-ai/sdk";
import type { StreamOptions } from "./types";

// PROJECT-BRIEF §10 locks the LLM to Sonnet 4.6. ANTHROPIC_MODEL overrides only
// when pinning a specific snapshot.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function streamAnthropic(opts: StreamOptions): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: opts.messages,
    },
    { signal: opts.signal },
  );

  stream.on("text", (chunk: string) => opts.onText(chunk));
  await stream.finalMessage();
}
