# PROJECT BRIEF — AutoAgent Negotiation Playground

**Versão:** 0.1 (brief de entrada para /gsd-new-project)
**Data:** 18/04/2026
**Autor do brief:** Lucas (filho, implementação)
**Baseado em:** PRD_AutoAgent_v2.md, Validacao_Modelo_AutoAgent_v2.md e AutoAgent_UX_Prototype_v2.jsx (produzidos por Felipe Criniti)

---

## Como usar este documento

Este é o input para o comando `/gsd-new-project` do [GSD](https://github.com/gsd-build/get-shit-done). Quando o GSD entrar no modo de perguntas, responda referenciando este brief ("ver seção 4", "decisão já tomada na seção 10") em vez de digitar cada resposta do zero. Seções 4, 6, 10 e 11 são especialmente densas de propósito — o GSD não precisa perguntar sobre o que já está decidido aqui.

Tudo o que **não** estiver neste brief é gray area válida que o `/gsd-discuss-phase` deve explorar antes de planejar cada fase.

---

## 1. Contexto

O **AutoAgent** (projeto maior, dos meus pais) é um marketplace B2B transacional para lojistas de seminovos no Brasil. Um agente de IA monitora OLX/WebMotors/Mercado Livre, identifica anúncios de pessoas físicas (PFs) motivadas, aborda via WhatsApp, negocia até fechar preço 20–30% abaixo da FIPE, e oferece a oportunidade pronta para lojistas assumirem mediante uma success fee de 6% sobre a economia capturada.

O modelo completo tem 7 módulos (marketplace, meus deals, negociações, dashboard, radar, settings, admin), escrow com Asaas, DocuSign, integração DETRAN, due diligence, contrato de exclusividade de 7 dias com o PF, etc. Tudo isso está no PRD v2 e no protótipo JSX.

**Estado atual do projeto maior:** plano de validação escrito mas ainda não executado. 8 hipóteses críticas (H1–H8) pendentes de teste qualitativo com 23–31 entrevistas. Sem validação, não vale construir o produto completo.

## 2. Por que este projeto (o playground) existe

O risco técnico de maior magnitude do AutoAgent é: **será que um agente de IA consegue negociar bem o suficiente com PFs reais para extrair 20–30% vs FIPE consistentemente?** Se a resposta for "não", todo o resto do modelo cai.

Além disso, as entrevistas de validação vão testar a hipótese "lojista confia em IA negociadora" (H3) e "trust layer digital é suficiente" (H6). Essas hipóteses são muito mais testáveis se o entrevistado **vê uma negociação real rodando na tela** em vez de imaginar no abstrato.

Este playground resolve os dois problemas ao mesmo tempo:

1. **Prova técnica** — valida se o agente funciona antes de construir marketplace, escrow, admin, etc.
2. **Demo de validação** — serve como ferramenta visual nas entrevistas do Felipe com lojistas e investidores.

É também o componente 100% reaproveitável para o MVP real depois: o mesmo código de negociação vai direto para o pipeline de produção (só muda o canal de webapp para WhatsApp Business API).

## 3. Objetivos e critérios de sucesso

### Objetivos (G1–G4)

| # | Goal | Métrica verificável |
|---|------|---------------------|
| G1 | Demonstrar negociação de IA end-to-end | Fluxo completo "formulário → chat → resumo" funcionando com Claude Sonnet 4.6 |
| G2 | Ser apresentável em entrevista | Deploy público, carrega em <2s, chat com streaming, design coerente com o protótipo v2 |
| G3 | Permitir iteração de prompt sem deploy | Parâmetros do agente (tom, rodadas máximas, % alvo vs FIPE) editáveis na UI |
| G4 | Gerar evidência quantitativa | Batch mode que roda 20+ negociações contra PF simulado e exporta estatísticas agregadas |

### Critérios de sucesso da v0 (Fase 1)

- Felipe consegue rodar uma negociação de ponta a ponta na frente de um lojista em <5 minutos de setup
- O chat flui em português natural, com streaming visível
- Ao final, há um resumo claro: quantas rodadas, preço inicial vs final, redução %, argumentos usados
- Zero dependência de banco de dados, Auth ou pagamentos

### Critérios de sucesso do projeto (Fase 4)

- Relatório agregado de 20+ negociações auto-simuladas, com % médio de redução vs FIPE, taxa de fechamento por persona de PF, tempo médio
- Export de logs de conversas individuais em JSON (para anexar nas entrevistas)
- Comparação A/B entre versões de prompt diferentes

## 4. Escopo e não-escopo

### 4.1 In scope (v0)

- Next.js 15 app router + TypeScript + Tailwind + shadcn/ui
- Uma tela principal: formulário de anúncio (entrada) + chat (negociação) + painel de resumo
- Integração com API pública FIPE (Parallelum, sem auth)
- Integração com Anthropic API (Claude Sonnet 4.6), streaming via Server-Sent Events
- Estado local (localStorage) para histórico de negociações da sessão
- Deploy na Vercel

### 4.2 In scope (fases seguintes)

- Segundo agente simulando o PF (personas configuráveis: resistente / ansioso / bem-informado / desesperado)
- Runner de batch (roda N negociações sequenciais ou paralelas)
- Dashboard de métricas agregadas
- Export JSON de conversas individuais
- Toggle para comparar versões diferentes de prompt

### 4.3 Explicitamente OUT OF SCOPE

Se o GSD sugerir qualquer um destes, recuse:

- **WhatsApp Business API** (requer aprovação Meta + CNPJ ativo, não é trivial, não é necessário para validação)
- **Scraping de WebMotors/OLX/MercadoLivre** (risco legal real — ToS desses sites é agressivo; usamos input manual)
- **Autenticação / contas de usuário** (é um playground, não um produto B2C)
- **Banco de dados relacional persistente** (localStorage basta para v0–v1; v2 pode usar Neon se necessário)
- **Escrow, DocuSign, integração DETRAN, due diligence externa** — tudo isso é do projeto maior
- **Marketplace, dashboard do lojista, admin console, onboarding** — já existem em mockup no JSX do Felipe, mas não são parte deste playground
- **Mobile app, PWA** — desktop-first, o uso é em laptop durante entrevistas
- **Internacionalização** — pt-BR hardcoded
- **Testes E2E pesados** (Playwright/Cypress) — unit + integration em rotas de API basta
- **Observabilidade avançada** (Sentry, DataDog) — console.log + Vercel logs por ora

## 5. Usuários-alvo do playground

| Papel | Quem | O que faz aqui |
|-------|------|----------------|
| Operador da demo | Felipe (pai) | Roda negociações na frente de lojistas entrevistados; ajusta parâmetros do agente entre sessões |
| Implementador | Lucas (filho) | Ajusta prompts, calibra táticas, roda batches, analisa resultados |
| "Vendedor PF" ao vivo | O próprio Felipe ou entrevistado | Responde às mensagens do agente pretendendo ser o PF |
| "Vendedor PF" simulado | Outro Claude | Em batch mode, simula o PF com persona configurável |

Não é exposto a lojistas/investidores como cliente; eles são observadores durante a demo.

## 6. Stack técnica (decisões já tomadas — não abrir para discussão)

- **Framework:** Next.js 15, App Router, React 19
- **Linguagem:** TypeScript strict mode
- **Styling:** Tailwind CSS v4 + shadcn/ui (New York style)
- **Ícones:** lucide-react (bate com o protótipo do Felipe)
- **LLM:** `@anthropic-ai/sdk`, modelo `claude-sonnet-4-5` como default, configurável via env
- **Streaming:** Server-Sent Events via route handler (`app/api/negotiate/stream/route.ts`)
- **Estado client:** Zustand (simples, sem boilerplate Redux) + localStorage para persistência entre reloads
- **Schema validation:** Zod em todos os boundaries (request bodies, respostas FIPE)
- **Linting/formatting:** Biome (mais rápido que ESLint + Prettier, um config só)
- **Package manager:** pnpm
- **Node:** 22 LTS
- **Deploy:** Vercel (preview branches + production)
- **Secrets:** `.env.local` em dev, Vercel env vars em produção. Nunca commitar. Configurar deny-list no `.claude/settings.json` antes do primeiro /gsd-new-project (ver seção 11).

Gray areas legítimas para o /gsd-discuss-phase (estas decisões ainda não foram tomadas):

- Estrutura exata do state machine da negociação (states, transitions, persistência por round)
- Layout exato do chat (estilo iMessage / Material / custom) e do painel lateral de contexto
- Formato do resumo final (tabela, cards, timeline, narrative)
- Como visualizar o "pensamento" do agente (se mostrar tool calls / rationale / só o output final)
- Estratégia de tokenização ao mostrar streaming (char-by-char vs palavra-por-palavra vs fluent)

## 7. Arquitetura em alto nível

```
┌──────────────────────────────────────────────────────────┐
│  Browser (Next.js client)                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  <NegotiationPage />                               │  │
│  │   ├── <AdListingForm />     (input do anúncio)     │  │
│  │   ├── <ChatView />          (streaming do agente)  │  │
│  │   ├── <ContextPanel />      (FIPE, alvo, rodadas)  │  │
│  │   └── <SummaryPanel />      (ao final da nego)     │  │
│  │                                                    │  │
│  │  Zustand store: negotiationStore                   │  │
│  │   ├── listing, fipe, targetPrice                   │  │
│  │   ├── messages[], round, status                    │  │
│  │   └── agentConfig (editável na UI)                 │  │
│  └──────────────┬─────────────────────────────────────┘  │
└─────────────────┼────────────────────────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────────┐
│ /api/   │ │ /api/    │ │ /api/        │
│ fipe    │ │ negotiate│ │ simulate-pf  │  (Fase 3)
│         │ │ /stream  │ │              │
│ busca   │ │ SSE com  │ │ LLM como PF  │
│ FIPE    │ │ Anthropic│ │ com persona  │
└────┬────┘ └─────┬────┘ └──────┬───────┘
     │            │             │
     ▼            ▼             ▼
Parallelum   Anthropic API  Anthropic API
 (FIPE)       (agente)       (PF sim)
```

## 8. Fases propostas (o GSD vai refinar no /gsd-new-project)

### Fase 1 — Chat manual funcional (semana 1)

Entregável: um humano consegue conversar com o agente até o fim.

- Setup do projeto (Next.js + Tailwind + shadcn + Biome + pnpm)
- Route handler `/api/fipe?marca&modelo&ano` que bate na Parallelum
- Form de anúncio (marca, modelo, ano, km, preço pedido, cidade, dias online, reduções)
- Cálculo do preço-alvo: `fipe * (1 - targetDiscount)` com targetDiscount default 0.25
- Route handler `/api/negotiate/stream` com streaming SSE do Claude Sonnet 4.6
- System prompt v1 (ver seção 9)
- Chat UI: mensagens bubble, streaming char-by-char, autoscroll
- Botão "encerrar negociação" — gera resumo final
- Resumo: rodadas, preço inicial ofertado pelo agente, preço final, % redução vs anúncio, % redução vs FIPE, argumentos usados (extraídos do prompt)
- Persistência em localStorage
- Deploy na Vercel

**Definition of done:** Felipe consegue abrir a URL pública, preencher um anúncio real, negociar 4–8 rodadas, e ver um resumo que ele consideraria usar em uma entrevista.

### Fase 2 — Inteligência do agente (semana 2)

Entregável: o agente é visivelmente melhor.

- Scoring de motivação do PF a partir dos sinais do anúncio (dias online, nº de reduções, motivo declarado) → input para o prompt
- Injeção de comparáveis sintéticos (por ora hardcoded; em fase futura vem de busca real)
- Prompt engineering com few-shot (ver seção 9.2)
- Painel de configuração na UI: targetDiscount, maxRounds (default 6), tone (formal/casual), initialAnchorStrategy (agressivo/moderado)
- Parâmetros do agente salvos em localStorage e editáveis sem reload
- Componente `<AgentThinking>` opcional que mostra o rationale do agente (se ele expuser via tool calls ou chain-of-thought estruturado)

**Definition of done:** em 10 negociações manuais, agente consegue reduzir em média ≥15% vs preço pedido, sem soar robótico ou agressivo.

### Fase 3 — Auto-PF simulado e batch (semana 3)

Entregável: evidência quantitativa.

- Route handler `/api/simulate-pf` — segundo Claude que age como PF com persona configurável
- 4 personas iniciais: `resistente`, `ansioso`, `bem-informado`, `desesperado`. System prompts diferentes por persona.
- Runner de batch: `/batch` page. Input: lista de anúncios (colável como CSV/JSON) + persona do PF. Output: tabela de resultados.
- Agente e PF-sim se falam via loop de chamadas LLM sem intervenção humana
- Limite de rodadas + timeout para evitar loops infinitos
- Agregação: taxa de fechamento, % redução média, rodadas médias, fee teórico médio (6% da economia)

**Definition of done:** Lucas roda um batch de 20 negociações em <10min e tem um dashboard com as métricas agregadas.

### Fase 4 — Análise, export e A/B (semana 4)

Entregável: ferramenta pronta para guiar próximo pivot de produto.

- Export de conversa individual em JSON (com metadata completa)
- Export de batch em CSV
- Versionamento de prompts: cada negociação registra qual versão do system prompt foi usada
- Comparação side-by-side entre 2 versões de prompt no mesmo lote de anúncios
- Anotações manuais nas conversas (Felipe/Lucas marcam "boa negociação", "agente foi agressivo demais", etc.)

**Definition of done:** dá para responder a pergunta "a versão v3 do prompt é melhor que v2?" com um gráfico.

## 9. Prompt do agente — bases iniciais

### 9.1 System prompt template (v1)

```
Você é o AutoAgent, um intermediador profissional de compra de veículos seminovos.
Você representa uma rede de lojistas verificados que compram à vista, com pagamento
via escrow bancário regulado pelo BCB e garantia de transferência em até 48h.

DADOS DO ANÚNCIO:
- Veículo: {marca} {modelo} {ano}, {km} km
- Preço pedido pelo vendedor: R$ {askPrice}
- Cidade: {city}
- Dias anunciado: {daysListed}
- Reduções de preço: {priceReductions}
- FIPE atual: R$ {fipe}
- Comparáveis recentes (região, últimos 30 dias): {comparables}

OBJETIVO:
- Fechar a compra em no máximo {maxRounds} rodadas
- Preço-alvo: R$ {targetPrice} (≈{targetDiscount}% abaixo da FIPE)
- Nunca aceitar preço acima de R$ {walkAwayPrice}

TÁTICAS PERMITIDAS:
1. Começar ancorando com oferta inicial ~30% abaixo do preço-alvo, justificada em dados de mercado
2. Subir oferta gradualmente, em no máximo R$ 3k por rodada, SEMPRE justificando
3. Invocar vantagens não-monetárias: pagamento à vista em 48h, zero test-drives chatos,
   zero risco de calote, burocracia por nossa conta (laudo, contrato, transferência)
4. Usar urgência legítima: "seu anúncio está há {daysListed} dias, comparáveis estão
   vendendo em {avgDaysToSell} dias a R$ {comparableMedian}"
5. Reconhecer o valor do carro: nunca depreciar o bem, depreciar apenas o contexto

TÁTICAS PROIBIDAS:
- Mentir sobre comparáveis, FIPE ou condições de mercado
- Pressionar emocionalmente ("você precisa decidir agora")
- Ameaçar ("se não aceitar vou oferecer menos amanhã")
- Inventar garantias ou benefícios que não existem
- Usar jargão técnico sem explicar

HARD STOPS:
- Se o vendedor exigir preço > R$ {walkAwayPrice} por 2 rodadas seguidas,
  encerre educadamente: "Entendo sua posição. Infelizmente não conseguimos
  chegar nesse valor. Obrigado pela conversa."
- Se atingir {maxRounds} rodadas sem fechar, encerre com um resumo e última oferta.
- Se o vendedor sinalizar qualquer coisa que sugira golpe/carro irregular, encerre.

TOM: profissional, cordial, direto, em português brasileiro natural.
Use WhatsApp-like casualness mas sem gírias. Emojis apenas no fechamento.

FORMATO DA RESPOSTA:
Responda APENAS com a mensagem que seria enviada ao vendedor. Sem meta-comentários,
sem "aqui está minha resposta:", sem markdown. Texto corrido, 1–3 parágrafos curtos.
```

### 9.2 Few-shot de negociação bem conduzida

Use a negociação do Audi Q5 Performance Black do protótipo do Felipe (JSX, `mockChatHistories[1]`) como exemplo canônico de negociação boa. Ela tem:

- 4 rodadas, 9 mensagens totais
- Abertura profissional + contexto
- Ancoragem inicial em R$ 195k (contra pedido de R$ 260k, FIPE R$ 268k)
- Uso de comparáveis ("11 anúncios similares, mediana R$ 228k")
- Justificativa de subida gradual com benefícios não-monetários
- Fechamento em R$ 198k com CTA clara (link de exclusividade)
- **Redução final: 23,8% vs preço pedido, 26,1% vs FIPE**

Colar os 9 turnos dessa conversa como few-shot dentro do system prompt (`<example>...</example>`) melhora drasticamente a qualidade do agente nas primeiras rodadas. Está no arquivo `AutoAgent_UX_Prototype_v2.jsx`, linhas aproximadamente 74–85.

### 9.3 Simulador de PF (Fase 3)

Personas iniciais e seus prompts base:

- **resistente:** já recusou ofertas baixas, tem expectativa próxima da FIPE, paciente, barganha duro
- **ansioso:** quer vender mas tem medo de golpe, precisa de muita validação, aceita desconto em troca de segurança
- **bem-informado:** sabe FIPE, sabe comparáveis, calcula na hora, aceita só se faz sentido numérico
- **desesperado:** motivo declarado forte (mudança, urgência financeira), tolera desconto maior, fecha rápido

Cada persona recebe o mesmo anúncio + instrução de negociar como aquele tipo de pessoa, com limite inferior próprio.

## 10. Decisões já tomadas (não discutir)

- Next.js App Router (não Pages Router)
- TypeScript strict
- Tailwind + shadcn/ui (não Chakra, não MUI, não styled-components)
- Anthropic Claude Sonnet 4.6 como modelo default (não OpenAI, não Gemini — para manter alinhamento com stack e contextual use do projeto)
- pnpm (não npm, não yarn, não bun)
- Biome (não ESLint + Prettier)
- Zustand (não Redux, não Jotai, não Context puro para estado do domínio)
- Vercel (não Netlify, não AWS, não self-hosted)
- Sem banco de dados na v0-v1 (localStorage é suficiente)
- Sem autenticação em nenhuma fase deste playground
- pt-BR único
- Desktop-first, não mobile

## 11. Configuração de segurança (antes de rodar /gsd-new-project)

Criar `.claude/settings.json` no root do projeto ANTES do primeiro `/gsd-new-project` com:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/**)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/id_rsa*)"
    ],
    "allow": [
      "Bash(pnpm:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git push:*)",
      "Bash(date:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(mkdir:*)"
    ]
  }
}
```

Recomendado: `claude --dangerously-skip-permissions` **apenas em worktree do GSD**, nunca no repo principal.

Secrets necessários em `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
# FIPE Parallelum não precisa de key
```

## 12. Riscos conhecidos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Agente soa robótico ou óbvio demais que é IA | Few-shot forte + tom "WhatsApp profissional"; testar com 5 humanos fingindo ser PF antes de mostrar em entrevista |
| FIPE Parallelum fora do ar durante demo | Fallback com cache local + input manual da FIPE se a API falhar |
| Custo de API Anthropic alto em batch | Usar Claude Sonnet em vez de Opus; configurar `max_tokens` conservador; batch tem budget cap de R$ 50 por rodada |
| Streaming com latência percebida alta no Brasil | Vercel Edge runtime; fallback sem streaming se SSE falhar |
| GSD sugere implementar WhatsApp / scraping / banco "porque o PRD fala disso" | Este brief é o escopo. PRD é do projeto maior. Recusar e apontar seção 4.3. |
| Agente inventa comparáveis falsos | Injetar apenas comparáveis realmente fornecidos no input; proibir invenção no system prompt; testar explicitamente |

## 13. Referências aos artefatos do projeto maior (Felipe)

Todos em `./reference/` (copiar antes de iniciar):

- `PRD_AutoAgent_v2.md` — PRD completo do produto final (contexto, não escopo)
- `Validacao_Modelo_AutoAgent_v2.md` — plano de validação (as 8 hipóteses que este playground ajuda a testar)
- `AutoAgent_UX_Prototype_v2.jsx` — protótipo visual do produto final. **Especificamente útil:**
  - Linhas 1–10: design system (cores, ícones)
  - Linhas 36–57: mock de oportunidades — referência de dados do domínio
  - Linhas 74–85: mockChatHistories[1] — few-shot canônico de negociação boa
- `AutoAgent_Financial_Model_v2.xlsx` — modelo financeiro (contexto, não usado diretamente)

## 14. Design system (do protótipo do Felipe — reaproveitar)

```ts
const DS = {
  primary: "#2563EB",  // blue-600 (Tailwind) — ações primárias
  success: "#059669",  // emerald-600 — sucessos, deals fechados
  warning: "#D97706",  // amber-600 — atenção
  danger:  "#DC2626",  // red-600 — erros, desistências
  accent:  "#7C3AED",  // violet-600 — negociações ativas
};
```

Tipografia: sistema default (`font-sans` do Tailwind = ui-sans-serif).
Radius: `rounded-lg` (shadcn default) para cards, `rounded-full` para badges.
Spacing: seguir o protótipo (p-4 para cards, gap-3 entre elementos).

---

**Fim do brief.** Ao rodar `/gsd-new-project`, responda as perguntas do GSD referenciando este documento. Coisas não cobertas aqui (layout exato do chat, formato do resumo, como mostrar o "pensamento" do agente, estrutura exata do state machine de negociação) são gray areas válidas para o `/gsd-discuss-phase 1`.
