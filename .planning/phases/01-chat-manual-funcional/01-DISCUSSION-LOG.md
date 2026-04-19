# Phase 1: Chat Manual Funcional — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-04-19
**Phase:** 01-chat-manual-funcional
**Areas discussed:** Layout & Chat UI, State machine + end flow, Summary format (defaults aplicados — user interrompeu)
**Mode:** Interactive com batching (AskUserQuestion de 3–4 perguntas por área, por preferência explícita do user)

---

## Layout & Chat UI

### Q1: Arranjo dos 4 blocos na NegotiationPage

| Option | Description | Selected |
|--------|-------------|----------|
| 3-col desktop: form esq / chat centro / context dir | Form fixa esquerda, chat centro, ContextPanel direita sticky. SummaryPanel substitui chat ao encerrar. max-w-7xl, desktop-first. | ✓ |
| 2-col: form+context esq / chat dir | Coluna esquerda w-80 empilha form + context; chat à direita. Mais espaço horizontal pro chat. | |
| Stepper: form → chat → summary full-width | Tela única por step. Mais linear, menos denso. | |

**User's choice:** 3-col desktop.
**Notes:** Recomendado — alinha com as 4 seções do protótipo v3 NegotiationPage mental model.

### Q2: Estilo das message bubbles

| Option | Description | Selected |
|--------|-------------|----------|
| Port verbatim ChatHistoryView v3 (linhas 207–224) | Avatar Bot/User, agent=bg-blue-50 rounded-tl-none, seller=bg-white rounded-tr-none flex-row-reverse, header "AutoAgent · Rodada N" + timestamp, max-w-xl | |
| iMessage-style sem header na bubble | Bubbles compactas sem label/timestamp dentro. Round = separador horizontal entre grupos. | |
| WhatsApp-ish (bubble quadrada, tail canto inferior) | Tail bottom-left (agent) / bottom-right (seller), sem avatar. Mais familiar pro BR. Drift do protótipo. | ✓ |

**User's choice:** WhatsApp-ish.
**Notes:** Drift consciente do protótipo v3. Reforça o registro pt-BR informal que o system prompt pede.

### Q3: Conteúdo do ContextPanel (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| FIPE + preço-alvo + walkAway (KPICards) | Cards numéricos principais: FIPE, targetPrice (fipe*0.75), walkAwayPrice | |
| Contador de rodadas + progress bar | Round X / 6 com ProgressBar do protótipo | |
| Current offer (última oferta do agente) | Destaque da última oferta. Requer extração regex ou tag no prompt. | ✓ |
| Resumo do anúncio (veículo/km/cidade/dias online) | Eco dos inputs do form. | ✓ |

**User's choice:** Current offer + Resumo do anúncio.
**Notes:** FIPE/alvo/walkAway/rounds explicitamente não foram selecionados — CONTEXT.md D-04 flag que esses 4 valores ainda precisam estar visíveis em algum lugar da tela (planner decide onde).

### Q4: Typing indicator durante SSE streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor piscante no fim do texto streamado | `▌` animado, como ChatGPT/Claude.ai. | |
| Bubble vazia com 3 dôts (WhatsApp-like) + cursor durante stream | Pré-chunk: 3 dôts. Durante stream: mensagem real com cursor. | ✓ |
| Badge global no topo do chat | "AutoAgent está digitando…" no header. | |

**User's choice:** Bubble com 3 dôts + cursor.
**Notes:** Combinação de WhatsApp pré-chunk + streaming visual moderno uma vez que começa a chegar.

---

## State machine + end flow

### Q1: Estados da negociação

| Option | Description | Selected |
|--------|-------------|----------|
| idle → negotiating → ended | 3 estados mínimos. Tipo de encerramento vira metadata. | ✓ |
| idle → fetching_fipe → ready → negotiating → ended | Estados explícitos para fetch FIPE e ready. Mais granular. | |
| idle → negotiating (sub-states: streaming/awaiting_user/ended_*) | Subtipos dentro de `negotiating` pra capturar modo de encerramento. | |

**User's choice:** 3 estados mínimos.
**Notes:** endReason fica como campo separado na session (`'user_stopped' | 'max_rounds' | 'agent_hard_stop'`). Menos estados, mais fácil de testar.

### Q2: Quando round incrementa

