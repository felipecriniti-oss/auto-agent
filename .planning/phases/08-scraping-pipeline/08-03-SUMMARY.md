---
phase: 08-scraping-pipeline
plan: 03
plan_id: 08-03
slug: webhook-auth
title: webhook-auth.ts — timing-safe shared-secret + HMAC scaffold (D-01 revised)
subsystem: scraping-pipeline
tags: [scraping, apify, security, auth, timing-safe, tdd]
type: execute
wave: 1
status: complete
requirements_addressed: [SCRAPE-02]
dependency_graph:
  requires:
    - 08-02 (sets up Apify lib structure: types.ts, target-models.ts)
  provides:
    - "verifySharedSecret(headerValue, expectedSecret): boolean — for plan 08-06 webhook route + plan 08-07 cron route"
    - "verifyHmacSha256(rawBody, headerValue, secret): boolean — scaffolded for Phase 13 hardening; NOT yet wired"
  affects:
    - "src/app/api/scrape/webmotors/webhook/route.ts (will be edited in plan 08-06 to import verifySharedSecret)"
    - "src/app/api/cron/scrape-cleanup/route.ts (will be edited in plan 08-07 to import verifySharedSecret)"
tech_stack:
  added: []
  patterns:
    - "node:crypto timingSafeEqual + length pre-check (avoids Node throw on length mismatch)"
    - "TDD RED → GREEN with vitest"
key_files:
  created:
    - src/lib/apify/webhook-auth.ts
    - src/lib/apify/webhook-auth.test.ts
  modified: []
decisions:
  - "D-01 revised: shared-secret in custom header is the primary Apify auth pattern (Apify has no native HMAC support — verified at docs.apify.com); HMAC variant is scaffolded only"
  - "Length pre-check before timingSafeEqual is mandatory: timingSafeEqual throws on length-mismatched Buffers"
  - "Length leak from pre-check is acceptable — secret length is a fixed deployment constant, not a credential"
metrics:
  duration_minutes: 4
  completed_date: 2026-04-26
  tasks_completed: 1
  files_changed: 2
  tests_added: 16
---

# Phase 8 Plan 03: webhook-auth — Summary

Timing-safe shared-secret comparison helper plus an HMAC-SHA256 scaffold ready for Phase 13 hardening; both implemented via TDD with 16 vitest cases covering null/undefined/empty/equal/mismatch/length-diff/HMAC paths.

## Commits

| # | Hash | Type | Message |
|---|------|------|---------|
| 1 | `cca77ee` | test | add failing tests for webhook-auth helpers (RED) |
| 2 | `800dbaa` | feat | implement webhook-auth helpers (GREEN) |

## Files Created

| Path | Lines | Purpose |
|------|-------|---------|
| `src/lib/apify/webhook-auth.ts` | 55 | `verifySharedSecret` + `verifyHmacSha256` exports; both timing-safe with length pre-check |
| `src/lib/apify/webhook-auth.test.ts` | 79 | 16 vitest cases (8 for each function) covering all boundary inputs |

## Implementation Notes

### `verifySharedSecret(headerValue, expectedSecret)`
1. Returns `false` if either argument is falsy (null/undefined/empty).
2. UTF-8 encodes both into Buffers.
3. Returns `false` if lengths differ (avoids `timingSafeEqual` throw).
4. Returns `crypto.timingSafeEqual(provided, expected)`.

### `verifyHmacSha256(rawBody, headerValue, secret)`
1. Returns `false` if `headerValue` or `secret` is falsy.
2. Computes `createHmac("sha256", secret).update(rawBody).digest("hex")`.
3. Length-pre-check, then `timingSafeEqual` against header value.

Pure functions, no side effects, never throw on legitimate input.

## Verification Results

- ✅ `pnpm test src/lib/apify/webhook-auth.test.ts --run` — 16/16 tests passing (~13ms)
- ✅ `pnpm tsc --noEmit` — exit 0 (no type errors)
- ✅ `pnpm exec biome check src/lib/apify/webhook-auth.ts src/lib/apify/webhook-auth.test.ts` — clean
- ✅ All 7 grep acceptance criteria from plan satisfied (imports, exports, length pre-check, timingSafeEqual call, describe count = 2)
- ⚠️ `pnpm lint` (whole-src) reports 2 pre-existing errors in `src/components/forms/WishlistPreviewPane.tsx` — unrelated to this plan, out of scope (logged here for visibility, not fixed)

## TDD Gate Compliance

- ✅ RED commit (`cca77ee`, `test(08-03)`): test fails with `Failed to resolve import "./webhook-auth"`
- ✅ GREEN commit (`800dbaa`, `feat(08-03)`): all 16 tests pass
- ✅ No REFACTOR needed — implementation already minimal and idiomatic

## Deviations from Plan

None — plan executed exactly as written. The pre-existing lint failures in `WishlistPreviewPane.tsx` are not deviations; they are out of scope per the executor scope-boundary rule and predate this plan (Phase 7 MED-04 TODO).

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-08-03-01 (Spoofing) | mitigate | ✅ length pre-check + timingSafeEqual; covered by `"abc" vs "abd"` test |
| T-08-03-02 (Timing-attack secret recovery) | mitigate | ✅ `crypto.timingSafeEqual` is the Node stdlib primitive built for this |
| T-08-03-03 (Oversized header DoS) | mitigate | ✅ length mismatch returns false immediately; covered by `"a".repeat(200)` test |
| T-08-03-04 (HMAC variant wired prematurely) | accept | ✅ `verifyHmacSha256` exported but not imported by any route in Phase 8 (verified — only the test file imports it) |

No new threat surface introduced. No threat flags raised.

## Downstream Hooks

- **Plan 08-06** (webhook route) will replace `if (header !== secret)` plain compare with `verifySharedSecret(header, secret)`.
- **Plan 08-07** (cron cleanup route) will use the same helper for `Authorization: Bearer ${CRON_SECRET}` style auth.
- **Phase 13** (hardening) can swap `verifySharedSecret` for `verifyHmacSha256` without touching this module — the public surface is already in place.

## Self-Check: PASSED

- ✅ FOUND: src/lib/apify/webhook-auth.ts
- ✅ FOUND: src/lib/apify/webhook-auth.test.ts
- ✅ FOUND commit cca77ee (RED)
- ✅ FOUND commit 800dbaa (GREEN)
