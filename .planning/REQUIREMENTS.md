# Requirements: AutoAgent Negotiation Playground

**Defined:** 2026-04-18
**Core Value:** O agente consegue negociar com PFs reais de forma convincente e extrair 20–30% vs FIPE consistentemente — sem isso, o modelo de negócio do AutoAgent inteiro cai.

## v1 Requirements

### Infra & Setup

- [ ] **INFRA-01**: Projeto Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui (New York) + Biome + pnpm criado, buildando e rodando localmente
- [ ] **INFRA-02**: Deploy na Vercel configurado com production URL pública e preview branches automáticos via git
- [ ] **INFRA-03**: Rate limiting básico na rota `/api/negotiate/stream` (ex: máximo de N chamadas por IP por minuto via headers ou middleware) + kill switch via variável de ambiente (`NEGOTIATION_ENABLED=false`) para desligar o endpoint sem deploy

### FIPE

- [ ] **FIPE-01**: Usuário pode buscar preço FIPE via Parallelum (marca, modelo, ano) através da rota `/api/fipe`; resposta validada com Zod
- [ ] **FIPE-02**: Se Parallelum falhar, usuário pode inserir FIPE manualmente (input de fallback no formulário)

### Negociação

- [ ] **NEG-01**: Usuário pode preencher formulário de anúncio (marca, modelo, ano, km, preço pedido, cidade, dias online, número de reduções de preço)
- [ ] **NEG-02**: Sistema calcula e exibe preço-alvo automaticamente (`fipe * (1 - targetDiscount)`, default 25%)
- [ ] **NEG-03**: Agente negocia via streaming SSE na rota `/api/negotiate/stream`, usando Anthropic SDK com system prompt v1 (táticas, hard stops, tom pt-BR, formato de resposta)
- [ ] **NEG-04**: Chat exibe streaming char-by-char com bubbles de mensagem por turno, autoscroll e indicador visual de "agente digitando"
- [ ] **NEG-05**: Usuário pode encerrar a negociação e ver resumo final: rodadas percorridas, preço inicial ofertado pelo agente, preço final, % redução vs preço pedido, % redução vs FIPE, argumentos usados

### Estado & Persistência

- [ ] **STATE-01**: Zustand store gerencia estado completo da negociação: listing, fipe, targetPrice, messages[], round, status, agentConfig
- [ ] **STATE-02**: Histórico de negociações da sessão persiste em localStorage entre reloads do browser

### Inteligência do Agente (Fase 2)

- [ ] **INTEL-01**: Scoring de motivação do PF é calculado automaticamente a partir de sinais do anúncio (dias online, número de reduções de preço, motivo declarado) e injetado no prompt
- [ ] **INTEL-02**: Comparáveis sintéticos (hardcoded inicial) são injetados no contexto do prompt como referência de mercado
- [ ] **INTEL-03**: Few-shot canônico da negociação Audi Q5 (mockChatHistories[1] do protótipo JSX) incorporado no system prompt como exemplo de negociação bem conduzida
- [ ] **INTEL-04**: Painel de configuração do agente na UI: targetDiscount, maxRounds (default 6), tone (formal/casual), initialAnchorStrategy (agressivo/moderado); parâmetros persistidos em localStorage e editáveis sem reload
- [ ] **INTEL-05**: Componente `<AgentThinking>` opcional que exibe o rationale do agente (via tool calls ou chain-of-thought estruturado), ativável via toggle
- [ ] **INTEL-06**: Benchmark manual de N negociações com scorecard mínimo (redução média %, rodadas médias, qualidade subjetiva 1–5) exibido ao final da fase, como gate de conclusão da Fase 2

### Simulação & Batch (Fase 3)

- [ ] **BATCH-01**: Rota `/api/simulate-pf` implementa segundo Claude atuando como PF com persona configurável (resistente, ansioso, bem-informado, desesperado); system prompts diferentes por persona
- [ ] **BATCH-02**: Página `/batch` aceita lista de anúncios (colável como CSV ou JSON) + seleção de persona; executa loop agente–PF-sim sem intervenção humana, com limite de rodadas e timeout para evitar loops infinitos
- [ ] **BATCH-03**: Dashboard de métricas agregadas exibe: taxa de fechamento, % redução média vs FIPE, número médio de rodadas, fee teórico médio (6% da economia capturada)
- [ ] **BATCH-04**: Cap de custo configurável por execução de batch (em tokens ou equivalente em R$); estimativa de custo exibida antes de iniciar; kill automático do batch se o cap for ultrapassado durante a execução

