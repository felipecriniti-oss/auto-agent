# Phase 2: Inteligência do Agente — Research

**Researched:** 2026-04-20
**Domain:** Codebase mapping + surgical extension contracts para Phase 2 (motivation scoring, comparables, few-shot pairs, config UI, AgentThinking, benchmark, prompt v2 + migration)
**Confidence:** HIGH em codebase mapping (tudo verificado em código-fonte Phase 1). HIGH em validation architecture (reusa framework Vitest 4 já estabelecido em Phase 1). MEDIUM em cache-breakpoint sizing (AI-SPEC §4b.5 ancorou os breakpoints; confirmed v1 template sozinho fica abaixo de 2048 tokens).

> **Foco deliberado desta RESEARCH.md:** complementar (não duplicar) 02-AI-SPEC.md. AI-SPEC já fixou SDK patterns, caching breakpoints, cost budget, Zod shapes, eval rubrics, guardrails. Este documento foca em: (1) **codebase mapping** — cada arquivo a estender/criar com seu analog Phase 1 exato; (2) **pattern extraction** — convenções Phase 1 que Phase 2 precisa seguir; (3) **dependency surface** — pacotes/componentes shadcn/icons a adicionar; (4) **migration strategy** — safety do bump v1 → v2 localStorage; (5) **validation architecture** — alimenta VALIDATION.md (Nyquist sampling).

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copiado verbatim de `02-CONTEXT.md` `<decisions>`. O planner MUST honrar cada decisão; nenhuma alternativa pode ser explorada.

**AgentThinking (INTEL-05)**
- **D-01** Mecanismo: tag `<rationale>...</rationale>` no system prompt v2. Mesmo pattern do `<arg>` (Phase 1 D-14). Frontend regex-strippa `<rationale>(.*?)</rationale>` do `content` renderizado no chat e extrai para o disclosure inline. Zero custo de thinking tokens, funciona char-by-char durante streaming (regex só no final da mensagem).
- **D-02** Policy: **sempre gerar, esconder no frontend**. System prompt v2 sempre instrui a emitir `<rationale>`. Toggle "Ver pensamento" na NegotiationStatusBar controla **só visibilidade** do disclosure; histórico sempre tem rationale armazenado. Custo: tokens extras mesmo quando usuário nunca abre o toggle — aceito por consistência.
- **D-03** Schema: extensão de `Message`. Adicionar campo opcional `rationale?: string` em `src/lib/types/message.ts`. Durante streaming, rationale fica embutido em `content`; ao final, `useNegotiationStream`/`finalizeAgentMessage` faz o strip + popula `rationale` separadamente. `content` final não contém `<rationale>`.

**Motivation scoring (INTEL-01)**
- **D-04** Algoritmo: fórmula determinística em código puro, score 0-100. Inputs: `diasOnline`, `reducoes`, `motivoDaVenda`. Implementar em `src/lib/scoring/motivation.ts` com `computeMotivationScore(listing): {score, label: 'BAIXA'|'MÉDIA'|'ALTA', rationale: string}`.
- **D-05** Injeção no prompt: valor + label + rationale em bloco dedicado, entre `DADOS DO ANÚNCIO` e `OBJETIVO` no system prompt v2.
- **D-06** `motivoDaVenda` = novo campo no AdListingForm. Select com 4 opções: `mudanca_cidade`, `upgrade_veiculo`, `necessidade_financeira`, `outros`. Opcional (default `outros`).
- **D-07** Thresholds de label: `< 40 → BAIXA`, `40-69 → MÉDIA`, `≥ 70 → ALTA`. Planner pode refinar após benchmark.

**Config semantics (INTEL-04)**
- **D-08** `tone: formal | casual` substitui bloco TOM do system prompt v2 por preset. Presets em `src/lib/prompts/tone.ts` (2 strings hardcoded).
- **D-09** `initialAnchorStrategy: agressivo | moderado` parametriza a tática 1 do prompt. Builder recebe `anchorStrategy` e substitui `{anchorInstruction}`.
- **D-10** **Apply timing = só próxima sessão.** Config é **copiada** para Session no `startNegotiation` (snapshot). Edições durante negociação ativa são permitidas na UI mas NÃO afetam sessão em andamento. Alert amarelo shadcn na Config tab quando `status === 'negotiating'`.

**Claude's Discretion (aplicadas)**
- **D-11** Comparáveis sintéticos hardcoded em `src/lib/data/comparables.ts` (~5-8 veículos). Injetado como substituição do `{comparables}` no prompt v2 (em v1 era stub).
- **D-12** Few-shot Audi Q5 injetado como **par messages API** (não no system prompt). 4-6 `{role:'user', content} + {role:'assistant', content}` pairs extraídos de `mockChatHistories[1]` do protótipo v3.
- **D-13** Benchmark data flow reutiliza `history: Session[]` existente. Adicionar 2 campos opcionais em `Session`: `userRating?: 1|2|3|4|5` e `userNote?: string`. Rota `/benchmark` mostra `history.filter(s => s.status === 'ended')` agregado via Zustand selector.
- **D-14** Prompt versioning: `export const PROMPT_VERSION = 'v2.0.0'` em `src/lib/prompts/system-v2.ts`. Stamp em `Session.promptVersion` no `startNegotiation`. Migration localStorage: key bump `autoagent-playground-v1` → `v2` + `migrateV1ToV2` em `src/lib/stores/migrations.ts`.
- **D-15** Config persistence: slice `agentConfig` extende o Zustand store existente (não store separado). Persist middleware já cobre o store inteiro.
- **D-16** System prompt v2 organization: arquivo **novo** `src/lib/prompts/system-v2.ts`. Phase 1 §9.1 verbatim como base + 4 mutations (motivation block, comparables real, tática 1 parametrizada, TOM substituível, rationale instruction). `system-v1.ts` permanece **intocado** (EXPORT-04 A/B em Phase 4).

### Claude's Discretion

Sem áreas residuais — todas as discretions foram resolvidas com recomendações (D-11..D-16) ou locks de UI-SPEC/AI-SPEC. Planner tem liberdade residual sobre:
- Exata distribuição das mutations do prompt v2 em PLAN tasks/waves.
- Sub-decomposição de teste por função pura vs. integração.
- Posicionamento exato dos 4-6 pairs do few-shot (quais turnos da Audi Q5 incluir — AI-SPEC recomenda opener/escalação/concessão/fechamento).

### Deferred Ideas (OUT OF SCOPE)

- **Re-scoring dinâmico** de motivação a partir de sinais do chat — Phase 3+ se validado ter valor.
- **Campo "motivo da venda" livre (textarea)** — rejeitado: select dá determinismo ao score.
- **Editar prompt na UI** — Phase 4 (prep A/B).

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **INTEL-01** | Scoring de motivação calculado a partir de sinais do anúncio e injetado no prompt | §Codebase Mapping `src/lib/scoring/motivation.ts` + §AI-SPEC-supplied Zod schema (seção 4b.1) + §Validation Architecture unit tests |
| **INTEL-02** | Comparáveis sintéticos injetados no contexto do prompt | §Codebase Mapping `src/lib/data/comparables.ts` + system-v2 template substitution of `{comparables}` |
| **INTEL-03** | Few-shot Audi Q5 incorporado no system prompt | §Codebase Mapping `src/lib/prompts/few-shot.ts` (messages API pair pattern) + §Migration Note — affects StreamOptions signature |
| **INTEL-04** | Painel de config UI + persist localStorage editáveis sem reload | §Codebase Mapping slice `agentConfig` em `negotiation.ts` + new `AgentConfigForm.tsx` + `src/lib/prompts/tone.ts` presets |
| **INTEL-05** | `<AgentThinking>` com toggle on/off exibindo rationale | §Codebase Mapping new `AgentThinking.tsx` + extension do `finalizeAgentMessage` no store + toggle na `NegotiationStatusBar` + `<rationale>` regex igual ao `<arg>` |
| **INTEL-06** | Benchmark manual com scorecard (redução média, rodadas, qualidade 1-5) | §Codebase Mapping new `/benchmark` route + `selectBenchmarkAggregates` selector + StarRating + `userRating/userNote` fields em Session |

</phase_requirements>

---

## Executive Summary

- **Phase 1 está em estado ideal para estender.** 164 tests green, 7 de 8 plans concluídos (Plan 01-08 = Vercel deploy só), convenções estabelecidas (Zustand split-selector/useShallow, Zod client+server, Vitest 4 + jsdom, Biome, pnpm, shadcn New-York). Phase 2 é aditiva — **zero arquivos Phase 1 são reescritos**, apenas extendidos. **Zero novos endpoints** (route handler `/api/negotiate/stream` existente aceita novos campos no body).
- **4 anti-patterns a evitar ativamente** (detectados ao mapear o código): (a) NÃO modificar `system-v1.ts` (D-16 lock para Phase 4 A/B); (b) NÃO criar novo endpoint — reusar `/api/negotiate/stream` com body estendido; (c) NÃO adicionar DB/cache externo — localStorage + Zustand bastam; (d) NÃO strip `<rationale>` durante streaming (igual `<arg>` — strip só no `finalizeAgentMessage`, padrão Phase 1 D-14).
- **Breaking change contido em 1 arquivo:** `src/lib/server/llm/types.ts::StreamOptions` precisa ganhar 2 campos novos (`fewShotPairs`, `onUsage`). Afeta `anthropic.ts` (mandatório), `gemini.ts` (low-priority — escape hatch de dev, não precisa paridade de few-shot em Phase 2; pode ignorar `fewShotPairs` ou throw "unsupported"). AI-SPEC §3 já flagged esta breaking change.
- **Migration localStorage: simples mas precisa de 4 defaults explícitos.** Bump `version: 1 → 2` + rename key `autoagent-playground-v1 → -v2`. Sessões antigas ganham `promptVersion: 'v1.0.0'`, `appliedConfig: {targetDiscount:0.25, maxRounds:6, tone:'casual', initialAnchorStrategy:'moderado'}`, `motivationScore: null` (opcional), `userRating: null`, `userNote: null`. Risk principal: user em preview branch com key v1 pré-existente — ver §Migration Strategy.
- **Dependency surface pequena:** 3 shadcn components novos (`tabs`, `radio-group`, `alert`) + 3 lucide icons (`Star`, `Brain`, `BarChart2`, `ChevronRight`). Tudo já suportado pelo `components.json` (New-York preset + slate base). Zero novos npm packages.
- **Validation architecture reusa Vitest 4 + jsdom + `vitest.config.ts` já configurado.** Adiciona ~8 novos test files (motivation unit, tone presets, few-shot alternance, system-v2 builder, migrations, selectBenchmarkAggregates, AgentThinking component, rationale strip). **Nyquist sampling: cada novo behavior recebe ≥2 test cases em extremos do input space** (BAIXA/ALTA motivation, formal/casual tone, agressivo/moderado anchor, v1/v2 prompt, 0/5 stars, etc).

