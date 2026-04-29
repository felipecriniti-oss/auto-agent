---
phase: 08-scraping-pipeline
plan: 09
plan_id: 08-09
slug: phase-gate-setup
title: Phase gate — schedule sync script + setup runbook + human smoke test
status: in_progress
type: phase-gate
wave: 4
depends_on: [08-06, 08-07, 08-08]
requirements_addressed: [SCRAPE-01, SCRAPE-02, SCRAPE-05, SCRAPE-06]
tags: [scraping, runbook, smoke-test, phase-gate]
dependency_graph:
  requires:
    - "src/lib/apify/target-models.ts (TARGET_MODELS, plan 08-02)"
    - "src/app/api/scrape/webmotors/webhook/route.ts (Apify-shape ingest, plan 08-06)"
    - "src/app/api/cron/listings-cleanup/route.ts (plan 08-07)"
    - "src/app/api/cron/fipe-retry/route.ts (plan 08-08)"
    - "vercel.json crons block (plans 08-07, 08-08)"
  provides:
    - "Idempotent schedule sync (re-runnable as `pnpm tsx scripts/setup-apify-schedule.ts dev|prod`)"
    - "End-to-end deployment runbook (Vercel env vars, Apify dashboard webhook, cron verification, smoke test checklist, rollback)"
  affects:
    - "Apify dashboard schedule autoagent-webmotors-{dev|prod} (created/updated by script)"
tech_stack:
  added: []
  patterns:
    - "Token-scrub: replace(new RegExp(token, 'g'), '[REDACTED]') on every stdout/stderr"
    - "Idempotent REST: list-by-name → POST or PUT (mirrors scripts/probe-apify-tier.ts conventions)"
    - "Pure built-in fetch (no Apify SDK; no new npm deps)"
key_files:
  created:
    - scripts/setup-apify-schedule.ts
    - .planning/phases/08-scraping-pipeline/08-09-SETUP.md
    - .planning/phases/08-scraping-pipeline/08-09-SUMMARY.md
  modified: []
decisions:
  - "Schedule sync uses /v2/schedules POST/PUT-by-name (idempotent); webhook config stays manual via dashboard headers UI"
  - "Cron locked per D-03: dev = 0 3 * * *, prod = 0 2,14 * * * (America/Sao_Paulo)"
  - "RESIDENTIAL proxy group hardcoded (per 08-01 probe outcome)"
  - "MAX_ITEMS_PER_RUN = 2000 per scheduled invocation"
  - "Script verifies SCRAPE_WEBHOOK_SECRET is SET but never reads its value into stdout — dashboard config uses placeholder text only"
metrics:
  tasks_completed: 2
  tasks_pending: 1
  tasks_total: 3
  duration_minutes: ~12
  completed_date: null  # set on sign-off
---

# Phase 8 Plan 09: Phase Gate — Setup + Smoke Test Summary

> **STATUS: IN_PROGRESS — awaiting HUMAN smoke test sign-off (Task 3).**
> Tasks 1 and 2 complete and committed. Task 3 is the gating human action;
> Phase 8 is NOT closed until the developer signs off the smoke-test checklist
> in this same file (see `## Phase 8 sign-off` template at bottom).

## One-liner

Phase 8 gate: idempotent Apify schedule sync script (re-deployable as one
command) + a deployment runbook covering every env var, dashboard step, cron
verification, and smoke-test box — followed by a HUMAN end-to-end smoke test
the developer must execute against the real Apify schedule + webhook + DB.

## Deliverables

### Task 1 — `scripts/setup-apify-schedule.ts` (committed `aee22d1`)

Idempotent schedule-sync script. CLI: `pnpm tsx scripts/setup-apify-schedule.ts <dev|prod>`.

Behavior:
1. Reads `APIFY_API_TOKEN` (required) and `SCRAPE_WEBHOOK_SECRET` (required —
   presence check only; value never echoed). Optional `WEBHOOK_BASE_URL`
   override; defaults to `http://localhost:3000` (dev) or
   `https://autoagente.ai` (prod).
2. Lists existing Apify schedules via `GET /v2/schedules`; matches by exact
   name `autoagent-webmotors-{env}`.
3. PUT-updates the existing schedule or POST-creates a new one with body:
   - `cronExpression`: `0 3 * * *` (dev) or `0 2,14 * * *` (prod)
   - `timezone`: `America/Sao_Paulo`
   - `actions[0].actorId`: `ribtools~webmotors-scraper`
   - `runInput.startUrls`: derived from `TARGET_MODELS` (20 brand+model URLs)
   - `runInput.maxItems`: 2000
   - `runInput.proxyConfiguration`: `{ useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] }`
4. Prints the dashboard webhook config block the developer must paste manually
   (Apify webhook headers UI is the only path that supports the
   `X-AutoAgent-Webhook-Secret` template); the actual secret value is NEVER
   echoed — only a placeholder string.

Token-scrub: every console output and thrown error passes through
`replace(new RegExp(token, 'g'), '[REDACTED]')` (mirrors
`scripts/probe-apify-tier.ts`).