### Análise & Export (Fase 4)

- [ ] **EXPORT-01**: Usuário pode exportar conversa individual em JSON (com metadata completa: listing, persona, versão do prompt, timestamps, resultado)
- [ ] **EXPORT-02**: Usuário pode exportar resultados de batch em CSV com todas as colunas de resultado
- [ ] **EXPORT-03**: Cada negociação registra automaticamente qual versão do system prompt foi usada
- [ ] **EXPORT-04**: Usuário pode rodar o mesmo lote de anúncios com 2 versões de prompt diferentes e ver comparação side-by-side dos resultados
- [ ] **EXPORT-05**: Usuário pode adicionar anotações manuais nas conversas individuais (ex: "boa negociação", "agente foi agressivo demais")

## v2 Requirements

### Dados Reais de Mercado

- **MKTDATA-01**: Integração com scraping real de comparáveis (substituindo os hardcoded da v1)
- **MKTDATA-02**: Cache de resultados FIPE para reduzir chamadas à Parallelum

### Performance

- **PERF-01**: Edge runtime no Vercel para reduzir latência percebida de streaming no Brasil

## Out of Scope

| Feature | Reason |
|---------|--------|
| WhatsApp Business API | Requer aprovação Meta + CNPJ ativo; desnecessário para validação |
| Scraping OLX/WebMotors/MercadoLivre | Risco legal real (ToS agressivo); input manual suficiente |
| Autenticação / contas de usuário | Playground interno, não produto B2C |
| Banco de dados relacional | localStorage suficiente para v0–v1 |
| Escrow, DocuSign, integração DETRAN | Pertencem ao projeto AutoAgent maior |
| Marketplace, dashboard do lojista, admin | Existem em mockup no JSX do Felipe; fora deste playground |
| Mobile app / PWA | Desktop-first, uso em laptop durante entrevistas |
| Internacionalização | pt-BR hardcoded |
| Testes E2E pesados (Playwright/Cypress) | Unit + integration em rotas de API bastam |
| Observabilidade avançada (Sentry/DataDog) | console.log + Vercel logs por ora |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 — Chat Manual Funcional | Pending |
| INFRA-02 | Phase 1 — Chat Manual Funcional | Pending |
| INFRA-03 | Phase 1 — Chat Manual Funcional | Pending |
| FIPE-01 | Phase 1 — Chat Manual Funcional | Pending |
| FIPE-02 | Phase 1 — Chat Manual Funcional | Pending |
| NEG-01 | Phase 1 — Chat Manual Funcional | Pending |
| NEG-02 | Phase 1 — Chat Manual Funcional | Pending |
| NEG-03 | Phase 1 — Chat Manual Funcional | Pending |
| NEG-04 | Phase 1 — Chat Manual Funcional | Pending |
| NEG-05 | Phase 1 — Chat Manual Funcional | Pending |
| STATE-01 | Phase 1 — Chat Manual Funcional | Pending |
| STATE-02 | Phase 1 — Chat Manual Funcional | Pending |
| INTEL-01 | Phase 2 — Inteligência do Agente | Pending |
| INTEL-02 | Phase 2 — Inteligência do Agente | Pending |
| INTEL-03 | Phase 2 — Inteligência do Agente | Pending |
| INTEL-04 | Phase 2 — Inteligência do Agente | Pending |
| INTEL-05 | Phase 2 — Inteligência do Agente | Pending |
| INTEL-06 | Phase 2 — Inteligência do Agente | Pending |
| BATCH-01 | Phase 3 — PF Simulado e Batch | Pending |
| BATCH-02 | Phase 3 — PF Simulado e Batch | Pending |
| BATCH-03 | Phase 3 — PF Simulado e Batch | Pending |
| BATCH-04 | Phase 3 — PF Simulado e Batch | Pending |
| EXPORT-01 | Phase 4 — Análise, Export e A/B | Pending |
| EXPORT-02 | Phase 4 — Análise, Export e A/B | Pending |
| EXPORT-03 | Phase 4 — Análise, Export e A/B | Pending |
| EXPORT-04 | Phase 4 — Análise, Export e A/B | Pending |
| EXPORT-05 | Phase 4 — Análise, Export e A/B | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after user review (added INFRA-03, INTEL-06, BATCH-04)*
