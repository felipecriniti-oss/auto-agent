# Phase 1: Chat Manual Funcional — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Areas discussed:** Layout & Chat UI (full), State machine + end flow (full), Summary format (defaults aplicados — user interrompeu para acelerar). Rate limit + kill switch = Claude's Discretion com proposta.

<domain>
## Phase Boundary

Felipe abre URL pública (Vercel) → preenche formulário com dados reais de um anúncio (marca/modelo/ano/km/preço pedido/cidade/dias online/reduções) → sistema busca FIPE via Parallelum e calcula preço-alvo (25% abaixo default) → Felipe chama o agente Claude Sonnet 4.6 via SSE streaming e negocia manualmente (o "PF" é o próprio Felipe ou entrevistado respondendo) → encerra com botão e vê resumo estruturado (rodadas, % reduções, argumentos usados). Histórico persiste em localStorage. Carrega em <2s na Vercel. **Zero**: banco de dados, autenticação, scraping, mobile, i18n, Fase 2+ features (scoring de motivação, few-shot Audi Q5, painel de config, <AgentThinking>, batch, export, A/B de prompts).

</domain>

<decisions>
## Implementation Decisions

### Layout & Chat UI (discussão completa — escolhas explícitas do user)

- **D-01:** NegotiationPage em 3 colunas desktop: AdListingForm à esquerda (fixa, anchor da sessão), ChatView no centro (maior), ContextPanel à direita (sticky). `max-w-7xl` container, desktop-first. SummaryPanel substitui o ChatView central ao encerrar.
- **D-02:** Message bubbles estilo WhatsApp: bubble mais quadrada, tail no canto inferior (bottom-left para `agent`, bottom-right para `seller`), **sem avatar lateral**. Drift consciente do `ChatHistoryView` do protótipo v3 (linhas 207–224) — o playground adota registro WhatsApp-ish para reforçar familiaridade PT-BR na demo ao vivo, enquanto o produto maior usa o estilo avatar+bubble do protótipo.
- **D-03:** ContextPanel durante a negociação exibe **apenas**: (a) *Current offer* — a última oferta do agente em destaque (card com violet accent, `text-2xl font-bold`) e (b) *Resumo do anúncio* — eco dos inputs-chave (veículo, km, cidade, dias online). Reusa o padrão KPICard do protótipo v3 (linhas 141–151).
- **D-04:** FIPE, targetPrice, walkAwayPrice e contador de rodadas **NÃO** vão no ContextPanel (escolha consciente do user). Claude's Discretion: planner decide surface em uma faixa acima/abaixo do form area (próximo ao campo FIPE) ou como "negotiation status bar" fina no topo do ChatView. Critério obrigatório: esses 4 valores precisam estar visíveis durante a negociação — não podem ficar só no store.
- **D-05:** Typing indicator em 3 fases: (a) pré-primeiro-chunk: bubble vazia com 3 dôts animados (WhatsApp-like), (b) durante streaming char-by-char: substitui pelos chunks chegando com cursor `▌` animado no final, (c) pós-stream: cursor desaparece, bubble fica estática. Atende NEG-04 ("indicador visual de agente digitando") + mantém char-by-char.
- **D-06:** Autoscroll com pin-on-scroll-up: auto-scrolla para a última mensagem enquanto o user está no bottom; se o user rolou pra cima, **não força scroll** (respeita leitura). Botão flutuante "↓ Nova mensagem" aparece quando há scroll pendente.

### State machine + end flow (discussão completa — escolhas explícitas do user)

- **D-07:** Zustand store com 3 estados: `idle | negotiating | ended`. Transições: (a) `idle → negotiating` ao clicar "Iniciar negociação" após form válido + FIPE resolvida; (b) `negotiating → ended` ao clicar "Encerrar negociação" (manual) OU ao atingir `maxRounds=6` sem fechar (auto-trigger via LLM hard stop). Não há `ended_capitulated` / `ended_walkaway` como estado separado — o tipo de encerramento é metadata no objeto de sessão.
- **D-08:** Round incrementa **por par user+agent fechado**. Regra: primeira mensagem do agente (opener, sem user prévio) = round 1. User responde → agente responde = round 2. Cada resposta completa do agente finaliza o round atual. Campo `round: number` no store, não no LLM.
- **D-09:** `walkAwayPrice = fipe * 0.90` — 10% abaixo da FIPE. Injetado no system prompt v1 junto com `targetPrice` e `maxRounds`. Não é editável na UI em Phase 1 (editabilidade é Fase 2, INTEL-04).
- **D-10:** `targetPrice = fipe * (1 - 0.25)` = fipe * 0.75. `targetDiscount` default = 25%. Não editável em Phase 1. Fields derivados no store via selector, não duplicados em state.
- **D-11:** End flow: botão "Encerrar negociação" no header do ChatView (variante danger `bg-red-50 text-red-700`, íconeLucide `XCircle`). Click → `shadcn AlertDialog` de confirmação "Encerrar agora? O resumo será gerado com as rodadas já completas. Esta ação não pode ser desfeita." → confirmed: AbortController cancela o SSE em curso, mensagem parcial é **descartada** (não persiste no histórico), state transita `negotiating → ended`, SummaryPanel monta.
- **D-12:** Auto-trigger de `ended` quando `round === maxRounds` e o agente acabou de responder sem fechar: state transita automaticamente, botão "Encerrar" vira disabled. System prompt v1 já instrui o agente a executar "exit protocol" (hard stop do brief §9.1) na rodada final.