**Primary recommendation for the planner:** Wave sequencing — (0) test scaffold + migration + types, (1) pure functions sem UI (motivation, tone, few-shot, comparables, system-v2 builder), (2) store + schemas extensions (agentConfig slice, Session fields, negotiateRequestSchema fields, migrateV1ToV2), (3) server plumbing (anthropic.ts StreamOptions breaking change, route.ts body parse + promptVersion switch, rationale strip), (4) UI layer (Tabs+AgentConfigForm, AgentThinking component + toggle, motivoDaVenda select in AdListingForm), (5) /benchmark route + BenchmarkTable + StarRating. Cada wave fecha com testes green antes da próxima.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Motivation score computation | Client (Zustand/pure fn) | — | Determinístico, inputs já estão no form; AI-SPEC §4b.1 trust boundary: server **não aceita** motivationScore do cliente — recomputa a partir de `listing` |
| Comparables injection | API Route Handler (builder em server) | — | Prompt montado server-side; `comparables.ts` importado pelo builder em server (e/ou compartilhado se planner quiser preview no ContextPanel — flag) |
| Few-shot pair assembly | API Route Handler (builder em server) | — | Idem — anti-tampering; `few-shot.ts` roda ao montar request body pro Anthropic |
| System prompt v2 selection (`promptVersion` switch) | API Route Handler (`/api/negotiate/stream`) | Client (envia `promptVersion` no body) | Server decide qual builder chamar baseado no body param; cliente só stamps na Session após `startNegotiating` |
| Agent config persistence (`agentConfig` slice) | Client (Zustand persist) | — | Pure UI state — snapshot copiado para Session no `startNegotiating` (D-10) |
| Config snapshot into Session | Client (store action) | — | `startNegotiating` lê `agentConfig` atual e clona em `appliedConfig` da Session |
| `<rationale>` tag extraction | Client (`finalizeAgentMessage`) | — | Mesmo contrato do `<arg>`: regex pós-stream, nunca char-by-char (Pitfall #3 AI-SPEC §3) |
| AgentThinking visibility toggle | Client (Zustand UI slice ou state local) | — | UI-only, não entra no request. Recomendação: UI state separado — nem no Session nem persist (não precisa sobreviver reload) |
| Benchmark aggregation | Client (Zustand selector) | — | Pure derivation sobre `history`. AI-SPEC §5 dá o selector pronto (`selectBenchmarkAggregates` + `selectGatePass`) |
| `/benchmark` page rendering | Client (`src/app/benchmark/page.tsx` "use client") | — | Read-only sobre localStorage persisted `history` |
| Star rating persist | Client (Zustand action) | — | `setUserRating(sessionId, value)` action no store, persistido com o `history` |

---

## Project Constraints (from CLAUDE.md)

- **Stack lock:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui (New-York) + pnpm + Biome + Zustand. Não negociável.
- **LLM lock:** Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) exclusivo — `@anthropic-ai/sdk ^0.90.0`. Override via `ANTHROPIC_MODEL` env var. Gemini existe como dev escape hatch (`LLM_PROVIDER=gemini`) mas não é produção.
- **Sem DB** — localStorage + Zustand persist suficientes até v1.
- **Sem auth** — nenhuma fase usa autenticação.
- **Deploy:** Vercel (preview branches + prod), Edge runtime em `/api/negotiate/stream` (`export const runtime = "edge"`).
- **Budget batch:** cap R$ 50/rodada. AI-SPEC §4b.5 calcula: benchmark 20 sessões ≈ $2 ≈ R$ 10.40 — bem abaixo do cap.
- **GSD workflow enforcement:** mudanças vão via `/gsd-execute-phase` ou `/gsd-quick`. Evitar edits diretos fora do workflow.

---

## Codebase Mapping

Cada arquivo listado abaixo foi **verificado no repo** (lido pelo researcher). Status: **E** = existing (Phase 1), **N** = new (Phase 2 create). Tamanho aproximado após Phase 2 é estimativa.

### `src/lib/scoring/motivation.ts` [N]

**Não existe.** Diretório `src/lib/scoring/` **não existe** — criar.

**Extension plan:** arquivo novo com função pura `computeMotivationScore(listing: Listing): MotivationScore` + schema Zod `motivationScoreSchema`. Corpo completo já ditado por AI-SPEC §4b.1 (seção "Pattern 2"). Pesos D-04 (dias online × 0.6, cap 50; reduções × 10, cap 30; motivo mapping 0/5/10/20).

**Conventions a seguir:**
- Default export? NO — named exports (Phase 1 convention: veja `parseFipeValor` em `src/lib/utils/fipe.ts`).
- Type-only imports: `import type { Listing } from "@/lib/schemas/listing"`.
- Zod schema em mesmo arquivo do consumer quando é output shape de função pura (Phase 1 convention: see `src/lib/schemas/*`).

**Co-located test:** `src/lib/scoring/motivation.test.ts` (ver §Validation Architecture — mín 8 test cases).

---

### `src/lib/data/comparables.ts` [N]

**Não existe.** Diretório `src/lib/data/` **não existe** — criar.

**Extension plan:** arquivo novo exportando constante tipada `COMPARABLES: readonly Comparable[]` (array de 5-8 veículos). D-11 manda ~5-8 veículos com `marca, modelo, ano, precoVenda, km, cidade, tempoAteVenda`.

```typescript
// src/lib/data/comparables.ts — shape recomendado
export interface Comparable {
  marca: string;
  modelo: string;
  ano: number;
  precoVenda: number;
  km: number;
  cidade: string;
  tempoAteVendaDias: number;
}

export const COMPARABLES: readonly Comparable[] = [
  // 5-8 entries — planner escolhe modelos comuns nas demos de Felipe
];

export function formatComparablesForPrompt(c: readonly Comparable[]): string {
  // "- Honda Civic 2019 EXL 45k km R$ 89k (vendido em SP em 18 dias)"
  return c.map(x => `- ${x.marca} ${x.modelo} ${x.ano} ${x.km.toLocaleString("pt-BR")}km R$ ${x.precoVenda.toLocaleString("pt-BR")} (vendido em ${x.cidade} em ${x.tempoAteVendaDias} dias)`).join("\n");
}
```

**Flag ao planner:** decidir se adiciona canonical replay fixture `src/lib/data/__fixtures__/audi-q5-canonical.ts` (AI-SPEC §5 Reference Dataset) — recomendação: **SIM**, no mesmo Plan que cria comparables.

---

### `src/lib/prompts/system-v1.ts` [E]

**108 linhas, ~569 palavras no template** (≈ 700-850 tokens para pt-BR). Estrutura atual (via leitura linha-a-linha):

```
Linha  1-11  : imports + JSDoc (ponta "Phase 2 must introduce v2 and leave v1 untouched")
Linha 12-74  : SYSTEM_PROMPT_V1_TEMPLATE com os blocos:
  - PAPEL (L12-14)
  - TRATAMENTO DOS DADOS DO ANÚNCIO (L16-22) ← prompt injection defense
  - DADOS DO ANÚNCIO (L24-31) ← tem {comparables} como stub
  - OBJETIVO (L33-36)
  - TÁTICAS PERMITIDAS (L38-45)  ← tática 1 hardcoded -30% (D-09 parametriza isso)
  - TÁTICAS PROIBIDAS (L47-52)
  - HARD STOPS (L54-59)
  - FORMATO INTERNO DE ARGUMENTOS (L61-67)  ← pattern <arg>
  - TOM (L69-70) ← D-08 substitui isto pelo preset
  - FORMATO DA RESPOSTA (L72-74)
Linha 76-108 : buildSystemPrompt() builder — 14 placeholders, incluindo {comparables} fixed como stub
```

**Extension plan:** NÃO MODIFICAR — D-16 lock. Template v1 vira base de referência para system-v2.ts. O JSDoc já anticipa isso ("Phase 2 must introduce v2 and leave v1 untouched").

---

### `src/lib/prompts/system-v2.ts` [N]

**Não existe.** Criar.

**Extension plan:** arquivo novo, base estrutural = cópia de `system-v1.ts` com 5 mutations (D-16):

1. **NEW bloco MOTIVAÇÃO DO VENDEDOR** injetado entre `DADOS DO ANÚNCIO` e `OBJETIVO` — variáveis `{motivationScore}`, `{motivationLabel}`, `{motivationRationale}`.
2. **`{comparables}` deixa de ser stub** — builder passa `formatComparablesForPrompt(COMPARABLES)` como valor.
3. **Tática 1 parametrizada** — substituir literal `"~30% abaixo do preço-alvo"` (linha 39 de v1) pela variável `{anchorInstruction}` que o builder preenche com string ditada por D-09 (agressivo: "~35% abaixo do preço-alvo, justificada em dados de mercado agressivos..." / moderado: "~20% abaixo do preço-alvo, justificada em dados de mercado médios...").
4. **Bloco TOM substituível** — remover as linhas hardcoded 69-70 de v1, substituir por variável `{tonePreset}` preenchida com o string do preset (formal ou casual) de `tone.ts`.
5. **NEW bloco FORMATO INTERNO DE RATIONALE** após FORMATO INTERNO DE ARGUMENTOS (antes de TOM) — ditando D-01 com exemplo textual. Reforço: NÃO mencionar `targetPrice`, `walkAway`, `targetDiscount`, `motivationScore` numérico no rationale (AI-SPEC §4b.3 Guidance).

**Signature do builder:**

```typescript
// Recomendação (planner valida em PLAN):
export const PROMPT_VERSION = "v2.0.0" as const;

export function buildSystemPromptV2(
  listing: Listing,
  fipe: number,
  targetPrice: number,
  walkAwayPrice: number,
  config: AgentConfig,               // tone, initialAnchorStrategy, targetDiscount, maxRounds
  motivation: MotivationScore,       // { score, label, rationale }
  comparablesText: string,           // output de formatComparablesForPrompt
): string
```

**Co-located test:** `src/lib/prompts/system-v2.test.ts` — mín 8 cases cobrindo combos `{formal, casual} × {agressivo, moderado} × {BAIXA, ALTA}` = 8 combos (Nyquist — extremos + middle).

---

### `src/lib/prompts/tone.ts` [N]

**Não existe.** Criar.

**Extension plan:** arquivo novo exportando 2 constantes string:

```typescript
export const TONE_PRESETS = {
  formal: "TOM: Profissional...",   // string exata da D-08
  casual: "TOM: WhatsApp BR profissional-informal...",  // string exata da D-08
} as const;

export type ToneKey = keyof typeof TONE_PRESETS;  // "formal" | "casual"
```

D-08 deu as strings literais. Planner copia verbatim.

**Co-located test:** `src/lib/prompts/tone.test.ts` — 2 cases (shape smoke).

---

### `src/lib/prompts/few-shot.ts` [N]

**Não existe.** Criar.

**Extension plan:** arquivo novo exportando `buildFewShot(): MessageParam[]` com 4 pairs (AI-SPEC §4b.3 recomendação) extraídos de `mockChatHistories[1]` do arquivo externo `C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx` linhas 48-60. Formato EXATO já ditado por AI-SPEC §4b.5:

```typescript
import type { MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";

const AUDI_Q5_PAIRS: readonly Array<{user: string; assistant: string}> = [
  // 4 pairs: opener / escalação / concessão / fechamento
];

export function buildFewShot(): MessageParam[] {
  // implementação exata de AI-SPEC §4b.5:
  // - Prepende todos os pairs ao histórico real
  // - Último `assistant` do few-shot ganha cache_control (TextBlockParam[])
  //   → marca fim do conteúdo estável
}
```

