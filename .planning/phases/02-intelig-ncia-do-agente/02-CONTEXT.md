# Phase 2: Inteligência do Agente — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Areas discussed:** AgentThinking mechanism (INTEL-05), Motivation scoring (INTEL-01), Config semantics (INTEL-04). Demais áreas (INTEL-02 comparáveis, INTEL-03 few-shot Audi Q5, INTEL-06 benchmark, prompt versioning, config persistence) = Claude's Discretion com recomendações abaixo.

<domain>
## Phase Boundary

Phase 2 entrega um agente que toma decisões visivelmente melhores a partir de sinais do anúncio (scoring de motivação, comparáveis sintéticos, few-shot canônico) e permite Felipe/Lucas ajustarem parâmetros (`targetDiscount`, `maxRounds`, `tone`, `initialAnchorStrategy`) direto na UI sem deploy. Adiciona componente `<AgentThinking>` opcional exibindo o rationale do agente por rodada, e rota dedicada `/benchmark` para agregados de qualidade.

**Zero** nesta fase: segundo Claude como PF (Phase 3), batch runner (Phase 3), export CSV/JSON (Phase 4), A/B de prompts side-by-side (Phase 4). Prompt versioning (`promptVersion` stamp) entra em Phase 2 como plumbing para Phase 4 — mas não há UI de comparação ainda.

</domain>

<decisions>
## Implementation Decisions

### AgentThinking (INTEL-05) — discussão completa

- **D-01:** Mecanismo: tag `<rationale>...</rationale>` no system prompt v2. Mesmo pattern do `<arg>` (Phase 1 D-14): agente envolve o raciocínio da rodada em tags; frontend regex-strippa `<rationale>(.*?)</rationale>` do conteúdo renderizado no chat e extrai para o disclosure inline abaixo da bolha. Zero custo de tokens de thinking, funciona char-by-char durante streaming (regex só no final da mensagem, igual `<arg>`).
- **D-02:** Policy de geração: **sempre gerar, esconder no frontend**. System prompt v2 sempre instrui a emitir `<rationale>`. Toggle "Ver pensamento" (na NegotiationStatusBar — locked pela UI-SPEC) só controla visibilidade do disclosure; histórico permanece consistente (todas as rodadas têm rationale armazenado). Custo: tokens extras mesmo quando usuário nunca abre o toggle — aceito como trade-off por consistência de dados (especialmente relevante para `/benchmark` poder inspecionar rationale de sessões passadas).
- **D-03:** Schema: extensão de `Message`. Adicionar campo opcional `rationale?: string` em `src/lib/types/message.ts`. Durante streaming, rationale fica embutido no `content`; ao final da resposta, o useNegotiationStream hook faz o strip + popula `rationale` separadamente. `content` final não contém `<rationale>`.

### Motivation scoring (INTEL-01) — discussão completa

- **D-04:** Algoritmo: **fórmula determinística em código puro**, score 0-100. Inputs: `diasOnline` (signal de urgência — quanto mais tempo sem vender, mais motivado), `reducoes` (signal de ajuste de expectativa — quanto mais reduções, mais pressão), `motivoDaVenda` (signal explícito — mudança/urgência financeira peso maior que upgrade/outros). Zero custo de API, auditável, testável com unit tests. Implementar em `src/lib/scoring/motivation.ts` com função pura `computeMotivationScore(listing): {score: number, label: 'BAIXA'|'MÉDIA'|'ALTA', rationale: string}`.
- **D-05:** Injeção no prompt: **valor + label + rationale em bloco dedicado**. Formato:
  ```
  MOTIVAÇÃO DO VENDEDOR: 72/100 (ALTA)
  Indicadores: 85 dias online, 3 reduções de preço, motivo "necessidade financeira" — todos apontam para pressão de venda.
  ```
  Injetado entre `DADOS DO ANÚNCIO` e `OBJETIVO` no system prompt v2. Dá ao agente contexto acionável (não só número cru), mas mantém o valor para que agente possa calibrar agressividade.
- **D-06:** Signal `motivoDaVenda` = **novo campo no AdListingForm**. Select com opções: `mudanca_cidade`, `upgrade_veiculo`, `necessidade_financeira`, `outros`. Labels pt-BR: "Mudança de cidade", "Upgrade de veículo", "Necessidade financeira", "Outros / não sei". Campo opcional (default `outros`, weight baixo no score). Extensão de `Listing` schema em `src/lib/schemas/listing.ts`.
- **D-07:** Thresholds de label (ajustáveis antes de Phase 2 planner): score `< 40 → BAIXA`, `40-69 → MÉDIA`, `≥ 70 → ALTA`. Planner pode refinar com dados ao longo de Phase 2 se benchmark mostrar calibração ruim.