### Formato do resumo final (defaults recomendados aplicados — revisar antes de plan-phase)

- **D-13:** [DEFAULT APLICADO] SummaryPanel em KPI cards + lista de argumentos. Topo: 4 KPICards em grid `grid-cols-4 gap-4`: (1) Rodadas `N/6`, (2) Preço inicial ofertado / Preço final, (3) % redução vs preço pedido (emerald if >= 20%, amber if 10–20%, red if < 10%), (4) % redução vs FIPE (mesmo color coding). Abaixo: lista de argumentos usados pelo agente em bullets com ícone `<Lightbulb>` do lucide-react. Reusa KPICard pattern do protótipo v3 (linhas 141–151).
- **D-14:** [DEFAULT APLICADO] Argumentos usados extraídos via **tags estruturadas no prompt + regex**. System prompt v1 instrui o agente a envolver cada argumento-chave em `<arg>...</arg>` invisível; no momento do rendering, regex strippa as tags antes de exibir no chat; ao encerrar, regex extrai todos os matches de `<arg>(.*?)</arg>` do histórico e deduplica. Determinístico, zero custo de API extra, funciona com streaming (tags podem atravessar chunks mas são processadas só no fim).
- **D-15:** [DEFAULT APLICADO] SummaryPanel **substitui** o ChatView no centro. Header do summary tem 2 botões: (a) "Ver conversa completa" → alterna de volta pro ChatView (somente leitura, chat bloqueado), (b) "Nova negociação" → reseta o store e volta pra `idle` (histórico da sessão anterior vai pra localStorage array). ContextPanel direita permanece visível. Form esquerda fica **disabled** mas visível (mostra o que foi negociado).

### Rate limit + kill switch (INFRA-03) — Claude's Discretion

Não foi selecionada para discussão. Proposta para o planner adotar ou contestar:

- **D-16:** Rate limit: in-memory LRU cache simples no route handler `/api/negotiate/stream` — Map<ip, {count, windowStart}>. Janela de 60s, limite de **5 negociações iniciadas por IP**. IP vem de `request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'`. Resposta quando bloqueado: 429 com body JSON `{error: 'rate_limited', retryAfter: N}`. Frontend mostra toast `shadcn sonner` "Muitas negociações recentes. Tente novamente em {N}s." **Não** usa Vercel KV / Upstash Redis (adiciona infra; playground não precisa de cross-instance) — limitação aceita: edge workers isolados têm caches separados; Felipe está atrás de 1 IP na demo, não vai escalar. Comentário no código: `// TODO: Upstash Redis se virar produção`.
- **D-17:** Kill switch: `process.env.NEGOTIATION_ENABLED !== 'false'` checado **per-request** no começo do handler (antes de qualquer validação ou LLM call). Se false: retorna 503 com `{error: 'disabled', reason: 'Negotiations temporarily disabled'}`. Frontend mostra banner sticky vermelho no topo da page "Negociações temporariamente indisponíveis" + desabilita o botão "Iniciar negociação". Vantagem: Felipe pode desligar na Vercel env vars (deploy instantâneo da flag, sem rebuild) se algo der errado numa demo.
- **D-18:** Middleware vs route handler: **route handler**. Next.js 15 middleware na edge tem restrições de runtime (não pode importar SDK Anthropic, tudo que for não-edge é bloqueado). Colocar rate limit + kill switch direto no `route.ts` do endpoint é o único lugar onde já temos acesso ao handler completo e não duplica lógica entre middleware + route.

### Claude's Discretion (outras decisões não discutidas)

