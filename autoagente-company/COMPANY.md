---
name: AutoAgente
description: Empresa de agentes IA para negociação automatizada de carros seminovos premium
slug: autoagente
schema: agentcompanies/v1
version: 3.2.0
license: MIT
authors:
  - name: Felipe Criniti
    email: felipecriniti@gmail.com
goals:
  - Automatizar busca e aquisição de seminovos premium via IA
  - Negociar preços com lojistas via WhatsApp usando psicologia de vendas
  - Otimizar precificação com learning engine baseada em FIPE e mercado
  - Controlar custos por deal e margem de investimento
  - Captar e reter lojistas na plataforma marketplace
requirements:
  secrets:
    - WHATSAPP_TOKEN
    - WHATSAPP_PHONE_ID
    - SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - LLM_API_KEY
    - FIPE_API_KEY
---

# AutoAgente

AutoAgente é uma empresa de agentes IA que automatiza a aquisição de carros seminovos premium para investimento. O sistema identifica oportunidades no mercado, negocia preços com lojistas via WhatsApp, gerencia o pipeline de deals e aprende continuamente com os resultados.

## A empresa

Opera como um time coordenado de 14 agentes especializados, organizados em 5 departamentos (CEO, CTO, CMO, CFO, CLO). Cada agente tem responsabilidades claras, budget próprio e métricas de performance.

## Como funciona

1. **Scraper** monitora plataformas (OLX, WebMotors, iCarros, ML) a cada 4 horas
2. **Analista** valida preço FIPE, posição de mercado e potencial de desconto
3. **CFO: Custos** aprova viabilidade financeira (margem mínima 8%)
4. **Negociador** executa 7 rounds de negociação via WhatsApp com gatilhos psicológicos
5. **CLO: Contratos** gera contrato de compra e venda com assinatura digital
6. **CEO** aprova deal final e coordena fechamento
7. **CLO: Compliance** verifica conformidade LGPD, KYC e histórico do veículo
8. **Learning engine** analisa resultado e refina estratégia para próximos deals
9. **CMO: Captação** traz novos lojistas continuamente via WhatsApp e onboarding

## Para lojistas

Lojistas interagem via WhatsApp: recebem ofertas estruturadas, negociam termos, fazem onboarding com KYC e acompanham deals em tempo real.

## Para investidores

Deal sourcing automatizado, pricing baseado em dados, portfolio management e métricas transparentes de ROI por deal.

## Stack técnica

- Next.js 15 + TypeScript + Tailwind v4
- Supabase (auth + DB + realtime + storage)
- WhatsApp BSP (Twilio/Gupshup)
- ReceitaWS (consulta CNPJ)
- FIPE API (preços referência)
- Paperclip (orquestração de agentes)