**Validação de alternância obrigatória** (AI-SPEC Pitfall #5):

```typescript
// Dentro do arquivo OU no test:
const isValid = (pairs: typeof AUDI_Q5_PAIRS) =>
  pairs.every(p => typeof p.user === "string" && typeof p.assistant === "string" && p.user.length > 0 && p.assistant.length > 0);
```

**Co-located test:** `src/lib/prompts/few-shot.test.ts` — 4 cases (alternância válida; último assistant tem cache_control; não copia model/ano/km literais do Audi Q5 em test de lint; count dentro de range 4-6).

---

### `src/lib/server/llm/types.ts` [E — BREAKING CHANGE]

**Estado atual (15 linhas):**

```typescript
export type LLMProvider = "anthropic" | "gemini";
export interface LLMMessage { role: "user" | "assistant"; content: string; }
export interface StreamOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  signal: AbortSignal;
  onText: (chunk: string) => void;
}
```

**Extension plan (DECISÃO DO PLANNER — recomendação A preferível):**

**Opção A (recomendada):** ampliar `StreamOptions` com campos opcionais. Compat-friendly com gemini.

```typescript
export interface StreamOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  signal: AbortSignal;
  onText: (chunk: string) => void;
  // Phase 2 additions (todos opcionais):
  fewShotPairs?: LLMMessage[];  // prepended para ...messages no adapter
  cacheSystem?: boolean;        // if true, anthropic.ts wraps system em TextBlockParam[] com cache_control
  onUsage?: (u: { input: number; output: number; cacheCreate: number; cacheRead: number; stopReason: string | null }) => void;
}
```

**Opção B (AI-SPEC §3 sugere):** criar `StreamOptionsV2` novo e union type. Mais explícito mas gemini.ts precisa rejeitar V2 ou ignorar campos — mais ruído.

**Recomendação:** **Opção A**. Campos opcionais; gemini.ts ignora `fewShotPairs`, `cacheSystem`, `onUsage`. Zero refactor em Phase 1 tests de gemini.

---

### `src/lib/server/llm/anthropic.ts` [E — extension]

**Estado atual (27 linhas):** chama `client.messages.stream({ model, max_tokens, system, messages })` com `system: opts.systemPrompt` (string), `messages: opts.messages` (LLMMessage[]).

**Extension plan:**

1. Adicionar 2 imports: `import type { MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages"`.
2. Se `opts.cacheSystem === true`, trocar `system: opts.systemPrompt` → `system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } } satisfies TextBlockParam]`.
3. Prepender `opts.fewShotPairs ?? []` em `messages: [...fewShot, ...opts.messages]`. Conversion LLMMessage → MessageParam: trivial (mesmo shape role+content, mas messages ganha text block com cache_control no último assistant — isto já deve ser feito pelo `buildFewShot()` retornando `MessageParam[]` com o último block carregando o breakpoint).
4. Após `await stream.finalMessage()`, ler `final.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` e `final.stop_reason`; chamar `opts.onUsage?.({ input, output, cacheCreate, cacheRead, stopReason })`.

**Risk:** se `fewShotPairs` estiver como `LLMMessage[]` mas precisa virar `MessageParam[]` (para carregar `cache_control`), o adapter precisa converter OU `buildFewShot()` deve retornar `MessageParam[]` diretamente. Recomendação: `buildFewShot(): MessageParam[]` retorna already-typed com cache_control no último element; `StreamOptions.fewShotPairs: MessageParam[]` (type import leakage é aceitável — adapter é anthropic-specific).

**Type bridge:** `fewShotPairs: MessageParam[] | LLMMessage[]` — escolher um. Recomendação: manter `LLMMessage[]` em types.ts (provider-agnostic) + converter dentro de anthropic.ts (adicionar cache_control no último element via detection do shape). Reduz acoplamento.

---

### `src/lib/server/llm/gemini.ts` [E — no-op para Phase 2]

**Estado atual (62 linhas):** dev escape hatch. Opcional em Phase 2.

**Extension plan:** zero changes obrigatórias. Se Opção A (acima) for adotada, gemini.ts naturalmente ignora `fewShotPairs`, `cacheSystem`, `onUsage` (campos opcionais que o adapter não usa). Se planner quiser paridade para testes locais: adicionar `opts.fewShotPairs` no array de `history` convertido — trivial mas não necessário.

**Flag ao planner:** decidir explicitamente no PLAN.md "Phase 2 no-op on gemini.ts" para evitar drift.

---

### `src/lib/server/llm/index.ts` [E — no changes]

**Estado atual (44 linhas):** `resolveProvider()`, `isProviderConfigured()`, `normalizeMessages()`, `streamLLM()`.

**Extension plan:** ZERO changes. `streamLLM()` passa `opts` opaco pros adapters; campos novos `fewShotPairs/cacheSystem/onUsage` são forward-compat.

**Nota:** `normalizeMessages()` continua válido — prepend de synthetic opener `"Início da conversa."` ANTES do few-shot? NÃO. Few-shot entra **antes do histórico real**, não antes do synthetic opener. Ordem recomendada no route handler:

```
[...fewShotPairs, ...normalizeMessages(realHistory)]
```

OU — seguro: **normalizar primeiro**, depois prepend fewShot. A função `normalizeMessages` roda sobre `opts.messages` (histórico real). `few-shot.ts` sempre emite pares começando com `user` → alternance inteira preservada.

**Risk:** Pitfall #5 de AI-SPEC (alternance strict) cobre isto. Unit test no `few-shot.test.ts` + integration test no `route.test.ts` validam.

---

### `src/app/api/negotiate/stream/route.ts` [E — extension]

**Estado atual (119 linhas):** body parsed via `negotiateRequestSchema.safeParse(...)`, chama `buildSystemPrompt()` (v1) + `streamLLM(provider, { systemPrompt, messages, maxTokens, signal, onText })`. Edge runtime.

**Extension plan:**

1. Após `parsed.data`, ler `body.promptVersion` (default "v2.0.0" se absent — AI-SPEC §4b.1 schema default).
2. Compute `motivationScore = computeMotivationScore(body.listing)` server-side (trust boundary — não aceitar do cliente).
3. Branch por `promptVersion`:
   - `v1.0.0` → `buildSystemPrompt(...)` (atual) + `fewShotPairs: []` + `cacheSystem: false`.
   - `v2.0.0` → `buildSystemPromptV2(listing, fipe, targetPrice, walkAway, { tone, initialAnchorStrategy, targetDiscount, maxRounds }, motivationScore, formatComparablesForPrompt(COMPARABLES))` + `fewShotPairs: buildFewShot()` + `cacheSystem: true`.
4. Passar `onUsage` callback que `console.log(JSON.stringify({scope: "negotiate_stream.usage", usage}))` para Vercel logs (AI-SPEC §7 telemetry).

**Body schema changes:** ver `src/lib/schemas/negotiate.ts` abaixo.

**Zero changes em:** rate limit (D-16 Phase 1), kill switch (D-17 Phase 1), abort control, error handling, SSE frame format.

---

### `src/lib/schemas/negotiate.ts` [E — extension]

**Estado atual (20 linhas):** `negotiateRequestSchema` com listing + fipe + targetPrice + walkAwayPrice + maxRounds + messages (sem refinement de alternance).

**Extension plan (ditado por AI-SPEC §4b.1):**

```typescript
// Phase 2 additions ao schema existente:
export const negotiateRequestSchema = z.object({
  listing: listingSchema,  // já estendido com motivoDaVenda (ver schemas/listing.ts abaixo)
  fipe: z.number().int().positive(),
  targetPrice: z.number().int().positive(),
  walkAwayPrice: z.number().int().positive(),
  maxRounds: z.number().int().min(1).max(20),
  messages: z.array(...).max(40).refine(alternanceRefinement, { message: "..." }), // NEW refinement
  // Phase 2 NEW fields:
  tone: z.enum(["formal", "casual"]).default("casual"),
  initialAnchorStrategy: z.enum(["agressivo", "moderado"]).default("moderado"),
  promptVersion: z.enum(["v1.0.0", "v2.0.0"]).default("v2.0.0"),
});
```

**Add alternance refinement** (AI-SPEC Pitfall #5 prevenção):

```typescript
const alternanceRefinement = (msgs: { role: "user" | "assistant" }[]) => {
  for (let i = 1; i < msgs.length; i++) if (msgs[i].role === msgs[i-1].role) return false;
  return true;
};
```

**Co-located test update:** `src/lib/schemas/negotiate.test.ts` — adicionar 4-5 cases (body válido com v2 defaults, body inválido com alternance violation, accept tone enum, reject tone fora do enum, reject promptVersion fora do enum).

---

### `src/lib/schemas/listing.ts` [E — extension]

**Estado atual (43 linhas):** 8 campos validados (marca, modelo, ano, km, precoPedido, cidade, diasOnline, reducoes) com regex SAFE_TEXT (`/^[^<>{}]*$/`) nos campos string.

**Extension plan:**

Adicionar `motivoDaVenda` como campo opcional enum (D-06):

```typescript
export const motivoDaVendaSchema = z.enum([
  "mudanca_cidade",
  "upgrade_veiculo",
  "necessidade_financeira",
  "outros",
]);

export const listingSchema = z.object({
  // ...todos os 8 campos existentes...
  motivoDaVenda: motivoDaVendaSchema.optional().default("outros"),  // D-06
});
```

**Risk:** backward compat — Phase 1 listings (persisted em localStorage) não têm `motivoDaVenda`. Migration (§Migration Strategy) precisa preencher com default `"outros"` para sessões v1.

**Co-located test update:** `src/lib/schemas/listing.test.ts` — 4 novos cases (default value; accept each of 4 enum values; reject invalid enum; optional ok).

---

### `src/lib/types/session.ts` [E — extension]

**Estado atual (20 linhas):** Status, EndReason, Session interface.

**Extension plan (D-10, D-13, D-14 + D-15):**

```typescript
export interface AgentConfig {
  targetDiscount: number;
  maxRounds: number;
  tone: "formal" | "casual";
  initialAnchorStrategy: "agressivo" | "moderado";
}

export interface Session {
  // ...todos os campos Phase 1...
  // Phase 2 additions:
  promptVersion: string;           // "v1.0.0" | "v2.0.0" (D-14)
  appliedConfig: AgentConfig;      // snapshot imutável após startNegotiating (D-10)
  motivationScore?: { score: number; label: "BAIXA"|"MÉDIA"|"ALTA"; rationale: string };  // D-05
  userRating?: 1 | 2 | 3 | 4 | 5;  // D-13
  userNote?: string;               // D-13
  finalPrice?: number;             // derived from last agent R$ match (AI-SPEC §5 uses this)
  flags?: {                        // AI-SPEC §6 guardrail outputs
    walkAwayExceeded?: boolean;
    rationaleLeak?: boolean;
    strategyLeakSuspect?: boolean;
    markdownBleed?: boolean;
  };
}
```

**Atenção:** `maxRounds: 6` atualmente é **literal 6** (linha 13). Phase 2 edição da config permite outros valores → type deve virar `maxRounds: number` (not literal 6). Breaking change minor de types — safe.

---

### `src/lib/types/message.ts` [E — extension]

**Estado atual (12 linhas):** Role, Message interface.

**Extension plan (D-03):**

```typescript
export interface Message {
  id: string;
  role: Role;
  round: number;
  content: string;           // post-strip de <arg> e <rationale> (D-14 + D-01)
  timestamp: string;
  isStreaming?: boolean;
  error?: boolean;
  // Phase 2 addition:
  rationale?: string;        // extracted from <rationale>...</rationale> on finalize (D-03)
}
```

---

### `src/lib/stores/negotiation.ts` [E — significant extension]

**Estado atual (215 linhas):** 3 slices — `currentSession`, `history`, ~10 actions. Persist middleware com `name: "autoagent-playground-v1", version: 1`. Regex `<arg>` em módulo top-level.

**Extension plan:**

**A. Adicionar slice `agentConfig`** (D-15):

```typescript
interface NegotiationState {
  currentSession: Session | null;
  history: Session[];
  agentConfig: AgentConfig;           // NEW
  thinkingVisible: boolean;           // UI-only toggle state (não persist recomendado)
  // ...todos os actions Phase 1...
  // NEW actions:
  setAgentConfig: (c: Partial<AgentConfig>) => void;
  setUserRating: (sessionId: string, rating: 1|2|3|4|5|undefined) => void;
  setUserNote: (sessionId: string, note: string) => void;
  setThinkingVisible: (v: boolean) => void;
}
```

**B. Default values:**

```typescript
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  targetDiscount: 0.25,  // Phase 1 D-10 compat
  maxRounds: 6,          // Phase 1 D-10 compat
  tone: "casual",        // D-08 default
  initialAnchorStrategy: "moderado",  // D-09 default
};
```

**C. `startNegotiating` — snapshot config + promptVersion stamp** (D-10, D-14):

```typescript
startNegotiating: () => {
  const s = get().currentSession;
  const cfg = get().agentConfig;
  if (!s) return;
  set({
    currentSession: {
      ...s,
      status: "negotiating",
      startedAt: isoNow(),
      appliedConfig: { ...cfg },          // SNAPSHOT (D-10)
      promptVersion: PROMPT_VERSION,      // "v2.0.0" import de system-v2.ts
      motivationScore: computeMotivationScore(s.listing),  // D-05
    },
  });
},
```

**D. `finalizeAgentMessage` — extrair rationale** (D-03):

Atualmente strip de `<arg>` é feito apenas no render (`renderMessageContent`) e extração ao fim (`getArgumentsUsed`). Para rationale (D-03), a extensão é **populada em `finalizeAgentMessage` e salva em `message.rationale`**:

```typescript
const RATIONALE_EXTRACT_REGEX = /<rationale>([\s\S]*?)<\/rationale>/g;
const RATIONALE_STRIP_REGEX = /<rationale>[\s\S]*?<\/rationale>\s*/g;

// No finalizeAgentMessage, antes de set:
const lastContent = last.content;
const rationaleMatches = [...lastContent.matchAll(RATIONALE_EXTRACT_REGEX)].map(m => m[1].trim());
const rationale = rationaleMatches[0];  // Pegar primeiro; D-01 limita 1 por msg
const contentWithoutRationale = lastContent.replace(RATIONALE_STRIP_REGEX, "").trim();
const finalized: Message = { ...last, content: contentWithoutRationale, rationale, isStreaming: false };
```

**IMPORTANTE:** `renderMessageContent` atual (linha 10) strippa só `<arg>` para manter tags durante streaming. Para rationale, há 2 opções:

- **Opção 1:** manter tags em `content` durante streaming + strip APENAS em `finalizeAgentMessage`. MessageBubble chama `renderMessageContent` que já faz strip de `<arg>` — estender para também strippar `<rationale>` in-memory. Simples mas significa rationale NÃO é visível no chat (correto). **DURING streaming**, rationale aparece por ~50-200ms antes do strip — mitigação AI-SPEC §Pitfall #3 menciona CSS hide.
- **Opção 2:** strip só após finalize. Durante streaming, `<rationale>` visível brevemente. AI-SPEC §3 Pitfall #3 aceita isso (tags atravessam chunks — strip seguro só no fim).

**Recomendação:** estender `renderMessageContent` para strippar AMBOS (`<arg>` e `<rationale>`) durante display. Zero risk de tags partidas (regex sobre strings finais ou parciais em chunks sempre retorna string limpa ou mantém o literal). Unit test cobre.

```typescript
const TAG_STRIP_ALL = /<\/?(arg|rationale)>/g;  // OR fuller regex per tag
```

**E. `migrate` function** (D-14):

Atual (linha 202): `migrate: (persisted) => persisted as NegotiationState`.

Novo: delegar para `migrateV1ToV2` em `src/lib/stores/migrations.ts` (arquivo novo — §Migration Strategy).

**F. `name: "autoagent-playground-v1"` → `"autoagent-playground-v2"`** (D-14), `version: 1` → `2`.

**G. Add `partialize`** pega: incluir `agentConfig` agora (senão não persiste). Não incluir `thinkingVisible` (UI-only).

```typescript
partialize: (state) => ({
  currentSession: state.currentSession,
  history: state.history,
  agentConfig: state.agentConfig,  // NEW
}),
```

---

### `src/lib/stores/migrations.ts` [N]

**Não existe.** Criar.

**Extension plan:**

```typescript
import type { Session, AgentConfig } from "@/lib/types/session";

// Shape do que localStorage Phase 1 tem persisted (v1 shape):
interface PersistedV1 {
  state: {
    currentSession: /* Session Phase 1 */ any | null;
    history: /* Session Phase 1 */ any[];
  };
  version: 1;
}

const DEFAULT_AGENT_CONFIG_FOR_MIGRATION: AgentConfig = {
  targetDiscount: 0.25,
  maxRounds: 6,
  tone: "casual",
  initialAnchorStrategy: "moderado",
};

export function migrateV1ToV2(persisted: unknown): /* PersistedV2 */ {
  // Se persisted é null ou shape errado, retornar init state.
  // Se persisted.version === 1:
  //   - Para cada session em history[] + currentSession:
  //     - listing.motivoDaVenda = listing.motivoDaVenda ?? "outros"
  //     - session.promptVersion = session.promptVersion ?? "v1.0.0"
  //     - session.appliedConfig = session.appliedConfig ?? DEFAULT_AGENT_CONFIG_FOR_MIGRATION
  //     - session.motivationScore = session.motivationScore ?? undefined
  //     - session.userRating = session.userRating ?? undefined
  //     - session.userNote = session.userNote ?? undefined
  //   - Adicionar state.agentConfig = DEFAULT_AGENT_CONFIG_FOR_MIGRATION
  // Retornar shape v2.
}
```

**Co-located test:** `src/lib/stores/migrations.test.ts` — mín 6 cases (persisted v1 com 1 session; v1 com 3 sessions; v1 sem history; v1 com listing sem motivoDaVenda; v1 null; v2 input passa-through).

**Risk principal:** shape drift entre env dev e prod. Se migrate falha, Zustand default é "não re-hidrata" e store começa vazio — sessões Phase 1 somem da UI (mas ainda existem em localStorage raw). Felipe perde histórico de demos Phase 1. **Mitigação:** migrate tem fallback resiliente (if shape wrong → keep as-is, log warn) ou unit test garante 100% idempotência.

---

### `src/components/negotiation/useNegotiationStream.ts` [E — no change in spirit]

**Estado atual (80 linhas):** NÃO é um React hook apesar do nome. É uma função async `startNegotiation(body, cb, signal)` que consome SSE via fetch+ReadableStream. D-14 strip de `<arg>` NÃO é feito aqui — é feito no `finalizeAgentMessage` do store (linha 125-145 de `negotiation.ts`).

**Extension plan:**

**ZERO changes neste arquivo.** O strip de `<rationale>` segue o mesmo padrão do `<arg>`: feito em `finalizeAgentMessage` do store, não no SSE consumer. Este arquivo continua emitindo `onChunk(text)` → store appenda em `content`.

**IMPORTANTE — planner:** o body que este arquivo recebe precisa incluir os novos campos `tone`, `initialAnchorStrategy`, `promptVersion`. A composição do body é feita no **chamador** (`ChatView.tsx` linha 72-79) — precisa estender lá. Ver abaixo.

---

### `src/components/negotiation/ChatView.tsx` [E — extension]

**Estado atual (202 linhas):** chama `startNegotiation({listing, fipe, targetPrice, walkAwayPrice, maxRounds, messages})` (linhas 72-79). `appendAgentChunk` + `finalizeAgentMessage` + etc.

**Extension plan:**

Estender body do request para incluir config snapshot:

```typescript
// Em sendToAgent, ler appliedConfig da Session (snapshot):
const cfg = session.appliedConfig;  // snapshot, não config atual
await startNegotiation({
  listing: session.listing,
  fipe: session.fipe,
  targetPrice: session.targetPrice,
  walkAwayPrice: session.walkAwayPrice,
  maxRounds: cfg.maxRounds,          // da config snapshot (D-10)
  messages: apiMessages,
  // Phase 2 additions:
  tone: cfg.tone,
  initialAnchorStrategy: cfg.initialAnchorStrategy,
  promptVersion: session.promptVersion,  // "v2.0.0" stamp
}, ...);
```

**Second extension:** `waitingOpener` detection (linha 129-132) precisa tolerar streaming com `<rationale>` como primeiros tokens. Se o agente emitir `<rationale>...</rationale>\nOlá...`, os primeiros chunks podem ser inteiramente `<rationale>`. Após strip no display, MessageBubble parece vazia → re-trigger `waitingOpener`? Não — `isStreaming: true` já é true, sem risco. Validar com unit test.

---

### `src/components/negotiation/MessageBubble.tsx` [E — trivial extension]

**Estado atual (36 linhas):** chama `renderMessageContent(message.content)` que strippa `<arg>`.

**Extension plan:** se optarmos pela Opção 1 (estender `renderMessageContent` para strip both `<arg>` e `<rationale>`), ZERO changes aqui. `renderMessageContent` internamente já strippa tudo.

**Co-located test:** `MessageBubble.test.tsx` já existe. Adicionar 2 cases (content com `<rationale>foo</rationale>bar` → renderiza só `bar`; content com ambos tags → renderiza sem nenhum).

---

### `src/components/negotiation/NegotiationStatusBar.tsx` [E — extension]

**Estado atual (49 linhas):** 4 badges — FIPE, Target, Walk-away, Rodada. Layout flex-wrap horizontal.

**Extension plan:**

Adicionar toggle "Ver pensamento" / "Ocultar pensamento" (UI-SPEC Surface 2). Layout: após o badge `Rodada` (que usa `ml-auto` para empurrar para direita), o toggle vai no extremo direito.

```typescript
// Usar useShallow pattern (já estabelecido neste arquivo e em ChatView):
const { thinkingVisible, setThinkingVisible } = useNegotiationStore(
  useShallow((s) => ({ thinkingVisible: s.thinkingVisible, setThinkingVisible: s.setThinkingVisible })),
);

// Após o último <Badge>:
<button
  role="switch"
  aria-checked={thinkingVisible}
  aria-label={thinkingVisible ? "Ocultar raciocínio de todos os turnos" : "Ativar exibição do raciocínio"}
  className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
  onClick={() => setThinkingVisible(!thinkingVisible)}
>
  <Brain className="h-3 w-3" />
  {thinkingVisible ? "Ocultar pensamento" : "Ver pensamento"}
</button>
```

**Risk:** badge Rodada usa `ml-auto` atual → força-se à direita. Toggle precisa ir **depois** do Rodada, mas `ml-auto` de Rodada deixa toggle colado. Solução: mover `ml-auto` de Rodada para o toggle; ou wrap em 2 grupos flex.

**Existing test:** `NegotiationStatusBar.test.tsx` — adicionar 3 cases (toggle renderiza com OFF default; onClick flipa; aria-checked espelha state).

---

### `src/components/negotiation/AgentThinking.tsx` [N]

**Não existe.** Criar.

**Extension plan (UI-SPEC Surface 2 já ditou a shape exata, linhas 307-366):**

```typescript
"use client";
import { ChevronRight } from "lucide-react";

interface Props {
  rationale: string | undefined;
  isStreaming: boolean;
  open: boolean;
}

export function AgentThinking({ rationale, isStreaming, open }: Props) {
  return (
    <details open={open} className="mt-1 rounded-md border border-violet-200 bg-violet-50">
      <summary className="...">  {/* UI-SPEC linha 340 */}
        <ChevronRight className="..." />
        Raciocínio do agente
      </summary>
      <div className="border-t border-violet-200 px-3 py-2">
        {isStreaming && !rationale
          ? <p className="text-xs font-medium text-muted-foreground italic">Analisando...</p>
          : !rationale
          ? <p className="text-xs font-medium text-muted-foreground">Nenhum raciocínio disponível para esta rodada.</p>
          : <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{rationale}</p>}
      </div>
    </details>
  );
}
```

**Integration** em ChatView (MessageBubble wrapper): after each agent MessageBubble, render:

```typescript
{m.role === "agent" && (
  <AgentThinking rationale={m.rationale} isStreaming={!!m.isStreaming} open={thinkingVisible} />
)}
```

Pode também ser refatorado como child de MessageBubble — decisão do planner. Recomendação: child da MessageBubble, dentro do `<div>` externo, para preservar layout WhatsApp-style (bubble à esquerda, thinking inline abaixo).

**Co-located test:** `AgentThinking.test.tsx` — 5 cases (closed state; open + rationale rendered; open + isStreaming + no rationale → "Analisando..."; open + no rationale + not streaming → "Nenhum raciocínio..."; open state reacts to prop change).

---

### `src/components/negotiation/AgentConfigForm.tsx` [N]

**Não existe.** Criar.

**Extension plan (UI-SPEC Surface 1 ditou a shape exata, linhas 192-235):**

- Uses `useForm<AgentConfig>` com `zodResolver` para validar. Precisa novo Zod schema `agentConfigSchema` em `src/lib/schemas/agent-config.ts`:

```typescript
export const agentConfigSchema = z.object({
  targetDiscount: z.number().min(0.05).max(0.40),  // 5-40%
  maxRounds: z.number().int().min(2).max(12),
  tone: z.enum(["formal", "casual"]),
  initialAnchorStrategy: z.enum(["agressivo", "moderado"]),
});
```

- 2 Inputs numéricos + 2 RadioGroups — UI-SPEC linhas 198-221.
- Alert shadcn amber renderizado condicional a `status === "negotiating"` (D-10).
- On submit → `setAgentConfig(data)` do store + `toast.success("Configuração salva.")`.

**Co-located test:** `AgentConfigForm.test.tsx` — 6 cases (default values load from store; edit and submit persists; validation error out-of-range; alert visible when negotiating; alert hidden when idle; toast fires on save).

---

### `src/components/negotiation/LeftColumnPanel.tsx` [N]

**Não existe.** Criar (UI-SPEC Surface 1 linhas 175-189).

**Extension plan:** wrapper com shadcn `Tabs` — duas tabs "Anúncio" + "Configuração". TabsContent[value=anuncio] renderiza `<AdListingForm>`; TabsContent[value=configuracao] renderiza `<AgentConfigForm>`.

**Integration:** `src/app/page.tsx` linha 33 atualmente tem `<AdListingForm>` direto em `<aside>`. Substituir por `<LeftColumnPanel>`. Zero outras mudanças em `page.tsx`.

**Co-located test:** `LeftColumnPanel.test.tsx` — 3 cases (default tab = "Anúncio"; tab switch works; both forms render sem crash).

---

### `src/components/negotiation/AdListingForm.tsx` [E — extension]

**Estado atual (299 linhas):** 8 fields, react-hook-form + zodResolver + useFipeLookup.

**Extension plan:**

Adicionar 9º field `motivoDaVenda` como shadcn `<Select>` (NÃO `<Input>`). Position recomendado: entre `reducoes` e o bloco FIPE (após linha 260, antes do divider "FIPE").

```typescript
<FormField
  control={form.control}
  name="motivoDaVenda"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Motivo da venda</FormLabel>
      <FormControl>
        <Select onValueChange={field.onChange} value={field.value ?? "outros"}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mudanca_cidade">Mudança de cidade</SelectItem>
            <SelectItem value="upgrade_veiculo">Upgrade de veículo</SelectItem>
            <SelectItem value="necessidade_financeira">Necessidade financeira</SelectItem>
            <SelectItem value="outros">Outros / não sei</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Dependency flag:** shadcn `select` NÃO está instalado. Adicionar via `pnpm dlx shadcn@latest add select`. Incluir em §Dependency Surface abaixo.

**ALTERNATIVE (lightweight):** usar `<select>` native HTML com Tailwind classes — funciona com react-hook-form `field.onChange` direto. Planner decide. **Recomendação:** shadcn Select (consistência visual + New-York defaults).

---

### `src/components/negotiation/ContextPanel.tsx` [E — minor extension]

**Estado atual (53 linhas):** mostra "Última oferta" card + "Anúncio" card.

**Extension plan (opcional — recomendação AI-SPEC §1b.Integration Points):**

Adicionar 3º card "Motivação do vendedor" mostrando `session.motivationScore.label` + `rationale` (após sessão iniciada). Felipe usa em demo para narrar "este vendedor é ALTA motivação porque [rationale]".

```typescript
{s.motivationScore && (
  <Card className="border-amber-200">
    <CardHeader className="pb-2">
      <CardTitle className="text-xs uppercase tracking-wide text-amber-700">Motivação</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-sm font-bold">{s.motivationScore.label}</div>
      <div className="text-xs text-slate-600 mt-1">{s.motivationScore.rationale}</div>
    </CardContent>
  </Card>
)}
```

**Flag ao planner:** mostrar score numérico (ex: "72/100 ALTA")? Recomendação: NÃO — evita Failure Mode §1b "score cru visível ao vendedor". Label + rationale suficiente para demo narration.

---

### `src/app/benchmark/page.tsx` [N]

**Não existe.** Criar (UI-SPEC Surface 3).

**Extension plan:** página "use client" (acessa Zustand), componentes conforme UI-SPEC linhas 449-490.

- Header: h1 "Benchmark" + subtitle.
- 4 AggregateCards em `grid-cols-4 gap-4` — valores via `selectBenchmarkAggregates`.
- BenchmarkTable OR EmptyBenchmark conditional on `sessions.length === 0`.
- Empty state tem `<BarChart2>` icon + CTA "Ir para o chat" (link `/`).
- Row click NÃO abre modal em Phase 2 — StarRating inline na célula "Qualidade" (5 Star buttons).
- `<StarRating>` component co-located: reads `session.userRating`, onChange calls `setUserRating(sessionId, value)`.

**Navigation:** adicionar nav bar em `src/app/layout.tsx` (UI-SPEC linhas 599-609). Links: "Chat" (/) + "Benchmark" (/benchmark). Active styling via `usePathname`.

**Co-located tests:**
- `BenchmarkPage.test.tsx` — 4 cases (empty state; rendered aggregates; star rating persists; navigation link).
- `StarRating.test.tsx` — 5 cases (value=0 renders empty; value=3 fills 3 stars; click sets rating; click same star clears; keyboard Enter activates).

---

### `src/app/layout.tsx` [E — extension]

**Estado atual (16 linhas):** RootLayout com `<html lang="pt-BR">` e `<body>` minimal.

**Extension plan:** adicionar nav bar **dentro** do `<body>` (UI-SPEC linhas 599-609). Componente Nav separado em `src/components/Nav.tsx`.

```typescript
// src/components/Nav.tsx — "use client"
"use client";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-medium text-foreground">AutoAgent</span>
        <a href="/" className={isActive("/") ? "text-sm font-medium text-foreground" : "text-sm font-medium text-muted-foreground hover:text-foreground"}>Chat</a>
        <a href="/benchmark" className={isActive("/benchmark") ? "text-sm font-medium text-foreground" : "text-sm font-medium text-muted-foreground hover:text-foreground"}>Benchmark</a>
      </div>
    </nav>
  );
}
```

Layout:
```tsx
<body className="min-h-screen bg-white text-slate-900 antialiased">
  <Nav />
  {children}