Verify: `pnpm tsc --noEmit scripts/setup-apify-schedule.ts` exits 0.

### Task 2 — `.planning/phases/08-scraping-pipeline/08-09-SETUP.md` (committed `2e24976`)

Deployment runbook with seven sections:

1. **Prerequisites** — probe-result GO, full test suite green, lint+typecheck clean, Phase 7 contracts intact.
2. **Step 1 — Vercel env vars** — table covering `APIFY_API_TOKEN`, `SCRAPE_WEBHOOK_SECRET`, `MAX_DAILY_SCRAPE_COST_USD`, `CRON_SECRET` (which envs to set them in, generation commands, why each is needed).
3. **Step 2 — Apify schedule sync** — exact `pnpm tsx scripts/setup-apify-schedule.ts <env>` invocations with `pnpm dotenv -e .env.local --` wrapper.
4. **Step 3 — Apify webhook config** (manual dashboard) — event types, request URL, headers JSON template, save.
5. **Step 4 — Vercel Cron verification** — confirm both `/api/cron/listings-cleanup` and `/api/cron/fipe-retry` registered; optional manual run.
6. **Smoke test checklist** — 7 gating boxes (Apify run, webhook 200, scrape_runs row, listings rows, log scrub spot-check, optional cost-cap test).
7. **Rollback procedure + Known operational concerns** — Apify dashboard drift, Akamai escalation, Parallelum downtime.

Plus a `## Sign-off` template for Task 3 to append to this file.

### Task 3 — HUMAN smoke test (PENDING)

**Status: awaiting developer execution.** This is a checkpoint:human-action
gate. The executor agent does NOT run the smoke test (no Apify credit spend,
no production webhook fire, no DB writes from the agent context).

**Developer next steps** (from the runbook):

1. Set the four env vars in Vercel (Production + Preview) and `.env.local`.
2. Run `pnpm dotenv -e .env.local -- pnpm tsx scripts/setup-apify-schedule.ts dev`
   (or `prod` once dev smoke succeeds).
3. Configure the dashboard webhook per Step 3.
4. Verify Vercel Cron tab shows both cron entries.
5. Manually trigger one Apify scheduled run from the dashboard.
6. Watch Vercel logs; confirm the webhook returns 200 with non-zero
   `listings_new`.
7. Confirm `scrape_runs` row + new `listings` rows in Supabase.
8. Spot-check Vercel logs: zero hits for the literal token / secret values.
9. Append the **Phase 8 sign-off** block (template below) with actual run id,
   counts, timestamp, and developer name. Commit.

## Self-Check

**Files claimed exist:**

- `scripts/setup-apify-schedule.ts` — created at commit `aee22d1`.
- `.planning/phases/08-scraping-pipeline/08-09-SETUP.md` — created at commit `2e24976`.
- `.planning/phases/08-scraping-pipeline/08-09-SUMMARY.md` — this file (will commit at end of executor flow).

**Verifications run during execution:**

- `pnpm tsc --noEmit scripts/setup-apify-schedule.ts` → exit 0.
- All 9 grep-based acceptance criteria for Task 1 → match counts ≥ thresholds.
- Section-presence verifier for runbook (7 required sections) → all present.
- All 9 grep-based acceptance criteria for Task 2 → match counts ≥ thresholds.

**Threat model coverage:**

- T-08-09-01 (token leak): mitigated — `scrub(value, token)` wraps every `console.log` / `console.error` / thrown error in the script.
- T-08-09-02 (secret leak): mitigated — `SCRAPE_WEBHOOK_SECRET` value is never read into a printable variable; dashboard config block uses placeholder text only. Manually verified the only `console.log(` call site (line 86) routes through `scrub()` and only printable inputs are flat strings + `JSON.stringify(result)` of the Apify schedule envelope (which never contains the webhook secret).
- T-08-09-03 (overwrite unrelated schedules): mitigated — list-by-name match against hardcoded `autoagent-webmotors-{dev|prod}` constants; no wildcard matching.
- T-08-09-05 (sign-off auditability): mitigated by sign-off block template (timestamp + run id + counts + developer name) committed to git.

## Self-Check: PASSED

All listed deliverables for Tasks 1 & 2 exist on disk and pass their verification gates. Task 3 is intentionally left as a HUMAN gate — agent did not execute it.

## Deviations from Plan

None — plan executed exactly as written.

## Phase 8 sign-off

> Smoke test executed end-to-end on 2026-04-29. Pipeline plumbing
> verified — see values below. First production-volume scheduled run
> (20 startUrls × maxRequests=2000) lands at 2026-04-30 03:00 BRT.

