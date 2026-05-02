---
name: Lead Generation
description: Captação e onboarding de lojistas para o marketplace da AutoAgente
slug: lead-generation
schema: agentcompanies/v1
version: 1.0.0
tags:
  - leads
  - onboarding
  - captacao-agent
---

# Lead Generation

Skill do agente Captação para identificar, contatar e onboardar lojistas de veículos seminovos.

## Fontes de Leads

### Plataformas de Anúncios
- Lojistas que anunciam em OLX, WebMotors, iCarros, ML
- Extrair dados de contato dos anúncios (nome da loja, telefone, cidade)
- Priorizar lojistas com alto volume de anúncios premium

### ReceitaWS (Consulta CNPJ)
- Validar CNPJ dos lojistas identificados
- Verificar CNAE compatível (4511-1/01 — Comércio a varejo de automóveis)
- Checar situação cadastral (ativa, baixada, inapta)

### Indicações
- Lojistas existentes podem indicar outros
- Programa de indicação: benefício para quem indica

## Funil de Captação

### 1. Identificação
- Scraper identifica lojistas PJ nas plataformas
- Deduplicar por CNPJ
- Salvar em `leads` com status `identified`

### 2. Qualificação
- Consultar ReceitaWS: CNPJ ativo, CNAE correto
- Volume de anúncios: mín 5 veículos ativos
- Faixa de preço: compatível com target da AutoAgente
- Status → `qualified` ou `disqualified`

### 3. Primeiro Contato (WhatsApp)
- Enviar template `onboarding_lojista`
- Mensagem: apresentar a AutoAgente, proposta de valor, convite para cadastro
- Status → `contacted`

### 4. Onboarding
- Lojista responde com interesse → iniciar fluxo de cadastro
- Coletar: razão social, CNPJ, responsável, email, endereço
- Enviar formulário KYC (link para plataforma Next.js)
- Status → `onboarding`

### 5. Validação KYC
- Compliance valida documentos (CNPJ, contrato social, identidade do responsável)
- Se aprovado → `active`
- Se reprovado → `kyc_failed` com motivo

### 6. Ativação
- Lojista recebe confirmação + tutorial da plataforma
- Primeira oferta enviada em até 48h (se houver deal compatível)
- Status → `active`

## Métricas de Captação

| Métrica | Meta Mensal |
|---------|------------|
| Leads identificados | 100+ |
| Leads qualificados | 60+ |
| Primeiro contato enviado | 50+ |
| Respostas recebidas | 20+ (40% response rate) |
| Onboarding iniciado | 15+ |
| Lojistas ativados | 10+ |

## Retenção

- **Churn prevention**: Se lojista não recebe oferta em 14 dias, Captação envia mensagem de reengajamento
- **NPS**: Pesquisa trimestral via WhatsApp (1-10)
- **Feedback loop**: Razão de churn alimenta melhorias no produto

## Templates WhatsApp para Captação

### Primeiro Contato
> Olá [Nome]! Sou da AutoAgente, plataforma de negociação inteligente de seminovos. Trabalhamos com compradores qualificados que buscam veículos como os que vocês anunciam. Gostaria de apresentar como funciona — posso enviar mais detalhes?

### Follow-up (sem resposta após 3 dias)
> Oi [Nome], passando para reforçar o contato. Temos compradores buscando [Modelo] na faixa que vocês trabalham. Posso apresentar nossa proposta em 2 minutos?

### Reengajamento
> [Nome], faz um tempo que não nos falamos. Tivemos [X] deals fechados no último mês na sua região. Quer que incluamos seus veículos nas próximas rodadas de negociação?
