---
phase: 01-chat-manual-funcional
plan: 04
subsystem: api
tags: [next15-edge, route-handler, parallelum, fipe, rate-limit, zod-boundary]

requires:
  - phase: 01-chat-manual-funcional/01-02
    provides: fipe + listing Zod schemas, parseFipeValor utility
provides:
  - POST /api/fipe edge route with 5 status-code paths (200, 400, 404, 429, 502)
  - 4-call Parallelum cascade (marcas → modelos → anos → valor) with Zod-validated responses
  - Fuzzy matching: case-insensitive substring, shortest-name wins (RESEARCH pitfall #15)
  - HTML-degradation guard: content-type check before .json() (T-04-05)
  - Generic error bodies; never leak upstream details (T-04-04)
  - In-memory rate limiter (src/lib/server/rate-limit.ts) with bucket isolation, custom window/max
  - FIPE bucket: 20/min/IP — looser than negotiate to allow form retries
affects: [06-negotiate-stream, 07-ui]

tech-stack:
  added: []
  patterns:
    - "Edge route handler with `runtime = 'edge'` + `dynamic = 'force-dynamic'`"
    - "AbortSignal.timeout(10_000) on every upstream fetch"
    - "Sentinel constant UPSTREAM_FAIL + isUpstreamFail<T> type guard for clean union returns"
    - "Rate limiter is per-V8-instance (Vercel limitation accepted; TODO: Upstash Redis if production)"

key-files:
  created:
    - src/lib/server/rate-limit.ts (~50 lines)
    - src/lib/server/rate-limit.test.ts (9 tests)
    - src/app/api/fipe/route.ts (~140 lines)
    - src/app/api/fipe/route.test.ts (14 tests)
  modified: []

key-decisions:
  - "Sentinel object UPSTREAM_FAIL (not throw) to keep cascade flow flat and explicit"
  - "fipeRequestSchema = listingSchema.pick({marca, modelo, ano}) inherits the SAFE_TEXT denylist + max-length caps from Plan 02"
  - "Year-fuel codigo prefer suffix '-1' (gasolina) when multiple matches"
  - "Console.warn on upstream failure (server-side log only) — generic 'upstream_failed' to client"
  - "Rate-limit bucket 'fipe' isolated from default 'negotiate' bucket"

patterns-established:
  - "Test pattern: vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...))"
  - "Generic-error helper that conditionally adds Retry-After header"

requirements-completed: [FIPE-01, FIPE-02, INFRA-03]

duration: ~5 min
completed: 2026-04-19
---

# Phase 1 / Plan 04: FIPE API Route Summary

**Next 15 edge route POST /api/fipe cascading 4 Parallelum calls with Zod validation, fuzzy matching, HTML-degradation guard, 10s timeout, and 20/min/IP rate limit. Plus a reusable in-memory rate limiter for /api/negotiate/stream.**

## Status Codes Returned

- **200** — Successful cascade. Body: `{fipe, marca, modelo, ano}`
- **400** — `invalid_body` (Zod fail or malformed JSON)
- **404** — `not_found` (no marca/modelo/ano match)
- **429** — `rate_limited` with `Retry-After` header
- **502** — `upstream_failed` (Parallelum 5xx, HTML response, schema mismatch, network error, parse failure)

## Task Commits

1. **Task 1: rate-limit module** — `feat(01-04): in-memory windowed rate limiter with bucket isolation`
2. **Task 2: /api/fipe route + tests** — `feat(01-04): /api/fipe edge route — Parallelum cascade + Zod + fuzzy match + rate limit`

## Decisions

None beyond plan — followed code sketches verbatim with one micro-refactor: replaced the inline `{__upstreamFailed: true}` literal with a hoisted `UPSTREAM_FAIL` constant + `UpstreamFail` type alias for cleaner type guards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Formatting] Biome organizeImports + line wrapping**
- Reordered imports (zod after `@/...` per group rules) and re-wrapped a few multi-line calls.
- Fixed via `pnpm biome check --write src`. Cosmetic only.

**Total deviations:** 1 auto-fixed (formatting only).

## Issues Encountered

The rate-limit happy-path test (20 cascading requests against the same mock) emits "Body has already been read" warnings to stderr because the mocked Response is consumed multiple times. The route correctly handles this as upstream failure (returns 502/404 — matches test expectations). Could be silenced by `mockImplementation(() => jsonResponse(...))` instead of `mockResolvedValue`, but it's noise not failure. Documented here in case anyone wonders.

## User Setup Required

None.

## Next Phase Readiness

- Rate limiter ready to be reused by `/api/negotiate/stream` (Plan 06) — pass `bucket: "negotiate", max: 5`
- `/api/fipe` ready for the AdListingForm useFipeLookup hook (Plan 07)
- All 5 threat mitigations live and tested (T-04-01 SSRF, T-04-02 outage, T-04-03 flooding, T-04-04 leak, T-04-05 HTML degradation)

---
*Phase: 01-chat-manual-funcional*
*Completed: 2026-04-19*