### Config semantics (INTEL-04) — discussão completa

- **D-08:** `tone: formal | casual` → **substitui bloco TOM do system prompt v2** por preset. Dois presets hardcoded em `src/lib/prompts/tone.ts`:
  - `formal`: "TOM: Profissional. Trate o vendedor por 'senhor/senhora' + nome. Evite gírias. Use 3ª pessoa em momentos de impasse ('a proposta do AutoAgent é...'). Fraseologia sóbria, bancária-friendly."
  - `casual`: "TOM: WhatsApp BR profissional-informal. Trate por primeiro nome. Gírias leves permitidas ('cara', 'irmão'). Emojis raros — no máximo 1 por mensagem, apenas para enfatizar proposta final. Registro conversacional."
- **D-09:** `initialAnchorStrategy: agressivo | moderado` → **tática 1 do prompt parametrizada**. Apenas o valor percentual + adjetivo na fraseologia muda:
  - `agressivo`: "Começar ancorando com oferta inicial ~35% abaixo do preço-alvo, justificada em dados de mercado agressivos (comparáveis de vendas rápidas, urgência explícita)."
  - `moderado`: "Começar ancorando com oferta inicial ~20% abaixo do preço-alvo, justificada em dados de mercado médios (FIPE de referência, média regional)."
  Builder do prompt em `src/lib/prompts/system-v2.ts` recebe `anchorStrategy` e substitui a variável `{anchorInstruction}`.
- **D-10:** **Apply timing = só próxima sessão.** Config é **copiada** para a Session no `startNegotiation` (snapshot do estado atual da config). Edições da config durante uma negociação ativa são permitidas na UI mas **não afetam a sessão em andamento**. Alert visual (shadcn `Alert` já previsto na UI-SPEC) na Config tab quando `status === 'negotiating'`: "Alterações só valem para a próxima negociação." Mantém determinismo do prompt — o histórico de uma sessão inteira usa os mesmos parâmetros.

### Folded Todos

Nenhum todo foi dobrado (não há todos pendentes relevantes capturados).

### Claude's Discretion

Áreas não selecionadas pelo user — planner adota as recomendações abaixo ou contesta com alternativa.

- **D-11:** **Comparáveis sintéticos (INTEL-02)** — array hardcoded em `src/lib/data/comparables.ts` com ~5-8 veículos exemplo (marca/modelo/ano/preço-de-venda/km/cidade). Injetado no prompt v2 como substituição da variável `{comparables}` (que em v1 era stub `"(sem dados de comparáveis nesta fase)"`). Formato: lista bulletizada `"- Honda Civic 2019 EXL 45k km R$ 89k (vendido em SP em 18 dias)"`. Planner define a lista final de acordo com os 2-3 modelos mais comuns nas demos de Felipe.

- **D-12:** **Few-shot Audi Q5 (INTEL-03)** — injetar como **par messages API** (não no system prompt). Pattern oficial Anthropic: antes da primeira user message real, empurrar array de `[{role:'user', content:'...oferta PF exemplo...'}, {role:'assistant', content:'...resposta agente canônico...'}]` extraído do `mockChatHistories[1]` do protótipo v3 (linhas 48-60 do JSX em `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx`). Vantagem: não polui system prompt com ~600 tokens de transcrição; o modelo aprende a táctica pela forma de diálogo. Condensado para 4-6 pares (rodadas canônicas chaves: opener + escalação + concessão + fechamento).

- **D-13:** **Benchmark data flow (INTEL-06)** — reutilizar `history: Session[]` já existente no Zustand store. Adicionar 2 campos opcionais em `Session`: `userRating?: 1|2|3|4|5` (estrelas do StarRating na UI-SPEC) e `userNote?: string` (campo textual opcional para anotações manuais — prepara Phase 4 EXPORT-05). Rota `/benchmark` mostra `history.filter(s => s.status === 'ended')` agregado. Nenhum array separado, nenhuma import manual. Aggregates computados por selector Zustand: `aggregateBenchmark = (sessions) => ({avgReductionVsFipe, avgRounds, avgRating, count})`.

- **D-14:** **Prompt versioning** — constante `export const PROMPT_VERSION = 'v2.0.0'` em `src/lib/prompts/system-v2.ts`. Stamp em `Session` via campo novo `promptVersion: string` (populado no `startNegotiation`). Migration localStorage: versioning da key (`autoagent-playground-v1` → `autoagent-playground-v2`) com função `migrateV1ToV2(oldState)` em `src/lib/stores/migrations.ts` que injeta `promptVersion: 'v1.0.0'` nas sessões antigas. Phase 4 reusará este campo para comparação A/B.

