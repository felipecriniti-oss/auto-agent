---
phase: 01-chat-manual-funcional
plan: 06
subsystem: api
tags: [next15-edge, sse, anthropic, stream, abort-controller, rate-limit, kill-switch]

requires:
  - phase: 01-chat-manual-funcional/01-02
    provides: negotiateRequestSchema
  - phase: 01-chat-manual-funcional/01-04
    provides: rate-limit module
  - phase: 01-chat-manual-funcional/01-05
    provides: buildSystemPrompt + isNegotiationEnabled
provides:
  - POST /api/negotiate/stream Edge route with SSE wire format
  - SSE frame envelope: {type: "chunk"|"done"|"error"} — never leaks upstream details
  - 503 (kill switch) → 429 (rate limit) → 400 (validation) → 200 (stream) ordering
  - Bidirectional AbortController (client cancel → Anthropic abort)
  - Generic 500 'misconfigured' if ANTHROPIC_API_KEY missing
affects: [07-ui]

tech-stack:
  added: []
  patterns:
    - "ReadableStream<Uint8Array> with TextEncoder for SSE frame emission"
    - "request.signal.addEventListener('abort', ...) wired to internal AbortController"
    - "stream.cancel() callback re-aborts internal controller (catches cases where signal didn't fire)"
    - "vi.mock('@anthropic-ai/sdk') with stateful streamFactory closure for per-test stream behavior"

key-files:
  created:
    - src/app/api/negotiate/stream/route.ts (~115 lines)
    - src/app/api/negotiate/stream/route.test.ts (13 tests)
  modified: []

key-decisions:
  - "Kill switch is the FIRST check — runs before any expensive work, returns 503 instantly"
  - "Order: kill-switch → rate-limit → body-validation → stream-open → Anthropic call"
  - "On Anthropic stream throw: emit generic 'upstream_failed' inside an SSE frame; never expose err.message (T-06-04)"
  - "ANTHROPIC_API_KEY missing returns 500 'misconfigured' (no specifics about which env var)"
  - "Status 200 even when an upstream-error SSE frame is emitted — the stream itself opened successfully; clients consume the typed frame"

patterns-established:
  - "Test pattern: vi.mock module top-level + dynamic import('./route') after env setup so process.env reads inside the route pick up test config"
  - "readStream helper: pipeThrough(new TextDecoderStream()).getReader() to drain SSE body"

requirements-completed: [NEG-03, INFRA-03]

duration: ~6 min
completed: 2026-04-19
---

# Phase 1 / Plan 06: SSE Negotiate Stream Summary

**Edge runtime POST /api/negotiate/stream wires Anthropic Claude streaming behind kill-switch + rate-limit + Zod gates. SSE wire format is `data: {"type":"chunk"|"done"|"error", ...}\n\n`. Bidirectional AbortController kills the upstream call when the client disconnects. 13 integration tests with mocked SDK lock the contract.**

## SSE Wire Format (consumed by Plan 07)

```
data: {"type":"chunk","text":"..."}\n\n
data: {"type":"done"}\n\n
data: {"type":"error","message":"upstream_failed"}\n\n   # generic only
```

## Status Codes

| Status | Body | Trigger |
|--------|------|---------|
| 200 | SSE stream | All checks pass; stream opens. Errors come *inside* frames, not as 4xx/5xx. |
| 400 | `{error: "invalid_body"}` | Zod fail or malformed JSON |
| 429 | `{error: "rate_limited", retryAfter: N}` + `Retry-After` | 6th request in 60s window |
| 500 | `{error: "misconfigured"}` | `ANTHROPIC_API_KEY` missing |
| 503 | `{error: "disabled", reason: "..."}` | `NEGOTIATION_ENABLED=false` (D-17) |

## Task Commits

1. **Task 1: route handler** — `feat(01-06): /api/negotiate/stream SSE Edge route`
2. **Task 2: integration tests** — `test(01-06): integration tests for SSE route (13 tests)`

## Decisions

- Anthropic SDK version: `0.90.0` (matches plan's call signature; `client.messages.stream(args, {signal})` is the documented pattern)
- AbortSignal events DO fire reliably under Node 22 / jsdom — tests verify the close path through both `request.signal.abort` (manual cancel) and `stream.cancel()` (reader.cancel), and the mocked stream's signal arg is wired through.
- Plan asked for "at least 13 tests" — added an extra test (`returns 400 on missing listing.marca AND does not call Anthropic`) plus a `rejects role 'system'` test to cover the schema cascade explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Lint — biome noUselessConstructor] Empty mock constructor removed**
- **Found during:** Wave-closing biome check
- **Issue:** Biome flagged the empty `constructor(_cfg: unknown) {}` in the Anthropic mock class as useless.
- **Fix:** Removed the no-op constructor; class now uses default constructor and works identically.
- **Committed in:** part of Task 2 commit

**2. [Lint — biome noDelete] process.env delete suppressed**
- Same pattern as Plan 01-05: `delete process.env.X` with `biome-ignore` rationale.

**3. [Test count] Added 13th test to satisfy plan acceptance**
- Plan asked for ≥13 tests; verbatim plan code produced 12. Added "anthropic-not-called on 400" + "rejects system role" tests for security regressions.

**Total deviations:** 3 auto-fixed (2 lint, 1 test-count addition).

## Issues Encountered

None — happy path on first run.

## User Setup Required

None for the test suite. **For runtime use** (when running `pnpm dev` and exercising the route from a browser), you need:
- `cp .env.local.example .env.local`
- Fill `ANTHROPIC_API_KEY` with a real key from console.anthropic.com (route returns 500 'misconfigured' otherwise)

The tests stub the API key so they don't need real credentials.

## Next Phase Readiness

- Plan 07's `useNegotiationStream` hook can now POST to `/api/negotiate/stream`, parse SSE frames, and feed `appendAgentChunk` / `finalizeAgentMessage` into the Zustand store
- All Phase 1 backend surface is complete: `/api/fipe` + `/api/negotiate/stream`. UI is the last code piece (Plan 07), then deploy (Plan 08).
- Total project test count: **132 across 11 files**, all green.

---
*Phase: 01-chat-manual-funcional*
*Completed: 2026-04-19*
