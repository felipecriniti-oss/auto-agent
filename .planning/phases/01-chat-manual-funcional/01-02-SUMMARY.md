---
phase: 01-chat-manual-funcional
plan: 02
subsystem: schemas
tags: [zod, types, validation, prompt-injection-defense, security-boundary]

requires:
  - phase: 01-chat-manual-funcional/01-01
    provides: Next.js + TypeScript strict + Vitest toolchain
provides:
  - listingSchema (Zod) + Listing type — 8-field ad form contract with prompt-injection denylist
  - parallelumv1 cascade schemas (marcaSchema, modelosResponseSchema, anosResponseSchema, valorResponseSchema, fipeApiResponseSchema)
  - parseFipeValor("R$ 268.000,00") → 268000 utility
  - Session + Message TypeScript types
  - negotiateRequestSchema with content size cap (2000 chars) + conversation length cap (40 messages)
affects: [03-zustand-store, 04-fipe-api, 05-system-prompt, 06-negotiate-stream, 07-ui]

tech-stack:
  added: []
  patterns:
    - "Schemas + types live under src/lib/{schemas,types,utils} with co-located *.test.ts files"
    - "Prompt-injection defense: SAFE_TEXT regex /^[^<>{}]*$/ + double-newline refine on every interpolated string field"
    - "Cost-exhaustion defense: messages[].content max(2000) + messages.max(40) on every public POST schema"

key-files:
  created:
    - src/lib/schemas/listing.ts (listingSchema, Listing)
    - src/lib/schemas/listing.test.ts (15 tests)
    - src/lib/schemas/fipe.ts (5 schemas + FipeApiResponse type)
    - src/lib/schemas/fipe.test.ts (8 tests)
    - src/lib/schemas/negotiate.ts (negotiateRequestSchema, NegotiateRequest)
    - src/lib/schemas/negotiate.test.ts (11 tests)
    - src/lib/utils/fipe.ts (parseFipeValor)
    - src/lib/utils/fipe.test.ts (8 tests)
    - src/lib/types/session.ts (Status, EndReason, Session)
    - src/lib/types/message.ts (Role, Message)
  modified: []

key-decisions:
  - "SAFE_TEXT pattern is /^[^<>{}]*$/ — denies <, >, {, } in marca/modelo/cidade (T-02-01)"
  - "Double-newline (\\n\\n) refine on top of regex catches prompt-section-separator injection that the regex misses"
  - "messages[].content max(2000) is the hard cost-exhaustion cap (T-02-02); messages.max(40) caps conversation length per request"
  - "Anthropic role enum is ['user','assistant'] in negotiateRequestSchema; internal Role union is ['agent','seller'] in src/lib/types/message.ts — route handler maps between them"
  - "Session.maxRounds is the literal type 6 (not number) so downstream code can rely on the constant"

patterns-established:
  - "Vitest co-located: schema-name.ts + schema-name.test.ts side by side"
  - "Zod .refine for behaviors regex can't catch (\\n\\n separator)"
  - "Brazilian number parser: strip 'R$ ', strip '.', swap ',' to '.', then parseFloat + Math.round"

requirements-completed: [NEG-01, FIPE-01, NEG-02]

duration: ~8 min
completed: 2026-04-19
---

# Phase 1 / Plan 02: Schemas + Types Summary

**Zod schemas (listing, FIPE cascade, negotiate request) + Session/Message types + parseFipeValor — all data contracts the rest of Phase 1 builds against, with prompt-injection and cost-exhaustion mitigations baked in.**

## Performance

- **Started:** 2026-04-19 (inline)
- **Completed:** 2026-04-19
- **Tasks:** 2
- **Files created:** 10
- **Tests added:** 42 (15 listing + 8 fipe + 8 utils + 11 negotiate)

## Accomplishments

- `listingSchema` validates the 8-field ad form with prompt-injection denylist on marca/modelo/cidade (`/^[^<>{}]*$/` + `\n\n` refine) — T-02-01
- Parallelum v1 cascade schemas (marca, modelos, anos, valor) plus our internal `/api/fipe` response schema
- `parseFipeValor` converts `"R$ 268.000,00"` → `268000` with Math.round and throws on garbage
- `Session` + `Message` types match RESEARCH.md §State Management verbatim; `Session.maxRounds` is literal `6`
- `negotiateRequestSchema` enforces `content.max(2000)` + `messages.max(40)` cost-exhaustion caps — T-02-02
- 43 vitest tests green (smoke + 42 new); typecheck + biome + build all green

## Task Commits

1. **Task 1: listing + fipe schemas + parseFipeValor + tests** — `ec9932c` (feat)
2. **Task 2: Session/Message types + negotiate schema + tests** — `4018aa3` (feat)

## Files Created/Modified

- `src/lib/schemas/listing.ts` — listingSchema with SAFE_TEXT regex + double-newline refine
- `src/lib/schemas/listing.test.ts` — 15 tests (valid, denylist, length, range, integer, double-newline)
- `src/lib/schemas/fipe.ts` — Parallelum v1 schemas + internal API response schema
- `src/lib/schemas/fipe.test.ts` — 8 tests (one per schema + edge cases)
- `src/lib/schemas/negotiate.ts` — negotiateRequestSchema (cascades from listingSchema)
- `src/lib/schemas/negotiate.test.ts` — 11 tests (size cap, length cap, role enum, integer fipe, range)
- `src/lib/utils/fipe.ts` — parseFipeValor (R$ 268.000,00 → 268000)
- `src/lib/utils/fipe.test.ts` — 8 tests (parsing + rounding + throws)
- `src/lib/types/message.ts` — Role union, Message interface
- `src/lib/types/session.ts` — Status, EndReason, Session (maxRounds: 6 literal)

## Decisions Made

None — followed plan as specified, including verbatim regex pattern, exact cap values (2000/40), and exact import path conventions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Formatting] Biome line-break preferences after initial write**
- **Found during:** Wave-closing biome check
- **Issue:** `pnpm biome check src` flagged 2 format mismatches: a multi-line `z.array(...)` that fit on one line, and a chained `.replace()` that should break across multiple lines.
- **Fix:** `pnpm biome format --write src` reformatted both files; committed as part of Task 2.
- **Files modified:** `src/lib/schemas/fipe.ts`, `src/lib/utils/fipe.ts`
- **Verification:** `pnpm biome check src` exits 0.
- **Committed in:** `4018aa3`

---

**Total deviations:** 1 auto-fixed (formatting only)
**Impact on plan:** Cosmetic only — no semantic change.

## Issues Encountered

None.

## User Setup Required

None — pure schema/type/util plan.

## Next Phase Readiness

- `@/lib/schemas/listing` ready for AdListingForm (Plan 07) and route validation (Plans 04, 06)
- `@/lib/schemas/fipe` ready for `/api/fipe` route (Plan 04)
- `@/lib/schemas/negotiate` ready for `/api/negotiate/stream` route (Plan 06)
- `@/lib/utils/fipe` `parseFipeValor` ready for FIPE route handler (Plan 04)
- `@/lib/types/{session,message}` ready for Zustand store (Plan 03) and UI components (Plan 07)
- Wave 2 (Plans 01-03, 01-04, 01-05) can start immediately — all three depend on this plan only

---
*Phase: 01-chat-manual-funcional*
*Completed: 2026-04-19*