</body>
```

**Co-located test:** `Nav.test.tsx` — 3 cases (active link styling for / ; active for /benchmark; rendering without crash).

---

## Pattern Extraction

### Import conventions (Phase 1 established)

| Pattern | Exemplo Phase 1 | Phase 2 segue? |
|---------|-----------------|----------------|
| Named exports (never default) | `export const SYSTEM_PROMPT_V1_TEMPLATE = ...` em `system-v1.ts`; `export function buildSystemPrompt(...)` | Sim — `buildSystemPromptV2`, `TONE_PRESETS`, `buildFewShot`, `COMPARABLES`, `computeMotivationScore`, `PROMPT_VERSION`, `migrateV1ToV2` |
| `import type` for type-only | `import type { Listing } from "@/lib/schemas/listing"` | Sim — `import type { MessageParam, TextBlockParam }`, `import type { AgentConfig, MotivationScore }` |
| `"use client"` directive para components que usam hooks ou store | Todos os arquivos em `src/components/negotiation/*.tsx` | Sim — `AgentConfigForm.tsx`, `AgentThinking.tsx`, `LeftColumnPanel.tsx`, `app/benchmark/page.tsx`, `Nav.tsx` |
| `@/` alias prefix | Todos os imports internos via `@/lib/`, `@/components/` | Sim — zero paths relativos |

### Naming conventions

| Tipo | Convenção Phase 1 | Phase 2 |
|------|-------------------|---------|
| Component file | PascalCase `.tsx` (`AdListingForm.tsx`) | `AgentConfigForm.tsx`, `AgentThinking.tsx`, `LeftColumnPanel.tsx`, `Nav.tsx`, `StarRating.tsx` |
| Hook file | `useXxx.ts` camelCase (`useFipeLookup.ts`) | N/A — zero novos hooks em Phase 2 (salvo se planner extrair `useAgentThinkingToggle`) |
| Utility / pure fn file | kebab-case `.ts` (`system-v1.ts`, `rate-limit.ts`) | `system-v2.ts`, `tone.ts`, `few-shot.ts`, `motivation.ts`, `comparables.ts`, `migrations.ts` |
| Schema | kebab-case `.ts` (`listing.ts`, `negotiate.ts`) | estender existentes + novo `agent-config.ts` |
| Test | co-located `.test.ts` / `.test.tsx` | mesmo padrão |

### Zustand store patterns (verificados em `negotiation.ts`, `NegotiationStatusBar.tsx`, `ChatView.tsx`, `page.tsx`)

| Pattern | Quando usar | Exemplo Phase 1 |
|---------|-------------|-----------------|
| **Split selector (Pattern A)** | 1 primitive slice | `const s = useNegotiationStore((st) => st.currentSession)` em `ContextPanel.tsx` |
| **useShallow (Pattern B)** | 2+ slices OR actions agrupadas | `useNegotiationStore(useShallow((s) => ({ appendAgentChunk, finalize... })))` em `ChatView.tsx` |
| **getState() para non-reactive reads** | Dentro de actions ou useEffect cleanup | `useNegotiationStore.getState().currentSession` em `SummaryPanel.tsx` linha 57 |
| **Não alocar no selector** | Sempre | `useMemo(() => store.getState().getArgumentsUsed(), [session])` em SummaryPanel — infinite re-render fix |

Phase 2 segue: selector de `selectBenchmarkAggregates` retorna objeto novo → planner precisa usar `useShallow` OU retornar valores primitivos OR cachear via `useMemo([sessions.length])`.

### Error handling idioms

| Lugar | Idiom Phase 1 |
|-------|---------------|
| Route handler upstream error | `console.warn(JSON.stringify({scope, ...}))` + retorna 500 genérico `{error: "upstream_failed"}` — NÃO vazar error message upstream ao cliente |
| Zod validation failure | `safeParse()` + retorna 400 genérico `{error: "invalid_body"}` — NÃO vazar schema shape ao cliente |
| Client stream error | `toast.error(...)` via sonner com mensagem pt-BR |
| localStorage rehydrate error | `onRehydrateStorage` callback faz `console.warn(...)` e deixa state default |

Phase 2 segue: migrate failures loggadas via `console.warn`, toast pt-BR para save errors, zero structured leakage ao cliente.

### Testing idioms

| Idiom | Exemplo Phase 1 | Phase 2 |
|-------|-----------------|---------|
| Co-location | `negotiation.test.ts` ao lado de `negotiation.ts` | Todos os novos tests seguem |
| `beforeEach(resetStore)` | `negotiation.test.ts:21-23` | Novo: reset de `agentConfig` + `currentSession` + `history` + `thinkingVisible` |
| `@testing-library/react` + jsdom | `NegotiationStatusBar.test.tsx`, `MessageBubble.test.tsx` | Sim |
| `vi.stubGlobal("fetch", ...)` + mock Response | `useNegotiationStream.test.ts` | Sim (route test precisa mock de Anthropic client) |
| `vi.mock()` para anthropic | `route.test.ts` (336 linhas — presumi usa mock) | Sim |
| data-testid para component queries | `data-testid="status-fipe"`, `data-testid="negotiation-status-bar"` | Adicionar para novos: `config-form-tone`, `agent-thinking-disclosure`, `benchmark-aggregate-reduction`, `star-rating-button-N` |

---

## Dependency Surface

### npm packages — zero adições obrigatórias

**Já instalados** (verified em `package.json`):
- `@anthropic-ai/sdk ^0.90.0` ✅
- `zod ^3.25.76` ✅
- `zustand ^5.0.12` ✅
- `react-hook-form ^7.72.1` + `@hookform/resolvers ^3.10.0` ✅
- `lucide-react ^0.468.0` ✅
- `sonner ^2.0.7` (toast) ✅
- `shadcn ^4.3.0` (CLI) ✅

**Não precisa adicionar nada via pnpm.**

### shadcn components — 4 componentes novos

Verificados em `src/components/ui/`: **alert-dialog, badge, button, card, form, input, label, skeleton, sonner** — todos instalados.

**Necessários adicionar em Phase 2 (via `pnpm dlx shadcn@latest add`):**

| Component | Comando | Usado em | Flag |
|-----------|---------|----------|------|
| `tabs` | `pnpm dlx shadcn@latest add tabs` | `LeftColumnPanel.tsx` (Surface 1 UI-SPEC) | Required |
| `radio-group` | `pnpm dlx shadcn@latest add radio-group` | `AgentConfigForm.tsx` (tone + anchor) | Required |
| `alert` | `pnpm dlx shadcn@latest add alert` | `AgentConfigForm.tsx` warning notice (D-10) | Required |
| `select` | `pnpm dlx shadcn@latest add select` | `AdListingForm.tsx` motivoDaVenda field (D-06) | Required UNLESS planner usa native `<select>` |

**Planner flag:** executar `pnpm dlx shadcn@latest add tabs radio-group alert select` em Wave 0 antes de qualquer UI task. Add-adds são idempotentes — sem risk.

### Lucide icons — 4 icons novos

Verificar pontualmente (lucide-react já instalado, apenas named imports):

| Icon | Usado em | Fonte UI-SPEC |
|------|----------|---------------|
| `Star` | StarRating dentro BenchmarkTable | Surface 3 linha 583 |
| `Brain` | Toggle "Ver pensamento" em NegotiationStatusBar | Surface 2 linha 319 |
| `BarChart2` | Empty state `/benchmark` | Surface 3 linha 497 |
| `ChevronRight` | AgentThinking disclosure chevron | Surface 2 linha 344 |
| `AlertCircle` | AgentConfigForm warning (já usado em KillSwitchBanner) | Surface 1 linha 225 |

**Zero npm adds necessários** — todos vêm de `lucide-react ^0.468.0`.

### Env vars — zero adições

| Var | Status |
|-----|--------|
| `ANTHROPIC_API_KEY` | Phase 1 existente |
| `ANTHROPIC_MODEL` | Phase 1 existente |
| `NEGOTIATION_ENABLED` | Phase 1 existente |
| `GEMINI_API_KEY` | Phase 1 existente (dev only) |
| `LLM_PROVIDER` | Phase 1 existente (dev only) |

Phase 2 zero env additions.

---

## Migration Strategy

### Goal

Bump localStorage key `autoagent-playground-v1` → `-v2`, `version: 1` → `2`. Sessões Phase 1 persisted precisam ser convertidas para shape v2 sem perda de dados (Felipe pode ter demos históricas).

### migrateV1ToV2 shape (exato)

```typescript
// Input: persisted v1 blob:
{
  state: {
    currentSession: Session_v1 | null,  // sem appliedConfig, motivationScore, promptVersion, userRating, userNote
    history: Session_v1[],
  },
  version: 1,
}

// Output: PersistedState_v2:
{
  state: {
    currentSession: Session_v2 | null,  // campos novos com defaults
    history: Session_v2[],
    agentConfig: {
      targetDiscount: 0.25,
      maxRounds: 6,
      tone: "casual",
      initialAnchorStrategy: "moderado",
    },
  },
  version: 2,
}

// Per Session transformation:
Session_v1 + {
  listing: { ...v1.listing, motivoDaVenda: v1.listing.motivoDaVenda ?? "outros" },
  promptVersion: "v1.0.0",                 // stamp explícito para A/B Phase 4
  appliedConfig: DEFAULT_AGENT_CONFIG,     // reconstituído (não conhecemos o config na época)
  motivationScore: undefined,              // não computamos retroativamente
  userRating: undefined,
  userNote: undefined,
  flags: undefined,
  finalPrice: undefined,                   // selector computará on-demand
  maxRounds: v1.maxRounds ?? 6,           // relax literal-6 type → number
}
```

### Backward-compat invariant

**Sessões Phase 1 devem continuar renderizando em `/benchmark`** com badge "v1" (ou filtro automático para `promptVersion: "v2.0.0"` no scorecard — AI-SPEC §5 default). Planner decide se `/benchmark` mostra v1 sessões ou filtra por promptVersion:

**Recomendação:** mostrar TODAS (v1 + v2) em `/benchmark` table, mas **gate check** (AI-SPEC `selectGatePass`) usa filtro `promptVersion: "v2.0.0"` — só Phase 2 sessões contam para o gate.

### persist middleware `version` field config

```typescript
// src/lib/stores/negotiation.ts — persist options
{
  name: "autoagent-playground-v2",  // KEY BUMP
  storage: createJSONStorage(() => localStorage),
  version: 2,                        // VERSION BUMP
  migrate: (persisted, version) => {
    if (version === 1) return migrateV1ToV2(persisted);
    return persisted as NegotiationState;
  },
  partialize: (state) => ({
    currentSession: state.currentSession,
    history: state.history,
    agentConfig: state.agentConfig,  // NEW
  }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.warn("Failed to rehydrate v2:", error);
  },
}
```

**Atenção sobre key rename:** Zustand persist com key NOVA (`-v2`) **não lê automaticamente** o blob da key antiga (`-v1`). Opções:

**Opção X (recomendada):** no `migrate`, ler manualmente de `localStorage.getItem("autoagent-playground-v1")` como fallback se `persisted` é null → faz o merge + migrate + salva na key nova. Após 1 render: key antiga pode ficar (legacy) ou ser removida (`localStorage.removeItem`).

```typescript
migrate: (persisted, version) => {
  if (version === 2) return persisted as NegotiationState;
  if (version === 1) return migrateV1ToV2(persisted);
  // Key switched (null persisted) — fallback to reading old key directly
  if (!persisted && typeof localStorage !== "undefined") {
    const oldRaw = localStorage.getItem("autoagent-playground-v1");
    if (oldRaw) {
      try {
        const oldBlob = JSON.parse(oldRaw);
        return migrateV1ToV2(oldBlob.state);
      } catch { /* fall through */ }
    }
  }
  return persisted as NegotiationState;
}
```

**Opção Y (simpler):** manter key `autoagent-playground-v1` e apenas bumpar `version`. Zustand persist naturalmente roda `migrate(persisted, 1)` na primeira carga em v2. Trade-off: nome da key deixa de refletir o schema version explicitamente.

**Recomendação:** **Opção Y** (key `-v1` preservada, version = 2). Mais simples, zero fallback logic. D-14 pediu rename por clareza, mas Zustand não beneficia dele — D-14 é aceitável como orientação organizacional (filename migrations.ts) mas na prática key pode ficar. **Planner escolhe e documenta em PLAN.md.**

### Risk: user em dev preview com localStorage v1 → v2 build

**Scenario:** Felipe está testando Phase 1 preview em branch A, localStorage tem key `autoagent-playground-v1` populada com ~5 sessões de demo. Deploy de Phase 2 em main → Felipe abre production → localStorage restored via migrate → sessões aparecem em `/benchmark` com promptVersion=v1.0.0.

**Expected:** sessões v1 aparecem. Gate check filtra para v2 only (não contam). Zero perda de dados.

**Detection:** unit test de migrateV1ToV2 valida com fixtures reais de localStorage Phase 1 (captura raw do devtools, salva em `__fixtures__/persisted-v1.json`).

**Worst case mitigation:** se migrate throw, `onRehydrateStorage` callback loga warn → store começa default (agentConfig defaults, history vazio). Sessões antigas ainda estão em localStorage raw (key antiga se mantida) e podem ser recuperadas manualmente.

---

## Validation Architecture

> Phase 2 extend o framework Vitest 4 + jsdom já configurado em Phase 1. Zero mudanças de infra. Alimenta `02-VALIDATION.md` (Nyquist sampling).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.9 + @testing-library/react ^16.3.2 + jsdom ^25.0.1 |
| Config file | `vitest.config.ts` (já existe — Wave 0 Phase 1) + `vitest.setup.ts` (já existe) |
| Quick run command | `pnpm vitest run <path>` |
| Full suite command | `pnpm vitest run` |
| Typecheck | `pnpm typecheck` (tsc --noEmit) |
| Lint | `pnpm lint` (biome check src) |
| Build | `pnpm build` (next build) |
| Estimated runtime | ~5s full (Phase 1 baseline 164 tests); ~7-8s com +30-50 tests Phase 2 |

### Phase Requirements → Test Map (Nyquist ≥2 cases em extremos)

| Req ID | Behavior | Test Type | Command | File |
|--------|----------|-----------|---------|------|
| **INTEL-01** | `computeMotivationScore(0 dias, 0 reduções, outros)` → score baixo, label BAIXA | unit | `pnpm vitest run src/lib/scoring/motivation.test.ts -t "0-signal"` | `src/lib/scoring/motivation.test.ts` [N] |
| **INTEL-01** | `computeMotivationScore(100 dias, 5 reduções, necessidade_financeira)` → score alto, label ALTA | unit | idem `-t "max-signal"` | idem |
| **INTEL-01** | `computeMotivationScore` com cada motivoDaVenda (4 cases) | unit | idem `-t "motivo weights"` | idem |
| **INTEL-01** | `computeMotivationScore` threshold boundaries (39 → BAIXA, 40 → MÉDIA, 69 → MÉDIA, 70 → ALTA) | unit | idem `-t "label thresholds"` | idem |
| **INTEL-01** | `motivationScoreSchema.parse` rejeita score < 0 ou > 100 | unit | idem `-t "schema invariant"` | idem |
| **INTEL-01** | `computeMotivationScore` default motivoDaVenda = "outros" quando undefined | unit | idem `-t "undefined motivo"` | idem |
| **INTEL-02** | `formatComparablesForPrompt(COMPARABLES)` retorna string bulletizada com N linhas | unit | `pnpm vitest run src/lib/data/comparables.test.ts` | `src/lib/data/comparables.test.ts` [N] |
| **INTEL-02** | `COMPARABLES` array tem entre 5 e 8 items | unit | idem `-t "count"` | idem |
| **INTEL-03** | `buildFewShot()` retorna array com alternance user/assistant válida | unit | `pnpm vitest run src/lib/prompts/few-shot.test.ts -t "alternance"` | `src/lib/prompts/few-shot.test.ts` [N] |
| **INTEL-03** | `buildFewShot()` último assistant tem `cache_control: ephemeral` | unit | idem `-t "cache_control breakpoint"` | idem |
| **INTEL-03** | `buildFewShot()` retorna 4-6 pairs | unit | idem `-t "pair count"` | idem |
| **INTEL-03** | Zod refinement rejeita messages com `user → user` consecutivo | unit | `pnpm vitest run src/lib/schemas/negotiate.test.ts -t "alternance"` | existing + extend |
| **INTEL-04** | `agentConfigSchema` aceita todos os 4 combos tone × anchor | unit | `pnpm vitest run src/lib/schemas/agent-config.test.ts` | `src/lib/schemas/agent-config.test.ts` [N] |
| **INTEL-04** | `agentConfigSchema` rejeita targetDiscount < 5% e > 40% | unit | idem `-t "targetDiscount range"` | idem |
| **INTEL-04** | `setAgentConfig` action updates store slice | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "setAgentConfig"` | existing + extend |
| **INTEL-04** | `startNegotiating` snapshots agentConfig into `session.appliedConfig` | unit | idem `-t "appliedConfig snapshot"` | idem |
| **INTEL-04** | Later `setAgentConfig` edits **do not** mutate `session.appliedConfig` (D-10 invariant) | unit | idem `-t "snapshot immutability"` | idem |
| **INTEL-04** | AgentConfigForm validates and submits; toast fires | integration | `pnpm vitest run src/components/negotiation/AgentConfigForm.test.tsx` | `AgentConfigForm.test.tsx` [N] |
| **INTEL-04** | AgentConfigForm alerts amber when `status=negotiating` | integration | idem `-t "warning notice"` | idem |
| **INTEL-05** | `<rationale>...</rationale>` extracted from message in `finalizeAgentMessage` | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "rationale extract"` | existing + extend |
| **INTEL-05** | `content` post-finalize has `<rationale>` block removed | unit | idem `-t "rationale strip"` | idem |
| **INTEL-05** | `renderMessageContent` strips BOTH `<arg>` and `<rationale>` tags | unit | idem `-t "renderMessageContent both tags"` | idem |
| **INTEL-05** | Truncated `<rationale>` (no closing tag) is preserved raw in content, rationale = undefined | unit | idem `-t "truncated rationale"` | idem |
| **INTEL-05** | AgentThinking renders rationale when `open=true` | component | `pnpm vitest run src/components/negotiation/AgentThinking.test.tsx` | `AgentThinking.test.tsx` [N] |
| **INTEL-05** | AgentThinking shows "Analisando..." when `isStreaming && !rationale` | component | idem `-t "loading state"` | idem |
| **INTEL-05** | AgentThinking shows "Nenhum raciocínio..." when `!isStreaming && !rationale` | component | idem `-t "empty state"` | idem |
| **INTEL-05** | NegotiationStatusBar toggle flips `thinkingVisible` store slice | component | `pnpm vitest run src/components/negotiation/NegotiationStatusBar.test.tsx -t "toggle"` | existing + extend |
| **INTEL-06** | `selectBenchmarkAggregates([])` returns null for all aggregates, count=0 | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "aggregates empty"` | existing + extend |
| **INTEL-06** | `selectBenchmarkAggregates(1 session at 25% reduction)` returns avgReduction=25 | unit | idem `-t "aggregates single"` | idem |
| **INTEL-06** | `selectBenchmarkAggregates(3 sessions mixed)` averages correctly | unit | idem `-t "aggregates multi"` | idem |
| **INTEL-06** | Filter by `promptVersion: "v2.0.0"` excludes v1 sessions from aggregate | unit | idem `-t "promptVersion filter"` | idem |
| **INTEL-06** | `setUserRating(id, 5)` persists to store; rehydrate preserves | unit | idem `-t "rating persist"` | idem |
| **INTEL-06** | StarRating renders 5 buttons; clicks update value | component | `pnpm vitest run src/components/StarRating.test.tsx` | `StarRating.test.tsx` [N] |
| **INTEL-06** | StarRating click same star clears rating (toggle) | component | idem `-t "toggle clear"` | idem |
| **INTEL-06** | /benchmark page renders empty state when `history.length === 0` | integration | `pnpm vitest run src/app/benchmark/page.test.tsx -t "empty"` | `page.test.tsx` [N] |
| **INTEL-06** | /benchmark page renders 4 aggregate cards + table when sessions present | integration | idem `-t "populated"` | idem |
| **INTEL-06** | `selectGatePass` returns `pass: false, reasons: [...]` when count < 20 | unit | `pnpm vitest run src/lib/stores/negotiation.test.ts -t "gatePass"` | existing + extend |
| **INTEL-06** | `selectGatePass` accumulates multiple failure reasons | unit | idem | idem |
| Route integration | POST with `promptVersion: "v2.0.0"` builds v2 prompt + includes fewShot | integration | `pnpm vitest run src/app/api/negotiate/stream/route.test.ts -t "v2 pathway"` | existing + extend |
| Route integration | POST with `promptVersion: "v1.0.0"` builds v1 prompt, zero fewShot | integration | idem `-t "v1 pathway"` | idem |
| Route integration | POST with missing tone defaults to "casual" (Zod default) | integration | idem `-t "tone default"` | idem |
| Route integration | Server computes motivationScore from listing (not from client body) | integration | idem `-t "motivation server-computed"` | idem |
| Migration | `migrateV1ToV2` preserves all v1 sessions in history | unit | `pnpm vitest run src/lib/stores/migrations.test.ts -t "history preserved"` | `migrations.test.ts` [N] |
| Migration | `migrateV1ToV2` stamps `promptVersion: "v1.0.0"` on migrated sessions | unit | idem `-t "promptVersion stamp"` | idem |
| Migration | `migrateV1ToV2` injects default `appliedConfig` on sessions lacking it | unit | idem `-t "appliedConfig default"` | idem |
| Migration | `migrateV1ToV2` handles v1 listing without `motivoDaVenda` | unit | idem `-t "motivoDaVenda default"` | idem |
| Migration | `migrateV1ToV2` returns initial state shape when persisted is null | unit | idem `-t "null input"` | idem |
| Migration | `migrateV1ToV2` is idempotent on v2 input (version=2) | unit | idem `-t "idempotent"` | idem |

