---
phase: 05-v3-pivot
doc_type: decisions-and-context
created: 2026-04-21
last_updated: 2026-04-21
---

# Phase 5 — Decisions & Context

Decisions captured during the Phase 5 pivot execution sprint. Format mirrors
Phase 2's `02-CONTEXT.md`: each entry has the decision, the rationale, the
alternatives considered, and the date. Use this as the go-to when someone
asks "why does v3 do X instead of Y?".

## Decisions

### D-01 — Fake-auth localStorage instead of real Supabase (2026-04-21)

**Decision:** SignupView writes name/city/persona to Zustand + localStorage
(persist middleware). No real auth, no DB.

**Why:** Deadline of 2026-04-24 for Felipe demo. Supabase auth + RLS setup
+ Postgres schema + Stripe Checkout webhooks = days of work, blocks the
demo narrative.

**Alternative considered:** Option 2 — do Supabase first, ship demo without
Phase 5 polish. Rejected because Felipe's review is on the *product shell*,
not the auth layer.

**Follow-up:** Phase 6 (seeded) handles real auth + multi-tenancy. Trigger
is Phase 5 sign-off on 2026-04-24.

---

### D-02 — PF simulator is a second Claude, not a mock (2026-04-21)

**Decision:** `/api/simulate-pf` runs Claude Sonnet 4.6 with a persona-aware
system prompt (resistente/ansioso/urgente). Reuses `streamLLM` abstraction
+ kill-switch + rate-limit from the main agent route.

**Why:** A hand-rolled state machine would be cheap but demo-brittle — the
lojista sees through canned responses immediately. Second Claude reads
the full conversation history, plays the persona, revelation pacing feels
authentic.

**Alternative considered:** Pre-recorded script bank keyed by round number.
Rejected because it can't respond coherently to any agent message the
first Claude might produce.

**Cost envelope:** ~320 max tokens per PF turn × 6 rounds × demo calls.
Rate-limited to 30/min/IP — fine for demo and low budget risk.

---

### D-03 — Modo Piloto is scripted theater, not live scraping (2026-04-21)

**Decision:** "Iniciar modo piloto" button on Dashboard drip-feeds 5
hardcoded opportunities (ids 901–905) over ~30s with toast progress. Does
NOT hit Apify.

**Why:** Live scraping during a demo is a liability — Apify can be slow,
can fail, can rate-limit us right when Felipe is watching. The theater
narrative ("agente varrendo WebMotors/OLX/Mercado Livre") is convincing
without the risk.

**Follow-up:** The real "Importar por URL" button in Marketplace still
hits Apify on-demand for live demos where we WANT to show scraping work.

**File:** `src/lib/mock-data/pilot.ts` holds the 5 curated opps; persona
mix matches the autoagente.ai §07 target personas (premium + high-volume
SUVs).

---

### D-04 — Autoplay Backstage is a sibling component, not a rewrite (2026-04-21)

**Decision:** `AutoplayBackstage.tsx` runs its own message array (local
`useState`), calls `/api/negotiate/stream` → `/api/simulate-pf` in a loop,
and renders in BackstageModule when `autoModeOpportunityIds.includes(opp.id)`.
Does NOT use the Phase 1 Zustand negotiation store.

**Why:** Phase 1 chat store has opinions (roles "agent"/"seller", round
counters, status/endReason) that don't match the autoplay use case
(symmetric agent/pf, no seller input). Touching it risks breaking the
Playground route at `/` that still works for solo validation.

**Alternative considered:** Extend the Phase 1 store with an "autoplay"
mode. Rejected — adds complexity to a tested codepath for a feature only
used in one place.

**Cost of the sibling:** ~330 LOC. Trivial compared to the risk of
regressing solo chat.

---

### D-05 — Apify actor is ribtools/webmotors-scraper, not custom or jupri (2026-04-21)

**Decision:** `ribtools~webmotors-scraper` is the primary and only actor.
98.6% success rate over 622 runs (2025-09 → 2026-03), active maintenance,
PAY_PER_EVENT pricing, handles Akamai internally.

**Why:** jupri/webmotors-br-scraper failed consistently on free tier
(2026-04-20 session). apify/web-scraper with hand-rolled pageFunction
hit Akamai firewall (also failed). ribtools is the only maintained
actor that actually works.

