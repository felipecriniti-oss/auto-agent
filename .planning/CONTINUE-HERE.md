# CONTINUE HERE — Session handoff (2026-04-30)

> Read this FIRST after `/clear`. Tells the next session exactly where the user left off
> and what to do next. Single source of truth — supersedes anything in chat history.

## Where we are

**Phases shipped (in main):**
- Phase 7 wishlist UI — done; HUMAN-UAT Test 2 closed today via Esc handler fix (`dc1827b`)
- Phase 8 scraping pipeline — done; production-live on `workspace.autoagente.ai`; first
  scheduled Apify run at 03h BRT today (2026-04-30)
- Phase 9 matching engine — done in 5 plans across 3 waves; verifier PASSED (`e7c73de`)

**Code reviews just completed (just before `/clear`):**
- `09-REVIEW.md`: 1 CRITICAL + 2 HIGH + 8 medium/low (rev id `09-CR-01..N-04`)
- `08-REVIEW.md`: 1 CRITICAL + 4 HIGH + 13 medium/low (rev id `08-CR-01..N-03`)
- `07-REVIEW-2.md`: 1 HIGH + 4 MEDIUM + 5 LOW (post-Phase-9-cleanup pass)

## Father status (blocking decisions)

The user (Gabriel) is talking to his father (Felipe — author of all PRD/UX/Spec docs)
about three open questions:

1. **KYC documents:** which docs to require at signup (light: CNPJ+endereço; heavy:
   +contrato social+RG+certidão; deferred: opcional, exige antes do "Assume Deal").
   The pai mentioned the onboarding "está longe de estar completo" but no doc in
   `Downloads/` has a detailed onboarding spec — last session's escalation message
   asks the pai which file/source has the detail he was remembering.

2. **Payment provider:** Pai is evaluating non-Stripe options (Asaas / Pagar.me /
   MercadoPago / Iugu / PagBank / EBANX — Brazilian processors). Phase 13a (Stripe)
   blocked until decision lands.

3. **"Pré-setar o sistema":** Pai's preference is scaffolding the database/interface
   so when KYC + payment provider are decided, integration is plug-in, not build-from-
   scratch. Translates to: agnostic `PaymentGateway` interface (no impl) + KYC bucket
   + `kyc_documents` table.

## What the user just approved (the order)

1. ✅ Phase 7-13 Esc handler fix → done (`dc1827b`, 10/10 tests)
2. ✅ Code reviews on phase 7+8+9 → done (3 files written, NOT YET committed)
3. **▶ NOW:** Apply critical-and-high review fixes BEFORE today's 03h BRT real run
4. Then: validate the 03h BRT run against production
5. Pre-set scaffolding (KYC bucket+table, PaymentGateway interface) while pai responds

## NEXT TURN — exact entry point

**Step 0:** commit the 3 review files that aren't yet in main (see `git status`).

```bash
cd /c/Users/pc/auto-agent
git add .planning/phases/07-wishlist-ui/07-REVIEW-2.md \
        .planning/phases/08-scraping-pipeline/08-REVIEW.md \
        .planning/phases/09-matching-engine/09-REVIEW.md
git commit -m "docs(reviews): code review reports for phases 7+8+9

7-REVIEW-2 (post-Phase-9 + Esc fix): 1 HIGH + 4 MEDIUM + 5 LOW
8-REVIEW (production-facing): 1 CRITICAL + 4 HIGH + 13 medium/low
9-REVIEW (matching engine): 1 CRITICAL + 2 HIGH + 8 medium/low

Critical findings address before 03h BRT first real Apify run today:
- 8-CR-01: scrape_runs.apify_run_id no unique constraint → on
  Apify retry, double-count cost cap; route returns 502 on failed
  triggers Apify retry. Migration + dedup check in route.
- 8-HI-01: scrape_runs row can stay 'running' forever on hard
  timeout/throw between INSERT and try block. Wrap final update
  in finally.
- 8-HI-04: sinistro keyword separator should accept
  [\\s\\-._\\u00A0]+ to catch cambio.fundido / cambio-fundido / NBSP

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin main
```

**Step 1: apply critical Phase 8 fixes** (the only ones that actually affect today's
03h BRT run — Phase 9 critical/highs are pre-public-launch concerns, not pre-tonight).

Read `.planning/phases/08-scraping-pipeline/08-REVIEW.md` and apply:

- **8-CR-01:** Add unique constraint on `scrape_runs.apify_run_id` via new migration
  `supabase/migrations/0003_scrape_runs_apify_run_id_unique.sql`. Then in
  `src/app/api/scrape/webmotors/webhook/route.ts:293-307`, wrap the insert in
  `try { ... } catch (PostgrestError 23505 unique_violation) { return 200 idempotent ack }`
  so Apify retry is a no-op instead of double-billing.
- **8-HI-01:** In `route.ts` `handleApifyRun`, move the final `scrape_runs.update`
  call into a `finally` block so a hard timeout / uncaught throw between INSERT and
  the try-block flow still flips status to `failed` instead of leaving `running`.
- **8-HI-04:** In `src/lib/apify/filters.ts`, change the `\s+` separator in the
  multi-word SINISTRO regexes (`/motor\s+fundid[oa]/i`, etc.) to
  `[\\s\\-._\\u00A0]+` so `cambio.fundido` / `cambio-fundido` / NBSP-separated
  variants are also caught. Update tests in `filters.test.ts`.

