---
name: Deal Pricing
description: Precificação de deals, análise de viabilidade e definição de faixas de negociação
slug: deal-pricing
schema: agentcompanies/v1
version: 1.0.0
tags:
  - pricing
  - finance
  - pricing-agent
---

# Deal Pricing

Skill do agente Pricing para determinar viabilidade financeira e faixas de preço para negociação de cada deal.

## Análise de Viabilidade

Para cada deal que passa pelo Analista, o Pricing calcula:

### 1. Preço de Compra Target
```
preço_target = fipe_price * fator_desconto_modelo * fator_km * fator_urgência
```

| Fator | Range | Descrição |
|-------|-------|-----------|
| fator_desconto_modelo | 0.80-0.95 | Desconto típico do modelo vs. FIPE |
| fator_km | 0.95-1.05 | Ajuste por quilometragem (0km=1.05, 60k=0.95) |
| fator_urgência | 0.95-1.00 | Se deal precisa fechar rápido, aceita pagar mais |

### 2. Preço de Revenda Estimado
```
preço_revenda = fipe_price * fator_revenda_modelo * fator_sazonalidade
```

| Fator | Range | Descrição |
|-------|-------|-----------|
| fator_revenda_modelo | 0.95-1.10 | Alguns modelos vendem acima da FIPE |
| fator_sazonalidade | 0.97-1.03 | Ajuste sazonal (verão/inverno) |

### 3. Margem Estimada
```
margem_bruta = preço_revenda - preço_target
custos_operacionais = custo_deal_estimado + custo_transferência + IPVA_proporcional
margem_líquida = margem_bruta - custos_operacionais
margem_percentual = margem_líquida / preço_target
```

### 4. Decisão Go/No-Go

| Margem Líquida | Decisão |
|---------------|---------|
| >= 12% | Go (prioridade alta) |
| 8-12% | Go (prioridade normal) |
| 5-8% | Go condicional (só se negociar desconto extra) |
| < 5% | No-go (margem insuficiente) |

## Faixas de Negociação

O Pricing define 3 preços para o Negociador:

| Preço | Cálculo | Uso |
|-------|---------|-----|
| **Oferta inicial** | target - 10% | Primeira proposta |
| **Target** | preço_target | Objetivo ideal |
| **Walk-away** | target + 5% | Máximo absoluto |

## Custos de Transferência

| Item | Custo Estimado |
|------|---------------|
| Transferência DETRAN | R$ 300-800 (varia por estado) |
| Vistoria cautelar | R$ 200-400 |
| Seguro transporte | R$ 150-300 |
| IPVA proporcional | Variável |
| **Buffer** | +5% sobre total |

## Modelos de Liquidez

Baseado em dados históricos, o Pricing mantém tabela de liquidez:

| Liquidez | Tempo médio revenda | Exemplos |
|----------|-------------------|----------|
| Alta | < 30 dias | Corolla, Civic, HRV |
| Média | 30-60 dias | A3, 320i, Compass |
| Baixa | 60-90 dias | Modelos nicho, cores raras |

Modelos de alta liquidez podem aceitar margem menor (5-8%).
Modelos de baixa liquidez exigem margem maior (12%+).

## Métricas

- `deals_priced` — total de deals avaliados
- `deals_approved` — aprovados (go)
- `deals_rejected` — rejeitados (no-go) com motivo
- `pricing_accuracy` — % de deals onde margem real ficou ±2% do estimado
- `avg_margin` — margem média dos deals fechados