**Total Phase 2 new test cases: ~50** (unit + integration + component). Full suite target: **~200-220 tests green** end of Phase 2.

### Sampling Rate (Nyquist)

- **Per task commit:** `pnpm vitest run <path-touched>` — completes <2s per file.
- **Per wave merge:** `pnpm vitest run` — full suite <10s estimated.
- **Phase gate (before `/gsd-verify-work`):** full suite green + `pnpm build` green + `pnpm typecheck` green + `pnpm lint` green + manual Felipe smoke run 3-5 sessions (INTEL-06 gate starts no final da fase com 20 sessões).

### Coverage Gates (soft — Phase 2)

**Critical paths** que DEVEM ter cobertura:

| Path | Target | Rationale |
|------|--------|-----------|
| `src/lib/scoring/motivation.ts` | 100% | Fórmula determinística, pure fn, auditável |
| `src/lib/stores/migrations.ts` | 100% | Data loss risk se migrate falha silenciosamente |
| `src/lib/prompts/system-v2.ts` (builder) | ≥90% | Prompt é o core value de Phase 2; shape bugs caros em demo |
| `src/lib/stores/negotiation.ts` (selectors + actions novos) | ≥90% | D-10 snapshot invariant é load-bearing |
| `src/lib/prompts/few-shot.ts` | 100% | Alternance bug = 400 da Anthropic API em runtime |
| `src/lib/schemas/*.ts` | ≥95% | Client+server trust boundary |

