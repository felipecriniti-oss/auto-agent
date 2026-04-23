# Supabase at Scale for AutoAgent — Research Report

**Date:** 2026-04-22
**Author:** research agent (Opus 4.7, 1M context)
**Scope:** Is Supabase the right DB/auth platform for a Brazilian B2B marketplace processing tens to hundreds of thousands of financial transactions/month?
**TL;DR:** **Stay on Supabase.** Move from Free to **Pro ($25/mo)** the day you onboard your first paying lojista. Upgrade to **Small or Large compute add-on** before you cross ~500 concurrent dealer sessions. Reserve Team ($599/mo) for when you need SOC2 reports for enterprise clients or SSO. Only revisit (Neon or RDS) if you hit >1M writes/day or need true scale-to-zero across many tenant DBs.

---

## 1. Can Supabase handle 100k–1M requests/month of transactional workload?

Short answer: **yes, comfortably, with headroom**, as long as you size compute correctly and use the Supavisor pooler in transaction mode on port 6543.

**What 100k–1M req/month actually is:** 100k/mo ≈ 2.3 req/sec average, peaking maybe at 20–40 req/sec. 1M/mo ≈ 23 req/sec average. This is small-to-medium load by Postgres standards — a single Micro/Small instance handles it with RLS on.

**Compute tier limits (Supabase official):**

| Tier | CPU | RAM | Direct connections | Pooler clients |
|------|-----|-----|--------------------|----------------|
| Nano (Free) | shared | 0.5 GB | 60 | 200 |
| Micro | 2-core ARM shared | 1 GB | 60 | 200 |
| Small | 2-core ARM shared | 2 GB | 90 | 400 |
| Medium | 2-core ARM shared | 4 GB | 120 | 600 |
| Large | 2-core ARM dedicated | 8 GB | 160 | 800 |
| XL | 4-core dedicated | 16 GB | 240 | 1,000 |
| 2XL | 8-core dedicated | 32 GB | 380 | 1,500 |
| 4XL | 16-core dedicated | 64 GB | 480 | 3,000 |
| 8XL | 32-core dedicated | 128 GB | 490 | 6,000 |
| 12XL | 48-core dedicated | 192 GB | 500 | 9,000 |
| 16XL | 64-core dedicated | 256 GB | 500 | 12,000 |

Source: https://supabase.com/docs/guides/platform/compute-and-disk

**Plan quotas:**

| Plan | Base cost | DB storage | Egress | MAU | Backup retention |
|------|-----------|------------|--------|-----|------------------|
| Free | $0 | 500 MB | 5 GB | 50k | none |
| Pro | $25/mo | 8 GB included (then $0.125/GB) | 250 GB included (then $0.09/GB) | 100k | 7 days |
| Team | $599/mo | same structure | higher | higher | 14 days |
| Enterprise | custom | custom | custom | custom | custom + PITR |

Pro includes **$10 of monthly compute credit** (covers Nano/Micro). Source: https://supabase.com/pricing and https://supabase.com/docs/guides/platform/manage-your-usage/compute

**Realtime / throughput:** Supabase publishes benchmarks where Realtime handles 10k+ concurrent WebSockets comfortably; the DB layer itself is vanilla Postgres 15 on NVMe with HAProxy in front. 100k REST requests/day is routine; people run Postgres clusters doing 10k qps/second on much smaller hardware. Source: https://supabase.com/docs/guides/realtime/benchmarks

**Verdict for AutoAgent load:** A **Small compute** ($15/mo addon on top of Pro) handles your projected year-one load comfortably. Upgrade to **Large** ($110/mo - $10 credit = ~$100/mo) when (a) lojista count passes ~200 simultaneous or (b) Backstage chat streaming concurrency gets heavy. Peak budget at 18 months: ~$150–250/mo all-in.

---

## 2. Security posture for financial data in Brazil

**What Supabase gives you today:**