**Fallback:** If ribtools disappears, the code has a hook to swap actors
but no secondary configured — it would 502 with `scrape_failed` and the
user would fall back to manual entry.

**Cost:** $0.02–0.05 per URL on Starter+, free tier is datacenter proxy
(works most of the time). User's Apify token is set in Vercel env.

---

### D-06 — Full ribtools output mapped, not minimal (2026-04-21)

**Decision:** `mapToOpportunity` pulls seller.neighborhood, photos[0],
url, seller.seller_type, transmission, body_type, optionals. Motivation
signals are derived from publish_date (days online) + attributes
(`Aceita troca`). DD status is set to "ok" for PJ sellers and "review"
for PF or is_armored listings.

**Why:** User flagged on 2026-04-21 that location wasn't coming through
on scraped imports. Root cause was whitespace + state shape. Fix was
broader than just the bug — mapper now surfaces enough to render a real
photo, link back to the source listing, and tag PF/PJ.

**Opportunity type** gained 7 optional fields (all non-breaking). Mock +
pilot data renders unchanged.

---

### D-07 — Dark mode via CSS fallback layer, not per-component rewrite (2026-04-21)

**Decision:** `globals.css` has a `.dark .bg-white` / `.dark .text-slate-*`
/ `.dark .border-slate-*` block that remaps the bare utility classes
without `dark:` variants. Components that need special behavior override
with their own explicit `dark:*` utilities (Sidebar and AppShell do this).

**Why:** The app has ~40 files using `bg-white` / `bg-slate-50` / etc.
without `dark:` variants. Annotating every one of them is a day of work
and risks churn. The fallback layer gets 80% of dark mode for free;
targeted overrides on high-visibility surfaces (Sidebar, AppShell, plan
badges) handle the last 20%.

**Trade-off:** Cascade order matters. If a utility CSS file is loaded
*after* the fallback layer, it would override the dark adjustments.
Tailwind v4 loads before globals.css custom rules, so we're safe, but
this is a maintenance note.

**Activation:** `next-themes` was already installed (Toaster used it).
Added ThemeProvider wrapper in `layout.tsx`. ThemeToggle in Sidebar
cycles light/dark/system.

---

### D-08 — Vercel is primary deploy, DO is opportunistic (2026-04-21)

**Decision:** `autoagente.ai` points to Vercel. DigitalOcean App Platform
is "best effort if user sets it up Thursday" — not required for demo.

**Why:** Vercel build has been green across every commit in this
session. Setting up DO requires converting edge routes to nodejs runtime
(we have 4 edge routes: /api/fipe, /api/negotiate/stream, /api/scrape/
webmotors already nodejs, /api/simulate-pf). Not worth the risk before
deadline.

**User actions pending:** autoagente.ai DNS at registrar, APIFY_API_TOKEN
+ ANTHROPIC_API_KEY + NEGOTIATION_ENABLED=true in Vercel env.

---

## Open questions (resolve before 2026-04-24)

1. **Does the Vercel preview on each push actually reflect autoplay?**
   Deployment is automatic but the user should manually test the
   live deploy of commit `04a60a8` or later to confirm Modo Piloto →
   click opp → AutoplayBackstage renders.

2. **Is APIFY_API_TOKEN set in Vercel production/preview/development?**
   Without it, the "Importar por URL" button in Marketplace 500s with
   `apify_token_missing`. Not critical for demo theater but expected
   for the real scraping demo moment.

3. **Dark mode smoke test on mobile?** Sidebar ThemeToggle works on
   desktop — mobile layout has the sidebar hidden/collapsed behind a
   breakpoint; the toggle may not be reachable. Needs mobile QA pass.

## References

- `05-PHASE-PLAN.md` — original scope + waves
- `OVERNIGHT-PROGRESS.md` — read-in-the-morning summary from the
  overnight autonomous session (2026-04-21 00:00–03:00 BRT)
- `USER-ACTIONS.md` — user-side checklist (DNS, Apify, DO)
- `.planning/phases/06-supabase-integration/06-PHASE-SEED.md` — next
  phase scope, triggered after 2026-04-24 sign-off
