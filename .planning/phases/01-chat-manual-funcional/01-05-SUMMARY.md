---
phase: 01-chat-manual-funcional
plan: 05
subsystem: prompts
tags: [system-prompt, anthropic, prompt-injection-defense, kill-switch, env-var]

requires:
  - phase: 01-chat-manual-funcional/01-02
    provides: Listing type
provides:
  - SYSTEM_PROMPT_V1_TEMPLATE — frozen template with 14 placeholders + injection-defense + <arg> instruction
  - buildSystemPrompt(listing, fipe, target, walkAway, maxRounds) — pure substitution with pt-BR number formatting
  - isNegotiationEnabled() — env-var kill switch (per-request, not cached)
affects: [06-negotiate-stream]

tech-stack:
  added: []
  patterns:
    - "System prompt as exported const (drift-guarded by Vitest assertions on every block)"
    - "pt-BR number formatting via Intl: n.toLocaleString('pt-BR')"
    - "Kill switch reads env per-request — Vercel env-var flips take effect without redeploy"

key-files:
  created:
    - src/lib/prompts/system-v1.ts (~115 lines, ~3300 char template)
    - src/lib/prompts/system-v1.test.ts (19 tests — drift guards + substitution)
    - src/lib/server/kill-switch.ts (single function, 3 lines of body)
    - src/lib/server/kill-switch.test.ts (7 tests — all 4 documented env states + edge cases)
  modified: []

key-decisions:
  - "System prompt v1 is the SOURCE OF TRUTH — Phase 2 must introduce v2, leaving v1 untouched (EXPORT-04 A/B baseline)"
  - "{targetDiscount} hardcoded to '25' for Phase 1 per D-10"
  - "{comparables} hardcoded to '(sem dados de comparáveis nesta fase)' — Phase 2 INTEL injects real data"
  - "Kill switch uses exact-string match on 'false' — anything else (including '0', 'disabled', 'FALSE') keeps the endpoint live"
  - "delete process.env.X is correct (not the biome-suggested undefined-assignment, which Node coerces to literal 'undefined' string) — biome-ignore added in test"

patterns-established:
  - "Drift-guard test: assert presence of every placeholder + every functional block + relative ordering of injected sections"
  - "Test convention: capture process.env value at module load, restore in afterEach"

requirements-completed: [NEG-03, INFRA-03]

duration: ~4 min
completed: 2026-04-19
---

# Phase 1 / Plan 05: System Prompt + Kill Switch Summary

**SYSTEM_PROMPT_V1_TEMPLATE frozen as Phase 1 source of truth (verbatim from brief §9.1 + 2 documented additions: prompt-injection defense paragraph and `<arg>` tag instruction). buildSystemPrompt substitutes all 14 placeholders with pt-BR number formatting. isNegotiationEnabled kill-switch helper reads env per-request.**

## Template Inventory

- **Char count:** ~3300 (full template)
- **Placeholder count:** 14 (in insertion order)
  - `{marca}`, `{modelo}`, `{ano}`, `{km}`
  - `{askPrice}`, `{city}`, `{daysListed}`, `{priceReductions}`
  - `{fipe}`, `{comparables}`, `{maxRounds}`, `{targetPrice}`
  - `{targetDiscount}`, `{walkAwayPrice}`
- **Block ordering (left-to-right):**
  1. Role statement (`Você é o AutoAgent...`)
  2. **TRATAMENTO DOS DADOS DO ANÚNCIO** (injection defense — addition #1)
  3. DADOS DO ANÚNCIO
  4. OBJETIVO
  5. TÁTICAS PERMITIDAS / PROIBIDAS
  6. HARD STOPS
  7. **FORMATO INTERNO DE ARGUMENTOS** (`<arg>` instruction — addition #2)
  8. TOM
  9. FORMATO DA RESPOSTA

## Task Commits

1. **Task 1: SYSTEM_PROMPT_V1_TEMPLATE + buildSystemPrompt** — `feat(01-05): system prompt v1 frozen + buildSystemPrompt with pt-BR formatting`
2. **Task 2: isNegotiationEnabled kill switch** — `feat(01-05): isNegotiationEnabled kill-switch helper`

## Decisions

- `Node 22 supports String.prototype.replaceAll` natively — no shim needed.
- `pnpm vitest run` exits 0 with 26 new tests (19 prompt + 7 kill-switch). Total project test count: **119 across 10 files.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Lint — biome noDelete] Suppressed for process.env**
- **Found during:** Wave-closing biome check
- **Issue:** Biome flagged `delete process.env.NEGOTIATION_ENABLED` as performance anti-pattern. Suggested unsafe fix `process.env.X = undefined` would corrupt the test (Node coerces undefined assignment on `process.env` to the literal string `"undefined"`).
- **Fix:** Added `// biome-ignore lint/performance/noDelete: process.env requires delete to truly unset` comments at both `delete` sites.
- **Files modified:** `src/lib/server/kill-switch.test.ts`
- **Verification:** `pnpm biome check src` exits 0; tests still pass.
- **Committed in:** part of Task 2 commit

**2. [Formatting] Biome organizeImports**
- Reordered imports (type imports first per group rule).
- Cosmetic only.

**Total deviations:** 2 auto-fixed (1 lint suppression with rationale, 1 formatting).

## Issues Encountered

None.

## User Setup Required

None for this plan. (Plan 06 will need `ANTHROPIC_API_KEY` set in `.env.local` to actually exercise the negotiate route at dev time, but the API key is already documented in `.env.local.example` from Plan 01-01.)

## AI-SPEC Status (deferred)

AI-SPEC.md §2–7 remain empty — framework selection and eval strategy deferred to `/gsd-ai-integration-phase 2` before Phase 2 starts. This is intentional per the plan's `<objective>` note. Phase 1 does not need an AI framework abstraction; the negotiate route in Plan 06 calls the Anthropic SDK directly.

## Next Phase Readiness

- Plan 06 can `import { buildSystemPrompt } from "@/lib/prompts/system-v1"` and pass it as the `system` field to `anthropic.messages.stream(...)`
- Plan 06 can `import { isNegotiationEnabled } from "@/lib/server/kill-switch"` for an early 503 return per D-17
- Plan 06 can also `import { checkRateLimit } from "@/lib/server/rate-limit"` (built in Plan 04)
- Wave 2 is now fully complete (Plans 01-03, 01-04, 01-05); Wave 3 (Plan 01-06) is unblocked

---
*Phase: 01-chat-manual-funcional*
*Completed: 2026-04-19*