- **SOC 2 Type 2** — compliant, report available on Team/Enterprise dashboards. Source: https://supabase.com/blog/supabase-soc2-hipaa
- **ISO 27001** — certified; cert downloadable from Team/Enterprise. Source: https://supabase.com/security
- **HIPAA** — compliant via add-on + BAA (US health, not relevant to you). Source: https://supabase.com/docs/guides/security/hipaa-compliance
- **LGPD** — addressed in their DPA (Data Processing Addendum). Supabase signs a DPA on request and their infra sits on AWS which has an LGPD-compliant posture in sa-east-1. Source: https://supabase.com/legal/dpa
- **GDPR** — compliant. Source: https://supabase.com/blog/supabase-soc2
- **PCI-DSS** — **NOT certified themselves.** See the important caveat below.
- **Encryption** — AES-256 at rest, TLS 1.2+ in transit, on every tier.
- **Backups** — daily on Pro (7-day retention). **PITR** (point-in-time-recovery) is a paid add-on — ~$100/mo for 7 days of PITR. Recommended once DB > 4 GB or once real money flows. Source: https://supabase.com/docs/guides/platform/going-into-prod
- **Vault / pgsodium** — Supabase Vault (pgsodium-based) is built in for encrypting secrets columns (e.g., WhatsApp tokens, Stripe API keys if you ever store them). Free on every tier.
- **RLS** — Postgres-native, which you're already using across 13 tables. No replacement.
- **DDoS** — Cloudflare + fail2ban in front of every project.