- **D-15:** **Config persistence schema** — extensão do Zustand store existente, **não** um store separado. Adicionar slice `agentConfig: {targetDiscount: number, maxRounds: number, tone: 'formal'|'casual', initialAnchorStrategy: 'agressivo'|'moderado'}` em `src/lib/stores/negotiation.ts`. Persist middleware já cobre o store inteiro — mesma key `autoagent-playground-v1`, agora v2. Defaults em Phase 2: `{targetDiscount: 0.25, maxRounds: 6, tone: 'casual', initialAnchorStrategy: 'moderado'}` (cover backward-compat com Phase 1 D-09/D-10).

- **D-16:** **System prompt v2 organization** — arquivo novo `src/lib/prompts/system-v2.ts`. Phase 1 §9.1 brief verbatim preservado como base + 4 mutations:
  1. Novo bloco `MOTIVAÇÃO DO VENDEDOR: {score}/100 ({label})\n{rationale}` entre DADOS e OBJETIVO (D-05)
  2. `{comparables}` agora é lista real, não stub (D-11)
  3. Tática 1 parametrizada via `{anchorInstruction}` (D-09)
  4. Bloco TOM substituível via preset (D-08)
  5. Instrução adicional após bloco `FORMATO INTERNO DE ARGUMENTOS`: "FORMATO INTERNO DE RATIONALE: Envolva em `<rationale>...</rationale>` em cada resposta uma explicação curta (2-3 frases) do raciocínio que te levou a essa tática/valor. Tags invisíveis ao vendedor, apenas para análise interna." (D-01)
  
  Phase 1 `system-v1.ts` permanece intocado (EXPORT-04 A/B em Phase 4 precisa de ambos).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto e domínio
- `.planning/PROJECT.md` — Constraints (stack locked, LLM locked, sem DB, sem auth), Key Decisions
- `.planning/REQUIREMENTS.md` §INTEL — INTEL-01 a INTEL-06 verbatim
- `.planning/ROADMAP.md` Phase 2 — Success Criteria (5 critérios) + dependência em Phase 1
- `CLAUDE.md` — Conventions enforcement

### Phase 1 (base a estender)
- `.planning/phases/01-chat-manual-funcional/01-CONTEXT.md` — Decisões D-01 a D-18 de Phase 1 (session shape, message shape, system prompt structure, `<arg>` pattern — base do `<rationale>`)
- `.planning/phases/01-chat-manual-funcional/01-RESEARCH.md` — Stack research de Phase 1 (Anthropic SDK patterns, streaming via route handler, Zustand persist middleware)
- `.planning/phases/01-chat-manual-funcional/01-AI-SPEC.md` §1b — Domain context e failure modes do agente (critérios de eval subjective que informam INTEL-06 qualidade 1-5)

### Phase 2 contracts
- `.planning/phases/02-intelig-ncia-do-agente/02-UI-SPEC.md` — **Design contract locked** — todas as decisões visuais das 3 surfaces (Config tab, AgentThinking disclosure, /benchmark). Agents MUST respect this verbatim — não re-decidir layout/cor/typography.

### Source code de Phase 1 (reutilizar)
- `src/lib/stores/negotiation.ts` — Zustand store atual. Extender com `agentConfig` slice (D-15) e campos novos em `Session` (`promptVersion`, `userRating`, `userNote` — D-13, D-14).
- `src/lib/types/session.ts` + `src/lib/types/message.ts` — Adicionar `rationale?: string` em Message (D-03), `promptVersion`, `userRating`, `userNote` em Session.
- `src/lib/schemas/listing.ts` — Adicionar campo `motivoDaVenda` com enum 4 valores (D-06).
- `src/lib/prompts/system-v1.ts` — **Não modificar**. Copiar base, criar `system-v2.ts` novo (D-16).
- `src/components/negotiation/useNegotiationStream.ts` — Hook que já faz strip de `<arg>`. Adicionar strip de `<rationale>` no mesmo lugar (D-01).
- `src/components/negotiation/NegotiationStatusBar.tsx` — Já é o local do toggle "Ver pensamento" (per UI-SPEC).

