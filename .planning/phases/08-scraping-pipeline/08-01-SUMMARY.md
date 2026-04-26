---
phase: 08-scraping-pipeline
plan: 01
slug: apify-tier-probe
status: in_progress
completed: 2026-04-26T03:09:14Z
subsystem: scraping
tags: [scraping, apify, probe, blocker, wave-0]
requirements_addressed: [SCRAPE-01]
dependency_graph:
  requires: []
  provides:
    - "scripts/probe-apify-tier.ts: idempotent Apify residential-proxy tier probe (Wave 0 BLOCKER resolver)"
  affects:
    - "Phase 8 Wave 1 (plans 02-09): cannot proceed until human runs probe + commits 08-01-PROBE-RESULT.md with Decision: GO"
tech_stack:
  added: []
  patterns:
    - "Apify REST: POST /v2/acts/{actor}/runs + poll /v2/actor-runs/{id} until terminal status"
    - "Token-scrub on every console output via String(x).replace(new RegExp(token, 'g'), '[REDACTED]')"
    - "AbortSignal.timeout for per-fetch deadline + manual wall-clock budget for total run polling"
    - "process.exit(0|1|2) — distinct codes for GO / HALT / missing-token"
key_files:
  created:
    - scripts/probe-apify-tier.ts
  modified: []
decisions:
  - "Use built-in fetch (no apify-client npm dep) — keeps probe surface minimal and matches existing route.ts:202 convention"
  - "Hardcode TEST_URL to one brand+model (Honda Civic) and MAX_ITEMS=10 — caps cost at ~$0.01 per probe run"
  - "Wall-clock TIMEOUT_MS=180_000 (3 min) — Apify residential proxy + WebMotors render typically completes well under 60s; 3 min is generous safety budget"
  - "Probe is non-interactive: human MUST run it themselves (Task 2 checkpoint:human-action) — orchestrator/agent will not invoke it"
metrics:
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 0
  duration_minutes: ~3
  awaiting_human: true
---

# Phase 8 Plan 01: Apify tier probe — verify residential proxy access — Summary

One-shot Apify residential-proxy probe script delivered. Phase 8 Wave 1 is **BLOCKED** until the human operator runs the probe and commits `08-01-PROBE-RESULT.md` with an explicit `Decision: GO` line.

## Status: IN PROGRESS

| Task | Status | Owner | Result |
|------|--------|-------|--------|
| Task 1 — Write the probe script | DONE | Agent | `scripts/probe-apify-tier.ts` committed (9761a61); `pnpm tsc --noEmit` exits 0; all 9 grep-based acceptance criteria match |
| Task 2 — Run probe + record GO/HALT | AWAITING HUMAN ACTION | Human | Cannot be automated — only the human possesses the live `APIFY_API_TOKEN` and authority to commit a `Decision: GO\|HALT` to `08-01-PROBE-RESULT.md` |

## What Was Built

A standalone Node 22+ TypeScript script (`scripts/probe-apify-tier.ts`) that:

1. Reads `process.env.APIFY_API_TOKEN`; exits 2 with `MISSING APIFY_API_TOKEN` on stderr if absent.
2. POSTs ONE actor run to `https://api.apify.com/v2/acts/ribtools~webmotors-scraper/runs` with body:
   ```json
   {
     "startUrls": [{ "url": "https://www.webmotors.com.br/carros/estoque?marca=honda&modelo=civic" }],
     "maxItems": 10,
     "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
   }
   ```
3. Detects free-tier signal on a 402/403 response containing "RESIDENTIAL" / "plan" / "upgrade" → prints `RESULT: HALT — account does not have residential proxy access` and exits 1.
4. On a 2xx, polls `GET /v2/actor-runs/{runId}` every 5s (max 3 min wall-clock) until status ∈ {SUCCEEDED, FAILED, ABORTED, TIMED-OUT}.
5. On `SUCCEEDED`: GETs the dataset (`?clean=true&limit=10`), counts items, prints:
   ```
   RESULT: GO
   status=SUCCEEDED
   itemCount=<N>
   usageTotalUsd=<value or null>
   statusMessage=<value>
   ```
   Exits 0.
6. On any other terminal status or wall-clock timeout: prints `RESULT: HALT` with status + statusMessage, exits 1.
7. Every `console.log` / `console.error` / thrown error passes through `String(x).replace(new RegExp(token, "g"), "[REDACTED]")` before being printed.

## Verification Performed (Task 1)