**Non-critical** (exercised via integration — component tests mais leves):
- `AgentThinking.tsx`, `AgentConfigForm.tsx`, `LeftColumnPanel.tsx`, `BenchmarkPage.tsx`, `StarRating.tsx` — ≥70% (smoke + happy path).

**Manual-only (no test):**
- Felipe subjective rating calibration (INTEL-06 threshold ≥3.5/5) — por definição subjetivo.
- `<rationale>` coerência auditada por Lucas (AI-SPEC §5 Rubric "Coerência") — 100% manual em Phase 2.
- Visual UAT de tabs, star rating animation, disclosure animation — deferred ao smoke test Felipe.

### Wave 0 Gaps (test scaffold to create BEFORE implementation)

- [ ] `src/lib/scoring/motivation.test.ts` — covers INTEL-01
- [ ] `src/lib/data/comparables.test.ts` — covers INTEL-02
- [ ] `src/lib/prompts/few-shot.test.ts` — covers INTEL-03 alternance
- [ ] `src/lib/prompts/system-v2.test.ts` — covers placeholder substitution × 4 variations (formal+agressivo, formal+moderado, casual+agressivo, casual+moderado)
- [ ] `src/lib/prompts/tone.test.ts` — covers D-08 preset shapes
- [ ] `src/lib/schemas/agent-config.test.ts` — covers INTEL-04 validation
- [ ] `src/lib/stores/migrations.test.ts` — covers D-14 migration
- [ ] `src/components/negotiation/AgentThinking.test.tsx` — covers INTEL-05 disclosure
- [ ] `src/components/negotiation/AgentConfigForm.test.tsx` — covers INTEL-04 UI
- [ ] `src/components/negotiation/LeftColumnPanel.test.tsx` — covers tabs wiring
- [ ] `src/components/StarRating.test.tsx` — covers INTEL-06 rating component
- [ ] `src/app/benchmark/page.test.tsx` — covers INTEL-06 page integration
- [ ] Test fixtures:
  - [ ] `src/lib/data/__fixtures__/persisted-v1.json` — raw localStorage blob from Phase 1 for migration tests
  - [ ] `src/lib/data/__fixtures__/audi-q5-canonical.ts` — AI-SPEC §5 canonical replay fixture

