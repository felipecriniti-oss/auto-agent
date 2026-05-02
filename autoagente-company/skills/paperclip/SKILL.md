---
name: Paperclip Orchestration
description: Skill padrão de orquestração via Paperclip — comunicação entre agentes, delegação de tarefas e governança
slug: paperclip
schema: agentcompanies/v1
version: 1.0.0
tags:
  - orchestration
  - core
  - all-agents
---

# Paperclip Orchestration

Skill compartilhada por todos os 14 agentes da AutoAgente. Define como agentes se comunicam, delegam tarefas e respeitam a hierarquia organizacional.

## Princípios de Comunicação

### Hub-and-Spoke
- Agentes operacionais NUNCA se comunicam diretamente entre si
- Toda comunicação passa pelo C-level responsável (CTO, CMO, CFO ou CLO)
- C-levels escalam ao CEO quando há conflito entre departamentos ou decisões de alto impacto

### Formato de Mensagem Inter-Agente
Toda mensagem entre agentes deve seguir o schema:
```json
{
  "from": "agent_slug",
  "to": "agent_slug",
  "type": "request | response | escalation | notification",
  "priority": "low | medium | high | critical",
  "deal_id": "string | null",
  "payload": {},
  "timestamp": "ISO 8601"
}
```

### Prioridades
- **critical**: Risco legal, compliance, perda financeira iminente → resposta em minutos
- **high**: Deal em andamento, deadline próximo → resposta em 1 hora
- **medium**: Análise, relatório, atualização → resposta em 4 horas
- **low**: Informativo, melhoria, sugestão → próximo ciclo

## Delegação de Tarefas

### CEO delega para:
- **CTO** → tarefas técnicas (scraping, análise, negociação)
- **CMO** → tarefas de marketing (captação, conteúdo)
- **CFO** → tarefas financeiras (custos, pricing)
- **CLO** → tarefas jurídicas (contratos, compliance)

### C-levels delegam para operacionais:
- CTO → Scraper, Analista, Negociador
- CMO → Captação, Conteúdo
- CFO → Custos, Pricing
- CLO → Contratos, Compliance

## Governança

### Budget por Agente
Cada agente tem um budget mensal de API calls (tokens LLM). Quando um agente atinge 80% do budget, ele notifica seu C-level. A 95%, entra em modo econômico (respostas mais curtas, menos rounds).

### Aprovações Requeridas
- Deal > R$ 200.000 → CEO deve aprovar
- Mudança de estratégia de pricing → CFO + CEO
- Novo template WhatsApp → CMO aprova
- Contrato com cláusula não-padrão → CLO aprova
- Qualquer ação com implicação LGPD → CLO/Compliance

### Logging
Todo agente deve logar suas ações no Supabase:
- `agent_logs` → ações executadas, inputs/outputs
- `deal_events` → mudanças de estado no pipeline de deals
- `error_logs` → falhas, timeouts, erros de API

## Pipeline de Deal (Fluxo Completo)

1. **Scraper** encontra anúncio → cria `deal` com status `discovered`
2. **Analista** valida preço FIPE → status `analyzed`
3. **Compliance** verifica veículo → status `verified`
4. **Pricing** calcula viabilidade → status `priced`
5. **Negociador** inicia negociação WhatsApp → status `negotiating`
6. **Contratos** gera C&V → status `contract_sent`
7. **CEO** aprova deal final → status `approved`
8. Deal fechado → status `closed_won` ou `closed_lost`

## Rotinas Cron

| Rotina | Agente | Frequência | Horário (BRT) |
|--------|--------|-----------|---------------|
| market-monitoring | Scraper | A cada 4h | */4 * * * * |
| daily-analytics | Analista | Diário | 08:00 |
| daily-cost-report | Custos | Diário | 09:00 |
| lead-generation-daily | Captação | Seg-Sex | 10:00 |
| weekly-strategy-review | CEO | Segunda | 09:00 |
| weekly-compliance-check | Compliance | Sexta | 10:00 |
| contract-followup | Contratos | Seg-Sex | 14:00 |

## Modelos por Agente

| Tier | Modelo | Agentes | Uso |
|------|--------|---------|-----|
| Premium | claude-opus-4-6 | CEO, Negociador | Decisões estratégicas, negociação complexa |
| Standard | claude-sonnet-4-6 | CTO, CMO, CFO, CLO, Analista, Captação, Conteúdo, Pricing, Contratos, Compliance | Análise, geração de conteúdo, coordenação |
| Economy | claude-haiku-4-5 | Scraper, Custos | Alto volume, tarefas repetitivas |
