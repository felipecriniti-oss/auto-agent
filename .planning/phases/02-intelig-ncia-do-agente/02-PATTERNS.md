# Phase 02 — Inteligência do Agente: Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 11 novos + 10 extensões cirúrgicas = 21 surfaces
**Analogs found:** 20 / 21 (1 sem análogo direto — `/benchmark` route layout, mas reusa padrão de `SummaryPanel` KPI grid)

> Phase 2 é **aditiva** a Phase 1. Zero arquivos existentes são reescritos — apenas estendidos. Cada novo arquivo tem análogo direto em Phase 1 (convenção estabelecida). O planner deve **copiar padrões literalmente** (imports, naming, test shape, error handling) a menos que explicitamente flagged como "deviation allowed".

---

## Executive Summary

- **Camada pura / server (6 novos arquivos):** todos seguem o pattern de `src/lib/prompts/system-v1.ts` (named exports, `import type`, co-located `.test.ts`, Zod schemas locais quando shape é output de função pura).
- **Camada types/schemas (4 extensões):** cada extensão é aditiva — campos opcionais com defaults Zod, backward-compat garantida via migration.
- **Camada store (1 extensão significativa + 1 arquivo novo):** `negotiation.ts` estende com slice `agentConfig` + fields novos em Session + strip `<rationale>` paralelo a `<arg>` (linha 7-12). `migrations.ts` é o primeiro arquivo deste tipo — planner cria pattern.
- **Camada UI (6 componentes novos + 4 extensões):** todos `"use client"`, split-selector ou useShallow per pattern (ContextPanel.tsx vs ChatView.tsx), `data-testid` para testes, lucide-react named imports.
- **Rota `/benchmark` (1 nova):** reusa o pattern de `src/app/page.tsx` ("use client" + grid + Zustand selector).
- **Zero anti-patterns detectados** nos análogos escolhidos — Phase 1 é coerente e serve como template sólido.
- **Cross-cutting invariants críticos:** (1) nunca default exports, (2) tags invisíveis ao vendedor sempre strippadas via regex global, (3) error handling nunca vaza upstream strings ao cliente, (4) persist middleware sempre com `partialize` explícito.

---

## File Classification

### Camada: Pure functions / Data / Prompts (server-side ou shared)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/scoring/motivation.ts` [N] | utility/pure-fn | transform (listing → score) | `src/lib/utils/fipe.ts::parseFipeValor` | exact (single pure fn + named export + co-located test) |
| `src/lib/data/comparables.ts` [N] | data constant + formatter | batch (array → string) | `src/lib/prompts/system-v1.ts::SYSTEM_PROMPT_V1_TEMPLATE` (const + builder) | role-match (data constant + export function) |
| `src/lib/prompts/system-v2.ts` [N] | prompt-builder | transform (inputs → prompt string) | `src/lib/prompts/system-v1.ts` | exact (copy structure, 5 mutations per D-16) |
| `src/lib/prompts/tone.ts` [N] | constant map | lookup | `src/lib/prompts/system-v1.ts` (const exports) | role-match |
| `src/lib/prompts/few-shot.ts` [N] | builder (returns MessageParam[]) | transform (static → typed array with cache_control) | Nenhum exato — **novo shape** (retorna `MessageParam[]` com cache breakpoint). Parcial: `system-v1.ts::buildSystemPrompt` (builder pattern) | partial-match (new shape: Anthropic SDK type-bearing output) |
| `src/lib/stores/migrations.ts` [N] | migration helper | transform (v1 blob → v2 blob) | `src/lib/utils/fipe.ts::parseFipeValor` (pure transform + throws on malformed) | role-match (pure + co-located test, but new concept: "migration") |

### Camada: Schemas & Types

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/schemas/listing.ts` [E — extend] | schema | CRUD validation | (self — precedent já locked) | exact |
| `src/lib/schemas/negotiate.ts` [E — extend] | schema | CRUD validation | (self + `listing.ts`) | exact |
| `src/lib/schemas/agent-config.ts` [N] | schema | CRUD validation | `src/lib/schemas/listing.ts` | exact (same pattern: single `z.object`, typed export via `z.infer`) |
| `src/lib/types/session.ts` [E — extend] | type | shape declaration | (self) | exact |
| `src/lib/types/message.ts` [E — extend] | type | shape declaration | (self) | exact |

### Camada: LLM Server Adapters

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/server/llm/types.ts` [E — extend] | type | shape declaration | (self) | exact — **append fields, no rename** |
| `src/lib/server/llm/anthropic.ts` [E — extend] | adapter | streaming | (self) | exact — 4 surgical changes inside `streamAnthropic` |
| `src/lib/server/llm/gemini.ts` [E — no-op] | adapter | streaming | (self) | exact — no change (optional fields ignored) |
| `src/lib/server/llm/index.ts` [E — no change] | adapter router | orchestration | (self) | N/A — no change needed |

### Camada: API Route Handler

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/negotiate/stream/route.ts` [E — extend] | route-handler | request-response + streaming | (self) | exact — `promptVersion` branch + new body fields + `onUsage` callback |

### Camada: Store

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/stores/negotiation.ts` [E — significant extend] | store | CRUD + event-driven | (self) | exact — 7 surgical extensions |

### Camada: UI Components

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/negotiation/AgentThinking.tsx` [N] | component (presentational) | read-only render from props | `src/components/negotiation/MessageBubble.tsx` | exact (pure render, `"use client"`, props-only, no store) |
| `src/components/negotiation/AgentConfigForm.tsx` [N] | component (form + store) | request-response via store | `src/components/negotiation/AdListingForm.tsx` | exact (react-hook-form + zodResolver + Zustand via useShallow) |
| `src/components/negotiation/LeftColumnPanel.tsx` [N] | component (layout) | no data flow (layout only) | `src/components/negotiation/SummaryPanel.tsx` (layout wrapper pattern) | role-match |
| `src/components/negotiation/NegotiationStatusBar.tsx` [E — extend] | component (status) | read-only render from store | (self) | exact — add toggle button after last Badge |
| `src/components/negotiation/AdListingForm.tsx` [E — extend] | component (form) | request-response via store | (self) | exact — new FormField in grid |
| `src/components/negotiation/ChatView.tsx` [E — extend] | component (orchestrator) | streaming + event-driven | (self) | exact — body fields + AgentThinking render |
| `src/components/negotiation/MessageBubble.tsx` [E — no change if Option 1] | component (presentational) | read-only | (self) | exact |
| `src/components/negotiation/ContextPanel.tsx` [E — minor extend] | component (panel) | read-only render from store | (self) | exact — add 3rd Card |
| `src/components/Nav.tsx` [N] | component (layout) | read-only (usePathname) | `src/components/negotiation/NegotiationStatusBar.tsx` (flex layout) | role-match |

### Camada: Benchmark Surfaces

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/benchmark/page.tsx` [N] | page-route | read-only from store | `src/app/page.tsx` | role-match (`"use client"` + grid + Zustand) |
| `src/components/benchmark/BenchmarkScorecard.tsx` [N] | component (KPI grid) | read-only render from store aggregates | `src/components/negotiation/SummaryPanel.tsx` (KPI grid section) | exact |
| `src/components/benchmark/BenchmarkRow.tsx` [N] | component (table row) | read-only render from props + callback | `src/components/negotiation/MessageBubble.tsx` (props + data-testid) | role-match |
| `src/components/benchmark/StarRating.tsx` [N] | component (input) | event-driven (onChange) | Nenhum análogo exato. Parcial: `src/components/negotiation/AdListingForm.tsx` (form field interaction) | partial-match |

### Camada: Layout (app-level)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/layout.tsx` [E — extend] | layout | layout only | (self) | exact — inject `<Nav />` inside body |

---

## Pattern Assignments (per-file)

### [N] `src/lib/scoring/motivation.ts` (utility/pure-fn, transform)

**Analog:** `src/lib/utils/fipe.ts`

**Imports pattern** (fipe.ts linhas 1-7, zero imports — pure fn):
```typescript
// motivation.ts replica o mesmo: sem import de runtime, só `import type`
import type { Listing } from "@/lib/schemas/listing";
```

**Named-export pure fn pattern** (fipe.ts linhas 8-21):
```typescript
export function parseFipeValor(valor: string): number {
  if (typeof valor !== "string" || valor.length === 0) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  const clean = valor
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(clean);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  return Math.round(parsed);
}
```

**Co-located test pattern** (`src/lib/utils/fipe.test.ts` linhas 1-36):
```typescript
import { describe, expect, it } from "vitest";
import { parseFipeValor } from "./fipe";

describe("parseFipeValor", () => {
  it("parses R$ 268.000,00 to 268000", () => {
    expect(parseFipeValor("R$ 268.000,00")).toBe(268000);
  });
  // ...extremos: empty, non-numeric, malformed, extra whitespace
});
```

**Key invariants:**
- `export function <camelCase>(args): ReturnType` — nunca `export default`
- `import type` para tipos que não têm runtime footprint
- Validação defensiva com throws descritivos (`JSON.stringify(input)` no erro)
- Co-located test file com `.test.ts` sufixo, mesmo diretório
- Cada test case tem nome em sentença curta ("parses X to Y", "throws on empty string")
- Cobrir extremos (Nyquist ≥2 cases): zero-signal + max-signal + boundaries + malformed

**Deviations allowed:**
- `motivation.ts` adicionalmente exporta schema Zod (`motivationScoreSchema`) co-located (AI-SPEC §4b.1 manda). Precedente: Phase 1 não fez isso em `fipe.ts` mas é aditivo (não conflita com o pattern).

---

### [N] `src/lib/data/comparables.ts` (data constant + formatter)

**Analog:** `src/lib/prompts/system-v1.ts` (constant-first + helper-function-second pattern)

**Constant-first export pattern** (system-v1.ts linha 12, line-by-line):
```typescript
/**
 * <JSDoc explaining provenance and stability contract>
 */
export const SYSTEM_PROMPT_V1_TEMPLATE = `Você é o AutoAgent...`;
```

