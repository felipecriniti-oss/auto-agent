---
name: Content & Copy
description: Criação de conteúdo, templates WhatsApp e comunicação da marca AutoAgente
slug: content-copy
schema: agentcompanies/v1
version: 1.0.0
tags:
  - content
  - copy
  - brand
  - conteudo-agent
---

# Content & Copy

Skill do agente Conteúdo para criar e manter todos os materiais de comunicação da AutoAgente.

## Responsabilidades

### Templates WhatsApp
- Criar templates para aprovação do Meta
- Manter biblioteca de templates por cenário (negociação, captação, contratos)
- A/B testing de mensagens (variações de copy para mesmo cenário)
- Garantir tom de voz consistente

### Copy para Negociação
- Sugerir fraseologia por round de negociação
- Adaptar tom por perfil do lojista (formal vs. informal, capital vs. interior)
- Criar respostas para objeções comuns

### Comunicação Institucional
- Textos para plataforma web (landing page, FAQ, termos)
- Emails transacionais (confirmação de cadastro, contrato, etc.)
- Materiais de onboarding para lojistas

## Tom de Voz da AutoAgente

### Princípios
- **Profissional sem ser frio**: Linguagem clara, direta, mas calorosa
- **Confiável**: Dados e fatos, nunca promessas vazias
- **Acessível**: Evitar jargão técnico com lojistas
- **Regional**: Adaptar expressões por região quando relevante

### Formatação WhatsApp
- Usar *negrito* para valores e prazos
- Usar emojis com moderação (máx 2 por mensagem)
- Parágrafos curtos (máx 3 linhas)
- Sempre incluir CTA claro no final

### Palavras-chave a usar
- "oportunidade", "parceria", "agilidade", "transparência", "dados"
- "investidores qualificados", "pagamento rápido", "sem burocracia"

### Palavras a evitar
- "desconto" (usar "condição especial"), "barato" (usar "competitivo")
- "urgente" (usar "prioridade"), "último preço" (usar "melhor condição")

## Biblioteca de Objeções

| Objeção | Resposta Sugerida |
|---------|-------------------|
| "Preço muito baixo" | "Entendo. Essa oferta reflete nossa análise de mercado com base na FIPE e anúncios similares. Qual valor seria interessante para você?" |
| "Já tenho compradores" | "Ótimo! Somos mais um canal. Nossos compradores são qualificados e o pagamento é rápido — complementa seus canais atuais." |
| "Não conheço a empresa" | "Posso enviar nosso portfólio de deals fechados e referências de lojistas parceiros na sua região." |
| "Preciso pensar" | "Sem problemas! Vou reservar essa condição por 48h. Qualquer dúvida, estou aqui." |

## Métricas

- `template_approval_rate` — % de templates aprovados pelo Meta
- `message_response_rate` — taxa de resposta por template
- `ab_test_winner_rate` — % de testes A/B com vencedor significativo
- `objection_resolution_rate` — % de objeções que resultam em continuidade da negociação
