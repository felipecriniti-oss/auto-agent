/**
 * Phase 8 — Filtros eliminatorios (Spec Técnico v1 § 2).
 *
 * Listings matching ANY blocking filter are rejected during normalization
 * and never reach the DB. Filtros checked:
 *   - leilao  (auction-origin vehicles)
 *   - sinistro (totaled / salvaged / wrecked)
 *   - recall  (deferred — no reliable signal in WebMotors payload; Phase 13)
 *
 * Pure function: no I/O, no console, no throw on malformed input.
 *
 * ReDoS-safe: all regexes are simple character classes — no nested quantifiers
 * or `(.*)+`-style backtracking traps (T-08-04-04).
 */
import type { WebMotorsScraped } from "./types";

export type FilterReason = "leilao" | "sinistro" | "recall";

const LEILAO_TERMS: RegExp[] = [/leil[aã]o/i, /procedencia\s+leilao/i];
const SINISTRO_TERMS: RegExp[] = [
  /sinistr[ao]/i,
  /salvad[oa]/i,
  /recuperad[oa]/i,
  /batid[oa]/i,
];

export function detectBlockingFilter(item: WebMotorsScraped): FilterReason | null {
  const haystacks: string[] = [];
  if (typeof item.title === "string") haystacks.push(item.title);
  if (Array.isArray(item.attributes)) {
    for (const a of item.attributes) {
      if (typeof a === "string") haystacks.push(a);
    }
  }
  const text = haystacks.join(" | ").toLowerCase();
  if (LEILAO_TERMS.some((re) => re.test(text))) return "leilao";
  if (SINISTRO_TERMS.some((re) => re.test(text))) return "sinistro";
  // Recall: no reliable signal in payload. Phase 13 will add FAB recall API.
  return null;
}