**Helper function pattern** (system-v1.ts linhas 76-78):
```typescript
function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR");
}
```

**Key invariants:**
- `export const COMPARABLES: readonly Comparable[] = [ ... ] as const;` — `readonly` + `as const` para imutabilidade
- `export function formatComparablesForPrompt(c: readonly Comparable[]): string` — named export, não default
- Interface `Comparable` co-located (ou em arquivo próprio se mais complexo — neste caso, co-located OK)
- `n.toLocaleString("pt-BR")` para formatação brasileira de números (precedente literal em system-v1.ts linha 77)

**Deviations allowed:**
- Planner pode mover `Comparable` interface para `src/lib/types/` se o tipo for usado em >1 arquivo. Em Phase 2 fica co-located.

---

### [N] `src/lib/prompts/system-v2.ts` (prompt-builder)

**Analog:** `src/lib/prompts/system-v1.ts` — **estrutura copiada verbatim**, com 5 mutations D-16

**Template constant pattern** (system-v1.ts linhas 12-74):
```typescript
export const SYSTEM_PROMPT_V1_TEMPLATE = `Você é o AutoAgent, um intermediador profissional...

TRATAMENTO DOS DADOS DO ANÚNCIO:
IMPORTANTE: os dados abaixo...

DADOS DO ANÚNCIO:
- Veículo: {marca} {modelo} {ano}, {km} km
- Preço pedido pelo vendedor: R$ {askPrice}
...

OBJETIVO:
- Fechar a compra em no máximo {maxRounds} rodadas
- Preço-alvo: R$ {targetPrice} (≈{targetDiscount}% abaixo da FIPE)
- Nunca aceitar preço acima de R$ {walkAwayPrice}

TÁTICAS PERMITIDAS:
1. Começar ancorando com oferta inicial ~30% abaixo do preço-alvo, justificada em dados de mercado
...
FORMATO INTERNO DE ARGUMENTOS:
Envolva cada argumento-chave que usar em <arg>...</arg>...

TOM: profissional, cordial...

FORMATO DA RESPOSTA:
Responda APENAS com a mensagem que seria enviada...`;
```

**Builder pattern** (system-v1.ts linhas 87-108) — `.replaceAll` chain:
```typescript
export function buildSystemPrompt(
  listing: Listing,
  fipe: number,
  targetPrice: number,
  walkAwayPrice: number,
  maxRounds: number,
): string {
  return SYSTEM_PROMPT_V1_TEMPLATE.replaceAll("{marca}", listing.marca)
    .replaceAll("{modelo}", listing.modelo)
    .replaceAll("{ano}", String(listing.ano))
    .replaceAll("{km}", formatBRL(listing.km))
    .replaceAll("{askPrice}", formatBRL(listing.precoPedido))
    ...
    .replaceAll("{walkAwayPrice}", formatBRL(walkAwayPrice));
}
```

**Drift guard test pattern** (system-v1.test.ts linhas 16-80):
```typescript
describe("SYSTEM_PROMPT_V1_TEMPLATE — drift guard", () => {
  it("contains all 14 placeholders", () => {
    const placeholders = ["{marca}", "{modelo}", /* ... */];
    for (const p of placeholders) {
      expect(SYSTEM_PROMPT_V1_TEMPLATE).toContain(p);
    }
  });
  it("injection-defense block appears BEFORE DADOS DO ANÚNCIO (ordering)", () => {
    const iDefense = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("TRATAMENTO DOS DADOS DO ANÚNCIO");
    const iData = SYSTEM_PROMPT_V1_TEMPLATE.indexOf("DADOS DO ANÚNCIO:");
    expect(iDefense).toBeLessThan(iData);
  });
});
```

**Substitution test pattern** (system-v1.test.ts linhas 82-144):
```typescript
describe("buildSystemPrompt — substitution", () => {
  it("substitutes all placeholders (no unsubstituted {word} tokens left)", () => {
    const out = buildSystemPrompt(validListing, 52000, 39000, 46800, 6);
    const leftovers = out.match(/\{[a-zA-Z]+\}/g);
    expect(leftovers).toBeNull();
  });
});
```

**Key invariants:**
- Export constant `SYSTEM_PROMPT_V2_TEMPLATE` + `PROMPT_VERSION` + `buildSystemPromptV2` — todos named
- Placeholders entre `{}` (NÃO `${}` — não é template literal)
- `.replaceAll` chain — nunca regex; string literals são seguros
- `formatBRL(n: number): string` helper reused — copiar from v1 ou importar (recomendação: copiar inline por isolamento — v1 não importa nada aqui, v2 fica simétrico)
- JSDoc no topo citando provenance + stability contract (ver v1 linhas 3-11)
- Drift guard tests MUST: count placeholders (Nyquist: if v2 has N placeholders, test declara N e conta), verify ordering of blocks, verify new blocks present ("MOTIVAÇÃO DO VENDEDOR", "FORMATO INTERNO DE RATIONALE")
- Test Nyquist: 8 combos (formal/casual × agressivo/moderado × BAIXA/ALTA) cobrindo output shape

**Deviations allowed:**
- Builder de v2 recebe `config: AgentConfig` agregado (em vez de 4 primitives separados) — diferente de v1 que recebe primitives. Justificado porque D-10 copia snapshot de AgentConfig em Session.
- Builder de v2 recebe `motivation: MotivationScore` e `comparablesText: string` — novos inputs.

---

### [N] `src/lib/prompts/tone.ts` (constant map)

**Analog:** `src/lib/prompts/system-v1.ts::SYSTEM_PROMPT_V1_TEMPLATE` (const export pattern)

**Constant export pattern:**
```typescript
// system-v1.ts linha 12: export const <NAME> = `...`;
// tone.ts segue:
export const TONE_PRESETS = {
  formal: "TOM: Profissional. Trate o vendedor por 'senhor/senhora' + nome. ...",
  casual: "TOM: WhatsApp BR profissional-informal. Trate por primeiro nome. ...",
} as const;

export type ToneKey = keyof typeof TONE_PRESETS;
```

**Key invariants:**
- `as const` para estreitar tipos do objeto
- `keyof typeof` para derivar union type `"formal" | "casual"` automaticamente
- Strings literais verbatim do D-08 (não parafrasear)

**Deviations allowed:** N/A — pattern é trivial.

---

### [N] `src/lib/prompts/few-shot.ts` (MessageParam[] builder)

**Analog:** nenhum exato — primeira função que retorna Anthropic SDK types. **Parcial:** `src/lib/prompts/system-v1.ts::buildSystemPrompt` (builder pattern).

**Type-only import pattern** (anthropic.ts linha 2):
```typescript
// anthropic.ts linha 2 — referência:
import type { StreamOptions } from "./types";

// few-shot.ts aplica o mesmo:
import type { MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
```

**Builder shape** (extrapolated from AI-SPEC §4b.5):
```typescript
const AUDI_Q5_PAIRS: readonly Array<{ user: string; assistant: string }> = [
  { user: "...", assistant: "..." },
  // 4 pairs total: opener, escalação, concessão, fechamento
];

export function buildFewShot(): MessageParam[] {
  // Implementação: flatten pairs em MessageParam[], marcar último assistant
  // com cache_control: { type: "ephemeral" } para caching breakpoint.
  // Ver AI-SPEC §4b.5 para código exato.
}
```

**Co-located test pattern** (few-shot.test.ts — novo, mas segue `src/lib/prompts/system-v1.test.ts` structure):
```typescript
import { describe, expect, it } from "vitest";
import { buildFewShot } from "./few-shot";

describe("buildFewShot", () => {
  it("returns an even-length array (pairs of user/assistant)", () => {
    const pairs = buildFewShot();
    expect(pairs.length % 2).toBe(0);
  });

  it("alternates user/assistant starting with user", () => {
    const pairs = buildFewShot();
    for (let i = 0; i < pairs.length; i++) {
      expect(pairs[i].role).toBe(i % 2 === 0 ? "user" : "assistant");
    }
  });

  it("last assistant content carries cache_control", () => {
    // Assert on TextBlockParam shape of last assistant message
  });
});
```

