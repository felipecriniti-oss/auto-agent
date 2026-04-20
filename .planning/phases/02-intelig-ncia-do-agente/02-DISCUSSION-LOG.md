# Phase 2: Inteligência do Agente — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 02-intelig-ncia-do-agente
**Areas discussed:** AgentThinking (INTEL-05), Motivation scoring (INTEL-01), Config semantics (INTEL-04)
**Areas not selected:** Few-shot Audi Q5 (INTEL-03) — enviado para Claude's Discretion

---

## Gray Area Selection

**Question:** Quais áreas cinzentas de Phase 2 você quer discutir?

| Option | Description | Selected |
|--------|-------------|----------|
| AgentThinking (INTEL-05) | Mecanismo para produzir rationale visível — tag / extended thinking / tool / post-hoc | ✓ |
| Motivation scoring (INTEL-01) | Fórmula / heurística / LLM classifier; formato de injeção no prompt | ✓ |
| Config semântica (INTEL-04) | O que tone e initialAnchorStrategy mudam concretamente; timing de aplicação | ✓ |
| Few-shot Audi Q5 (INTEL-03) | Verbatim / condensado / messages API pair | (Claude's Discretion) |

**User notes:** "Não estou conseguindo selecionar corretamente não sei porque, porém a opção 1 e a opção 2 e 3." — UI de multi-select apresentou glitch; user indicou explicitamente as 3 primeiras via texto.

---

## AgentThinking (INTEL-05)

**Question 1:** Como o agente produz o rationale exibido no disclosure?

| Option | Description | Selected |
|--------|-------------|----------|
| Tag `<rationale>` no prompt | Mesmo pattern de `<arg>`: regex-strip do chat + extrai p/ disclosure. Zero custo extra. | ✓ |
| Extended thinking nativo | Bloco `thinking` da Anthropic API (Sonnet 4.5+). Natural mas + tokens + não streamable char-by-char. | |
| 2ª chamada LLM pós-hoc | Chamada separada quando user expande disclosure. Baixo custo OFF; latency alta ao abrir. | |

**User's choice:** Tag `<rationale>` no prompt
**Notes:** Consistência com pattern existente de `<arg>` tags em Phase 1. Determinístico, barato, testável.

---

**Question 2:** Quando toggle "Ver pensamento" está OFF, o rationale deve ser gerado?

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre gerar, esconder | Tokens extra sempre, mas histórico consistente. Benchmark pode inspecionar sessões antigas. | ✓ |
| Condicional: só gera se ON | Economiza tokens OFF, mas histórico inconsistente entre rodadas. | |

**User's choice:** Sempre gerar, esconder
**Notes:** Consistência de dados prioridade sobre economia de tokens. Benchmark e futuro export (Phase 4) dependem de ter rationale para todas as rodadas.

---

## Motivation Scoring (INTEL-01)

**Question 1:** Como calcular o scoring de motivação do PF?

| Option | Description | Selected |
|--------|-------------|----------|
| Fórmula determinística | 0-100 via peso de signals. Código puro, zero API, auditável. | ✓ |
| Heurísticas LOW/MED/HIGH | Thresholds categóricos. Mais legível, perde granularidade. | |
| LLM classifier | 2ª chamada Claude Haiku pré-negociação. Caro em batch. | |

**User's choice:** Fórmula determinística
**Notes:** Debuggability importa — Felipe precisa explicar o score em demos.

---

**Question 2:** Como injetar o score no system prompt?

| Option | Description | Selected |
|--------|-------------|----------|
| Valor + label + rationale | "MOTIVAÇÃO: 72/100 (ALTA) — 85 dias online, 3 reduções". Context-rich. | ✓ |
| Só label categórico | "MOTIVAÇÃO: ALTA". Enxuto. | |
| Só número | "MOTIVAÇÃO: 72/100". Modelo inferir. | |

**User's choice:** Valor + label + rationale
**Notes:** Dá ao agente material explícito para calibrar agressividade.

---

**Question 3:** Quais signals entram na fórmula?

| Option | Description | Selected |
|--------|-------------|----------|
| diasOnline + reducoes apenas | Campos já existentes. Motivo declarado = Claude's Discretion futuro. | |
| + campo novo "Motivo da venda" | Select no AdListingForm (mudança/upgrade/financeira/outros). Score mais rico. | ✓ |

**User's choice:** + campo novo "Motivo da venda"
**Notes:** Amplifica o score com signal forte. Schema de Listing extende. Valores determinísticos mapeiam para pesos fixos.

---

## Config Semantics (INTEL-04)

**Question 1:** O que "tone: formal" vs "tone: casual" muda no system prompt?

| Option | Description | Selected |
|--------|-------------|----------|
| Modifier bloco TOM | Bloco TOM substituído por preset. Alto controle, 2 strings hardcoded. | ✓ |
| Tone prefix string | Frase adicionada. Modelo interpreta. Enxuto, menos controle. | |
| Dois templates separados | SYSTEM_PROMPT_FORMAL + SYSTEM_PROMPT_CASUAL. Duplicação alta. | |

**User's choice:** Modifier bloco TOM
**Notes:** Apenas um bloco varia, resto do prompt é compartilhado.

---

**Question 2:** O que "initialAnchorStrategy: agressivo" vs "moderado" muda?

| Option | Description | Selected |
|--------|-------------|----------|
| Tática 1 parametrizada | Só percentual + adjetivo mudam. Mínima mudança. | ✓ |
| Variação completa da tática 1 | 2 parágrafos diferentes (agressivo cita hard stops; moderado amigável). | |

**User's choice:** Tática 1 parametrizada
**Notes:** Mantém simplicidade; planner pode expandir se benchmark Phase 2 mostrar diferença insuficiente.

---

**Question 3:** Os parâmetros editados na UI afetam a sessão ativa ou só a próxima?

| Option | Description | Selected |
|--------|-------------|----------|
| Só próxima sessão | Config copiada para Session no startNegotiation. Alert quando editando durante negociação. | ✓ |
| Aplica imediato (próxima rodada) | Mudança vale p/ rodada seguinte. Dinâmico mas risco de incoerência. | |

**User's choice:** Só próxima sessão
**Notes:** Determinismo do prompt para todo o histórico de uma sessão. Alert UI (shadcn Alert — já previsto na UI-SPEC) comunica a regra ao usuário.

---

## Claude's Discretion

Áreas onde o user não quis discutir; planner recebe recomendações em CONTEXT.md D-11 a D-16:

- **Comparáveis sintéticos (INTEL-02)** → array hardcoded em `src/lib/data/comparables.ts`, 5-8 exemplos, formato bullet
- **Few-shot Audi Q5 (INTEL-03)** → messages API pair (não system prompt); 4-6 rodadas condensadas do `mockChatHistories[1]` do protótipo v3
- **Benchmark data flow (INTEL-06)** → reutilizar `history: Session[]` existente; adicionar `userRating` + `userNote` opcionais em Session; aggregates via selector
- **Prompt versioning** → constante `PROMPT_VERSION` + campo `promptVersion` em Session; migration localStorage v1→v2
- **Config persistence schema** → extensão do store existente com slice `agentConfig`; mesma key versionada
- **System prompt v2 organization** → arquivo novo `system-v2.ts`; v1 preservado intocado (EXPORT-04 Phase 4)

---

## Deferred Ideas

Ideas mentioned during discussion that were noted for future phases:

- **Re-scoring dinâmico de motivação a partir de sinais do chat** (não-Phase-2; precisa validação)
- **Campo "motivo da venda" livre/textarea** (hoje: select; textarea seria Phase 3+ se LLM-based)
- **Editar prompt raw na UI** (não-Phase-2; Phase 4 A/B prep)

---
