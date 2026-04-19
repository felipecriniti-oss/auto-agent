---
phase: 01
slug: chat-manual-funcional
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.x + @testing-library/react + jsdom |
| **Config file** | `vitest.config.ts` (created in Wave 0) |
| **Quick run command** | `pnpm vitest run src/lib/schemas` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~5 seconds (full), ~500ms (schemas quick) |

No E2E per brief §4.3 (Playwright/Cypress out of scope).

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run` filtered to files touched by the task
- **After every plan wave:** Run `pnpm vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm build` success + manual Vercel preview walkthrough by Felipe
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| INFRA-01 | `pnpm dev` starts Next, `/` renders | smoke | `pnpm build && pnpm start` (manual post-build check) | ❌ W0 | ⬜ pending |
| INFRA-02 | Vercel preview on PR, prod on merge to main | manual-only | — (Vercel dashboard) | N/A | ⬜ pending |
| INFRA-03 | 6th request from same IP in <60s → 429 | unit | `pnpm vitest run src/lib/server/rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| INFRA-03 | `NEGOTIATION_ENABLED=false` → 503 | integration | `pnpm vitest run src/app/api/negotiate/stream/route.test.ts -t "kill switch"` | ❌ W0 | ⬜ pending |
| FIPE-01 | Valid marca/modelo/ano returns `{fipe: number}` | integration | `pnpm vitest run src/app/api/fipe/route.test.ts` (fetch mocked) | ❌ W0 | ⬜ pending |
| FIPE-01 | Zod rejects malformed Parallelum response | unit | `pnpm vitest run src/lib/schemas/fipe.test.ts` | ❌ W0 | ⬜ pending |
| FIPE-01 | `"R$ 268.000,00"` → `268000` | unit | `pnpm vitest run src/lib/utils/fipe.test.ts` | ❌ W0 | ⬜ pending |
| FIPE-01 | Client hook: 200 / 404 / 502 / abort / debounce branching | unit | `pnpm vitest run src/components/negotiation/useFipeLookup.test.ts` | ❌ W0 | ⬜ pending |
| FIPE-02 | Manual input replaces fetched FIPE in store | integration | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "manual fipe"` | ❌ W0 | ⬜ pending |
| NEG-01 | Listing form Zod validation (8 fields) | unit | `pnpm vitest run src/lib/schemas/listing.test.ts` | ❌ W0 | ⬜ pending |
| NEG-02 | `targetPrice = fipe * 0.75`, `walkAwayPrice = fipe * 0.90` | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "derived prices"` | ❌ W0 | ⬜ pending |
| NEG-03 | SSE route emits `data:` chunks with proper shape | integration | `pnpm vitest run src/app/api/negotiate/stream/route.test.ts` (Anthropic mocked) | ❌ W0 | ⬜ pending |
| NEG-03 | System prompt substitutes all placeholders | unit | `pnpm vitest run src/lib/prompts/system-v1.test.ts` | ❌ W0 | ⬜ pending |
| NEG-04 | Streaming hook accumulates chunks in order | unit | `pnpm vitest run src/components/negotiation/useNegotiationStream.test.ts` | ❌ W0 | ⬜ pending |
| NEG-04 | MessageBubble strips `<arg>` tags from display | unit | `pnpm vitest run src/components/negotiation/MessageBubble.test.tsx` | ❌ W0 | ⬜ pending |
| NEG-04 | D-04 status bar renders FIPE / target / walk-away / round labels | unit | `pnpm vitest run src/components/negotiation/NegotiationStatusBar.test.tsx` | ❌ W0 | ⬜ pending |
| NEG-04 | Autoscroll pin-on-scroll-up | manual-only | — (visual behavior, Felipe's demo run) | N/A | ⬜ pending |
| NEG-04 | Typing indicator 3-phase transition | manual-only | — (visual; demo run) | N/A | ⬜ pending |
| NEG-05 | Summary extracts `<arg>` matches + dedupes | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "getArgumentsUsed"` | ❌ W0 | ⬜ pending |
| NEG-05 | % reduction vs askPrice + vs FIPE computed | unit | `pnpm vitest run src/components/negotiation/SummaryPanel.test.tsx` | ❌ W0 | ⬜ pending |
| STATE-01 | Session shape mutations consistent | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts` (multi-test) | ❌ W0 | ⬜ pending |
| STATE-01 | D-08: round increments on agent finalization only | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "round increments"` | ❌ W0 | ⬜ pending |
| STATE-02 | localStorage round-trip preserves state | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "persist roundtrip"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Greenfield project — ALL test files + framework must be created in Wave 0:

- [ ] `vitest.config.ts` — Vitest + React Testing Library setup (`environment: 'jsdom'`)
- [ ] `vitest.setup.ts` — global mocks (fetch, crypto.randomUUID) + jest-dom matchers
- [ ] `src/lib/schemas/listing.test.ts` — covers NEG-01
- [ ] `src/lib/schemas/fipe.test.ts` — covers FIPE-01 validation
- [ ] `src/lib/utils/fipe.test.ts` — covers `parseFipeValor`
- [ ] `src/app/api/fipe/route.test.ts` — covers FIPE-01 integration (fetch mocked)
- [ ] `src/app/api/negotiate/stream/route.test.ts` — covers NEG-03 + INFRA-03 (Anthropic mocked)
- [ ] `src/lib/server/rate-limit.test.ts` — covers INFRA-03
- [ ] `src/lib/prompts/system-v1.test.ts` — covers NEG-03 prompt assembly
- [ ] `src/lib/stores/negotiation.test.ts` — covers STATE-01 + STATE-02
- [ ] `src/components/negotiation/MessageBubble.test.tsx` — covers NEG-04 `<arg>` stripping
- [ ] `src/components/negotiation/NegotiationStatusBar.test.tsx` — covers NEG-04 D-04 status bar labels
- [ ] `src/components/negotiation/SummaryPanel.test.tsx` — covers NEG-05
- [ ] `src/components/negotiation/useNegotiationStream.test.ts` — covers NEG-04 stream consumption
- [ ] `src/components/negotiation/useFipeLookup.test.ts` — covers FIPE-01 client-side branching (200/404/502/abort/debounce/unmount)
- [ ] Install dev deps: `pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/dom vite-tsconfig-paths`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel preview + production deploy | INFRA-02 | Platform-level deployment state | PR opened → preview URL in comment. Merge to main → production URL updates. Verify <2s load via browser DevTools Network tab. |
| Autoscroll pin-on-scroll-up (D-06) | NEG-04 | Complex visual-temporal behavior hard to test in jsdom | During a negotiation: (1) Stay at bottom while new messages arrive — should auto-follow. (2) Scroll up mid-stream — should NOT force scroll. (3) "↓ Nova mensagem" button should appear. (4) Click button — should snap to bottom. |
| Typing indicator 3-phase transition (D-05) | NEG-04 | Purely visual timing | (1) Pré-first-chunk: 3 animated dots in empty bubble. (2) First chunk arrives: bubble fills, cursor `▌` animates at end. (3) Stream completes: cursor disappears, bubble static. |
| End-flow modal + AbortController (D-11) | NEG-05 | Integration of UI + network cancellation | Mid-stream: click "Encerrar" → AlertDialog opens → confirm → stream stops immediately (Network tab shows aborted request to `/api/negotiate/stream`), partial message does NOT appear in history, SummaryPanel mounts. |
| Live Felipe demo run | ALL | Full end-to-end validation of real user flow | Felipe fills a real anúncio, runs a 4-6 round negotiation manually, encerra, reviews summary. Everything visible must work. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags in CI (always `vitest run`)
- [ ] Feedback latency <5s (full suite)
- [ ] Coverage per file: `lib/**` ≥80%, `app/api/**` ≥70%, UI ≥40% (no global threshold)
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 green

**Approval:** pending
</content>
</invoke>
