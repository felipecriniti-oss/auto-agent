import type { Opportunity } from "@/lib/mock-data/v3";
import type { PfPersona } from "@/lib/prompts/pf-sim-v1";

/**
 * Picks a PF persona from an Opportunity's motivation signals using a small
 * heuristic. Deterministic (no randomness) so reruns feel consistent.
 *
 * Priority:
 *  1. `urgente` — hard motivation (international move, urgency markers, 5+
 *     price reductions, or 60+ days online)
 *  2. `ansioso` — moderate motivation (troca/mudança/3+ reductions/30+ days)
 *  3. `resistente` — default (no strong signals, early ad)
 */
export function pickPersonaFromOpportunity(opp: Opportunity): PfPersona {
  const joined = opp.motivationSignals.join(" ").toLowerCase();

  const daysMatch = joined.match(/(\d+)\s*dias?/);
  const daysOnline = daysMatch ? Number.parseInt(daysMatch[1], 10) : 0;

  const reducoesMatch = joined.match(/(\d+)\s*reduç/);
  const reducoes = reducoesMatch ? Number.parseInt(reducoesMatch[1], 10) : 0;

  const urgentMarkers = /(internacion|eua|urgente|mudança.*eua|preciso vender|quitação|3 semanas)/;
  if (urgentMarkers.test(joined) || reducoes >= 5 || daysOnline >= 60) {
    return "urgente";
  }

  const moderateMarkers = /(troca|mudança|segundo carro|alugar frota|trocando)/;
  if (moderateMarkers.test(joined) || reducoes >= 3 || daysOnline >= 30) {
    return "ansioso";
  }

  return "resistente";
}

/**
 * Agent-side closing phrases that indicate the agent has given up (walkaway)
 * or locked in a deal. Used to halt the autoplay loop before max rounds.
 */
const AGENT_WALKAWAY_PATTERNS = [
  /não\s+conseguimos\s+chegar/i,
  /obrigado\s+pela\s+conversa/i,
  /vamos\s+encerrar\s+por\s+aqui/i,
  /desejamos\s+boa\s+sorte/i,
  /infelizmente\s+não/i,
];

const AGENT_DEAL_PATTERNS = [
  /fechado\s+então/i,
  /vamos\s+fechar\b/i,
  /topo\s+fechar/i,
  /pode\s+contar\s+comigo/i,
];

const PF_DEAL_PATTERNS = [
  /\btá\s+fechado\b/i,
  /\bestá\s+fechado\b/i,
  /\bfechado\b/i,
  /\baceito\b/i,
  /\baceita\b.*?(sua|essa|esta)\s+(oferta|proposta)/i,
  /\bpode\s+fechar\b/i,
  /\bvamos\s+fechar\b/i,
  /\btopo\b/i,
];

const PF_WALKAWAY_PATTERNS = [
  /não\s+consigo\s+aceitar/i,
  /desculpa,\s*mas\s+não/i,
  /vou\s+pensar\s+em\s+outras/i,
];

export type AutoplayOutcome = "in_progress" | "deal_closed" | "walkaway" | "max_rounds";

export function detectAgentOutcome(agentMessage: string): AutoplayOutcome {
  if (AGENT_WALKAWAY_PATTERNS.some((r) => r.test(agentMessage))) return "walkaway";
  if (AGENT_DEAL_PATTERNS.some((r) => r.test(agentMessage))) return "deal_closed";
  return "in_progress";
}

export function detectPfOutcome(pfMessage: string): AutoplayOutcome {
  if (PF_WALKAWAY_PATTERNS.some((r) => r.test(pfMessage))) return "walkaway";
  if (PF_DEAL_PATTERNS.some((r) => r.test(pfMessage))) return "deal_closed";
  return "in_progress";
}

/**
 * Strips the internal <arg>...</arg> markers the agent prompt asks for. Those
 * are for summarization only and must never reach the displayed message.
 */
const ARG_TAG_REGEX = /<\/?arg>/g;
export function stripArgTags(text: string): string {
  return text.replace(ARG_TAG_REGEX, "");
}

/**
 * Persona label helpers for UI copy.
 */
export const PERSONA_LABELS: Record<PfPersona, string> = {
  resistente: "Resistente",
  ansioso: "Ansioso",
  urgente: "Urgente",
};
