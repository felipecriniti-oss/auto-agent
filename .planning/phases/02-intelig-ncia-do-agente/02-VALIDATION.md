---
phase: 02
slug: intelig-ncia-do-agente
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Populated from 02-RESEARCH.md §Validation Architecture. Planner fills the Per-Task Verification Map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + jsdom (already installed Phase 1) |
| **Config file** | `vitest.config.ts` (existing, no changes needed) |
| **Quick run command** | `pnpm test -- --run --changed` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~10–20 seconds full suite after Phase 2 adds |

---

## Sampling Rate

- **After every task commit:** Run quick changed-scope suite
- **After every plan wave:** Run full suite (should stay <30s)
- **Before `/gsd-verify-work`:** Full suite green + canonical Audi Q5 replay manual check
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Populated by `gsd-planner` from PLAN.md task list. Each row maps one task to its automated verification command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INTEL-01..06 | TBD | TBD | unit / integration / manual | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per 02-RESEARCH.md §Validation Architecture, Wave 0 creates test scaffolds before any implementation. Planner finalizes the list in PLAN.md; below is the baseline from research:

- [ ] `src/lib/scoring/__tests__/motivation.test.ts` — stubs for INTEL-01 (computeMotivationScore)
- [ ] `src/lib/prompts/__tests__/system-v2.test.ts` — stubs for INTEL-01/02/03/04 (prompt builder composition)
- [ ] `src/lib/prompts/__tests__/tone.test.ts` — stubs for INTEL-04 (tone preset switching)
- [ ] `src/lib/prompts/__tests__/few-shot.test.ts` — stubs for INTEL-03 (Audi Q5 pair assembly)
- [ ] `src/lib/data/__tests__/comparables.test.ts` — stubs for INTEL-02 (array shape + injection format)
- [ ] `src/lib/stores/__tests__/migrations.test.ts` — stubs for D-14 (v1→v2 localStorage migration)
- [ ] `src/lib/stores/__tests__/agent-config-slice.test.ts` — stubs for INTEL-04 (config slice + persist)
- [ ] `src/lib/stores/__tests__/benchmark-selectors.test.ts` — stubs for INTEL-06 (aggregates + gate selectors)
- [ ] `src/lib/schemas/__tests__/listing.test.ts` — stubs for D-06 (motivoDaVenda field)
- [ ] `src/lib/schemas/__tests__/negotiate.test.ts` — stubs for route body alternance refinement
- [ ] `src/lib/streaming/__tests__/rationale-strip.test.ts` — stubs for D-01 (`<rationale>` regex strip)
- [ ] `src/app/api/negotiate/stream/__tests__/route.test.ts` — integration: body validation + promptVersion routing
- [ ] `src/components/negotiation/__tests__/AgentThinking.test.tsx` — stubs for INTEL-05 (disclosure component)

*Framework install: none — Vitest 4 + jsdom already installed per Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canonical Audi Q5 replay fixture — few-shot produces recognizable opener | INTEL-03 | Output is LLM-generated prose; assertion is "feels right to Felipe" | Load fixture listing, run `/chat` with `promptVersion=v2.0.0`, compare opener structure against `mockChatHistories[1]` shape in protótipo v3 |
| Benchmark gate (≥20% redução, ≥3.5 rating, 0 walkAway, ≥85% rationale coherence) | INTEL-06 | Requires 20 manually rated sessions by Felipe | Run 20 negotiations via Phase 2 UI, rate each 1-5 on `/benchmark`, Lucas audits 100% of `<rationale>` coherence offline, verify `selectGatePass` returns `true` |
| Rationale disclosure toggle reveals/hides `<rationale>` content | INTEL-05 | Subjective UI interaction | Start session, send 2 turns, toggle "Ver pensamento" on NegotiationStatusBar, confirm rationale appears only when toggled on |
| Config drift alert when editing during active negotiation | D-10 | Subjective UI affordance | Start negotiation (status=negotiating), open Config tab, edit any field, confirm shadcn `Alert` shows "Alterações só valem para a próxima negociação" |
| Markdown bleed regression from Phase 1 | Phase 1 guardrail (inherit) | Continuous check | Verify no markdown syntax leaks into visible agent messages across 20 benchmark sessions |

---

## Nyquist Compliance Notes

Per 02-RESEARCH.md §Validation Architecture:
- **Sampling rule:** every new deterministic behavior gets ≥2 test cases exercising opposite ends of the input space (e.g., `computeMotivationScore`: 0 dias online + 0 reduções + motivo=outros → expect BAIXA; high dias + many reduções + necessidade_financeira → expect ALTA).
- **Critical path coverage:** `src/lib/scoring/motivation.ts`, `src/lib/stores/migrations.ts`, `src/lib/prompts/system-v2.ts` → 100%.
- **Supporting module coverage:** schemas, hooks, streaming helpers → ≥90%.
- **UI component coverage:** AgentThinking, BenchmarkScorecard, Config tab → ≥70% (interaction contracts, not render pixels).
- **Total new test cases estimated:** ~50 (see research §Validation Architecture for breakdown).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (filled by planner)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (checked by plan-checker)
- [ ] Wave 0 covers all MISSING references (13 scaffolds listed above)
- [ ] No watch-mode flags (`--run` used everywhere)
- [ ] Feedback latency < 30s (verified after Wave 0 scaffolds land)
- [ ] `nyquist_compliant: true` set in frontmatter after plan-checker approval

**Approval:** pending