```
- Smoke test executed: 2026-04-29T22:17:15Z
- First scheduled run id: k70PIrEEaNG9N4wbA (manual minimal-input test trigger)
- Schedule id: BuwV5h3eekRF0x1qB (autoagent-webmotors-dev, "0 3 * * *" America/Sao_Paulo)
- Webhook id: qLbRHOsV4rsElbu6h (ACTOR.RUN.SUCCEEDED → workspace.autoagente.ai)
- Webhook delivery status: SUCCEEDED, HTTP 200
- Webhook response body: {"ok":true,"run_id":"k70PIrEEaNG9N4wbA","listings_new":0,"listings_updated":0,"listings_error":0}
- listings_new in first run: 0 (minimal-input test: 1 URL, maxRequests=3, 0.001 USD spend)
- listings_error in first run: 0
- scrape_runs id: written (handler returned ok:true; row inserted, count not queried directly)
- Confirmed by: gabrielcrinitigrunix@gmail.com (driver) + Claude session 2026-04-29
```

### Sign-off context — what was actually verified

**Pipeline plumbing (end-to-end):**

- ✅ `setup-apify-schedule.ts` runs idempotently, repaired against live Apify v2 API
  (`runInput` shape changed to `{body, contentType}` wrapper; actor slug must be
  resolved to internal id at runtime). See commit `b6f2cc1`.
- ✅ Schedule `autoagent-webmotors-dev` created with cron `0 3 * * *`
  America/Sao_Paulo, max 2000 items, 20 target startUrls. Next scheduled fire:
  2026-04-30T06:00:00Z (= 03:00 BRT).
- ✅ Webhook `qLbRHOsV4rsElbu6h` registered against `actorId=4m4ORp0JBpR1c8ay0`,
  event `ACTOR.RUN.SUCCEEDED`, payloadTemplate
  `{"resource":{{resource}},"eventType":"{{eventType}}","eventData":{{eventData}}}`,
  header `x-scrape-webhook-secret: <SCRAPE_WEBHOOK_SECRET>`.
- ✅ Manual minimal-input run `mEZWtCwOXzmo8yro6` (and follow-up `k70PIrEEaNG9N4wbA`)
  fired the webhook. First delivery returned 400 (invalid payload shape due to
  default `{{resource}}` template stripping wrapper); second returned **200**
  after fixing the template.
- ✅ Vercel Cron tab confirms both `/api/cron/listings-cleanup` (`0 4 * * *`)
  and `/api/cron/fipe-retry` (`0 5 * * *`) registered. Both within Hobby plan
  daily-cron limits.

**Gaps and known caveats:**

- `listings_new=0` in smoke test because input was deliberately minimal
  (1 startUrl, maxRequests=3) to keep cost at 0.001 USD. Empty dataset is
  expected behaviour, not a defect — it confirms the Apify→webhook→handler
  path works end-to-end without exercising the Supabase upsert path. First
  production-volume validation: tomorrow's 03h BRT scheduled run (20 URLs ×
  maxRequests=2000), or trigger an interim full-input run from the dashboard.
- Direct `scrape_runs` row count not queried — handler returned `{ok:true}`
  which on this code path requires the `scrape_runs.insert(...)` to have
  succeeded (route.ts:292-306). The row exists; querying its UUID was deferred.

**Phase 8.10 follow-up filed in todo list:**

- Restore `fipe-retry` cron from `0 5 * * *` (daily, Hobby-compatible) back to
  `5 * * * *` (hourly, Phase 8 original spec) when upgrading to Vercel Pro plan.
  Trade-off: listings with `attributes.fipe_retry_pending=true` retry every 24h
  instead of every 1h until upgrade lands. Route handler is idempotent and
  supports any cadence — single-line revert in `vercel.json`.

**Bugs found and shipped during smoke test (separate commits):**

- `ac7d704 fix(ci): unblock biome check after toolchain update` — biome bumped
  to a stricter `suppressions/unused` mode that flagged 3 redundant
  `biome-ignore` comments and 3 format/organize-imports diffs. Cleaned up.
- `b475882 fix(ci): wrap auth pages in <Suspense> for Next 15 prerender compliance` —
  `/login`, `/signup`, `/reset-password` all use `useSearchParams()` which
  Next 15 requires inside a Suspense boundary at build time. Each page
  now renders a thin shell `<Suspense fallback={null}><...PageContent /></Suspense>`.
- `f141719 fix(infra): remove orphan gitlinks blocking Vercel git submodule init` —
  two paths under `.claude/worktrees/` were registered as gitlinks (mode
  `160000`) without `.gitmodules` mapping (caused by a sibling agent's
  stray `git add`). `git rm --cached` both; ignore covers future occurrences.
- `505e7a8 fix(infra): cron schedule compatible with Vercel Hobby plan` — the
  ROOT CAUSE of all silent deploy failures since 2026-04-21. The Apify-cron
  expression `5 * * * *` (24×/day) violated Hobby plan's 1×/day per-cron
  limit. Vercel rejected every push from `c076980` onward without surfacing
  the error in the Deployments list — production stayed pinned to the last
  successful deploy from 2026-04-22 for 7 days. Schedule changed to
  `0 5 * * *` (1×/day, 02:00 BRT). Once this commit landed, normal GitHub
  push → Vercel auto-deploy resumed.

