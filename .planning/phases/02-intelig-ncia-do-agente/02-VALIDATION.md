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
| 00-T1 | 02-00 | 0 | INTEL-01..06 | T-02-00-01/02 | shadcn components load without build-breakage | build smoke | `test -f src/components/ui/tabs.tsx && pnpm build` | yes | ⬜ pending |
| 00-T2 | 02-00 | 0 | INTEL-01..06 | — | test scaffolds exist with it.todo | vitest | `pnpm test -- --run` exits 0 with pending count | yes | ⬜ pending |
| 01-T1 | 02-01 | 1 | INTEL-04 | — | agent-config schema validates ranges | unit | `pnpm test -- --run src/lib/schemas/__tests__/agent-config.test.ts` | yes | ⬜ pending |
| 01-T2 | 02-01 | 1 | INTEL-01 | T-02-01-01 | listingSchema enforces motivoDaVenda enum | unit | `pnpm test -- --run src/lib/scoring src/lib/schemas/listing.test.ts` | yes | ⬜ pending |
| 01-T3 | 02-01 | 1 | INTEL-02, INTEL-03, INTEL-04 | — | tone/comparables/few-shot deterministic | unit | `pnpm test -- --run src/lib/prompts src/lib/data` | yes | ⬜ pending |
| 01-T4 | 02-01 | 1 | INTEL-03 | T-02-01-03 | alternance refinement rejects user→user | unit | `pnpm test -- --run src/lib/schemas/negotiate.test.ts` | yes | ⬜ pending |
| 02-T1 | 02-02 | 2 | INTEL-01, INTEL-02, INTEL-05 | T-02-02-02 | system-v2 contains all 5 mutations + v1 untouched | unit | `pnpm test -- --run src/lib/prompts/__tests__/system-v2.test.ts src/lib/prompts/system-v1.test.ts && git diff --name-only src/lib/prompts/system-v1.ts \| wc -l` | yes | ⬜ pending |
| 02-T2 | 02-02 | 2 | — (infrastructure) | T-02-02-01 | migrations never throws + idempotent | unit | `pnpm test -- --run src/lib/stores/__tests__/migrations.test.ts` | yes | ⬜ pending |
| 02-T3 | 02-02 | 2 | INTEL-03 | — | anthropic adapter passes fewShot + cache + usage | integration | `pnpm test -- --run src/lib/server/llm/` | yes | ⬜ pending |
| 03-T1 | 02-03 | 3 | INTEL-01, INTEL-04, INTEL-05, INTEL-06 | T-02-03-03 | store rationale extraction + snapshot + selectors | unit | `pnpm test -- --run src/lib/stores/` | yes | ⬜ pending |
| 03-T2 | 02-03 | 3 | INTEL-01, INTEL-02, INTEL-03 | T-02-03-01, T-02-03-02, T-02-03-04 | route v2 branching + server motivation + telemetry | integration | `pnpm test -- --run src/app/api/negotiate/stream/route.test.ts` | yes | ⬜ pending |
| 03-T1b | 02-03 | 3 | AI-SPEC §6 (G-01..G-05) | T-02-03-01, T-02-03-02, T-02-03-03 | client-side flag writers detect leaks / walkAway / markdown / truncation | unit | `pnpm test -- --run src/lib/stores/__tests__/flags.test.ts` | yes | ⬜ pending |
| 03-T2b | 02-03 | 3 | AI-SPEC §6 G-05 | T-02-02-03 | server emits `event: truncated` SSE frame on `stop_reason === 'max_tokens'` | integration | `pnpm test -- --run src/app/api/negotiate/stream/route.test.ts` | yes | ⬜ pending |
| 04-T1 | 02-04 | 4 | INTEL-01 | T-02-04-02 | AdListingForm motivoDaVenda select renders | component | `pnpm test -- --run src/components/negotiation/AdListingForm && pnpm typecheck` | yes | ⬜ pending |
| 04-T2 | 02-04 | 4 | INTEL-05 | — | AgentThinking states render correctly | component | `pnpm test -- --run src/components/negotiation/__tests__/AgentThinking.test.tsx` | yes | ⬜ pending |
| 04-T3 | 02-04 | 4 | INTEL-04 | T-02-04-03 | AgentConfigForm + LeftColumnPanel validate + submit + alert | component | `pnpm test -- --run src/components/negotiation/__tests__/AgentConfigForm.test.tsx src/components/negotiation/__tests__/LeftColumnPanel.test.tsx` | yes | ⬜ pending |
| 04-T4 | 02-04 | 4 | INTEL-05 | — | NegotiationStatusBar toggle flips thinkingVisible | component | `pnpm test -- --run src/components/negotiation/NegotiationStatusBar.test.tsx` | yes | ⬜ pending |
| 04-T5 | 02-04 | 4 | INTEL-01 (motivation card), INTEL-04 (config snapshot in body) | T-02-04-01 | ChatView uses appliedConfig + ContextPanel shows label only | build+typecheck | `pnpm test -- --run && pnpm build` | yes | ⬜ pending |
| 05-T1 | 02-05 | 5 | INTEL-06 | — | StarRating toggle + ReductionBadge color tiers | component | `pnpm test -- --run src/components/benchmark/__tests__/StarRating.test.tsx` | yes | ⬜ pending |
| 05-T2 | 02-05 | 5 | INTEL-06 | T-02-05-01 | BenchmarkScorecard + Row + Table render with gate filter | typecheck+build | `pnpm typecheck && pnpm test -- --run src/components/benchmark/` | yes | ⬜ pending |
| 05-T3 | 02-05 | 5 | INTEL-06 | — | Nav + layout persistent nav bar | component | `pnpm test -- --run src/components/ && pnpm build` | yes | ⬜ pending |
| 05-T4 | 02-05 | 5 | INTEL-06 | T-02-05-02 | /benchmark page renders aggregates + table + rating dispatch | integration | `pnpm test -- --run src/app/benchmark && pnpm build` | yes | ⬜ pending |
| 06-T1 | 02-06 | 6 | INTEL-03 | T-02-06-01 | prompt v2 + few-shot meets 2048 cache threshold (or decision logged) | manual-live | `test -n "$ANTHROPIC_API_KEY" && pnpm test -- --run src/lib/prompts/__tests__/prompt-size.test.ts` | yes | ⬜ pending |
| 06-T2 | 02-06 | 6 | INTEL-01, INTEL-03 | T-02-06-02 | canonical Audi Q5 replay regression passes | integration | `pnpm test -- --run src/app/api/negotiate/stream/route.test.ts && pnpm test -- --run` | yes | ⬜ pending |
| 06-T3 | 02-06 | 6 | INTEL-01..06 | T-02-06-02, T-02-06-03 | Felipe end-to-end smoke test | manual | Human checkpoint (see 02-06-PLAN.md Task 3) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per 02-RESEARCH.md §Validation Architecture, Wave 0 creates test scaffolds before any implementation. Planner finalized the list in 02-00-PLAN.md Task 2; below is the baseline from research (now all assigned to 02-00):