| Option | Description | Selected |
|--------|-------------|----------|
| Por par user+agent fechado | Opener do agente = round 1. User+agent = round 2. | ✓ |
| Por mensagem do agente | Cada response do agente = +1. Mais simples de contar. | |
| Manual via tag `<round>N</round>` no prompt | LLM declara round explicitamente. Dá controle ao LLM mas vaza detalhe do sistema. | |

**User's choice:** Por par user+agent.
**Notes:** Match com a semântica de "6 rodadas máx" no brief §9.1.

### Q3: walkAwayPrice

| Option | Description | Selected |
|--------|-------------|----------|
| fipe * 0.90 (10% abaixo FIPE) | Âncora objetiva de mercado. Corredor de 15pp com target (fipe*0.75). | ✓ |
| targetPrice * 1.10 (10% acima alvo) | Corredor fixo independente da FIPE. fipe*0.825. Mais agressivo. | |
| Input editável na UI (default fipe*0.90) | Felipe ajusta antes de iniciar. Flex pra demo, mas vira feature de Fase 2. | |

**User's choice:** fipe * 0.90.
**Notes:** Editabilidade fica pra INTEL-04 em Phase 2.

### Q4: End flow (botão + stream parcial)

| Option | Description | Selected |
|--------|-------------|----------|
| Botão "Encerrar" + modal confirmação + AbortController cancela stream (discarta parcial) | shadcn AlertDialog. Mensagem parcial descartada. Transita negotiating → ended. | ✓ |
| Botão sem modal + stream completa antes de encerrar | Um clique encerra. Stream em curso termina primeiro. | |
| Botão sem modal + cancela imediato (keep partial) | Mensagem parcial fica como "[interrompida]" no histórico. | |

**User's choice:** Botão + modal + AbortController + discarta parcial.
**Notes:** Modal previne click acidental mid-demo. Descarte limpa o summary (sem argumentos incompletos).

---

## Formato do resumo final

**⚠ User interrompeu a discussão antes de responder. Defaults recomendados foram aplicados — revisar CONTEXT.md D-13/D-14/D-15 antes de /gsd-plan-phase 1 se quiser mudar.**

### Q1: Renderização do SummaryPanel (default aplicado)

| Option | Description | Default |
|--------|-------------|---------|
| KPI cards + lista de argumentos | 4 KPICards no topo + bullets de argumentos abaixo | ✓ (default recomendado) |
| Tabela compacta | 2 tabelas side-by-side | |
| Timeline | Rodada por rodada com preço evoluindo | |
| Narrative (LLM-gerado) | 2–3 parágrafos gerados via +1 API call | |

### Q2: Extração de argumentos (default aplicado)

| Option | Description | Default |
|--------|-------------|---------|
| Tags estruturadas no prompt + regex | `<arg>...</arg>` invisível, regex extrai no fim | ✓ (default recomendado) |
| Segunda chamada LLM | +1 API call para resumir argumentos | |
| Whitelist hardcoded | Dict de frases-chave → labels | |

### Q3: Onde renderiza (default aplicado)

| Option | Description | Default |
|--------|-------------|---------|
| Substitui chat no centro + botão "Ver conversa completa" | SummaryPanel no centro. Form/Context laterais permanecem. | ✓ (default recomendado) |
| Modal/drawer full-screen | Overlay com chat blurred atrás | |
| Painel inferior sticky | Summary empilha abaixo do chat | |

---

## Rate limit + kill switch (INFRA-03) — não selecionado para discussão

User escolheu não discutir esta área. CONTEXT.md D-16/D-17/D-18 contém proposta de Claude's Discretion (in-memory LRU + `NEGOTIATION_ENABLED` per-request + route handler). Planner pode adotar ou contestar com pesquisa.

---

## Claude's Discretion (áreas não discutidas)

Documentadas em CONTEXT.md `<decisions>` → "Claude's Discretion (outras decisões não discutidas)":
- Form validation (Zod + react-hook-form)
- FIPE fetch (auto on-blur + input manual sempre visível)
- Zustand store shape + localStorage schema
- Message shape
- Streaming error handling
- System prompt v1 instruction para tags `<arg>`

---

## Deferred Ideas

Nenhuma idéia fora do escopo surgiu. Discussão ficou disciplinada dentro do boundary da Phase 1.
