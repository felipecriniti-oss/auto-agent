import { streamAnthropic } from "./anthropic";
import { streamGemini } from "./gemini";
import type { LLMProvider, StreamOptions } from "./types";

// Anthropic is the production default (PROJECT-BRIEF §10 locks the LLM to
// Sonnet 4.6). LLM_PROVIDER=gemini is a dev escape hatch for testing on the
// Gemini free tier — not for production use.
export function resolveProvider(): LLMProvider {
  const raw = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase().trim();
  return raw === "gemini" ? "gemini" : "anthropic";
}

export function isProviderConfigured(provider: LLMProvider): boolean {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function streamLLM(provider: LLMProvider, opts: StreamOptions): Promise<void> {
  if (provider === "gemini") return streamGemini(opts);
  return streamAnthropic(opts);
}

export type { LLMProvider, StreamOptions } from "./types";
