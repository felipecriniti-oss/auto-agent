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

export interface FallbackResult {
  providerUsed: LLMProvider;
  fellBack: boolean;
}

/**
 * Provider fallback wrapper.
 *
 * Runs `primary` first. If it throws BEFORE any text has been streamed to
 * onText, retries with the other configured provider silently — user sees
 * no error, no retry button, no double-charge. Once any chunk has flowed,
 * a mid-stream failure is surfaced (you can't cleanly rebind a partial
 * stream to a different model without the client seeing nonsense).
 *
 * Returns which provider actually served the request; the caller can log
 * or telemetry on `fellBack`.
 *
 * If BOTH providers are missing keys, `primary` throws and the caller gets
 * the same behavior as today — this wrapper never invents a configured
 * provider that isn't there.
 */
export async function streamLLMWithFallback(
  primary: LLMProvider,
  opts: StreamOptions,
): Promise<FallbackResult> {
  const other: LLMProvider = primary === "anthropic" ? "gemini" : "anthropic";
  let firstChunk = false;

  const wrapped: StreamOptions = {
    ...opts,
    messages: normalizeMessages(opts.messages),
    onText: (chunk: string) => {
      firstChunk = true;
      opts.onText(chunk);
    },
  };

  try {
    if (primary === "gemini") await streamGemini(wrapped);
    else await streamAnthropic(wrapped);
    return { providerUsed: primary, fellBack: false };
  } catch (err) {
    if (firstChunk) throw err; // mid-stream failure — don't fall back
    if (!isProviderConfigured(other)) throw err; // no fallback target

    // Reset the streamed-flag for the fallback attempt
    firstChunk = false;
    const fallbackOpts: StreamOptions = { ...wrapped, onText: wrapped.onText };

    console.warn(
      JSON.stringify({
        scope: "llm.fallback",
        primary,
        fellBackTo: other,
        primaryError: (err as { message?: string })?.message ?? String(err),
      }),
    );

    if (other === "gemini") await streamGemini(fallbackOpts);
    else await streamAnthropic(fallbackOpts);
    return { providerUsed: other, fellBack: true };
  }
}

/**
 * True if at least one provider has its API key configured. Use in routes
 * when deciding whether to short-circuit with a 500 "misconfigured" vs
 * continuing to the fallback-aware stream call.
 */
export function isAnyProviderConfigured(): boolean {
  return isProviderConfigured("anthropic") || isProviderConfigured("gemini");
}

export type { LLMProvider, StreamOptions } from "./types";
