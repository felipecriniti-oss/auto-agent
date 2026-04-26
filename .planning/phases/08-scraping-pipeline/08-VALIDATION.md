---
phase: 08
slug: scraping-pipeline
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-25
last_updated: 2026-04-25
---

# Phase 08 — Validation Strategy

> Per-phase validation contract. Researcher designed a 16-test Wave 0 backlog;
> planner has populated the per-task map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.x (already installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test src/lib/apify --run` (per-area) |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~12s full / ~2s per-area |

---

## Sampling Rate

- **After every task commit:** Run quick area test
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite green + `pnpm typecheck` + `pnpm lint`
- **Max feedback latency:** 12s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-T1 | 08-01 | 0 | SCRAPE-01 | T-08-01-01..04 | Probe script — token scrub on every output; cost-bounded (max_items=10) | typecheck | `pnpm tsc --noEmit scripts/probe-apify-tier.ts` | NEW | ⬜ pending |
| 08-01-T2 | 08-01 | 0 | SCRAPE-01 | — | HUMAN — execute probe + record GO/HALT | manual | (developer runs probe and commits 08-01-PROBE-RESULT.md) | NEW | ⬜ pending |
| 08-02-T1 | 08-02 | 0 | SCRAPE-01, SCRAPE-03 | T-08-02-01..03 | Static config — TARGET_MODELS frozen length=20, brand+model unique, URL pattern validated | unit | `pnpm test src/lib/apify/target-models.test.ts --run` | NEW | ⬜ pending |
| 08-02-T2 | 08-02 | 0 | SCRAPE-01 | — | Type relocation — zero behavioral change to existing on-demand route | regression | `pnpm test src/app/api/scrape/webmotors/route.test.ts --run` | EXISTING | ⬜ pending |
| 08-03-T1 | 08-03 | 1 | SCRAPE-02 | T-08-03-01..04 | Auth: `crypto.timingSafeEqual` after length pre-check; null/empty/length-diff all return false without throwing | unit | `pnpm test src/lib/apify/webhook-auth.test.ts --run` | NEW | ⬜ pending |
| 08-04-T1 | 08-04 | 1 | SCRAPE-09 | T-08-04-03..04 | Filtros eliminatorios — pure regex predicate; ReDoS-safe; tolerates non-string array entries | unit | `pnpm test src/lib/apify/filters.test.ts --run` | NEW | ⬜ pending |
| 08-04-T2 | 08-04 | 1 | SCRAPE-03 | T-08-04-01..02, 05 | Pure normalize: discriminated-union output; PII (phones) NOT mapped; deterministic SHA-256 fingerprint | unit | `pnpm test src/lib/apify/webmotors-normalize.test.ts --run` | NEW | ⬜ pending |
| 08-05-T1 | 08-05 | 1 | SCRAPE-02 | T-08-05-01..06 | Apify REST: token-scrub on throw; AbortSignal forwarded; AsyncGenerator never loads full dataset; HTTPS only | unit (vi.stubGlobal fetch) | `pnpm test src/lib/apify/client.test.ts --run` | NEW | ⬜ pending |
| 08-06-T1 | 08-06 | 2 | SCRAPE-02 | T-08-06-01, 10 | Discriminator + verifySharedSecret wired; Phase 7 contract preserved | integration | `pnpm test src/app/api/scrape/webmotors/webhook/route.test.ts --run` | EXTEND | ⬜ pending |
| 08-06-T2 | 08-06 | 2 | SCRAPE-02, 04, 05, 08, 09 | T-08-06-02..09 | Cost cap rejects before Apify call (test asserts `getActorRun NOT called`); scrape_runs lifecycle (insert running → update completed); FIPE failure → fipe_retry_pending=true; sinistro/leilao filtered before upsert; token-scrub on crash | integration | `pnpm test src/app/api/scrape/webmotors/webhook/route.test.ts src/lib/matching/ --run` | EXTEND | ⬜ pending |
| 08-07-T1 | 08-07 | 3 | SCRAPE-06 | T-08-07-01, 03..06 | TTL 72h via `lt(last_scraped_at, cutoff)`; exclude already-removed; `select("id")` only (no PII leak); CRON_SECRET timing-safe | unit (mocked supabase) | `pnpm test src/app/api/cron/listings-cleanup/route.test.ts --run` | NEW | ⬜ pending |
| 08-07-T2 | 08-07 | 3 | SCRAPE-06 | T-08-07-02 | vercel.json valid + cron entry present | json-validity | `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` | EXTEND | ⬜ pending |
| 08-08-T1 | 08-08 | 3 | SCRAPE-04 | T-08-08-01..07 | Chunked CHUNK=10 (test asserts peak ≤ 10); MAX_PER_RUN=100 cap; clears fipe_retry_pending on success; leaves row alone on failure; only `listings` table touched | unit (mocked supabase + fetch) | `pnpm test src/app/api/cron/fipe-retry/route.test.ts --run` | NEW | ⬜ pending |
| 08-08-T2 | 08-08 | 3 | SCRAPE-04 | — | vercel.json has hourly entry | json-validity | `node -e "...path==='/api/cron/fipe-retry'..."` | EXTEND | ⬜ pending |
| 08-09-T1 | 08-09 | 4 | SCRAPE-01 | T-08-09-01..04 | Schedule sync — token-scrub; webhook secret value NEVER echoed (placeholder text only); idempotent PUT-by-name | typecheck | `pnpm tsc --noEmit scripts/setup-apify-schedule.ts` | NEW | ⬜ pending |
| 08-09-T2 | 08-09 | 4 | SCRAPE-01..06 | T-08-09-05 | Runbook section completeness | structural-grep | (verify command in plan 08-09 Task 2) | NEW | ⬜ pending |
| 08-09-T3 | 08-09 | 4 | SCRAPE-01..09 | T-08-09-06 | HUMAN smoke test — real Apify run → webhook → DB; zero token leaks in Vercel logs | manual + sign-off | (developer signs off in 08-09-SUMMARY.md) | NEW | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per RESEARCH.md §Validation Architecture (16-test backlog):

- [ ] `src/lib/apify/types.ts` — moved + re-exported in plan 08-02 (no test file; consumed via webmotors-normalize tests)
- [ ] `src/lib/apify/webmotors-normalize.test.ts` — listing transform (price, km, UF, motivation_signals) — plan 08-04
- [ ] `src/lib/apify/webmotors-normalize.test.ts` includes fingerprint determinism case — plan 08-04 Task 2
- [ ] `src/lib/apify/cost-cap` — implemented inline in webhook route + tested via `apify_run shape — cost_cap` describe — plan 08-06
- [ ] `src/lib/apify/webhook-auth.test.ts` — shared-secret constant-time compare (D-01 revised) — plan 08-03
- [ ] `src/lib/apify/client.test.ts` — Apify REST `/actor-runs/{id}` + `/datasets/{id}/items` paginated — plan 08-05
- [ ] `src/lib/apify/target-models.test.ts` — D-06 lista shape + uniqueness — plan 08-02
- [ ] `src/app/api/scrape/webmotors/webhook/route.test.ts` — discriminator (Apify metadata vs Phase 7 stub array), HMAC/secret reject paths, idempotency — plan 08-06
- [ ] `src/app/api/cron/listings-cleanup/route.test.ts` — 72h TTL UPDATE query + Vercel cron auth — plan 08-07
- [ ] `src/app/api/cron/fipe-retry/route.test.ts` — D-04 retry queue (insert null + flag → cron picks up) — plan 08-08
- [ ] scrape_runs lifecycle — covered inline in plan 08-06 Task 2 ingest test
- [ ] filters.test.ts — sinistro/leilao keyword detection — plan 08-04 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Plan / Test Instructions |
|----------|-------------|------------|--------------------------|
| Apify Scheduled Run trigger fires webhook | SCRAPE-06 | Requires real Apify account + dashboard config | Plan 08-09 — runbook Step 3 + smoke-test checklist |
| Apify residential proxy bypasses WebMotors Akamai | SCRAPE-01 | Requires Apify Starter+ tier (open question A1) | Plan 08-01 — probe script + GO/HALT decision |
| Cost cap kicks in at $50 USD aggregate (real DB) | SCRAPE-08 | Requires accumulating real cost in scrape_runs.cost_usd | Plan 08-09 — runbook smoke-test checklist (optional cost-cap test step) |
| FIPE retry cron picks up null entries (real DB) | SCRAPE-04 | Requires Vercel Cron infra | Plan 08-09 — Step 4 cron verification |
| Stale cleanup marks listings status=removed (real DB) | SCRAPE-06 | Requires time-shifted data | Plan 08-09 — Step 4 cron verification |
| Token-scrub holds in production logs | T-08-05-01..02, T-08-06-03 | Vercel logs only inspectable post-deploy | Plan 08-09 — runbook smoke-test checklist (Vercel log grep) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner — 2026-04-25