**The PCI-DSS gap (important — don't misread this):**

You do NOT need Supabase to be PCI-DSS certified if you use **Stripe Checkout** or **Stripe Elements** correctly. Card data goes directly to Stripe's iframe/hosted page; your backend only sees a `pm_xxx` token. You qualify for **PCI SAQ-A** (simplest self-assessment, 24 questions). Source: https://stripe.com/guides/pci-compliance and https://cside.com/blog/can-you-use-stripe-for-pci-dss

**What you still owe as a merchant under SAQ-A (PCI v4):**
- Annual self-assessment
- **Quarterly external ASV vulnerability scans** — new under PCI v4 even for SAQ-A merchants. You'll need a vendor like Trustwave or SecurityMetrics (~$100–300/yr).

**What's missing from Supabase that matters for Brazil:**

- **No BACEN certification** — not needed unless you become an acquirer or PIX SPI participant. You won't. Asaas/Stripe handles fiat; you're an intermediary.
- **Data residency** — sa-east-1 exists and is selectable on project creation (see §3). LGPD doesn't mandate onshore, but it's a legitimate talking point with conservative lojistas.
- **No native NF-e, nor Serasa integration** — irrelevant, those are business-integration layers built on top regardless of DB.

**Net:** security posture is **strong enough** for your use case. You are not a bank. You intermediate deals and subscriptions; Stripe handles cards; Supabase handles business state with Postgres-grade ACID + RLS + Vault. Good to go.

---

## 3. Known weak points at scale

### 3a. Supavisor pooler with Vercel Edge

This is the real operational gotcha. Edge runtimes open short-lived connections aggressively; naive direct Postgres connects exhaust the 60–90 connection cap in seconds.

**Fix (mandatory):** Connect via **Supavisor transaction mode, port 6543**, not port 5432. String looks like:
```
postgresql://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

With `@supabase/supabase-js` this is automatic through the REST/PostgREST layer — you don't hit the pooler directly. But if you ever add Prisma or node-postgres, use port 6543 and disable prepared statements (`pgbouncer=true`). Sources: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI

**Known issue, watch for it:** A GitHub discussion (supabase/discussions/40671) reports that **Vercel Fluid Compute + Supavisor shared pooler** has a bug where client connections grow unbounded and only reset when Supabase restarts the pooler. Workaround: disable Fluid Compute's `attachDatabasePool`, or use the dedicated pooler on Pro+. If you stick with PostgREST (Supabase JS client) you're insulated from this.

### 3b. Realtime scaling ceiling

Realtime does 10k WebSockets per project cleanly; 100k requires architecture planning with read replicas + connection pooling. You won't hit this in year one — each lojista maybe opens 1–3 realtime channels (Marketplace feed, Backstage deal). 100 lojistas × 3 = 300 channels. Non-issue.

### 3c. Edge Functions cold starts

Median cold start was 400ms, now down to 42ms median / <500ms P99 after their 2026 persistent-storage/bootstrap rework. Source: https://supabase.com/blog/persistent-storage-for-faster-edge-functions

You're running your API on **Vercel Edge**, not Supabase Edge Functions — so Supabase Edge Functions cold starts don't apply unless you offload scraping/webhooks there. Recommendation: keep Vercel as your app runtime, use Supabase Edge Functions only for webhooks Supabase needs to own (Stripe webhook → DB mutation, Auth hooks).

### 3d. sa-east-1 (São Paulo) region

**GA and stable.** Selectable at project creation. Same feature parity as us-east-1 for core DB, Auth, Realtime, Storage. Caveat: Edge Functions are **globally distributed**, they don't pin to sa-east-1, so a webhook invocation in NL hits a Postgres in São Paulo — adds ~150–200ms. Plan for this or use regional invocations (Enterprise feature). Source: https://supabase.com/docs/guides/functions/regional-invocation

Read replicas are supported in sa-east-1 on Team+ plan. Worth having one eventually for analytics queries that don't need to hit primary.

### 3e. Compute credit gotcha

Compute is billed **hourly, not proportionally**. A 5-minute 4XL bump = 1 hour billed. Spend Cap does NOT apply to compute. If you ever scale up manually, scale back down promptly. Source: https://supabase.com/docs/guides/platform/manage-your-usage/compute

---

## 4. Alternatives evaluated

### Neon (serverless Postgres + Stack Auth)

- **Pros:** Scale-to-zero compute (Scale plan = $0.222/CU-hour), instant branching for preview envs, modern architecture. Schema migration = pure `pg_dump` / `pg_restore` (both are Postgres).
- **Cons:** No Realtime, no Storage, no built-in RLS helpers, no Auth (Stack Auth is separate product, still maturing). You'd rebuild: auth, storage, realtime, edge. That's **2–4 weeks of engineering** you do not have.
- **Cost at 100k txn/mo:** ~$19–40/mo for DB alone. Add Stack Auth (~$25/mo for paid tier) + Cloudflare R2 for storage + Pusher/Ably for realtime → realistically $80–120/mo and 3x moving parts.
- **When it wins:** if you ever need per-tenant isolated DBs at cheap cost (e.g., true white-label multi-region). Not today.
- **Verdict for you:** NO. Sources: https://neon.com/pricing and https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/

### PlanetScale (Vitess MySQL)

- **Pros:** Battle-tested horizontal scaling at huge volume.
- **Cons:** **MySQL, not Postgres.** Your 13 tables, RLS policies, and `pg_tgrm`/FTS queries would need rewriting. PlanetScale killed free branching in 2024; now $39/mo entry.
- **Verdict:** HARD NO. Zero reuse of current schema. 4–6 week migration. Not a fit.

### Convex (TS-native)

- **Pros:** Beautiful DX, optimistic updates, real-time by default, reactive queries.
- **Cons:** Document/NoSQL-ish, no SQL JOINs the way you need them for Marketplace filtering (price vs FIPE, fee calc aggregations over deals). B2B multi-tenant reporting is weaker. No RLS equivalent — auth logic lives in TS functions. **Total rewrite of your 13-table schema.**
- **Cost at 100k txn/mo:** Pro tier ~$25/mo/seat + overages; likely $80–150/mo at scale.
- **Verdict:** NO. The rewrite cost alone kills it. Sources: https://www.convex.dev/compare/supabase

### Firebase / Firestore

- **Pros:** Mature, Google infra, cheap at small scale.
- **Cons:** NoSQL, no SQL aggregations, poor fit for financial reporting and join-heavy marketplace queries. Multi-tenant security rules are clunkier than Postgres RLS. Cold start latency from Brazil is worse than sa-east-1 Supabase.
- **Verdict:** NO. Wrong data model for your domain.

### AWS RDS Postgres + Cognito + S3 + AppSync

- **Pros:** Max control, max scale ceiling, onshore sa-east-1 native. Well-known for enterprise buyers.
- **Cons:** You become a DBA. ~$50–100/mo for a db.t4g.micro RDS, plus you build your own PostgREST equivalent, plus Cognito integration, plus RLS plumbing. **4–8 weeks of platform engineering** before you ship a feature.
- **Cost at 100k txn/mo:** $150–400/mo infra + your time.
- **Verdict:** NO right now. Revisit at Series A if you have a platform engineer.

---

## 5. Final recommendation

**Stay on Supabase. Do these in order:**

1. **Today — Friday demo:** stay on Free tier. Good enough to ship.
2. **Day you sign first paying lojista:** flip to **Pro ($25/mo)**. Enable **daily backups** (on by default). Pin project to **sa-east-1**. Turn on Supabase Vault for any sensitive column (Stripe secret, WhatsApp Business token).
3. **Before onboarding 10+ lojistas or real money flowing:** add **PITR add-on** (~$100/mo). Non-negotiable once real subscriptions + success fees hit the DB. Loss of 24h of deals = unacceptable. Also add **Small or Medium compute** if load or p95 latency grows.
4. **~50 lojistas or first enterprise prospect asks for SOC2 report:** upgrade to **Team ($599/mo)** for SOC2 access, 14-day backups, SSO, read replicas. Get a signed DPA for LGPD.
5. **When to leave:** genuinely, when you outgrow a single 16XL (64-core, 256 GB) — meaning >10k concurrent users, >10k qps sustained. That's a 2028+ problem. At that point evaluate RDS + your own PostgREST or go Aurora. Do not pre-migrate.

**What to do this week (non-code):**
- Request Supabase DPA (covers LGPD). Takes 1 email.
- Sign up for a quarterly ASV vulnerability scan vendor for PCI SAQ-A (Trustwave / SecurityMetrics, ~$150/yr).
- Set Spend Cap on Supabase Pro to prevent compute overage surprises.
- Set up a staging project in sa-east-1 so you load-test (k6) before each paid feature ships.

**Defensible story for your father tonight:**
> "Supabase is hosted Postgres with SOC2 + ISO27001, same DB tech banks use, on AWS sa-east-1 in São Paulo. Stripe handles the cards so we only need the simplest PCI self-assessment. We pay $25/mo today, maybe $150/mo at 50 dealers, $600/mo at 200+ dealers. If we ever outgrow it in 2–3 years we can lift-and-shift to AWS RDS in a weekend because it's plain Postgres — no lock-in. Alternatives (Neon, Convex, Firebase) either force a rewrite or add 2-4 weeks of engineering we don't have before Friday."

---

## Sources (ranked by citation weight)

- Supabase compute tiers — https://supabase.com/docs/guides/platform/compute-and-disk
- Supabase pricing — https://supabase.com/pricing
- Supabase compute billing — https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Supabase production checklist — https://supabase.com/docs/guides/platform/going-into-prod
- Supabase security page — https://supabase.com/security
- Supabase SOC2 + HIPAA announcement — https://supabase.com/blog/supabase-soc2-hipaa
- Supabase DPA (LGPD/GDPR) — https://supabase.com/legal/dpa
- Supabase Supavisor FAQ — https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI
- Supabase connecting to Postgres — https://supabase.com/docs/guides/database/connecting-to-postgres
- Supavisor + Vercel Fluid bug — https://github.com/orgs/supabase/discussions/40671
- Supabase realtime benchmarks — https://supabase.com/docs/guides/realtime/benchmarks
- Supabase Edge Functions cold start improvements — https://supabase.com/blog/persistent-storage-for-faster-edge-functions
- Supabase regions — https://supabase.com/docs/guides/platform/regions
- Stripe PCI compliance guide — https://stripe.com/guides/pci-compliance
- Stripe + PCI SAQ-A analysis — https://cside.com/blog/can-you-use-stripe-for-pci-dss
- Neon pricing — https://neon.com/pricing
- Neon 2026 pricing breakdown — https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/
- Convex vs Supabase comparison — https://www.convex.dev/compare/supabase
- Neon vs Supabase deep-dive — https://designrevision.com/blog/supabase-vs-neon