- [ ] `src/lib/scoring/__tests__/motivation.test.ts` — stubs for INTEL-01 (computeMotivationScore)
- [ ] `src/lib/prompts/__tests__/system-v2.test.ts` — stubs for INTEL-01/02/03/04 (prompt builder composition)
- [ ] `src/lib/prompts/__tests__/tone.test.ts` — stubs for INTEL-04 (tone preset switching)
- [ ] `src/lib/prompts/__tests__/few-shot.test.ts` — stubs for INTEL-03 (Audi Q5 pair assembly)
- [ ] `src/lib/data/__tests__/comparables.test.ts` — stubs for INTEL-02 (array shape + injection format)
- [ ] `src/lib/stores/__tests__/migrations.test.ts` — stubs for D-14 (v1→v2 localStorage migration)
- [ ] `src/lib/stores/__tests__/flags.test.ts` — stubs for AI-SPEC §6 guardrail flag writers (G-01..G-04 positive+negative cases, G-05 SSE truncation)
- [ ] `src/lib/schemas/__tests__/agent-config.test.ts` — stubs for INTEL-04 (config slice validation)
- [ ] `src/components/negotiation/__tests__/AgentThinking.test.tsx` — stubs for INTEL-05 (disclosure component)
- [ ] `src/components/negotiation/__tests__/AgentConfigForm.test.tsx` — stubs for INTEL-04 UI
- [ ] `src/components/negotiation/__tests__/LeftColumnPanel.test.tsx` — stubs for tabs wiring
- [ ] `src/components/benchmark/__tests__/StarRating.test.tsx` — stubs for INTEL-06 rating component
- [ ] `src/app/benchmark/__tests__/page.test.tsx` — stubs for INTEL-06 page integration

**Existing Phase 1 test files extended during Phase 2 (NOT scaffold — already exist):**
- `src/lib/schemas/listing.test.ts` — extend with motivoDaVenda cases (01-T2)
- `src/lib/schemas/negotiate.test.ts` — extend with tone/anchor/promptVersion/alternance (01-T4)
- `src/lib/stores/negotiation.test.ts` — extend massively with Phase 2 slices (03-T1)
- `src/app/api/negotiate/stream/route.test.ts` — extend with v2 branching + canonical replay (03-T2, 06-T2)
- `src/components/negotiation/NegotiationStatusBar.test.tsx` — extend with toggle (04-T4)
- `src/components/negotiation/AdListingForm.test.tsx` (if exists) — extend with motivoDaVenda (04-T1)

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
| Token count empirical measurement | AI-SPEC §4b.5 (Plan 06 Task 1) | Requires live ANTHROPIC_API_KEY | Run `pnpm test -- --run src/lib/prompts/__tests__/prompt-size.test.ts` with env var set; log shows total tokens + cache eligibility |
| Felipe end-to-end smoke | INTEL-01..06 | UAT subjective validation of the 6 requirements integrated | Plan 06 Task 3 checkpoint — see 02-06-PLAN.md for full step-by-step |

---

## Nyquist Compliance Notes

Per 02-RESEARCH.md §Validation Architecture:
- **Sampling rule:** every new deterministic behavior gets ≥2 test cases exercising opposite ends of the input space (e.g., `computeMotivationScore`: 0 dias online + 0 reduções + motivo=outros → expect BAIXA; high dias + many reduções + necessidade_financeira → expect ALTA).
- **Critical path coverage:** `src/lib/scoring/motivation.ts`, `src/lib/stores/migrations.ts`, `src/lib/prompts/system-v2.ts` → 100%.
- **Supporting module coverage:** schemas, hooks, streaming helpers → ≥90%.
- **UI component coverage:** AgentThinking, BenchmarkScorecard, Config tab → ≥70% (interaction contracts, not render pixels).
- **Total new test cases estimated:** ~145 across 7 plans (see individual plan SUMMARYs for breakdown).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (filled by planner)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (checked by plan-checker)
- [ ] Wave 0 covers all MISSING references (13 scaffolds — composition changed: benchmark-selectors replaced by flags per Plan 00 revision; selectors co-located in negotiation.test.ts instead)
- [ ] No watch-mode flags (`--run` used everywhere)
- [ ] Feedback latency < 30s (verified after Wave 0 scaffolds land)
- [ ] `nyquist_compliant: true` set in frontmatter after plan-checker approval

**Approval:** pending
