import { describe, expect, it } from "vitest";
import { normalizeMessages } from "./index";
import type { LLMMessage } from "./types";

/**
 * Regression tests for the Bug B fix (chat second-turn failure).
 *
 * The negotiation frontend persists only the agent's streamed reply in
 * localStorage — it drops the synthetic opener user turn. So on round ≥2 the
 * server receives messages that start with role="assistant", which both
 * Anthropic and Gemini reject ("first message must be role 'user'").
 *
 * `normalizeMessages` is the single source of truth that repairs this invariant
 * before the provider adapter sees the messages.
 */
describe("normalizeMessages (Bug B regression)", () => {
  it("returns empty array untouched", () => {
    expect(normalizeMessages([])).toEqual([]);
  });

  it("passes through a history that already starts with user", () => {
    const input: LLMMessage[] = [
      { role: "user", content: "Início da conversa." },
      { role: "assistant", content: "Olá, vi seu anúncio." },
      { role: "user", content: "Tudo bem, 50k." },
    ];
    expect(normalizeMessages(input)).toEqual(input);
  });

  it("prepends a synthetic user turn when history starts with assistant (turn 2+ reality)", () => {
    // Exactly the shape the frontend sends on round 2: persisted agent opener
    // followed by the new seller reply.
    const input: LLMMessage[] = [
      { role: "assistant", content: "Olá, vi seu anúncio. Está disponível?" },
      { role: "user", content: "Sim, 52k." },
    ];
    const out = normalizeMessages(input);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ role: "user", content: "Início da conversa." });
    expect(out[1]).toBe(input[0]);
    expect(out[2]).toBe(input[1]);
  });

  it("prepends only ONE synthetic user — does not double-prepend", () => {
    const input: LLMMessage[] = [{ role: "assistant", content: "x" }];
    const out = normalizeMessages(input);
    const firstAssistantIndex = out.findIndex((m) => m.role === "assistant");
    expect(firstAssistantIndex).toBe(1);
    expect(out[0].role).toBe("user");
  });

  it("does not mutate input (purity)", () => {
    const input: LLMMessage[] = [{ role: "assistant", content: "x" }];
    const snapshot = JSON.parse(JSON.stringify(input));
    normalizeMessages(input);
    expect(input).toEqual(snapshot);
  });
});