### Referências externas
- Anthropic messages API few-shot pattern — oficial docs, usar `mcp__context7__*` para fetch current syntax quando planner implementar D-12.
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 48-60 — `mockChatHistories[1]` Audi Q5 source verbatim para D-12.
- `C:\Users\pc\Downloads\projeto autoagent atualizado\PROJECT-BRIEF.md` §9.1 — Template do system prompt v1, base de v2.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Zustand store `negotiation.ts`** — usar `extend with slice` pattern para `agentConfig`. Persist middleware já configurado com versioned key.
- **`<arg>` regex strip em useNegotiationStream** — código existente é o template exato para o novo strip de `<rationale>` (mesma lógica, regex diferente).
- **Session + Message types** — extensíveis via optional fields, backward-compat via migration function.
- **KPICard pattern** (Phase 1) — usado no SummaryPanel atual; UI-SPEC /benchmark reusa o mesmo componente para os 4 cards de agregados.
- **shadcn `Tabs`, `RadioGroup`, `Alert`** — componentes que serão adicionados via `npx shadcn add` (flagged pela UI-SPEC).
- **lucide `Star` icon** — usado no StarRating (flagged pela UI-SPEC).

### Established Patterns

- **Schema validation client+server via Zod** — novo campo `motivoDaVenda` segue o mesmo pattern do schema `listing.ts`.
- **Derived values via Zustand selectors** — aggregates de `/benchmark` (média de redução, rodadas, rating) devem ser selectors, não state duplicado.
- **Route handlers em `app/api/{name}/route.ts`** — **nenhum novo endpoint em Phase 2**. Tudo client-side ou reutilizando `/api/negotiate/stream` (que já aceitará system-v2 via flag de parâmetro ou substituindo v1 — planner decide).
- **Test-first para lib/utils puros** — `computeMotivationScore` tem unit tests; `<rationale>` strip tem unit test no hook.

### Integration Points

- **`/api/negotiate/stream` route handler** — precisa aceitar os novos parâmetros de config (`tone`, `initialAnchorStrategy`) para passar ao prompt builder. Body schema (`src/lib/schemas/negotiate.ts`) extende com esses campos.
- **AdListingForm** — novo campo `motivoDaVenda` no form; Zod schema extende + react-hook-form field adicionado.
- **ContextPanel (coluna direita)** — eco do `motivationScore` + rationale pode ser displayed aqui junto com "Resumo do anúncio" (Phase 1 D-03). Planner decide se mostra score na UI ou se é só dado interno injetado no prompt. Recomendação: mostrar label (ALTA/MÉDIA/BAIXA) + rationale na ContextPanel para dar Felipe material de conversa nas demos.
- **NegotiationStatusBar** — adicionar toggle "Ver pensamento" (locked pela UI-SPEC §2.3).

</code_context>

<specifics>
## Specific Ideas

- **Pattern `<arg>` é a referência** — D-01 (rationale) segue exatamente o mesmo contrato do Phase 1 D-14 (argumentos). Consistência conceitual importa: ambos são tags invisíveis ao vendedor, strippadas no chat, extraídas para surfaces internas diferentes (SummaryPanel vs AgentThinking disclosure).
- **Fórmula determinística é pro-debuggability** — Felipe precisa conseguir explicar "por que esse anúncio foi classificado como ALTA" em uma demo. Formula pura + rationale string explícito atende isso. LLM classifier (D-04 alternativa) seria caixa-preta.
- **System prompt v2 coexiste com v1** — decisão arquitetural deliberada para habilitar EXPORT-04 (A/B side-by-side em Phase 4). v1 **não** é modificado em Phase 2; v2 é aditivo.
- **Motivação preditiva, não reativa** — score é calculado no client no momento de iniciar a negociação a partir dos dados do form, não depois pela interação. Isso significa que se o vendedor responder no chat "estou com muita pressa", o agente não re-scora — apenas usa a info tática via `<arg>`/resposta normal. Re-scoring dinâmico seria Phase 3+ (se for validado ter valor).

</specifics>

<deferred>
## Deferred Ideas

- **Re-scoring dinâmico de motivação a partir de sinais do chat** — anotado. Ideia: LLM extrai "pressa", "resistência", "urgência financeira" das mensagens do vendedor e ajusta score em tempo real. Não é Phase 2 — seria Phase 3+ e precisa ser validado ter valor tático (vs o agente simplesmente ler o contexto natural da conversa). Não adicionar à ROADMAP ainda.
- **Campo "motivo da venda" livre (textarea)** — considerado em vez de select. Rejeitado por ora: select dá determinismo ao score (4 valores mapeiam para pesos fixos). Textarea seria Phase 3+ se quisermos LLM-based scoring.
- **Editar prompt na UI** — não é Phase 2. Config panel edita targetDiscount/maxRounds/tone/initialAnchorStrategy apenas. Edit raw prompt seria Phase 4 (prep pra A/B).

### Reviewed Todos (not folded)

Nenhum todo reviewed — não havia todos pendentes relevantes para Phase 2.

</deferred>

---

*Phase: 02-intelig-ncia-do-agente*
*Context gathered: 2026-04-20*
