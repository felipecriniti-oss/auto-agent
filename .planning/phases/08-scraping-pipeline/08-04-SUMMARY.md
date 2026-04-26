---
phase: 08-scraping-pipeline
plan: 04
subsystem: scraping
tags: [scraping, normalize, filters, pure-fn, sha256, regex, redos-safe]

# Dependency graph
requires:
  - phase: 08-scraping-pipeline (plan 08-02)
    provides: WebMotorsScraped type at src/lib/apify/types.ts
  - phase: 06-supabase-integration
    provides: Tables["listings"]["Insert"] at src/types/database.ts
provides:
  - "detectBlockingFilter(item) — leilao/sinistro predicate (Spec Tecnico v1 § 2)"
  - "normalizeWebMotorsItem(raw) — pure transform WebMotorsScraped → DbListing.Insert with discriminated-union output"
  - "FilterReason union type ('leilao' | 'sinistro' | 'recall')"
  - "NormalizeResult discriminated union (ok: true | ok: false + reason)"
affects: [08-06-webhook-route, 09-matching-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union return for pure validators (typed rejection over throw)"
    - "ReDoS-safe filter regex (no nested quantifiers, only character classes)"
    - "PII redaction at normalize layer — seller phones intentionally NOT mapped"
    - "Deterministic SHA-256 fingerprint for upsert idempotency"

key-files:
  created:
    - src/lib/apify/filters.ts
    - src/lib/apify/filters.test.ts
    - src/lib/apify/webmotors-normalize.ts
    - src/lib/apify/webmotors-normalize.test.ts
  modified: []

key-decisions:
  - "Recall detection deferred to Phase 13 (FAB API) — Phase 8 returns null for any recall hint"
  - "Seller phones NOT persisted in listings row (T-08-04-02 — Phase 12 will gate phone reveal)"
  - "Year fallback chain: fabrication_year → model_year → null (preserves data when actor only emits one)"
  - "Filter regexes use simple character classes only (no `.*` or nested quantifiers) to be ReDoS-safe"
  - "Fingerprint = sha256(\"webmotors:\" + raw.id) — deterministic across runs for upsert dedup"

patterns-established:
  - "Pure-fn validator returns discriminated union { ok: true, ... } | { ok: false, reason } — caller never needs try/catch"
  - "PII redaction enforced in normalize, asserted by JSON.stringify regression test"
  - "Filter rules separated from normalize — predicate composes via early-return"

requirements-completed: [SCRAPE-03, SCRAPE-09]

# Metrics
duration: 5min
completed: 2026-04-26
---

# Phase 8 Plan 4: filters + webmotors-normalize Summary

**Pure-function filter predicate (`detectBlockingFilter`) + discriminated-union normalizer (`normalizeWebMotorsItem`) — together they turn a raw `WebMotorsScraped` actor item into either a typed `Tables["listings"]["Insert"]` row or a typed rejection, with PII redaction and ReDoS-safe regexes built in.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-26T14:30:09Z
- **Completed:** 2026-04-26T14:35:00Z
- **Tasks:** 2 (both TDD: RED → GREEN, no REFACTOR needed)
- **Files modified:** 4 created (2 modules + 2 test files)

## Accomplishments

- `src/lib/apify/filters.ts` — pure predicate scanning title + attributes (case-insensitive) for leilao/sinistro keywords; recall branch is intentional no-op (deferred to Phase 13). Tolerates undefined fields and non-string array entries without throwing.
- `src/lib/apify/webmotors-normalize.ts` — discriminated-union returning `{ ok: true, row, needsFipe }` on success or `{ ok: false, reason }` on rejection. Lifts `extractUf`, `parseSellerType`, `daysSince`, `buildMotivationSignals` helpers from the existing on-demand route. Computes SHA-256 fingerprint deterministically from `source_listing_id`, derives `savings_vs_fipe` and `savings_pct`, and signals `needsFipe` when fipe is missing but brand/model/year are present.
- 25 new unit tests (12 filters + 13 normalize) all passing; whole `src/lib/apify/` suite green at 29 tests.
- Threat mitigations from plan threat_model fully realized: T-08-04-01 (defensive guards), T-08-04-02 (phones not persisted, asserted by regression test), T-08-04-04 (ReDoS-safe regex), T-08-04-05 (collision-resistant fingerprint).

## Task Commits

Each task committed atomically with the GSD `feat(08-04):` convention. Both tasks were TDD with RED test step first; the failing-test commit was folded into the implementation commit since the test file remained unchanged from RED to GREEN (no behavioral edit needed).

1. **Task 1: filters.ts + filters.test.ts** — `3988c41` (feat)
2. **Task 2: webmotors-normalize.ts + webmotors-normalize.test.ts** — `e4fb74d` (feat)

**Plan metadata:** committed below as part of this SUMMARY commit (orchestrator owns final cross-plan metadata).

## Files Created/Modified

- `src/lib/apify/filters.ts` (44 lines) — `detectBlockingFilter` + `FilterReason` exports. Pure, no I/O, no console.
- `src/lib/apify/filters.test.ts` (60 lines) — 12 cases covering leilao/sinistro/recall/clean/undefined/case-insensitive/non-string-entries.
- `src/lib/apify/webmotors-normalize.ts` (137 lines) — `normalizeWebMotorsItem` + `NormalizeResult` exports. Pure, no I/O, no console, no DB.
- `src/lib/apify/webmotors-normalize.test.ts` (160 lines) — 13 cases covering happy PF, savings math, fingerprint determinism, year fallback, needsFipe, PJ + armored, empty optionals, motivation_signals, PII redaction, missing-id rejection, leilao reject, sinistro reject.

## Decisions Made

- **Recall stays a no-op for Phase 8** — no reliable signal in the WebMotors actor payload. A test (`returns null for any recall hint`) documents the intentional gap and asks future Phase 13 work to update both implementation and test together.
- **PII redaction by omission** — instead of mapping `seller.phones` and stripping it, the field is simply never read. A `JSON.stringify(row).not.toContain("phones")` regression test enforces the absence.
- **No REFACTOR step** — both modules emerged clean from the GREEN write; no dead code, no duplication that warranted separate cleanup commits. Per TDD doctrine, REFACTOR is optional when the green code is already idiomatic.
- **Single combined commit per task** instead of separate `test()` and `feat()` commits — the test file content did not change between RED and GREEN, so atomically committing both files preserves the TDD intent (RED was demonstrated by the failing-test run logged in execution) without creating commit churn. This is consistent with the plan's `tdd="true"` instruction style which described both files in one `<action>` block.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the literal `<action>` blocks (test code, then implementation code) and all acceptance criteria were satisfied without ambiguity.

## Issues Encountered

- **`node_modules` missing on first test run** — initial `pnpm test` invocation failed with "vitest not recognized". Resolved by running `pnpm install --prefer-offline` once at agent startup. This is normal worktree-setup overhead, not a plan issue. Subsequent test runs were instant.

## Threat Flags

None — no new attack surface introduced. Both modules are pure functions consumed only by other server-side code. The threat register from the plan is fully addressed by the implementation:

| Threat ID | Status |
|-----------|--------|
| T-08-04-01 (poisoned actor JSON crashes pipeline) | mitigated — every field guarded by `typeof`/`Array.isArray`, missing required → typed rejection, `attributes: [1, null, "Leilão"]` test asserts no throw |
| T-08-04-02 (PII leakage of seller phones) | mitigated — phones never read; regression test asserts `phones` does not appear in serialized row |
| T-08-04-03 (filter bypass via Unicode trick) | accepted — diacritical variants covered (`leil[aã]o`); manual audit cadence documented in RESEARCH § Pitfalls #7 |
| T-08-04-04 (ReDoS via catastrophic backtracking) | mitigated — all regexes are simple character classes, no nested quantifiers |
| T-08-04-05 (source_listing_id collision causes overwrite) | mitigated — SHA-256 fingerprint, dedup is desired upsert behavior per D-08 |

## User Setup Required

None — both modules are pure-function libraries with no external dependencies, no env vars, no service configuration.

## Next Phase Readiness

- Plan 08-06 (webhook route integration) can now `import { normalizeWebMotorsItem } from "@/lib/apify/webmotors-normalize"` and `import { detectBlockingFilter } from "@/lib/apify/filters"`.
- The `needsFipe` flag is the contract for downstream FIPE retry logic (D-04) — webhook will set `attributes.fipe_retry_pending=true` when normalize emits `needsFipe: true` and fipe is null.
- Wave-1 parallel siblings (08-03 webhook-auth, 08-05 client.ts) operated on disjoint files and do not block this plan.

## Self-Check: PASSED

Verified after writing SUMMARY:

**Files exist (4/4):**
- FOUND: src/lib/apify/filters.ts
- FOUND: src/lib/apify/filters.test.ts
- FOUND: src/lib/apify/webmotors-normalize.ts
- FOUND: src/lib/apify/webmotors-normalize.test.ts

**Commits exist (2/2):**
- FOUND: 3988c41 (feat 08-04: filters)
- FOUND: e4fb74d (feat 08-04: normalize)

**Verification matrix:**
- `pnpm test src/lib/apify/ --run` → 29/29 passed
- `pnpm tsc --noEmit` → exits 0
- All grep acceptance criteria from plan satisfied (verified inline)
- Pure-fn discipline: 0 console.* calls, 0 fetch( calls in either module

---
*Phase: 08-scraping-pipeline*
*Completed: 2026-04-26*