- **Form validation**: Zod schema compartilhado client+server para o body de `/api/negotiate/stream` e para o form. Validação client-side on-submit com `react-hook-form` + `@hookform/resolvers/zod`; erros renderizados com `<FormMessage>` do shadcn. Campos: marca/modelo/ano/km (number ≥0) / precoPedido (number >0) / cidade / diasOnline (number ≥0) / reducoes (number ≥0).
- **FIPE fetch**: auto-fetch on-blur após marca+modelo+ano preenchidos (debounce 300ms). Input manual de fallback **sempre visível abaixo** do campo auto-FIPE com label "Se a busca automática falhar, insira a FIPE manualmente". FIPE resolvida (auto ou manual) preenche o mesmo `fipe: number` no store. Sem cache de Parallelum na sessão (v2: MKTDATA-02).
- **Parallelum schema**: Zod valida a resposta de Parallelum nos 3 endpoints sequenciais (`/marcas`, `/marcas/{codMarca}/modelos`, `/marcas/{codMarca}/modelos/{codModelo}/anos`, `/marcas/{codMarca}/modelos/{codModelo}/anos/{codAno}` → retorna `Valor: "R$ 268.000,00"`). Route handler `/api/fipe` faz as 4 chamadas e retorna `{fipe: number, marca, modelo, ano}` ou `{error}`.
- **Zustand store shape**: um objeto `currentSession` para a sessão ativa + array `history: Session[]` para sessões encerradas. Persist middleware do Zustand grava tudo em `autoagent-playground-v1` localStorage key. Key versionada (`-v1`) pra futuras migrações.
- **Session shape**: `{id: string, listing: {marca, modelo, ano, km, precoPedido, cidade, diasOnline, reducoes}, fipe: number, targetPrice: number, walkAwayPrice: number, maxRounds: 6, messages: Message[], round: number, status: 'idle' | 'negotiating' | 'ended', startedAt: string | null, endedAt: string | null, endReason: 'user_stopped' | 'max_rounds' | 'agent_hard_stop' | null}`.
- **Message shape**: `{id: string, role: 'agent' | 'seller', round: number, content: string, timestamp: string, isStreaming?: boolean}`.
- **Streaming error handling**: se SSE falhar mid-stream (network error, Anthropic 500/rate limit), a última mensagem do agente fica marcada `error: true` com label "Falha ao completar resposta — clique para tentar novamente". Botão re-envia a mesma user message (não adiciona ao histórico, só re-stream).
- **System prompt v1**: template do brief §9.1 **verbatim** com substituição de `{marca} {modelo} {ano} {km} {askPrice} {city} {daysListed} {priceReductions} {fipe} {maxRounds} {targetPrice} {targetDiscount} {walkAwayPrice}`. `{comparables}` = `"(sem dados de comparáveis nesta fase)"` — few-shot Audi Q5 + comparáveis hardcoded vêm em Phase 2 (INTEL-02, INTEL-03). Instrução explícita adicionada: `Envolva cada argumento-chave em <arg>...</arg> — essas tags não serão exibidas ao vendedor, são usadas só para o resumo final.`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto e domínio
- `PROJECT-BRIEF.md` §4.1 — In-scope v0 Phase 1
- `PROJECT-BRIEF.md` §6 — Stack técnica (decisões locked) + gray areas explícitas pra discuss-phase
- `PROJECT-BRIEF.md` §9.1 — System prompt v1 template (source of truth para o prompt do agente)
- `PROJECT-BRIEF.md` §10 — Decisões já tomadas (não discutir)
- `PROJECT-BRIEF.md` §11 — Configuração de segurança (.claude/settings.json, env vars)
- `PROJECT-BRIEF.md` §12 — Riscos + mitigações (FIPE down, custo API, streaming latency)
- `PROJECT-BRIEF.md` §14 — Design system (cores DS, font-sans, rounded-lg cards, rounded-full badges)
- `.planning/PROJECT.md` — Active requirements + Out of scope + Key Decisions
- `.planning/REQUIREMENTS.md` §v1 Infra/FIPE/Negociação/Estado — requirement IDs INFRA-01..03, FIPE-01..02, NEG-01..05, STATE-01..02
- `.planning/ROADMAP.md` Phase 1 — Success Criteria (5 critérios) e dependências

### AI-SPEC (parcialmente preenchido — só seção 1b)
- `.planning/phases/01-chat-manual-funcional/01-AI-SPEC.md` §1b (Domain Context) — critérios de avaliação por especialista (anchor credibility, concession logic, argument quality, hard stop discipline, tone pt-BR, close recognition, resistance handling). **Failure modes** e rubrica de eval já estão definidos aqui. **Seções 2–7 estão vazias** (framework, implementation guidance, eval strategy) — planner trata como ausência e não bloqueia; Phase 2 roda `/gsd-ai-integration-phase 2` para preencher.

