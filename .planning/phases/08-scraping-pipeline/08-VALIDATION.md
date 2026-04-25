---
phase: 08
slug: scraping-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 08 — Validation Strategy

> Per-phase validation contract. Researcher designed a 16-test Wave 0 backlog;
> planner will populate the per-task map below.

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

*(Populated by planner during plan generation. Each task gets a row.)*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | SCRAPE-01..09 | T-08-01..N | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per RESEARCH.md §Validation Architecture (16-test backlog):

- [ ] `src/lib/apify/types.test.ts` — actor schema + webhook payload types
- [ ] `src/lib/apify/webmotors-normalize.test.ts` — listing transform (price, km, UF, motivation_signals)
- [ ] `src/lib/apify/fingerprint.test.ts` — SHA-256 fingerprint dedup contract
- [ ] `src/lib/apify/cost-cap.test.ts` — D-02 hard-kill aggregate query + 429 path
- [ ] `src/lib/apify/webhook-auth.test.ts` — shared-secret constant-time compare (D-01 revised)
- [ ] `src/lib/apify/run-fetch.test.ts` — Apify REST `/actor-runs/{id}` + `/datasets/{id}/items` paginated
- [ ] `src/lib/apify/target-models.test.ts` — D-06 lista shape + uniqueness
- [ ] `src/app/api/scrape/webmotors/webhook/route.test.ts` — discriminator (Apify metadata vs Phase 7 stub array), HMAC/secret reject paths, idempotency
- [ ] `src/app/api/cron/listings-cleanup/route.test.ts` — 72h TTL UPDATE query + Vercel cron auth
- [ ] `src/app/api/cron/fipe-retry/route.test.ts` — D-04 retry queue (insert null + flag → cron picks up)
- [ ] `src/lib/apify/scrape-runs-log.test.ts` — start/end lifecycle + counts increments
- [ ] Integration test stubs (16 total; 5 already drafted by researcher in 08-RESEARCH.md)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apify Scheduled Run trigger fires webhook | SCRAPE-06 | Requires real Apify account + dashboard config | (1) Configure schedule in Apify dashboard pointing to `https://autoagente.ai/api/scrape/webmotors/webhook`. (2) Trigger manual run. (3) Tail Vercel logs; expect 200 + scrape_runs row. |
| Apify residential proxy bypasses WebMotors Akamai | SCRAPE-06 | Requires Apify Starter+ tier (open question A1) | Probe task: run actor with residential proxy disabled vs enabled, compare success rate. |
| Cost cap kicks in at $50 USD aggregate | SCRAPE-04 | Requires accumulating real cost in scrape_runs.cost_usd | Manually insert mock scrape_runs rows summing $51, then POST a webhook → expect 429 + console.error alert. |
| FIPE retry cron picks up null entries | SCRAPE-09 | Requires Vercel Cron infra | Insert listing with fipe=null + attributes.fipe_retry_pending=true; trigger `/api/cron/fipe-retry`; expect listing.fipe populated. |
| Stale cleanup marks listings status=removed | SCRAPE-08 | Requires time-shifted data | Insert listing with last_scraped_at=now-73h; trigger `/api/cron/listings-cleanup`; expect status='removed'. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — awaits planner population of Per-Task Verification Map