**Framework install:** none needed — Vitest 4 already installed.

---

## Open Questions

### Q1: Should `rationale` persist across reloads, or is it UI-only?

**Context:** D-02 mandates "sempre gerar, esconder no frontend" — rationale is stored on Message. But AI-SPEC §5 says `/benchmark` needs to inspect rationale of past sessions for Lucas audit.

**Recommendation:** `rationale` IS persisted (already part of Message extension D-03). Zustand partialize includes messages (implicit via history + currentSession). Zero extra work — if message has `rationale`, it persists with the session.

### Q2: Exact cache_control placement when system-v2 alone is <2048 tokens?

**Context:** AI-SPEC §3 Pitfall #4 flags: v1 template alone is ~700-850 tokens (verified: 569 words × pt-BR ratio). v2 adds motivation block (~80 tokens), comparables expanded (~250 tokens), rationale instruction (~120 tokens), anchor + tone blocks (~40 tokens same as v1). **v2 alone ≈ 1200-1400 tokens** — still below 2048 minimum cache size for Sonnet 4.6.

**AI-SPEC §4b.5 solution:** put cache_control on LAST assistant of few-shot, not on system. The few-shot (4 pairs × ~100 tokens each = ~400-500 tokens) + system v2 (~1200) = ~1600-1900 total cached content — STILL marginal vs 2048 threshold.

**Recommendation to planner:** **Measure actual token count before committing to caching strategy.**