### Referência visual (fora do repo — user apontou)
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 5–13 — Design system DS + PLANS config (playground usa **apenas** o DS, não PLANS)
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 48–60 — `mockChatHistories[1]` Audi Q5: few-shot canônico (NÃO usado em Phase 1, vem em Phase 2 INTEL-03)
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 117–151 — Badge, ScoreRing, ProgressBar, KPICard (padrões de componente a imitar no summary + context panel)
- `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 207–224 — `ChatHistoryView` (referência do produto maior; Phase 1 adota registro WhatsApp-ish como drift consciente)
- `C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md` — pricing dual-tier do produto maior (NÃO afeta o playground; referência de contexto de negócio apenas)

### Externo (APIs)
- Parallelum FIPE: `https://parallelum.com.br/fipe/api/v1/carros/marcas` (+ cascading endpoints para modelos/anos/preço). Sem API key. Sem rate limit documentado explícito.
- Anthropic SDK: `@anthropic-ai/sdk` v0.x, modelo `claude-sonnet-4-5` via env `ANTHROPIC_MODEL`, streaming via `client.messages.stream()`.

</canonical_refs>

<code_context>
## Existing Code Insights

**Status: greenfield.** Não existe código no repo ainda — só `CLAUDE.md`, `PROJECT-BRIEF.md`, `README.md` (vazio) e `.planning/`. Phase 1 começa com scaffolding do projeto.

### Reusable Assets
- Nada no repo. Referências visuais vêm do protótipo v3 em `C:\Users\pc\Downloads\projeto autoagent atualizado\`.

### Established Patterns
- Nenhum pattern estabelecido. Phase 1 define os patterns que Phases 2–4 vão seguir:
  - Route handlers em `app/api/{name}/route.ts`
  - Zod schemas em `lib/schemas/*.ts` compartilhados client+server
  - Zustand store em `lib/stores/negotiation.ts` com persist middleware
  - shadcn/ui components instalados via `pnpm dlx shadcn@latest add {comp}` em `components/ui/`
  - Domain components em `components/negotiation/*.tsx`

### Integration Points
- Greenfield. Primeira versão da integração Next ↔ Anthropic ↔ Parallelum.

</code_context>

<specifics>
## Specific Ideas

- **Design system fiel ao protótipo v2/v3** (cores DS, rounded-lg, rounded-full, font-sans default). Não inventar nova paleta. A demo precisa parecer consistente com os mockups que Felipe já mostrou.
- **Registro pt-BR WhatsApp-profissional** no agente (brief §9.1 "TOM"). Bubbles estilo WhatsApp reforçam esse registro visualmente.
- **Hard stop enforcement em 2 camadas**: (a) system prompt instrui o agente a não ultrapassar walkAwayPrice (soft, confiável ~95%); (b) não há enforcement código-side em Phase 1 — detecção de "agente aceitou preço > walkAway" é manual via review de Felipe/Lucas. Phase 2+ pode adicionar post-process de extração de preço final + check. Flag isso pro planner.
- **Vercel Edge runtime**: route handler de streaming deve declarar `export const runtime = 'edge'` (brief §6 performance + PROJECT.md constraints). Mas: Anthropic SDK funciona em edge? Checar se precisa de `export const runtime = 'nodejs'` como fallback — planner pesquisa na fase de research.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma idéia nova fora do escopo surgiu na discussão. Todo conteúdo de Phases 2–4 (few-shot Audi Q5, scoring de motivação, comparáveis, painel de config, `<AgentThinking>`, batch, export, A/B) permanece nas fases originais conforme ROADMAP.md.

### Revisar antes de /gsd-plan-phase

Itens onde defaults foram aplicados automaticamente (user interrompeu a discussão pra acelerar). Se quiser mudar, edite este arquivo antes de rodar `/gsd-plan-phase 1`:
- **D-13** Formato do summary (KPI cards + lista) — alternativa: tabela / timeline / narrative gerada por LLM
- **D-14** Extração de argumentos (tags `<arg>...</arg>` + regex) — alternativa: segunda chamada LLM / whitelist hardcoded
- **D-15** Summary substitui ChatView — alternativa: modal full-screen / painel inferior sticky
- **D-16 a D-18** Rate limit + kill switch — alternativas: Vercel KV / Upstash Redis / middleware / limites diferentes

</deferred>

---

*Phase: 01-chat-manual-funcional*
*Context gathered: 2026-04-19*
