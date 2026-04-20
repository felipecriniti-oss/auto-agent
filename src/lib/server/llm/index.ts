import { streamAnthropic } from "./anthropic";
import { streamGemini } from "./gemini";
import type { LLMMessage, LLMProvider, StreamOptions } from "./types";

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

// Synthetic opener used by the negotiate frontend; mirrored here because the
// Zustand store persists only the agent's streamed reply (not the opening
// "user" turn we pass in ChatView's useEffect). So on round ≥2 the server
// receives history starting with an "assistant" turn, which Anthropic rejects
// ("messages: first message must be role 'user'") and Gemini also rejects.
const SYNTHETIC_OPENER = "Início da conversa.";

/**
 * Ensure `messages` starts with a user turn. Anthropic and Gemini both require
 * the first turn to be `user`; the frontend omits the synthetic opener from
 * persisted state, so we repair it server-side in a provider-agnostic way.
 *
 * Pure function — returns a new array.
 */
export function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  if (messages.length === 0) return messages;
  if (messages[0].role === "user") return messages;
  return [{ role: "user", content: SYNTHETIC_OPENER }, ...messages];
}

export async function streamLLM(provider: LLMProvider, opts: StreamOptions): Promise<void> {
  const normalized: StreamOptions = { ...opts, messages: normalizeMessages(opts.messages) };
  if (provider === "gemini") return streamGemini(normalized);
  return streamAnthropic(normalized);
}

export type { LLMProvider, StreamOptions } from "./types";