- Add `countTokens` helper that uses Anthropic SDK's `client.messages.countTokens({system, messages})` API in Wave 1 test.
- Log `usage.cache_creation_input_tokens` on first turn of a session to verify cache was actually written (if 0, silent fail per Pitfall #4).
- If still <2048: consider condensing comparables inline into system prompt to bump size, or accept no-cache (Phase 2 benchmark cost still under budget at $2/20 sessions).

**Fallback:** if caching doesn't kick in, Phase 2 cost rises from $1.98 to $2.36 for benchmark — **both under budget**. Not a blocker.

### Q3: Should `appliedConfig` in Session include `targetDiscount` despite it being fixed by Phase 1?

**Context:** D-10 snapshot invariant. D-15 slice includes targetDiscount. Phase 1 used D-10 with `targetDiscount=0.25` fixed.

**Risk:** if Felipe edits `targetDiscount: 0.30` then starts a session, `targetPrice` was computed at `initSession` time with `fipe * 0.75` (OLD formula). The 0.30 config never propagates to targetPrice.

**Resolution:** Phase 2 DOES parameterize — `targetPrice` should be recomputed from `agentConfig.targetDiscount` at `startNegotiating` time, using snapshot. This is a change to how `targetPrice` is derived: from `initSession` (Phase 1) to `startNegotiating` (Phase 2). Planner must document.

```typescript
// Phase 2 startNegotiating:
targetPrice: Math.round(s.fipe * (1 - cfg.targetDiscount)),
walkAwayPrice: Math.round(s.fipe * 0.90),  // walkAway stays at 10% above target (D-09 Phase 1 legacy; can stay fixed or move to config Phase 3)
```

**Flag:** or keep Phase 1 hardcoded 0.75 and treat `agentConfig.targetDiscount` as **new** config value that takes effect only for v2 prompt. Simpler for migration but inconsistent. **Recommendation: recompute on startNegotiating**, accept small refactor risk.

### Q4: AgentThinking toggle — global (all rows share `open` prop) or per-message?

**Context:** UI-SPEC Surface 2 says global toggle via `thinkingVisible` state; each `<details>` accepts the `open` prop; BUT user can still click individual summary to toggle.

**Behavior:** when `thinkingVisible` flips OFF, does it force all open disclosures to close? Or just the DEFAULT state for new disclosures?

**Recommendation:** `open` is a **controlled attribute** — flipping `thinkingVisible` FORCES all disclosures to match. User click on individual summary flips LOCAL state (React uncontrolled). Trade-off documented in UI-SPEC already. Planner locks behavior in component spec.

### Q5: Does gemini.ts need few-shot support in Phase 2?

**Context:** Phase 2 flag mentions gemini.ts is affected by StreamOptions breaking change.

**Decision:** NO. Gemini is dev escape hatch (per `src/lib/server/llm/index.ts:5-11` comment). Production = Anthropic only (CLAUDE.md lock). Gemini adapter can **ignore** `fewShotPairs`, `cacheSystem`, `onUsage` silently. Phase 2 does not require Gemini parity. **Unit test NOT needed for gemini few-shot**. Planner documents this no-op explicitly in PLAN.md for Wave touching types.ts.

### Q6: /benchmark table: show v1 sessions mixed in? Or filter-only v2?

**Context:** D-13 says "reutilizar history". Migration stamps v1 sessions with `promptVersion: "v1.0.0"`.

**Recommendation:** SHOW both, but:
- Table has a column or badge showing `promptVersion` (v1 / v2 badge).
- Aggregates at top of page filter to v2 only (gate check metric).
- Add optional filter toggle later in Phase 4 when A/B view arrives.

**Simpler Phase 2 alternative:** filter table to `promptVersion: "v2.0.0"` → v1 sessions invisible. User confusion minimized. Planner decides. Flag.

---

## Anti-Patterns (Explicit Don'ts)

These are deliberately called out because they are natural traps given the Phase 1 codebase + Phase 2 scope:

1. **DO NOT modify `src/lib/prompts/system-v1.ts`.** D-16 hard lock — v1 must remain bit-identical for Phase 4 A/B. The JSDoc on line 10 already warns about this. Any planner deviation breaks EXPORT-04.

2. **DO NOT create a new API route for Phase 2.** Reuse `/api/negotiate/stream` — extend its body schema. `CLAUDE.md` constraints + AI-SPEC §4 explicitly state no new endpoints. Creating `/api/negotiate/v2/stream` or `/api/agent-config` fragments the codebase without benefit.

3. **DO NOT introduce a database, Redis, Upstash, or any persistent backend.** localStorage + Zustand are the Phase 1 + Phase 2 data layer. AI-SPEC §7 defers Phoenix/Phoenix alternatives to Phase 3. `PROJECT.md` constraints are non-negotiable.

4. **DO NOT strip `<rationale>` during streaming (`onChunk` / `appendAgentChunk`).** Regex must run ONLY at `finalizeAgentMessage` — same pattern as `<arg>` (Phase 1 D-14). Tags cross chunks unpredictably. AI-SPEC §3 Pitfall #3 documents this. Violating means occasional rationale truncation + broken strip.

5. **DO NOT add `stop_sequence: "</rationale>"` to Anthropic params.** AI-SPEC §4 Model Configuration Pattern explicitly warns: this would halt generation after rationale closes, and the message to seller (which comes AFTER rationale per D-01 spec) would never be generated.

6. **DO NOT hand-roll SSE framing, EventSource, WebSockets.** Phase 1 `useNegotiationStream.ts` handles fetch+ReadableStream via `TextDecoderStream`. Phase 2 reuses unchanged.

7. **DO NOT re-research Anthropic SDK streaming patterns, Zustand persist patterns, Zod schema composition, Next 15 route handler streaming, Tailwind v4 + shadcn New-York setup.** AI-SPEC §3, §4, §4b and Phase 1 RESEARCH §Framework & SDK already cover. Any attempt to introduce `ai` SDK, LangChain, Vercel AI SDK, etc. is off-scope per AI-SPEC §2 Alternatives Considered.

8. **DO NOT accept `motivationScore` from client body.** AI-SPEC §4b.1 trust boundary: server recomputes from `listing`. Client can DISPLAY a preview (computed client-side using same `computeMotivationScore` pure fn), but server computes independently and injects in prompt. Zero drift.

9. **DO NOT use a tool-use / function-calling pattern for `<rationale>`.** D-01 explicitly uses string tags. Tool use adds API complexity, Anthropic pricing overhead, and breaks streaming char-by-char UX. AI-SPEC §4 Tool Use is `N/A` deliberately.

10. **DO NOT embed few-shot inside the system prompt text.** D-12 uses the Anthropic messages API pair pattern. Embedding in system makes the prompt 2800+ tokens and changes cache-control positioning. AI-SPEC §4b.3 + §4b.5 rely on messages pattern.

11. **DO NOT install `ai` (Vercel AI SDK), LangChain, LangGraph, or any framework wrapper.** AI-SPEC §2 Alternatives ruled them out. Using them adds abstraction without benefit for single-model streaming.

12. **DO NOT regenerate random Session `id` on rehydrate.** Session IDs must be stable across reload for `/benchmark` star-rating persistence to work. Phase 1 uses `crypto.randomUUID()` at `initSession` only. Phase 2 preserves behavior.

---

## Sources

### Primary (HIGH confidence)

- **Source code verified (read line-by-line):**
  - `C:\Users\pc\auto-agent\src\lib\stores\negotiation.ts` (215 lines)
  - `C:\Users\pc\auto-agent\src\lib\prompts\system-v1.ts` (108 lines)
  - `C:\Users\pc\auto-agent\src\lib\server\llm\{anthropic.ts, types.ts, gemini.ts, index.ts}`
  - `C:\Users\pc\auto-agent\src\app\api\negotiate\stream\route.ts` (119 lines)
  - `C:\Users\pc\auto-agent\src\lib\schemas\{listing.ts, negotiate.ts}`
  - `C:\Users\pc\auto-agent\src\lib\types\{session.ts, message.ts}`
  - `C:\Users\pc\auto-agent\src\components\negotiation\{useNegotiationStream.ts, ChatView.tsx, MessageBubble.tsx, NegotiationStatusBar.tsx, ContextPanel.tsx, AdListingForm.tsx, SummaryPanel.tsx, KillSwitchBanner.tsx}`
  - `C:\Users\pc\auto-agent\src\app\{layout.tsx, page.tsx}`
  - `C:\Users\pc\auto-agent\package.json`, `components.json`
  - `C:\Users\pc\auto-agent\src\lib\stores\negotiation.test.ts` + `useNegotiationStream.test.ts` + `NegotiationStatusBar.test.tsx`
  - `C:\Users\pc\auto-agent\src\lib\server\llm\{anthropic,gemini,types,index}.ts`

- **Planning context:**
  - `C:\Users\pc\auto-agent\.planning\phases\02-intelig-ncia-do-agente\02-CONTEXT.md` (D-01 a D-16 locked)
  - `C:\Users\pc\auto-agent\.planning\phases\02-intelig-ncia-do-agente\02-UI-SPEC.md` (Surfaces 1-3 locked)
  - `C:\Users\pc\auto-agent\.planning\phases\02-intelig-ncia-do-agente\02-AI-SPEC.md` (Sections 1-7 locked — SDK patterns, caching, cost, Zod, guardrails, eval)
  - `C:\Users\pc\auto-agent\.planning\REQUIREMENTS.md` (INTEL-01..06 verbatim)
  - `C:\Users\pc\auto-agent\.planning\ROADMAP.md` Phase 2 (Success Criteria)
  - `C:\Users\pc\auto-agent\.planning\phases\01-chat-manual-funcional\01-CONTEXT.md` (Phase 1 D-01..D-18 base)
  - `C:\Users\pc\auto-agent\.planning\phases\01-chat-manual-funcional\01-VALIDATION.md` (Nyquist framework Phase 1)
  - `C:\Users\pc\auto-agent\.planning\STATE.md` (current position: Wave 5 pending, 7/8 plans done, 164 tests green)
  - `C:\Users\pc\auto-agent\CLAUDE.md` (project constraints)

### Secondary (MEDIUM — derived from AI-SPEC citations)

- Anthropic Messages API + Prompt Caching — referenced via AI-SPEC §3 (already verified by `gsd-ai-researcher` 2026-04-20).
- Context7 `/anthropics/anthropic-sdk-typescript` — AI-SPEC §3 sources.

### Tertiary (flagged for validation if breaks discovered)

- Token counts for v1 template and v2 projected (estimated 700-850 + 1200-1400 tokens) — **unverified against actual `countTokens` API call**. Recommendation: Wave 1 adds a one-off token measurement test to confirm cache threshold behavior.

---

## Metadata

**Confidence breakdown:**
- Codebase mapping: **HIGH** — every file referenced was read line-by-line; extension plans map exactly to existing shapes.
- Pattern extraction: **HIGH** — patterns verified in at least 2 Phase 1 components each.
- Dependency surface: **HIGH** — `components.json` + `package.json` + `ls src/components/ui/` confirmed what's installed vs needed.
- Migration strategy: **MEDIUM** — logic is sound; **risk concentrated in `migrateV1ToV2` idempotency** (planner must unit test with real v1 localStorage fixture).
- Validation architecture: **HIGH** — reuses Phase 1 Vitest setup verbatim; test count estimates based on pattern similarity to Phase 1's 164-test baseline.
- Cache breakpoint effectiveness: **MEDIUM** — AI-SPEC §4b.5 gave the shape; real token count TBD (Open Question Q2).
- Few-shot extraction from protótipo v3: **MEDIUM** — file location documented by CONTEXT.md, but the 4-6 pairs selection + condensation is a planner decision, not researched here.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — codebase + decisions are stable; Anthropic SDK API surface is stable since 0.90.0 shipped 2026-04-16).

---

## RESEARCH COMPLETE

**Phase:** 02 — Inteligência do Agente
**Confidence:** HIGH (codebase mapping, validation architecture, dependency surface); MEDIUM (cache breakpoint sizing — flagged for Wave 1 measurement).

### Key Findings

- **Zero files rewritten.** Phase 2 is purely additive: 11 new files + 10 surgical extensions to existing files. Phase 1 (164 tests green, 7/8 plans done) is a stable foundation — no refactor needed.
- **Single breaking change** contained to `src/lib/server/llm/types.ts` (StreamOptions gains 3 optional fields). Anthropic adapter updated; Gemini adapter ignores new fields silently.
- **Migration strategy is simple** (bump version 1→2, add defaults for 5 new fields per Session + 1 new schema field `motivoDaVenda`), but requires robust idempotency test using a real Phase 1 localStorage fixture.
- **Dependency surface is small:** 4 shadcn components (`tabs`, `radio-group`, `alert`, `select`) + 4 lucide icons, zero npm adds.
- **Validation architecture adds ~50 new test cases** to Phase 1's 164-test baseline via Nyquist sampling (≥2 extremes per behavior). Critical paths (motivation, migrations, system-v2, few-shot alternance) target 100%/≥90% coverage; UI components target ≥70%.

### File Created

`C:\Users\pc\auto-agent\.planning\phases\02-intelig-ncia-do-agente\02-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Codebase mapping | HIGH | All 18 source files read line-by-line; extension plans mirror existing patterns. |
| Dependency surface | HIGH | `components.json` + `package.json` + `ls` confirmed. |
| Migration strategy | MEDIUM | Logic sound; idempotency risk requires unit test with real v1 blob. |
| Validation architecture | HIGH | Reuses Phase 1 Vitest 4 / jsdom infra unchanged. |
| Pattern extraction | HIGH | Each convention verified in ≥2 Phase 1 components. |
| Cache breakpoint sizing | MEDIUM | v1 template verified <2048 tokens; v2 projected 1200-1400; Wave 1 needs actual measurement. |

### Open Questions

- Q1 (rationale persist?) — **resolved**: yes, via Message.rationale with existing persist.
- Q2 (cache breakpoint exact size?) — **flag**: Wave 1 adds token measurement.
- Q3 (targetPrice recomputed on startNegotiating?) — **recommendation**: recompute from snapshot config.
- Q4 (AgentThinking toggle global vs local?) — **lock**: controlled attribute + local per-click override.
- Q5 (gemini.ts few-shot parity?) — **no**: dev escape hatch, document no-op.
- Q6 (/benchmark mix v1 and v2 sessions?) — **recommendation**: show both, aggregate filtered to v2.

### Ready for Planning

Research complete. Planner may begin `02-XX-PLAN.md` files immediately. Canonical reads for planner: CONTEXT.md (D-01..D-16), UI-SPEC.md (Surfaces 1-3), AI-SPEC.md (Sections 1-7), this RESEARCH.md (all sections), Phase 1 01-CONTEXT.md (D-01..D-18 base).