After fixes: `pnpm test src/lib/apify src/app/api/scrape --run` and `pnpm typecheck`
must exit 0. Commit per fix (atomic). Push to `origin/main`.

**Step 2: defer everything else** (Phase 7 HIGH-01 popover bubble, Phase 9 CR-01 auth
check, Phase 9 HI-01 index, etc.) to a post-pai-response cleanup pass. None of them
affect today's automated run.

**Step 3: monitor 03h BRT run** (will already have happened by next session start).
Check:
- Apify dashboard `console.apify.com/schedules/BuwV5h3eekRF0x1qB` — did the
  scheduled run fire?
- `https://workspace.autoagente.ai/api/scrape/webmotors/webhook` — query webhook
  delivery logs at `https://api.apify.com/v2/webhooks/qLbRHOsV4rsElbu6h/dispatches`
- Supabase `scrape_runs` row count and `listings_new`/`listings_error`

**Step 4: when pai responds about KYC/payment**, build the scaffolding (todo #6 from
the prior session list) — `src/lib/billing/PaymentGateway.ts` interface (no provider
impl) + `supabase/migrations/0004_kyc_documents.sql` (table + Storage bucket policy)
+ a 4th step skeleton in `/app/onboarding/page.tsx` gated behind a feature flag.

## Reference IDs

- Apify schedule: `BuwV5h3eekRF0x1qB` (autoagent-webmotors-dev, 0 3 * * * BRT)
- Apify webhook: `qLbRHOsV4rsElbu6h` (ACTOR.RUN.SUCCEEDED → workspace.autoagente.ai)
- Production URL: `https://workspace.autoagente.ai`
- Last commit: `dc1827b` (Phase 7-13 Esc fix); `e7c73de` is Phase 9 verifier

## Outstanding session todos

1. Apply Phase 8 critical fixes (CR-01, HI-01, HI-04) — pre-tonight
2. Watch 03h BRT scheduled run — 1st production volume
3. Pre-set scaffolding (KYC + PaymentGateway) — when pai responds
4. Phase 7 LOW-03 sweep (7 items from original review still open) — backlog
5. Phase 9 CR-01 auth + HI-01 index + HI-02 dead-code — pre-public-launch
6. Phase 7 HIGH-01 popover-bubble Esc — pre-demo polish
7. Phase 8.10 — restore fipe-retry hourly when Vercel Pro ($20/mo)

## State preserved across sessions (so next agent doesn't re-derive)

### Don't re-do (already locked in main)

- **Phase 9 discuss/plan/execute** — context locked in `.planning/phases/09-matching-engine/09-CONTEXT.md` (D-01..D-14). Don't re-spawn discuss-phase or plan-phase for it.
- **Vercel deploy pipeline** — auto-deploy via GitHub works since commit `505e7a8` (cron fix) + `f141719` (orphan gitlinks fix). Don't run `vercel deploy --prod`; it's redundant and can fight the auto-deploy.
- **Stripe direction** — user explicitly rejected Stripe; pai is evaluating other Brazilian payment processors (Asaas / Pagar.me / MercadoPago / Iugu / PagBank / EBANX). Phase 13a as Stripe-specific is on hold. Don't propose Stripe.

### Spec scan results (re-scan if you want, but here's the cache)

If you re-scan `C:\Users\pc\Downloads\projeto autoagent atualizado/` and `C:\Users\pc\Downloads\` (older folder + adendos + ideias_texto + autoagente_reescrita + "coisas para questionar e arrumar.txt"), here's what you'll find regarding **lojista onboarding** (the pai said "está longe de estar completo"):

- **PRD_AutoAgent_v3.md** — no onboarding section
- **PRD_AutoAgent_v2.md** — no onboarding section
- **AutoAgent_UX_Prototype_v3.jsx:862-931** — `OnboardingModule` with only 4 fields (Nome, E-mail, WhatsApp, Senha) → success screen "Pronto pra começar"
- **AutoAgente_Spec_Tecnico_v1.docx** — focuses on agent algorithm, no lojista onboarding
- **AutoAgent_Adendo_Estrategico_v2.2.md:76** — "No dia 1 após cadastrar conta, lojista já tem algo útil — liga Descoberta Ativa"; line 126 mentions "Redução de atrito de onboarding" but no detail
- **coisas para questionar e arrumar no projeto autoagente.txt** — explicit pai todo: "acabar de preparar database metodo de pagamento"
- **autoagente_reescrita.docx + ideias_texto_autoagente.docx** — landing-page copy only, not onboarding

**Conclusion:** no doc has a detailed lojista onboarding spec. Pai may be referring to a doc not yet shared OR verbal direction. Last session's escalation message asks the user to confirm with the pai which file/source has the detail he was remembering. If the user comes back with a NEW doc or verbal spec, re-derive from that — don't try to reverse-engineer "what onboarding should look like" from existing docs.

### Current `/app/onboarding` implementation (3 steps, ~110 LoC)

`src/app/app/onboarding/page.tsx`:
1. Nome completo + Empresa + Cidade + UF
2. CNPJ (optional)
3. First wishlist creation (or "Pular e fazer depois")
→ flips `users.onboarding_complete=true`, redirects to `/app`

This is more than the UX prototype's 4-field minimal version, but per the pai it's "far from complete." Likely missing (deduced, not spec'd): plan tier picker, KYC document uploads, payment method, agent activation toggle, dashboard tour, T&C acceptance, "Conta verificada" badge mechanic.
