---
name: Market Analysis
description: Análise de mercado, validação FIPE e scoring de oportunidades para deals de seminovos
slug: market-analysis
schema: agentcompanies/v1
version: 1.0.0
tags:
  - analysis
  - fipe
  - market
  - analista-agent
---

# Market Analysis

Skill do agente Analista para avaliar oportunidades de aquisição de seminovos usando dados FIPE, posição de mercado e machine learning.

## Fontes de Dados

### FIPE (Fundação Instituto de Pesquisas Econômicas)
- **API**: api.fipe.org.br ou veiculos.fipe.org.br
- **Dados**: Preço médio mensal por marca/modelo/versão/ano/combustível
- **Atualização**: Mensal (primeira semana do mês)
- **Uso**: Referência base para precificação

### Dados Internos (Supabase)
- `deals` — histórico de negociações (preço anunciado, preço fechado, desconto)
- `market_snapshots` — snapshots diários de preços por modelo
- `fipe_history` — série histórica FIPE para tendência

### Dados de Mercado (via Scraper)
- Preços anunciados nas 4 plataformas
- Volume de anúncios por modelo/região
- Tempo médio de permanência (quando disponível)

## Análise por Deal

Quando o Scraper envia um novo anúncio, o Analista executa:

### 1. Validação FIPE
```
fipe_price = consultar_fipe(marca, modelo, versão, ano, combustível)
fipe_ratio = preço_anúncio / fipe_price
```
- **fipe_ratio < 0.60**: Alerta fraude → rejeitar
- **fipe_ratio 0.60-0.85**: Excelente oportunidade → prioridade alta
- **fipe_ratio 0.85-0.95**: Boa oportunidade → prioridade média
- **fipe_ratio 0.95-1.05**: Preço justo → prioridade baixa
- **fipe_ratio > 1.05**: Acima do mercado → rejeitar (salvo modelo em alta)

### 2. Posição no Mercado
Comparar com anúncios similares ativos:
```
percentil = posição_preço_no_mercado(marca, modelo, ano, região)
```
- **P10-P25**: Preço muito competitivo
- **P25-P50**: Preço abaixo da média
- **P50-P75**: Preço na média
- **P75+**: Acima do mercado

### 3. Scoring de Oportunidade

| Fator | Peso | Score (0-10) |
|-------|------|-------------|
| FIPE ratio | 30% | Baseado na faixa acima |
| Posição no mercado | 25% | Percentil invertido |
| KM (menor = melhor) | 15% | Linear até 60k |
| Ano modelo (mais novo = melhor) | 10% | Linear |
| Histórico de liquidez do modelo | 10% | Baseado em deals anteriores |
| Região (demanda local) | 10% | Baseado em velocidade de venda |

**Score final**: Soma ponderada → classificação:
- **8-10**: Oportunidade A (notificar CTO imediatamente)
- **6-8**: Oportunidade B (incluir no relatório diário)
- **4-6**: Oportunidade C (monitorar)
- **0-4**: Descartado

### 4. Estimativa de Revenda
```
preço_revenda_estimado = fipe_price * fator_modelo * fator_km * fator_região
margem_estimada = preço_revenda_estimado - preço_compra_estimado - custos_operacionais
roi_estimado = margem_estimada / preço_compra_estimado
```

## Learning Engine

O Analista mantém um modelo de aprendizado contínuo:

### Feedback Loop
1. Após cada deal fechado (won ou lost), comparar previsão vs. realidade
2. Atualizar pesos do scoring baseado nos resultados
3. Identificar padrões: quais modelos dão mais margem, quais regiões vendem mais rápido

### Dados de Treinamento
- Deals fechados com margem final real
- Tempo de revenda por modelo/região
- Sazonalidade (ex: SUVs vendem mais no inverno, conversíveis no verão)

### Métricas do Modelo
- **MAE** (Mean Absolute Error) do preço de revenda estimado
- **Hit rate** de oportunidades A que viram deals fechados
- **Correlação** entre score e margem real

## Relatório Diário (8h BRT)

O Analista gera relatório diário contendo:
1. **Resumo de mercado**: novos anúncios, variação de preços, tendências
2. **Top oportunidades**: os 10 melhores deals do dia com score e análise
3. **Performance do modelo**: accuracy das previsões recentes
4. **Alertas**: mudanças FIPE, modelos com queda/alta de preço atípica
5. **Recomendações**: modelos para priorizar/evitar na próxima semana

## Métricas

- `analysis_total` — total de anúncios analisados
- `analysis_approved` — aprovados para negociação
- `analysis_rejected` — rejeitados (com motivo)
- `analysis_accuracy` — % de previsões de preço com erro < 5%
- `analysis_latency` — tempo médio de análise por deal
