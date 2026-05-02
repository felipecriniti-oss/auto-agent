---
name: Cost Control
description: Controle de custos operacionais, budget por agente e P&L por deal
slug: cost-control
schema: agentcompanies/v1
version: 1.0.0
tags:
  - finance
  - costs
  - custos-agent
---

# Cost Control

Skill do agente Custos para monitorar e controlar os gastos operacionais da AutoAgente.

## Categorias de Custo

### 1. Infraestrutura (Fixo Mensal)
| Item | Custo Estimado |
|------|---------------|
| Supabase Pro | R$ 130/mês |
| Vercel Pro | R$ 100/mês |
| WhatsApp BSP (base) | R$ 200/mês |
| Domínio + DNS | R$ 15/mês |
| **Total infra** | **~R$ 445/mês** |

### 2. LLM / API (Variável)
| Modelo | Custo por 1M tokens (input/output) | Budget mensal |
|--------|-------------------------------------|---------------|
| Opus (CEO, Negociador) | $15 / $75 | R$ 2.000 |
| Sonnet (8 agentes) | $3 / $15 | R$ 3.000 |
| Haiku (Scraper, Custos) | $0.80 / $4 | R$ 500 |
| **Total LLM** | | **~R$ 5.500/mês** |

### 3. APIs Externas (Variável)
| API | Custo | Budget |
|-----|-------|--------|
| FIPE API | R$ 0,02/consulta | R$ 200/mês |
| ReceitaWS | R$ 0,10/consulta CNPJ | R$ 100/mês |
| CheckCarro/similar | R$ 15-30/consulta | R$ 500/mês |
| WhatsApp msgs (template) | R$ 0,30-0,80/msg | R$ 800/mês |
| **Total APIs** | | **~R$ 1.600/mês** |

### 4. Custo por Deal
| Item | Estimativa |
|------|-----------|
| Scraping (encontrar) | R$ 2-5 |
| Análise FIPE + mercado | R$ 5-10 |
| Verificação veicular | R$ 15-30 |
| Negociação (7 rounds) | R$ 30-80 |
| Contrato (geração) | R$ 10-20 |
| **Total por deal** | **R$ 62-145** |

## Budget por Agente

Cada agente tem um budget mensal de tokens LLM:

| Agente | Budget (tokens/mês) | Alerta 80% | Modo Eco 95% |
|--------|---------------------|------------|-------------|
| CEO | 500K | 400K | 475K |
| Negociador | 2M | 1.6M | 1.9M |
| Analista | 1M | 800K | 950K |
| Scraper | 3M | 2.4M | 2.85M |
| Captação | 500K | 400K | 475K |
| Conteúdo | 300K | 240K | 285K |
| Custos | 500K | 400K | 475K |
| Pricing | 500K | 400K | 475K |
| Contratos | 300K | 240K | 285K |
| Compliance | 300K | 240K | 285K |

## Relatório Diário (9h BRT)

O agente Custos gera relatório contendo:
1. **Consumo LLM**: tokens usados por agente (dia/semana/mês)
2. **Consumo APIs**: calls por API externa
3. **Custo por deal**: custo médio dos deals em andamento
4. **Projeção mensal**: extrapolação do gasto atual
5. **Alertas**: agentes próximos do limite, custos atípicos

## P&L por Deal

Para cada deal fechado:
```
Receita = preço_revenda - preço_compra
Custos = custo_operacional_deal + rateio_fixo
Margem = Receita - Custos
ROI = Margem / preço_compra
```

Meta: margem mínima de 8% por deal após custos operacionais.

## Métricas

- `monthly_burn_rate` — gasto total mensal
- `cost_per_deal` — custo médio por deal
- `llm_utilization` — % do budget LLM usado por agente
- `api_cost_trend` — tendência de custo de APIs externas
- `margin_after_costs` — margem real após custos por deal