**Key invariants:**
- `import type { MessageParam, TextBlockParam }` — nunca runtime import do path types
- Retornar `MessageParam[]` (não `LLMMessage[]`) porque precisa carregar `cache_control` no último block — **este é o único lugar de Phase 2 que leaks Anthropic types fora de `anthropic.ts`; aceitável porque é provider-specific**
- Test de alternance obrigatório (AI-SPEC Pitfall #5)

**Deviations allowed:**
- Diferente de todos os outros arquivos em `prompts/` — retorna tipos SDK-specific em vez de string. Justificado pela necessidade de `cache_control`.

---

### [N] `src/lib/stores/migrations.ts` (migration helper)

**Analog:** `src/lib/utils/fipe.ts::parseFipeValor` (pure transform + defensive validation)

**Defensive validation + early-return pattern** (fipe.ts linhas 8-21):
```typescript
export function parseFipeValor(valor: string): number {
  if (typeof valor !== "string" || valor.length === 0) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  // ...parse logic
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  return Math.round(parsed);
}
```

**Shape for migrations.ts:**
```typescript
import type { AgentConfig, Session } from "@/lib/types/session";

const DEFAULT_AGENT_CONFIG_FOR_MIGRATION: AgentConfig = {
  targetDiscount: 0.25,
  maxRounds: 6,
  tone: "casual",
  initialAnchorStrategy: "moderado",
};

export function migrateV1ToV2(persisted: unknown): /* PersistedStateV2 */ unknown {
  // Guard: shape errado → retornar init state (não throw — Zustand precisa de state válido)
  if (!persisted || typeof persisted !== "object") {
    return { state: { currentSession: null, history: [], agentConfig: DEFAULT_AGENT_CONFIG_FOR_MIGRATION }, version: 2 };
  }
  // Transform cada session: listing + session-level new fields com defaults
  // ...
}
```

**Key invariants:**
- Pure function — nenhum side-effect, nenhum logging (console.warn fica em `onRehydrateStorage`, não aqui)
- Defensive shape-checking: `!persisted || typeof persisted !== "object"` antes de destructure
- **Não throw** — Zustand migrate precisa retornar state válido sempre; fallback é init state
- Type annotation `unknown` no input porque Zustand persist passa `unknown` para migrate

**Deviations allowed:**
- Diferente de `parseFipeValor` em um ponto-chave: migration **não throws**; retorna init state como fallback. Justificado porque Zustand persist não lida com throws em migrate.

---

### [E — extend] `src/lib/schemas/listing.ts` (schema CRUD)

**Analog:** self — pattern precedent já locked.

**Enum + optional field pattern** (novo a adicionar; precedent: `listing.ts` já tem primitive schemas):
```typescript
// Adicionar ao topo do arquivo (após linha 3):
export const motivoDaVendaSchema = z.enum([
  "mudanca_cidade",
  "upgrade_veiculo",
  "necessidade_financeira",
  "outros",
]);

// Adicionar ao listingSchema object (após linha 40, antes do closing brace):
motivoDaVenda: motivoDaVendaSchema.optional().default("outros"),
```

**Test pattern** (listing.test.ts linhas 4-13 — base + overrides):
```typescript
const validListing = {
  marca: "Volkswagen",
  modelo: "Gol 1.6",
  // ...
};

describe("listingSchema — motivoDaVenda", () => {
  it("defaults to 'outros' when absent", () => {
    const r = listingSchema.safeParse(validListing);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivoDaVenda).toBe("outros");
  });
  it("accepts each of the 4 enum values", () => {
    for (const m of ["mudanca_cidade", "upgrade_veiculo", "necessidade_financeira", "outros"]) {
      const r = listingSchema.safeParse({ ...validListing, motivoDaVenda: m });
      expect(r.success).toBe(true);
    }
  });
  it("rejects invalid enum value", () => {
    const r = listingSchema.safeParse({ ...validListing, motivoDaVenda: "foo" });
    expect(r.success).toBe(false);
  });
});
```

**Key invariants:**
- `z.enum([...])` — nunca `z.union([z.literal("a"), z.literal("b"), ...])` para enums
- `.optional().default(value)` — mesma ordem sempre: optional FIRST, default SECOND
- Test base `validListing` + spread com overrides `{...validListing, field: value}` (padrão já usado em listing.test.ts)
- `export type Listing = z.infer<typeof listingSchema>;` (linha 43 existente) — auto-actualiza

**Deviations allowed:** N/A.

---

### [E — extend] `src/lib/schemas/negotiate.ts` (schema CRUD)

**Analog:** self.

**Refinement pattern** (new — AI-SPEC Pitfall #5 mandates):
```typescript
// Adicionar helper pure antes do schema:
const alternanceRefinement = (msgs: { role: "user" | "assistant" }[]) => {
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].role === msgs[i - 1].role) return false;
  }
  return true;
};

// Estender schema existente (linhas 4-18):
export const negotiateRequestSchema = z.object({
  listing: listingSchema, // já cascata motivoDaVenda
  fipe: z.number().int().positive(),
  targetPrice: z.number().int().positive(),
  walkAwayPrice: z.number().int().positive(),
  maxRounds: z.number().int().min(1).max(20),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(40)
    .refine(alternanceRefinement, {
      message: "messages must alternate user/assistant roles",
    }),
  // Phase 2 additions:
  tone: z.enum(["formal", "casual"]).default("casual"),
  initialAnchorStrategy: z.enum(["agressivo", "moderado"]).default("moderado"),
  promptVersion: z.enum(["v1.0.0", "v2.0.0"]).default("v2.0.0"),
});
```

**Test pattern** (negotiate.test.ts linhas 4-23, base body + overrides):
```typescript
// Existing baseline:
const validBody = {
  listing: validListing,
  fipe: 52000,
  // ...
  messages: [{ role: "user", content: "Olá..." }],
};

// Add tests:
describe("negotiateRequestSchema — Phase 2 additions", () => {
  it("applies default tone='casual' when absent", () => {
    const r = negotiateRequestSchema.safeParse(validBody);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tone).toBe("casual");
  });
  it("rejects alternance violation (user → user)", () => {
    const body = {
      ...validBody,
      messages: [
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
    };
    expect(negotiateRequestSchema.safeParse(body).success).toBe(false);
  });
});
```

**Key invariants:**
- `.refine(fn, { message: "..." })` — sempre com message em inglês (precedent: schemas atuais não têm refinements; nova convenção — sugestão: manter inglês para DX de erros em devtools)
- Defaults inline no schema (`.default("casual")`) — rota depende disso (D-14 manda `promptVersion: "v2.0.0"` como default)

**Deviations allowed:**
- `refine` é novo — primeiro refinement em schema do projeto. Segue padrão oficial Zod.

---

### [N] `src/lib/schemas/agent-config.ts`

**Analog:** `src/lib/schemas/listing.ts` (inteiramente — shape simples + z.infer export).

**Excerpt to copy** (listing.ts linhas 1-43, condensado):
```typescript
import { z } from "zod";

export const agentConfigSchema = z.object({
  targetDiscount: z.number().min(0.05).max(0.40),
  maxRounds: z.number().int().min(2).max(12),
  tone: z.enum(["formal", "casual"]),
  initialAnchorStrategy: z.enum(["agressivo", "moderado"]),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
```

**Key invariants:**
- `z.infer` ao invés de interface manual — `AgentConfig` type dirige-se do schema
- Campos com min/max inline (não cross-field refine — Phase 1 não tem cross-field refinements)
- Co-located test mínimo: 1 accept + 2 rejects (out-of-range) + 1 invalid-enum

**Deviations allowed:** N/A.

---

### [E — extend] `src/lib/types/session.ts` (type shape)

**Analog:** self.

**Extension shape** (append-only aos campos existentes linhas 7-20):
```typescript
// NEW interface no topo do arquivo (após imports):
export interface AgentConfig {
  targetDiscount: number;
  maxRounds: number;
  tone: "formal" | "casual";
  initialAnchorStrategy: "agressivo" | "moderado";
}

export interface MotivationScore {
  score: number;
  label: "BAIXA" | "MÉDIA" | "ALTA";
  rationale: string;
}

// Estender Session interface existente:
export interface Session {
  // ...campos Phase 1 (id, listing, fipe, targetPrice, walkAwayPrice, messages, round, status, startedAt, endedAt, endReason)
  maxRounds: number; // ⚠️ MINOR BREAKING: estava `maxRounds: 6` literal; relax para number
  // Phase 2 additions:
  promptVersion: string;
  appliedConfig: AgentConfig;
  motivationScore?: MotivationScore;
  userRating?: 1 | 2 | 3 | 4 | 5;
  userNote?: string;
  finalPrice?: number;
  flags?: {
    walkAwayExceeded?: boolean;
    rationaleLeak?: boolean;
    strategyLeakSuspect?: boolean;
    markdownBleed?: boolean;
  };
}
```

**Key invariants:**
- `interface` sobre `type` para objetos — precedent em todo `src/lib/types/`
- Union types literais para enums inline (`"formal" | "casual"`) — coerente com `Status` e `EndReason`
- Campos opcionais com `?` — NÃO com `| undefined` explícito
- Literal type relax (`6` → `number`) é minor breaking, mas safe — tests Phase 1 usam `maxRounds: 6` valor, não tipo literal

**Deviations allowed:**
- `AgentConfig` poderia viver em `agent-config.ts` (schema) em vez de aqui. Recomendação: importar de `@/lib/schemas/agent-config` e re-export aqui — evita duplicação, mantém types.ts como agregador. Planner decide.

---

### [E — extend] `src/lib/types/message.ts`

**Analog:** self.

**Extension shape** (message.ts linhas 3-11):
```typescript
export interface Message {
  id: string;
  role: Role;
  round: number;
  content: string; // post-strip de <arg> e <rationale> (D-14 + D-01)
  timestamp: string;
  isStreaming?: boolean;
  error?: boolean;
  // Phase 2 addition (D-03):
  rationale?: string; // extracted from <rationale>...</rationale> on finalize
}
```

**Key invariants:** N/A — trivial append.

---

### [E — breaking change] `src/lib/server/llm/types.ts`

**Analog:** self.

**Extension — additive (Opção A from RESEARCH.md):**
```typescript
export type LLMProvider = "anthropic" | "gemini";
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  signal: AbortSignal;
  onText: (chunk: string) => void;
  // Phase 2 additions (todos opcionais — gemini.ts ignora):
  fewShotPairs?: LLMMessage[];
  cacheSystem?: boolean;
  onUsage?: (u: {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
    stopReason: string | null;
  }) => void;
}
```

**Key invariants:**
- **Todos os campos novos são opcionais** — preserva backward-compat com gemini.ts que ignora
- `fewShotPairs: LLMMessage[]` — NÃO `MessageParam[]` — mantém types.ts provider-agnostic; conversion para MessageParam (com cache_control) fica dentro de anthropic.ts
- `onUsage` é opcional (rota nova o usa; testes Phase 1 não precisam)

**Deviations allowed:**
- AI-SPEC §3 sugere `StreamOptionsV2` union type — Research recomenda Opção A (append opcional). Planner escolhe na PLAN.md, mas Opção A é o default.

---

### [E — extend] `src/lib/server/llm/anthropic.ts`

**Analog:** self — 4 surgical extensions dentro de `streamAnthropic`.

**Current baseline** (anthropic.ts linhas 1-26):
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { StreamOptions } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function streamAnthropic(opts: StreamOptions): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: opts.messages,
    },
    { signal: opts.signal },
  );

  stream.on("text", (chunk: string) => opts.onText(chunk));
  await stream.finalMessage();
}
```

**Phase 2 extension plan (4 changes — NO rewrite):**
1. Add imports: `import type { MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";`
2. Branch `system` based on `opts.cacheSystem`:
   ```typescript
   const system = opts.cacheSystem
     ? ([{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }] satisfies TextBlockParam[])
     : opts.systemPrompt;
   ```
3. Build messages with few-shot prepend:
   ```typescript
   const messages: MessageParam[] = [
     ...(opts.fewShotPairs ?? []),
     ...opts.messages,
   ];
   ```
4. After `await stream.finalMessage()`, extract usage and call `onUsage`:
   ```typescript
   const final = await stream.finalMessage();
   opts.onUsage?.({
     input: final.usage.input_tokens,
     output: final.usage.output_tokens,
     cacheCreate: final.usage.cache_creation_input_tokens ?? 0,
     cacheRead: final.usage.cache_read_input_tokens ?? 0,
     stopReason: final.stop_reason,
   });
   ```

**Key invariants:**
- Preserve `stream.on("text", ...)` callback — **DO NOT strip `<arg>` or `<rationale>` here** (Pitfall #3 — strip no cliente, pós-stream)
- Preserve `{ signal: opts.signal }` as SECOND argument to `stream()` — abort contract
- Sonnet 4.6 constant — `"claude-sonnet-4-6"`; env override via `ANTHROPIC_MODEL`
- Never log `apiKey` or `final.usage` content outside structured JSON (route handler does it)

**Deviations allowed:**
- `satisfies TextBlockParam[]` em vez de cast — modern TS pattern (Zod 3.22+ era).

---

### [E — no change] `src/lib/server/llm/gemini.ts`

**Analog:** self.

**Extension plan:** ZERO changes. `fewShotPairs`, `cacheSystem`, `onUsage` são campos opcionais que gemini.ts já ignora ao destructure só `systemPrompt`, `messages`, `maxTokens`, `signal`, `onText`.

**Key invariants:** no-op. Flag em PLAN.md "Phase 2 no-op on gemini.ts".

---

### [E — extend] `src/app/api/negotiate/stream/route.ts`

**Analog:** self — branch on `promptVersion`, preserve 119-line structure.

**Current structure** (route.ts linhas 1-118):
```typescript
import { buildSystemPrompt } from "@/lib/prompts/system-v1";
import { negotiateRequestSchema } from "@/lib/schemas/negotiate";
import { isNegotiationEnabled } from "@/lib/server/kill-switch";
import { isProviderConfigured, resolveProvider, streamLLM } from "@/lib/server/llm";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 1024;

// ...IP extraction, SSE frame helpers...

export async function POST(request: Request): Promise<Response> {
  if (!isNegotiationEnabled()) { /* 503 */ }
  const ip = extractIp(request);
  const rl = checkRateLimit(ip, { bucket: "negotiate", max: 5, windowMs: 60_000 });
  if (!rl.ok) { /* 429 */ }

  let body: ReturnType<typeof negotiateRequestSchema.parse>;
  try {
    const parsed = negotiateRequestSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
    body = parsed.data;
  } catch { /* 400 */ }

  const provider = resolveProvider();
  if (!isProviderConfigured(provider)) { /* 500 */ }

  const abortCtl = new AbortController();
  request.signal.addEventListener("abort", () => abortCtl.abort());

  const systemPrompt = buildSystemPrompt(
    body.listing, body.fipe, body.targetPrice, body.walkAwayPrice, body.maxRounds,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamLLM(provider, {
          systemPrompt, messages: body.messages, maxTokens: MAX_TOKENS,
          signal: abortCtl.signal,
          onText: (chunk: string) => { /* enqueue SSE frame */ },
        });
        controller.enqueue(encodeFrame({ type: "done" }));
        controller.close();
      } catch (err) {
        console.warn(JSON.stringify({ scope: "negotiate_stream.upstream", /* ... */ }));
        controller.enqueue(encodeFrame({ type: "error", message: "upstream_failed" }));
        controller.close();
      }
    },
    cancel() { abortCtl.abort(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", /* ... */ } });
}
```

**Extension plan:**
```typescript
import { buildSystemPrompt } from "@/lib/prompts/system-v1";
import { PROMPT_VERSION, buildSystemPromptV2 } from "@/lib/prompts/system-v2";
import { buildFewShot } from "@/lib/prompts/few-shot";
import { COMPARABLES, formatComparablesForPrompt } from "@/lib/data/comparables";
import { computeMotivationScore } from "@/lib/scoring/motivation";
// ...existing imports

// Após body parse (linha 48), antes de resolveProvider:
const useV2 = body.promptVersion === "v2.0.0";
const motivation = useV2 ? computeMotivationScore(body.listing) : undefined;

const systemPrompt = useV2
  ? buildSystemPromptV2(
      body.listing, body.fipe, body.targetPrice, body.walkAwayPrice,
      { targetDiscount: body.targetDiscount ?? 0.25, maxRounds: body.maxRounds, tone: body.tone, initialAnchorStrategy: body.initialAnchorStrategy },
      motivation!,
      formatComparablesForPrompt(COMPARABLES),
    )
  : buildSystemPrompt(body.listing, body.fipe, body.targetPrice, body.walkAwayPrice, body.maxRounds);

// Em streamLLM, adicionar fewShotPairs + cacheSystem + onUsage:
await streamLLM(provider, {
  systemPrompt,
  messages: body.messages,
  maxTokens: MAX_TOKENS,
  signal: abortCtl.signal,
  fewShotPairs: useV2 ? buildFewShot() : [],
  cacheSystem: useV2,
  onUsage: (usage) => {
    console.log(JSON.stringify({ scope: "negotiate_stream.usage", promptVersion: body.promptVersion, usage }));
  },
  onText: (chunk) => { /* unchanged */ },
});
```

**Error handling idiom** (route.ts linhas 87-103) — **preserve literal**:
```typescript
catch (err) {
  const e = err as { status?: number; name?: string; message?: string };
  console.warn(
    JSON.stringify({
      scope: "negotiate_stream.upstream",
      provider,
      status: e?.status ?? null,
      name: e?.name ?? null,
      message: e?.message ?? String(err),
    }),
  );
  // Client receives ONLY "upstream_failed" — never leaks upstream message
  controller.enqueue(encodeFrame({ type: "error", message: "upstream_failed" }));
  controller.close();
}
```

**Key invariants:**
- `runtime = "edge"` + `dynamic = "force-dynamic"` — nunca remover
- Rate limit + kill switch + Zod parse em ORDEM fixa (kill → rate → parse → provider-check)
- `console.warn(JSON.stringify(...))` com `scope` key para estruturado — Vercel logs dependem disso
- NUNCA leak upstream message ao cliente (T-06-04) — `type: "error", message: "upstream_failed"` fixo
- `controller.enqueue` SEMPRE wrapped em try/catch (linhas 78-80, 100-102) — controller pode estar fechado

**Deviations allowed:**
- Novo campo `promptVersion` no body — default `"v2.0.0"` (schema garante).
- Novo `console.log(JSON.stringify({ scope: "negotiate_stream.usage", ...}))` — novo scope para telemetria de usage. Não conflita com existente "negotiate_stream.upstream".

---

### [E — significant extend] `src/lib/stores/negotiation.ts`

**Analog:** self — 7 surgical changes preserving 215-line structure.

**Current regex pattern** (negotiation.ts linhas 7-12) — **template para rationale**:
```typescript
const ARG_TAG_REGEX = /<\/?arg>/g;
const ARG_EXTRACT_REGEX = /<arg>(.*?)<\/arg>/g;

export function renderMessageContent(content: string): string {
  return content.replace(ARG_TAG_REGEX, "");
}
```

**Extension — add rationale regex at top:**
```typescript
const ARG_TAG_REGEX = /<\/?arg>/g;
const ARG_EXTRACT_REGEX = /<arg>(.*?)<\/arg>/g;
const RATIONALE_TAG_REGEX = /<\/?rationale>/g;
const RATIONALE_EXTRACT_REGEX = /<rationale>([\s\S]*?)<\/rationale>/g;
const RATIONALE_STRIP_REGEX = /<rationale>[\s\S]*?<\/rationale>\s*/g;

export function renderMessageContent(content: string): string {
  // Strip BOTH <arg> and <rationale> (plus content of rationale blocks)
  return content
    .replace(RATIONALE_STRIP_REGEX, "")
    .replace(ARG_TAG_REGEX, "");
}
```

**State interface extension** (negotiation.ts linhas 14-26):
```typescript
interface NegotiationState {
  currentSession: Session | null;
  history: Session[];
  agentConfig: AgentConfig;           // NEW
  thinkingVisible: boolean;           // NEW — UI-only (NOT persisted)
  initSession: (listing: Listing, fipe: number) => void;
  setFipe: (fipe: number) => void;
  startNegotiating: () => void;
  appendAgentChunk: (chunk: string) => void;
  finalizeAgentMessage: () => void;
  addSellerMessage: (content: string) => void;
  endSession: (reason: EndReason) => void;
  newNegotiation: () => void;
  getArgumentsUsed: () => string[];
  // NEW actions:
  setAgentConfig: (c: Partial<AgentConfig>) => void;
  setUserRating: (sessionId: string, rating: 1 | 2 | 3 | 4 | 5 | undefined) => void;
  setUserNote: (sessionId: string, note: string) => void;
  setThinkingVisible: (v: boolean) => void;
}
```

**`finalizeAgentMessage` extension** (current linhas 125-145):
```typescript
finalizeAgentMessage: () => {
  const s = get().currentSession;
  if (!s) return;
  const last = s.messages[s.messages.length - 1];
  if (!last || !last.isStreaming) return;

  // Phase 2: extract rationale + strip from content (D-01, D-03)
  const rationaleMatches = [...last.content.matchAll(RATIONALE_EXTRACT_REGEX)].map((m) => m[1].trim());
  const rationale = rationaleMatches[0] ?? undefined;
  const contentWithoutRationale = last.content.replace(RATIONALE_STRIP_REGEX, "").trim();

  const finalized: Message = {
    ...last,
    content: contentWithoutRationale,
    rationale,
    isStreaming: false,
  };
  const newMessages = [...s.messages.slice(0, -1), finalized];

  // Unchanged: check max rounds
  if (s.round >= s.maxRounds) { /* ...ended */ }
  else { set({ currentSession: { ...s, messages: newMessages } }); }
},
```

**`startNegotiating` extension** (current linhas 86-92):
```typescript
import { PROMPT_VERSION } from "@/lib/prompts/system-v2";
import { computeMotivationScore } from "@/lib/scoring/motivation";

startNegotiating: () => {
  const s = get().currentSession;
  const cfg = get().agentConfig;
  if (!s) return;
  set({
    currentSession: {
      ...s,
      status: "negotiating",
      startedAt: isoNow(),
      // Phase 2 additions:
      appliedConfig: { ...cfg }, // SNAPSHOT (D-10)
      promptVersion: PROMPT_VERSION,
      motivationScore: computeMotivationScore(s.listing), // D-05
    },
  });
},
```

**Persist middleware extension** (current linhas 198-212):
```typescript
{
  name: "autoagent-playground-v1", // per RESEARCH recommendation: keep key, bump version only
  storage: createJSONStorage(() => localStorage),
  version: 2, // BUMP
  migrate: (persisted, version) => {
    if (version === 1) return migrateV1ToV2(persisted);
    return persisted as NegotiationState;
  },
  partialize: (state) => ({
    currentSession: state.currentSession,
    history: state.history,
    agentConfig: state.agentConfig, // NEW (thinkingVisible excluded — UI-only)
  }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.warn("Failed to rehydrate negotiation store:", error);
  },
}
```

**Default agent config constant** (new, top of file):
```typescript
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  targetDiscount: 0.25,
  maxRounds: 6,
  tone: "casual",
  initialAnchorStrategy: "moderado",
};
```

**Test pattern** (negotiation.test.ts linhas 16-23):
```typescript
function resetStore() {
  localStorage.clear();
  useNegotiationStore.setState({
    currentSession: null,
    history: [],
    agentConfig: DEFAULT_AGENT_CONFIG, // NEW
    thinkingVisible: false, // NEW
  });
}
beforeEach(() => {
  resetStore();
});
```

**Key invariants:**
- **NUNCA mutar `last.content` durante streaming** — strip só em `finalizeAgentMessage` (Pitfall #3)
- **`renderMessageContent` strippa TUDO (arg + rationale)** — MessageBubble usa isto, mantém bubble limpa
- Regex globais `/g` flag sempre — `replace` sem `/g` só substitui primeiro match
- **`[\s\S]*?` em RATIONALE_EXTRACT** para cobrir quebras de linha (rationale pode ser multi-line); `<arg>` usa `.*?` (single-line assumido)
- `thinkingVisible` UI-only → NÃO incluir em `partialize`
- `setState` preserva pattern `{ ...s, newFields }` — nunca mutate `s` diretamente
- Persist key preservada (`-v1`) por simplicidade — só version bump (RESEARCH Opção Y)

**Deviations allowed:**
- Planner pode escolher manter `-v1` key ou renomear para `-v2` (Opção X) — documentar decisão em PLAN.md. Recomendação: Opção Y (mais simples).

---

### [N] `src/lib/stores/migrations.test.ts`

**Analog:** `src/lib/stores/negotiation.test.ts` linhas 309-332 (persist roundtrip tests)

**Test pattern:**
```typescript
import { describe, expect, it } from "vitest";
import { migrateV1ToV2 } from "./migrations";

describe("migrateV1ToV2", () => {
  it("returns init state when persisted is null", () => {
    const result = migrateV1ToV2(null);
    expect(result).toMatchObject({
      state: { currentSession: null, history: [], agentConfig: expect.any(Object) },
      version: 2,
    });
  });

  it("adds motivoDaVenda='outros' to v1 sessions without it", () => {
    const v1 = { state: { currentSession: { listing: { marca: "VW" /* ...no motivoDaVenda */ } }, history: [] }, version: 1 };
    const result = migrateV1ToV2(v1);
    expect((result as any).state.currentSession.listing.motivoDaVenda).toBe("outros");
  });

  it("stamps promptVersion='v1.0.0' on existing sessions", () => { /* ... */ });
  it("reconstitutes appliedConfig with DEFAULT_AGENT_CONFIG", () => { /* ... */ });
  // Nyquist: empty history, 3 sessions, currentSession=null, malformed shape
});
```

**Key invariants:**
- Import from `./migrations` (co-located)
- Type-loose inputs (`unknown`/`any`) in tests — migration fn recebe unknown por contract
- Cover Nyquist cases: null, malformed, 0 sessions, N sessions, currentSession present/null

---

### [N] `src/components/negotiation/AgentThinking.tsx` (presentational)

**Analog:** `src/components/negotiation/MessageBubble.tsx` (pure render, props only, `"use client"`, no store access)

**Full analog excerpt** (MessageBubble.tsx linhas 1-36):
```typescript
"use client";

import { renderMessageContent } from "@/lib/stores/negotiation";
import type { Message } from "@/lib/types/message";
import { AlertCircle } from "lucide-react";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isAgent = message.role === "agent";
  const text = renderMessageContent(message.content);
  return (
    <div className={`mb-2 flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={/* ... conditional classes ... */}
        data-testid="message-bubble"
        data-role={message.role}
      >
        <span className="whitespace-pre-wrap">{text}</span>
        {message.isStreaming ? <span className="animate-pulse">▌</span> : null}
        {/* ... error state ... */}
      </div>
    </div>
  );
}
```

**AgentThinking.tsx shape** (per UI-SPEC Surface 2, linhas 334-364):
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
    <details
      open={open}
      className="mt-1 rounded-md border border-violet-200 bg-violet-50"
      data-testid="agent-thinking-disclosure"
    >
      <summary className="flex cursor-pointer items-center gap-1 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 list-none select-none">
        <ChevronRight className="h-3 w-3 transition-transform" aria-hidden="true" />
        Raciocínio do agente
      </summary>
      <div className="border-t border-violet-200 px-3 py-2">
        {isStreaming && !rationale ? (
          <p className="text-xs font-medium text-muted-foreground italic">Analisando...</p>
        ) : !rationale ? (
          <p className="text-xs font-medium text-muted-foreground">
            Nenhum raciocínio disponível para esta rodada.
          </p>
        ) : (
          <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
            {rationale}
          </p>
        )}
      </div>
    </details>
  );
}
```

**Test pattern** (analog: `MessageBubble.test.tsx` linhas 1-60):
```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentThinking } from "./AgentThinking";

describe("AgentThinking", () => {
  it("renders summary always (closed state)", () => {
    render(<AgentThinking rationale="algo" isStreaming={false} open={false} />);
    expect(screen.getByText("Raciocínio do agente")).toBeInTheDocument();
  });
  it("shows rationale text when open + rationale present", () => {
    render(<AgentThinking rationale="porque X" isStreaming={false} open={true} />);
    expect(screen.getByText("porque X")).toBeInTheDocument();
  });
  it("shows 'Analisando...' when streaming + no rationale", () => { /* ... */ });
  it("shows empty state when not streaming + no rationale", () => { /* ... */ });
});
```

**Key invariants:**
- `"use client"` directive (line 1)
- `interface Props { ... }` named — nunca inline props type
- `import { ChevronRight } from "lucide-react"` — named imports only (not `import * as Lucide`)
- `data-testid="agent-thinking-disclosure"` for tests
- `aria-hidden="true"` em icons decorativos (copy from MessageBubble's `AlertCircle`)
- Props-only, zero store access — props-drilled via ChatView
- Native `<details>/<summary>` — NOT shadcn Accordion (UI-SPEC manda)

---

### [N] `src/components/negotiation/AgentConfigForm.tsx` (form + store)

**Analog:** `src/components/negotiation/AdListingForm.tsx` (react-hook-form + zodResolver + Zustand via useShallow)

**Imports pattern** (AdListingForm.tsx linhas 1-20):
```typescript
"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
// ... more imports ...
import { type Listing, listingSchema } from "@/lib/schemas/listing";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useShallow } from "zustand/react/shallow";
```

**Form init pattern** (AdListingForm.tsx linhas 27-52):
```typescript
const defaultValues: Listing = { /* zero-initialized */ };

export function AdListingForm({ disabled, onReady }: Props) {
  const form = useForm<Listing>({
    resolver: zodResolver(listingSchema),
    defaultValues,
    mode: "onBlur",
  });

  // useShallow pattern — 3 slices as atomic object
  const { initSession, setFipe, currentSession } = useNegotiationStore(
    useShallow((s) => ({
      initSession: s.initSession,
      setFipe: s.setFipe,
      currentSession: s.currentSession,
    })),
  );
```

**FormField pattern** (AdListingForm.tsx linhas 128-140 — text input):
```typescript
<FormField
  control={form.control}
  name="marca"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Marca</FormLabel>
      <FormControl>
        <Input {...field} disabled={disabled} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Number field pattern** (AdListingForm.tsx linhas 155-171):
```typescript
<FormField
  control={form.control}
  name="ano"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Ano</FormLabel>
      <FormControl>
        <Input
          type="number"
          {...field}
          disabled={disabled}
          onChange={(e) => field.onChange(Number(e.target.value))}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Submit handler pattern** (AdListingForm.tsx linhas 92-104):
```typescript
function onSubmit(data: Listing) {
  // Read store imperatively via getState() for non-reactive data
  const s = useNegotiationStore.getState().currentSession;
  if (!s?.fipe || s.fipe <= 0) {
    form.setError("root", { message: "..." });
    return;
  }
  initSession(data, s.fipe);
  onReady();
}
```

**Key invariants:**
- `"use client"` first line
- `useForm<Type>({ resolver: zodResolver(schema), defaultValues, mode: "onBlur" })` — mode always onBlur (precedent)
- Number inputs use `onChange={(e) => field.onChange(Number(e.target.value))}` explicit coerção — react-hook-form não coerce automaticamente
- useShallow para 2+ slices OU 1 slice + 1 action
- `useNegotiationStore.getState()` inside event handlers (NOT inside render) for imperative reads
- Toast via `import { toast } from "sonner"` — `toast.success(...)` / `toast.error(...)` with pt-BR copy
- Alert conditional render: `{status === "negotiating" ? <Alert>...</Alert> : null}`

**Deviations allowed:**
- RadioGroup (shadcn) é novo — não existe em Phase 1. Planner segue docs shadcn.
- `Select` (shadcn) é novo — idem.

---

### [N] `src/components/negotiation/LeftColumnPanel.tsx`

**Analog:** Layout composition similar a `src/app/page.tsx` linhas 26-56 (grid com aside/section), mas para wrapper apenas.

**Shape** (per UI-SPEC Surface 1 linhas 174-189):
```typescript
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdListingForm } from "./AdListingForm";
import { AgentConfigForm } from "./AgentConfigForm";

interface Props {
  disabled?: boolean;
  onReady: () => void;
}

export function LeftColumnPanel({ disabled, onReady }: Props) {
  return (
    <Tabs defaultValue="anuncio">
      <TabsList className="w-full">
        <TabsTrigger value="anuncio">Anúncio</TabsTrigger>
        <TabsTrigger value="configuracao">Configuração</TabsTrigger>
      </TabsList>
      <TabsContent value="anuncio">
        <AdListingForm disabled={disabled} onReady={onReady} />
      </TabsContent>
      <TabsContent value="configuracao">
        <AgentConfigForm />
      </TabsContent>
    </Tabs>
  );
}
```

**Key invariants:**
- `"use client"` (because children are client components)
- Props drilled through to AdListingForm (preserve Phase 1 contract)
- shadcn `Tabs` with `defaultValue="anuncio"` — requires `pnpm dlx shadcn@latest add tabs` in Wave 0

---

### [E — extend] `src/components/negotiation/NegotiationStatusBar.tsx`

**Analog:** self — add toggle button after last Badge.

**Current baseline** (NegotiationStatusBar.tsx lines 14-49):
```typescript
export function NegotiationStatusBar() {
  const s = useNegotiationStore((st) => st.currentSession);
  if (!s) return null;
  const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
  return (
    <div
      data-testid="negotiation-status-bar"
      className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs"
    >
      <Badge data-testid="status-fipe" variant="outline" className="border-slate-300 bg-slate-50">
        FIPE: {fmt(s.fipe)}
      </Badge>
      {/* ... target, walkaway badges ... */}
      <Badge
        data-testid="status-round"
        variant="outline"
        className="ml-auto border-violet-300 bg-violet-50 text-violet-700"
      >
        Rodada {s.round}/{s.maxRounds}
      </Badge>
    </div>
  );
}
```

**Extension:**
```typescript
import { Brain } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function NegotiationStatusBar() {
  // MIGRATE: selector único → useShallow (2 slices + 1 action)
  const { session, thinkingVisible, setThinkingVisible } = useNegotiationStore(
    useShallow((st) => ({
      session: st.currentSession,
      thinkingVisible: st.thinkingVisible,
      setThinkingVisible: st.setThinkingVisible,
    })),
  );
  if (!session) return null;
  // ...existing fmt + badges...

  return (
    <div data-testid="negotiation-status-bar" className="flex flex-wrap items-center gap-2 ...">
      {/* ...FIPE, Target, Walk-away badges unchanged... */}
      <Badge
        data-testid="status-round"
        variant="outline"
        className="border-violet-300 bg-violet-50 text-violet-700"  // REMOVE ml-auto
      >
        Rodada {session.round}/{session.maxRounds}
      </Badge>
      <button
        type="button"
        role="switch"
        aria-checked={thinkingVisible}
        aria-label={thinkingVisible ? "Ocultar raciocínio de todos os turnos" : "Ativar exibição do raciocínio"}
        className="ml-auto flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
        onClick={() => setThinkingVisible(!thinkingVisible)}
        data-testid="thinking-toggle"
      >
        <Brain className="h-3 w-3" aria-hidden="true" />
        {thinkingVisible ? "Ocultar pensamento" : "Ver pensamento"}
      </button>
    </div>
  );
}
```

**Key invariants:**
- Badge `ml-auto` migrates from Rodada → toggle button (risk flag from RESEARCH honored)
- `role="switch"` + `aria-checked` (accessibility per UI-SPEC)
- `data-testid="thinking-toggle"` for tests

---

### [E — extend] `src/components/negotiation/AdListingForm.tsx`

**Analog:** self — insert FormField for `motivoDaVenda`.

**Extension point** (AdListingForm.tsx between lines 260 and 262 — before FIPE block):
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Inside defaultValues (line 27-36): add:
motivoDaVenda: "outros",  // D-06 default

// Inside form (after reducoes FormField at line 260):
<FormField
  control={form.control}
  name="motivoDaVenda"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Motivo da venda</FormLabel>
      <FormControl>
        <Select onValueChange={field.onChange} value={field.value ?? "outros"}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
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

**Key invariants:**
- `Select onValueChange={field.onChange}` (NOT `onChange` — shadcn Select uses Radix's `onValueChange` API)
- `value={field.value ?? "outros"}` — default fallback so controlled state matches schema default
- Insert position: AFTER `reducoes` field (diasOnline/reducoes grid at lines 223-260), BEFORE FIPE block (line 262+) — per RESEARCH

---

### [E — extend] `src/components/negotiation/ChatView.tsx`

**Analog:** self — 2 surgical extensions (body fields + AgentThinking render).

**Body extension** (ChatView.tsx lines 66-99):
```typescript
async function sendToAgent(apiMessages: Array<{ role: AgentRole; content: string }>) {
  if (!session) return;
  const ctl = new AbortController();
  abortRef.current = ctl;
  setStreaming(true);
  await startNegotiation(
    {
      listing: session.listing,
      fipe: session.fipe,
      targetPrice: session.targetPrice,
      walkAwayPrice: session.walkAwayPrice,
      maxRounds: session.appliedConfig.maxRounds,  // CHANGED: from session.maxRounds to snapshot
      messages: apiMessages,
      // Phase 2 additions:
      tone: session.appliedConfig.tone,
      initialAnchorStrategy: session.appliedConfig.initialAnchorStrategy,
      promptVersion: session.promptVersion,
    },
    { /* ...same callbacks... */ },
    ctl.signal,
  );
}
```

**AgentThinking integration** (ChatView.tsx around line 167 — messages render):
```typescript
import { AgentThinking } from "./AgentThinking";

// Read thinkingVisible via useShallow (already extending selector):
const { appendAgentChunk, finalizeAgentMessage, addSellerMessage, endSession, thinkingVisible } =
  useNegotiationStore(
    useShallow((s) => ({
      appendAgentChunk: s.appendAgentChunk,
      finalizeAgentMessage: s.finalizeAgentMessage,
      addSellerMessage: s.addSellerMessage,
      endSession: s.endSession,
      thinkingVisible: s.thinkingVisible,  // NEW
    })),
  );

// Render — after each MessageBubble (line 167 area):
{session?.messages.map((m) => (
  <div key={m.id}>
    <MessageBubble message={m} />
    {m.role === "agent" ? (
      <AgentThinking
        rationale={m.rationale}
        isStreaming={!!m.isStreaming}
        open={thinkingVisible}
      />
    ) : null}
  </div>
)) ?? null}
```

**Key invariants:**
- **`session.appliedConfig.*` — NOT `session.config`** (snapshot per D-10, not live config)
- Wrap MessageBubble + AgentThinking in same `<div key={m.id}>` — preserve React key contract
- Only render AgentThinking for agent messages (`m.role === "agent"`)
- Zero changes to SSE consumer (`useNegotiationStream.ts`) — confirmed by RESEARCH

---

### [E — minor extend] `src/components/negotiation/ContextPanel.tsx`

**Analog:** self — add 3rd Card.

**Current pattern** (ContextPanel.tsx lines 22-52) — Card pattern for "Última oferta" + "Anúncio":
```typescript
<div className="sticky top-4 space-y-3">
  <Card className="border-violet-200">
    <CardHeader className="pb-2">
      <CardTitle className="text-xs uppercase tracking-wide text-violet-700">
        Última oferta
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-violet-700">{currentOffer}</div>
    </CardContent>
  </Card>
  {/* Anúncio Card ... */}
</div>
```

**Extension — add 3rd Card:**
```typescript
{s.motivationScore ? (
  <Card className="border-amber-200">
    <CardHeader className="pb-2">
      <CardTitle className="text-xs uppercase tracking-wide text-amber-700">
        Motivação
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-sm font-bold">{s.motivationScore.label}</div>
      <div className="text-xs text-slate-600 mt-1">{s.motivationScore.rationale}</div>
    </CardContent>
  </Card>
) : null}
```

**Key invariants:**
- **NÃO mostrar score numérico cru** (AI-SPEC Failure Mode §1b.2: "cita o score cru ao vendedor" — embora este cárd não seja exibido ao vendedor, consistência)
- Label + rationale only (sufficient for demo narration)
- Border color amber (UI-SPEC color system)
- Conditional render with `s.motivationScore ? ... : null` — backward-compat com sessões v1

---

### [N] `src/components/Nav.tsx`

**Analog:** `src/components/negotiation/NegotiationStatusBar.tsx` (flex layout + hooks)

**Shape** (per UI-SPEC Surface 3 linhas 599-610):
```typescript
"use client";

import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-medium text-foreground">AutoAgent</span>
        <a
          href="/"
          className={
            isActive("/")
              ? "text-sm font-medium text-foreground"
              : "text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Chat
        </a>
        <a
          href="/benchmark"
          className={
            isActive("/benchmark")
              ? "text-sm font-medium text-foreground"
              : "text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Benchmark
        </a>
      </div>
    </nav>
  );
}
```

**Key invariants:**
- `"use client"` (usePathname is client hook)
- `<a href>` — NOT `<Link>` (UI-SPEC uses `<a>` deliberately; lighter, no prefetch needed for binary nav)
- `usePathname()` from `next/navigation` (App Router API)

---

### [N] `src/app/benchmark/page.tsx`

**Analog:** `src/app/page.tsx` lines 1-59 (`"use client"` + Zustand via useShallow + layout grid)

**Page-level structure** (page.tsx lines 1-30):
```typescript
"use client";

import { /* ...imports... */ } from "@/components/...";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { useShallow } from "zustand/react/shallow";

export default function NegotiationPage() {
  const { session, startNegotiating } = useNegotiationStore(
    useShallow((s) => ({
      session: s.currentSession,
      startNegotiating: s.startNegotiating,
    })),
  );
  // ...
}
```

**benchmark/page.tsx shape** (per UI-SPEC Surface 3):
```typescript
"use client";

import { BenchmarkScorecard } from "@/components/benchmark/BenchmarkScorecard";
import { BenchmarkTable } from "@/components/benchmark/BenchmarkTable";
import { EmptyBenchmark } from "@/components/benchmark/EmptyBenchmark";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { useShallow } from "zustand/react/shallow";
import { useMemo } from "react";

export default function BenchmarkPage() {
  const { history, setUserRating } = useNegotiationStore(
    useShallow((s) => ({
      history: s.history,
      setUserRating: s.setUserRating,
    })),
  );

  const endedSessions = useMemo(() => history.filter((s) => s.status === "ended"), [history]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Benchmark</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Acompanhe o desempenho das negociações registradas nesta sessão.
        </p>
      </header>
      <BenchmarkScorecard sessions={endedSessions} />
      {endedSessions.length === 0 ? (
        <EmptyBenchmark />
      ) : (
        <BenchmarkTable sessions={endedSessions} onRate={setUserRating} />
      )}
    </main>
  );
}
```

**Key invariants:**
- `"use client"` (because Zustand)
- `export default function` — route handler pattern (Next.js App Router)
- `useMemo` for filtered arrays (derived state, avoid re-filter on every render)
- **Filtered array passed DOWN to children** (BenchmarkScorecard, BenchmarkTable) — aggregates computed inside children or via selector, NOT in parent (avoid alloc in render)

---

### [N] `src/components/benchmark/BenchmarkScorecard.tsx`

**Analog:** `src/components/negotiation/SummaryPanel.tsx` lines 93-139 (4-card KPI grid)

**KPI grid pattern** (SummaryPanel.tsx):
```typescript
<div className="grid grid-cols-4 gap-4">
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-xs uppercase text-slate-500">Rodadas</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{session.round}/{session.maxRounds}</div>
    </CardContent>
  </Card>
  {/* ... 3 more Cards with conditional color via pctColor helper ... */}
</div>
```

**Color helper pattern** (SummaryPanel.tsx lines 35-39):
```typescript
function pctColor(pct: number): string {
  if (pct >= 20) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (pct >= 10) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}
```

**BenchmarkScorecard shape:**
```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Session } from "@/lib/types/session";
import { useMemo } from "react";

interface Props {
  sessions: Session[];
}

export function BenchmarkScorecard({ sessions }: Props) {
  const { avgReduction, avgRounds, avgQuality, total } = useMemo(() => {
    // Compute aggregates from ended sessions (v2 only for gate — filter by promptVersion if needed)
    // ...
  }, [sessions]);

  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Redução média vs FIPE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-700" data-testid="benchmark-aggregate-reduction">
            {avgReduction !== null ? `${avgReduction.toFixed(1)}%` : "—"}
          </div>
        </CardContent>
      </Card>
      {/* 3 more cards */}
    </div>
  );
}
```

**Key invariants:**
- Grid `grid-cols-4 gap-4` exact (UI-SPEC)
- `useMemo` for aggregates — never compute inline in JSX
- "—" fallback for null values (UI-SPEC "No data in aggregate")
- Color classes per UI-SPEC: reduction=emerald, rounds=primary(blue), quality=violet, total=foreground
- `data-testid` each aggregate card: `benchmark-aggregate-{reduction|rounds|quality|total}`

---

### [N] `src/components/benchmark/BenchmarkRow.tsx`

**Analog:** `src/components/negotiation/MessageBubble.tsx` (props + data-testid + presentational)

**Shape** (per UI-SPEC linhas 530-547):
```typescript
"use client";

import type { Session } from "@/lib/types/session";
import { StarRating } from "./StarRating";
import { ReductionBadge } from "./ReductionBadge";

interface Props {
  session: Session;
  onRate: (sessionId: string, rating: 1 | 2 | 3 | 4 | 5 | undefined) => void;
}

export function BenchmarkRow({ session, onRate }: Props) {
  // ...format date, compute finalPrice/fipeReductionPct...
  return (
    <tr className="hover:bg-slate-50" data-testid={`benchmark-row-${session.id}`}>
      <td className="px-4 py-3 text-xs font-medium text-muted-foreground">{formatDate(session.endedAt)}</td>
      <td className="px-4 py-3">
        <div className="font-medium">{session.listing.marca} {session.listing.modelo}</div>
        <div className="text-xs font-medium text-muted-foreground">
          {session.listing.ano} • {session.listing.cidade}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <ReductionBadge reduction={/* computed */} />
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium">
        {session.round}/{session.appliedConfig?.maxRounds ?? session.maxRounds}
      </td>
      <td className="px-4 py-3">
        <StarRating value={session.userRating ?? 0} onChange={(v) => onRate(session.id, v === 0 ? undefined : (v as 1|2|3|4|5))} />
      </td>
    </tr>
  );
}
```

**Key invariants:**
- `session.appliedConfig?.maxRounds ?? session.maxRounds` — fallback para sessões v1 sem appliedConfig (backward-compat)
- `session.userRating ?? 0` — 0 = unset state
- `onRate` callback abstrai o store action (planner decide where: inside BenchmarkTable or parent page)

---

### [N] `src/components/benchmark/StarRating.tsx`

**Analog:** Nenhum exato. Parcial: shape de `FormField` + callback em `AdListingForm.tsx`.

**Shape** (per UI-SPEC linhas 568-594):
```typescript
"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface Props {
  value: number; // 0 = unset, 1-5
  onChange: (v: number) => void;
}

export function StarRating({ value, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-1 min-h-[44px]"
      role="group"
      aria-label="Qualidade da negociação"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? 0 : star)}
          aria-label={`${star} de 5 estrelas`}
          aria-pressed={value === star}
          data-testid={`star-rating-button-${star}`}
          className="rounded p-1 hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary transition-transform"
        >
          <Star
            className={cn(
              "h-4 w-4",
              star <= value ? "fill-emerald-500 text-emerald-500" : "fill-none text-slate-300"
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
```

**Key invariants:**
- `import { cn } from "@/lib/utils"` — utility from shadcn scaffold (existing)
- `min-h-[44px]` — 44px touch target (UI-SPEC accessibility)
- Toggle pattern: `onChange(value === star ? 0 : star)` — click same star clears
- `aria-pressed` + `aria-label` per button
- `role="group"` + `aria-label` on wrapper
- `Star` with `fill-*` and `text-*` classes — lucide uses both stroke (text) and fill

---

### [E — extend] `src/app/layout.tsx`

**Analog:** self.

**Extension** (layout.tsx lines 9-14):
```typescript
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoAgent Negotiation Playground",
  description: "Chat manual funcional — Fase 1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
```

**Key invariants:**
- Nav OUTSIDE `{children}` (persists across route changes naturally — App Router layout)
- Metadata unchanged

---

## Shared / Cross-Cutting Patterns

### 1. Named exports, never default

**Source:** `src/lib/prompts/system-v1.ts`, `src/lib/utils/fipe.ts`, `src/lib/stores/negotiation.ts`
**Apply to:** ALL new files (motivation.ts, tone.ts, comparables.ts, few-shot.ts, system-v2.ts, migrations.ts, agent-config.ts)
**Excerpt** (system-v1.ts line 12, 87):
```typescript
export const SYSTEM_PROMPT_V1_TEMPLATE = `...`;
export function buildSystemPrompt(...): string { ... }
```
**Exception:** `src/app/benchmark/page.tsx` uses `export default function BenchmarkPage()` — required by Next.js App Router for page routes.

---

### 2. `"use client"` directive

**Source:** `src/components/negotiation/*.tsx`
**Apply to:** All new files under `src/components/` AND files that touch hooks/Zustand/Router (AgentThinking, AgentConfigForm, LeftColumnPanel, Nav, benchmark components, benchmark/page.tsx)
**Excerpt** (every component, line 1):
```typescript
"use client";
```

---

### 3. Import alias `@/*` (no relative paths for project imports)

**Source:** `src/app/page.tsx` lines 3-9, all components
**Apply to:** ALL new files
**Excerpt** (page.tsx):
```typescript
import { AdListingForm } from "@/components/negotiation/AdListingForm";
import { useNegotiationStore } from "@/lib/stores/negotiation";
```
**Co-located imports** (within same directory) may use `./name`:
```typescript
// Inside src/components/negotiation/*:
import { MessageBubble } from "./MessageBubble";
```

---

### 4. Zustand selector patterns

**Source:** `src/components/negotiation/ContextPanel.tsx` (Pattern A) + `src/components/negotiation/AdListingForm.tsx` (Pattern B)

**Pattern A — single primitive slice** (ContextPanel.tsx line 7):
```typescript
const s = useNegotiationStore((st) => st.currentSession);
```

**Pattern B — 2+ slices with useShallow** (AdListingForm.tsx lines 46-52):
```typescript
import { useShallow } from "zustand/react/shallow";

const { initSession, setFipe, currentSession } = useNegotiationStore(
  useShallow((s) => ({
    initSession: s.initSession,
    setFipe: s.setFipe,
    currentSession: s.currentSession,
  })),
);
```

**Pattern C — imperative read in event handler** (AdListingForm.tsx line 94):
```typescript
function onSubmit(data: Listing) {
  const s = useNegotiationStore.getState().currentSession; // imperative, non-reactive
  // ...
}
```

**Pattern D — avoid allocation in selector** (SummaryPanel.tsx lines 45-57):
```typescript
// BAD: useShallow never equals because array is reallocated every run:
// const args = useNegotiationStore(useShallow((s) => s.getArgumentsUsed()));

// GOOD: compute derived outside selector via useMemo:
const args = useMemo(() => useNegotiationStore.getState().getArgumentsUsed(), [session]);
```

**Apply to:** All new components accessing Zustand. Pattern A/B choice based on slice count.

---

### 5. Co-located tests, Vitest + @testing-library/react

**Source:** every `*.test.ts` / `*.test.tsx` in `src/`
**Apply to:** ALL new files with behavior
**Excerpt** (negotiation.test.ts lines 1-23):
```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { useNegotiationStore } from "./negotiation";

function resetStore() {
  localStorage.clear();
  useNegotiationStore.setState({ currentSession: null, history: [] });
}

beforeEach(() => { resetStore(); });

describe("useNegotiationStore — <describe scope>", () => {
  it("<behavior>", () => { ... });
});
```

**Component test excerpt** (NegotiationStatusBar.test.tsx lines 40-56):
```typescript
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  useNegotiationStore.setState({ currentSession: null, history: [] });
});

it("renders the FIPE value from the store", () => {
  seedSession();
  render(<NegotiationStatusBar />);
  expect(screen.getByTestId("status-fipe").textContent).toContain("52.000");
});
```

**Key invariants:**
- `import { describe, expect, it } from "vitest"` — NOT `@jest/globals`
- `import { render, screen } from "@testing-library/react"` for components
- Test file name: same basename + `.test.ts(x)`, same directory
- `beforeEach` reset pattern — `localStorage.clear()` + `setState(initialState)`
- Nyquist ≥2 cases per behavior — extremos + middle

---

### 6. Error handling (server-side)

**Source:** `src/app/api/negotiate/stream/route.ts` lines 86-103
**Apply to:** Any server-side logic (route.ts extension)
**Excerpt:**
```typescript
catch (err) {
  const e = err as { status?: number; name?: string; message?: string };
  console.warn(
    JSON.stringify({
      scope: "negotiate_stream.upstream",
      provider,
      status: e?.status ?? null,
      name: e?.name ?? null,
      message: e?.message ?? String(err),
    }),
  );
  // Client NEVER sees upstream message:
  controller.enqueue(encodeFrame({ type: "error", message: "upstream_failed" }));
}
```

**Key invariants:**
- `console.warn(JSON.stringify({ scope, ...}))` for structured Vercel logs — NEVER `console.log("message: " + error)`
- Generic error message to client — never leak upstream text
- Zod validation failure → generic `{ error: "invalid_body" }` 400 (route.ts line 43)

---

### 7. Error handling (client-side)

**Source:** `src/components/negotiation/ChatView.tsx` lines 86-95
**Apply to:** AgentConfigForm (save errors), BenchmarkPage (localStorage errors)
**Excerpt:**
```typescript
onError: (code) => {
  setStreaming(false);
  if (code === "disabled") onKillSwitch?.();
  else if (code === "rate_limited")
    toast.error("Muitas negociações recentes. Tente novamente em breve.");
  // ... more branches ...
  else toast.error(`Erro na negociação (${code}). Tente novamente.`);
},
```

**Key invariants:**
- `import { toast } from "sonner"` — project toast library
- `toast.success(...)` / `toast.error(...)` with **pt-BR** copy
- Messages user-facing (per UI-SPEC Copywriting Contract)

---

### 8. Tag-stripping regex pattern (critical for `<rationale>`)

**Source:** `src/lib/stores/negotiation.ts` lines 7-12
**Apply to:** rationale strip extension (same file)
**Excerpt:**
```typescript
const ARG_TAG_REGEX = /<\/?arg>/g;       // matches <arg> AND </arg>
const ARG_EXTRACT_REGEX = /<arg>(.*?)<\/arg>/g;

export function renderMessageContent(content: string): string {
  return content.replace(ARG_TAG_REGEX, "");
}
```

**Key invariants for `<rationale>`:**
- Use `[\s\S]*?` (multi-line) instead of `.*?` (single-line) — rationale may span lines
- Strip the CONTENT (not just tags) for rationale: `/<rationale>[\s\S]*?<\/rationale>\s*/g`
- Always `/g` flag — replace all occurrences
- **Strip happens in `finalizeAgentMessage` + in `renderMessageContent`** — NEVER during streaming (Pitfall #3)

---

### 9. Zustand persist middleware structure

**Source:** `src/lib/stores/negotiation.ts` lines 198-212
**Apply to:** Store extension
**Excerpt:**
```typescript
{
  name: "autoagent-playground-v1",
  storage: createJSONStorage(() => localStorage),
  version: 1,
  migrate: (persisted) => persisted as NegotiationState,
  partialize: (state) => ({
    currentSession: state.currentSession,
    history: state.history,
  }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.warn("Failed to rehydrate negotiation store:", error);
  },
}
```

**Key invariants:**
- `partialize` EXPLICITLY lists persisted slices — UI-only state (e.g., `thinkingVisible`) excluded
- `migrate` receives `(persisted, version)` — version bump requires matching handler
- `onRehydrateStorage` for load-time failures, NOT for ongoing errors
- Key name preserved across versions (per RESEARCH Opção Y recommendation)

---

### 10. lucide-react named imports only

**Source:** Every component using icons (ChatView.tsx line 16, MessageBubble.tsx line 5, NegotiationStatusBar — none, ContextPanel — none)
**Apply to:** ALL new files using icons
**Excerpt:**
```typescript
// GOOD:
import { ArrowDown, XCircle } from "lucide-react";

// BAD (never):
// import * as Icons from "lucide-react";
// import Icons from "lucide-react";
```

**New Phase 2 icons:** `Star`, `Brain`, `BarChart2`, `ChevronRight`, `AlertCircle` (already used).

---

### 11. Zod schema → `z.infer` type export

**Source:** `src/lib/schemas/listing.ts` line 43
**Apply to:** All new schemas (agent-config.ts, listing.ts extend, negotiate.ts extend)
**Excerpt:**
```typescript
export const listingSchema = z.object({ /* ... */ });
export type Listing = z.infer<typeof listingSchema>;
```

**Key invariants:**
- Type derived from schema (`z.infer`) — never hand-write the type
- Name pattern: `fooSchema` (const) + `Foo` (type)

---

### 12. Brazilian number formatting

**Source:** `src/lib/prompts/system-v1.ts` lines 76-78
**Apply to:** system-v2.ts, comparables.ts (formatter), BenchmarkRow
**Excerpt:**
```typescript
function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR");
}
```

---

### 13. Route handler contract (App Router)

**Source:** `src/app/api/negotiate/stream/route.ts` lines 1-21
**Apply to:** N/A in Phase 2 (no new endpoints — confirmed by RESEARCH)
**Excerpt:**
```typescript
export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // ...
}
```

---

## No Analog Found

Files with no close match in the codebase — planner designs from scratch or uses RESEARCH patterns:

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `src/lib/stores/migrations.ts` | migration helper | transform (v1 blob → v2 blob) | Phase 1 has no migration — first of its kind | Use `parseFipeValor` defensive-validation pattern + Zustand persist `migrate` contract from docs. RESEARCH §Migration Strategy has the full shape. |
| `src/lib/prompts/few-shot.ts` | MessageParam[] builder | transform (static → typed array) | First file to return Anthropic SDK types from `src/lib/prompts/` | Use AI-SPEC §4b.5 code excerpt verbatim. Name convention: `buildFewShot(): MessageParam[]`. |
| `src/components/benchmark/StarRating.tsx` | input component | event-driven | No rating-input component in Phase 1 | Use UI-SPEC Surface 3 (linhas 568-594) shape + `FormField`+callback idiom from AdListingForm. |

---

## Registry / Dependencies Flag (from RESEARCH §Dependency Surface)

**shadcn components to add in Wave 0 (before any UI task):**
```bash
pnpm dlx shadcn@latest add tabs radio-group alert select
```

**lucide icons used (already in deps):** `Star`, `Brain`, `BarChart2`, `ChevronRight`, `AlertCircle`.

**Zero npm package additions.**

---

## Metadata

**Analog search scope:** `src/**/*.{ts,tsx}` — 44 files scanned, 20 analogs identified
**Files scanned:** 44 source + 15 test files
**Phase 1 convention confidence:** HIGH (single-author codebase, consistent across all modules)
**Pattern extraction date:** 2026-04-20

---

## PATTERN MAPPING COMPLETE

**Phase:** 02 — Inteligência do Agente
**Files classified:** 21 (11 new + 10 extensions)
**Analogs found:** 20 / 21

### Coverage
- Files with exact analog: 15
- Files with role-match analog: 5
- Files with partial-match analog: 3 (few-shot.ts, StarRating.tsx, LeftColumnPanel.tsx)
- Files with no analog: 1 (migrations.ts — planner designs from RESEARCH §Migration Strategy)

### Key Patterns Identified
- **Named exports, never default** — locked across all 44 source files (exception: Next.js `export default function` for pages)
- **Zustand via two patterns** — split-selector (1 slice) and useShallow (2+ slices); `getState()` for imperative reads in event handlers; `useMemo([trigger])` to avoid allocation-in-selector infinite loop
- **Tag-stripping via global regex in store module** (`<arg>` pattern at `src/lib/stores/negotiation.ts` lines 7-12) — identical contract for `<rationale>` (same file, same approach)
- **Co-located tests (`.test.ts` ao lado do source)** — Vitest + @testing-library/react + `beforeEach(resetStore)` + extremo+middle Nyquist
- **Error handling never leaks upstream strings to client** — route handler uses `console.warn(JSON.stringify({scope, ...}))` for Vercel logs + generic `"upstream_failed"` to client (T-06-04)
- **Zustand persist with explicit `partialize` + `migrate`** — UI-only state excluded from persistence
- **System prompt builder pattern: const template + builder fn with `.replaceAll` chain** — drift-guard tests assert placeholder count + block ordering
- **Schema-first types via `z.infer`** — never hand-write types for Zod-validated shapes
- **lucide-react named imports only** — no barrel imports, no default imports

### File Created
`C:\Users\pc\auto-agent\.planning\phases\02-intelig-ncia-do-agente\02-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns directly in PLAN.md actions with specific file paths and line numbers. Every new file has either an exact analog or a documented pattern to follow; the single no-analog case (`migrations.ts`) has a full shape dictated by RESEARCH §Migration Strategy and Zustand persist docs.
