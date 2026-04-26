---
phase: 08-scraping-pipeline
plan: 09
type: runbook
created: 2026-04-26
---

# Phase 8 — Deployment Runbook

> Read this end-to-end before pushing the Phase 8 PR to production. The Apify
> schedule + webhook config is the ONE part of Phase 8 that lives outside git;
> losing the dashboard config breaks production silently.

## Prerequisites

- [ ] Plan 08-01 probe returned `Decision: GO` (`.planning/phases/08-scraping-pipeline/08-01-PROBE-RESULT.md`).
- [ ] All Phase 8 tests pass: `pnpm test --run` exits 0.
- [ ] Whole-repo typecheck + lint green: `pnpm tsc --noEmit && pnpm lint`.
- [ ] Phase 7 cross-phase contract tests still pass: `pnpm test src/lib/matching/ --run`.

## Step 1 — Vercel env vars

Add these to Vercel dashboard (Settings → Environment Variables):

| Name | Value | Why | Required |
|------|-------|-----|----------|
| `APIFY_API_TOKEN` | (from Apify console → Account → Integrations) | Apify REST calls + schedule sync | YES |
| `SCRAPE_WEBHOOK_SECRET` | Generate with `openssl rand -base64 32` | Webhook auth (X-AutoAgent-Webhook-Secret header) | YES |
| `MAX_DAILY_SCRAPE_COST_USD` | `50` (default — omit unless overriding) | D-02 cost cap | NO |
| `CRON_SECRET` | Generate with `openssl rand -base64 32`; reuse if already set from Phase 6/7 | Vercel Cron auth on listings-cleanup + fipe-retry | YES |

Add to BOTH "Production" and "Preview" environments. The "Development" environment is fine without them — local dev tests use mocked clients.

Mirror the same values into `.env.local` on your developer machine so the sync
script in Step 2 can authenticate against Apify.

## Step 2 — Apify schedule sync

Run from your local machine after the env vars above are set in `.env.local`:

```bash
# Dev (1 run/day at 03:00 BRT)
pnpm dotenv -e .env.local -- pnpm tsx scripts/setup-apify-schedule.ts dev

# Prod (2 runs/day at 02:00 + 14:00 BRT)
pnpm dotenv -e .env.local -- pnpm tsx scripts/setup-apify-schedule.ts prod
```

Expected output: a JSON dump of the created/updated schedule + a "configure the webhook" instruction block.

Re-running is safe — the script is idempotent (PUT-by-name).

## Step 3 — Apify webhook config (manual, dashboard)

Per the script's printed instructions:

1. Open https://console.apify.com/schedules — find `autoagent-webmotors-prod` (or `-dev`).
2. Click into the schedule → "Webhooks" tab → "Add webhook".
3. Configure:
   - Event types: `ACTOR.RUN.SUCCEEDED` (only — do NOT enable FAILED/ABORTED, we don't have a path for those yet)
   - Request URL: `https://autoagente.ai/api/scrape/webmotors/webhook` (prod) or your dev URL
   - Headers (JSON template):
     ```json
     {
       "Content-Type": "application/json",
       "X-AutoAgent-Webhook-Secret": "<paste the SCRAPE_WEBHOOK_SECRET value here>"
     }
     ```
   - Payload template: leave default (Apify sends `{ resource: { id }, eventType, ... }`).
4. Save.

## Step 4 — Vercel Cron verification

After deploy:

1. Vercel Dashboard → Project → Cron Jobs tab.
2. Verify two entries are listed:
   - `/api/cron/listings-cleanup` — Daily, 04:00 UTC
   - `/api/cron/fipe-retry` — Hourly, minute 5
3. Optionally: trigger each manually via the Vercel UI's "Run now" button. Expected:
   - listings-cleanup: 200 + `{ "removed": 0 }` (zero rows are stale yet on a fresh deploy)
   - fipe-retry: 200 + `{ "processed": 0, "succeeded": 0, "failed": 0 }`

## Smoke test checklist

This is the phase gate. Do NOT mark Phase 8 complete until ALL of these are checked.

- [ ] Manually trigger one Apify scheduled run (Apify Dashboard → schedule → "Run now").
- [ ] Watch Vercel logs (`vercel logs --follow` or Dashboard → Functions → /api/scrape/webmotors/webhook).
- [ ] Within 5 minutes, observe a single `200` log entry for the webhook with non-zero `listings_new` in the response body.
- [ ] In Supabase Dashboard → Table Editor → `scrape_runs`: confirm one new row with `status='completed'`, populated `cost_usd`, `listings_new > 0`.
- [ ] In Supabase Dashboard → Table Editor → `listings`: confirm new rows appear with `source='webmotors'` and recent `last_scraped_at`.
- [ ] Token-scrub spot check: search Vercel logs for the literal value of `APIFY_API_TOKEN` and `SCRAPE_WEBHOOK_SECRET`. Both MUST return zero hits. (If either appears, file an immediate issue and rotate the secret.)
- [ ] Cost cap test (optional, careful): temporarily set `MAX_DAILY_SCRAPE_COST_USD=0.01` in Vercel preview env, manually post a fake Apify-shape webhook with a valid secret, expect 429.

## Rollback procedure

If a scheduled run causes problems:

1. Apify Dashboard → schedule → toggle "Enabled" off. (Stops new runs immediately.)
2. If listings table is corrupted: `UPDATE listings SET status='removed' WHERE last_scraped_at > '<timestamp of bad run>'`. (Soft delete — Phase 9 matching skips status='removed' per existing engine.ts contract.)
3. The webhook route stays enabled but receives no traffic. The cron jobs continue running benignly.
4. Investigate via `scrape_runs` history (filter `status='failed'` or sort by `listings_error DESC`).

## Known operational concerns

- **Apify dashboard config drift:** The webhook URL + headers config is NOT in git. If someone edits or deletes it in the dashboard, the Apify run still SUCCEEDS but our webhook never fires → silent ingest gap. Mitigation: re-run `setup-apify-schedule.ts` after any dashboard change; the script does not (yet) restore webhook config — that step remains manual until Phase 13.
- **Akamai escalation:** If WebMotors deploys a stricter anti-bot upgrade, the ribtools actor may break. Watch for `scrape_runs.listings_new == 0` for 3 consecutive runs; that's the warning signal. Mitigation: contact actor maintainer or rotate to a different actor.
- **Parallelum FIPE downtime:** D-04 retry queue absorbs short outages (<24h). Sustained outages > 24h grow the queue unbounded; consider a Phase 13 max-age purge.

## Sign-off

After all smoke-test boxes are checked, append to `08-09-SUMMARY.md`:

```
## Phase 8 sign-off

- Smoke test executed: <ISO timestamp>
- First scheduled run id: <Apify run id>
- listings_new in first run: <N>
- listings_error in first run: <N>
- scrape_runs id: <UUID>
- Confirmed by: <developer name>
```