- `pnpm tsc --noEmit scripts/probe-apify-tier.ts` → exit 0
- `pnpm tsc --noEmit` (project-wide) → exit 0 (no regression introduced)
- 9/9 grep acceptance criteria from the plan match:
  - `apifyProxyGroups: ["RESIDENTIAL"]` ✓
  - `ribtools~webmotors-scraper` ✓
  - `replace(new RegExp(token` (token-scrub present) ✓
  - `process.exit(2)` (missing-token branch) ✓
  - `process.exit(1)` (HALT branches — 8 occurrences) ✓
  - `RESULT: GO` ✓
  - `RESULT: HALT` ✓
  - `MAX_ITEMS = 10` ✓
  - `https://api.apify.com/v2` ✓

## Threat Model Compliance

All four threats from the plan's `<threat_model>` are mitigated as planned:

| Threat ID | Mitigation Implemented |
|-----------|------------------------|
| T-08-01-01 (Information Disclosure — token leak) | Every `console.log` / `console.error` / thrown error wrapped in `scrub(value, token)` helper that runs `String(x).replace(new RegExp(token, "g"), "[REDACTED]")`. Catch-all `main().catch(...)` also scrubs. |
| T-08-01-02 (DoS / cost runaway) | Hardcoded `MAX_ITEMS = 10`, `TIMEOUT_MS = 180_000` (3 min), single `TEST_URL`. Worst-case cost ≈ $0.01 USD. |
| T-08-01-03 (Elevation via committed secret) | Token read from `process.env.APIFY_API_TOKEN` only — never written to source. PROBE-RESULT.md template (Task 2) records only runId / status / itemCount / usageTotalUsd / statusMessage. |
| T-08-01-04 (Tampering — false GO on FAILED run) | `RESULT: GO` emitted only when `lastRun.status === "SUCCEEDED"` (strict equality at line 263). All other terminal statuses fall through to the HALT branch at lines 305-313. |

## Deviations from Plan

**None — plan executed exactly as written.** Specifically:

- All literal constant names and values match the plan verbatim (`APIFY_BASE`, `ACTOR`, `TEST_URL`, `MAX_ITEMS = 10`, `POLL_INTERVAL_MS = 5_000`, `TIMEOUT_MS = 180_000`).
- Body shape matches the plan exactly.
- Free-tier-signal detection uses the exact substring set: `"RESIDENTIAL"` / `"plan"` / `"upgrade"`.
- Token-scrub regex matches the plan-specified pattern verbatim.
- No npm dependencies added (built-in `fetch` only).
- Header `X-AutoAgent-Probe` was deliberately NOT added (Apify expects token in query string per existing convention; adding custom headers risks rejection).

## Authentication / Human-Action Gates

**Task 2 is a `checkpoint:human-action` gate by design.** This is normal flow, not a deviation:

- The probe must be executed against the user's actual Apify account.
- Only the human possesses the live `APIFY_API_TOKEN` (it is NOT committed to repo and the agent has no authority to invoke billed external APIs autonomously).
- Only the human can confirm Apify console billing tier (`https://console.apify.com/billing`) and check the manual confirmation box in PROBE-RESULT.md.
- Only the human can commit the GO/HALT decision (`chore(phase-08): apify tier probe — <GO|HALT>`).

## Awaiting Human Action — Task 2

Open a terminal at the repo root and run:

```bash
# If APIFY_API_TOKEN is in .env.local:
pnpm dotenv -e .env.local -- pnpm tsx scripts/probe-apify-tier.ts

# Otherwise, with token exported in shell:
pnpm tsx scripts/probe-apify-tier.ts
```

Wait up to 3 minutes. Watch stdout for either `RESULT: GO` or `RESULT: HALT`.

Then create `.planning/phases/08-scraping-pipeline/08-01-PROBE-RESULT.md` per the template in the plan (Task 2 `<how-to-verify>` step 4), commit `scripts/probe-apify-tier.ts` (already committed) and `08-01-PROBE-RESULT.md` together.

**Resume signal:** Reply `GO` if probe passed and PROBE-RESULT.md is committed with `Decision: GO`. Reply `HALT` if blocked.

## Self-Check: PASSED

Commit verification:
- `9761a61` — `feat(08-01): add Apify tier probe script for residential proxy access` — FOUND in `git log --oneline`

File existence verification:
- `scripts/probe-apify-tier.ts` — FOUND (328 lines, committed)
- `.planning/phases/08-scraping-pipeline/08-01-PROBE-RESULT.md` — DELIBERATELY NOT created (Task 2 is human's responsibility per plan)

Acceptance criteria verification:
- All 9 grep-based criteria match (see "Verification Performed" above)
- `pnpm tsc --noEmit scripts/probe-apify-tier.ts` exits 0
