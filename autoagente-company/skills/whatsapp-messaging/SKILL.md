---
name: WhatsApp Messaging
description: Integração com WhatsApp Business API para comunicação automatizada com lojistas
slug: whatsapp-messaging
schema: agentcompanies/v1
version: 1.0.0
tags:
  - whatsapp
  - messaging
  - integration
---

# WhatsApp Messaging

Skill compartilhada pelos agentes que interagem via WhatsApp (Negociador, Captação, Conteúdo).

## Infraestrutura

### WhatsApp Business API
- **BSP**: Twilio ou Gupshup (configurável via env)
- **Número**: Único número business verificado pelo Meta
- **Webhook**: Recebe mensagens em endpoint Next.js → roteia para agente correto

### Tipos de Mensagem

| Tipo | Janela | Uso |
|------|--------|-----|
| Template (HSM) | Qualquer momento | Primeiro contato, notificações |
| Session message | 24h após última msg do contato | Conversação livre |
| Interactive | 24h | Botões, listas, quick replies |
| Media | 24h | Imagens, PDFs, documentos |

### Templates Aprovados (exemplos)
- `primeiro_contato_deal` — Interesse em veículo específico
- `proposta_formal` — Envio de oferta com preço
- `onboarding_lojista` — Convite para cadastro
- `contrato_envio` — Notificação de contrato para assinatura
- `followup_generico` — Reengajamento após inatividade

## Roteamento de Mensagens

```
Webhook recebe msg → identifica contato no Supabase →
  Se deal ativo → Negociador
  Se onboarding em andamento → Captação
  Se sem contexto → Captação (triagem)
  Se opt-out → marcar e não responder
```

## Regras de Compliance

- **Opt-in**: Só enviar template se contato fez opt-in (via formulário ou resposta prévia)
- **Opt-out**: Responder "sair", "pare", "cancelar" → desativar imediatamente
- **Horário**: Mensagens apenas entre 08:00-19:00 BRT (seg-sáb)
- **Frequência**: Máx 1 template/dia por contato não-engajado
- **LGPD**: Dados de conversa retidos por período definido pelo CLO
- **Logs**: Toda mensagem enviada/recebida logada em `whatsapp_messages`

## Rate Limits

| Tier | Mensagens/dia | Requisito |
|------|--------------|-----------|
| Tier 1 (novo) | 1.000 | Número verificado |
| Tier 2 | 10.000 | Quality rating bom + volume |
| Tier 3 | 100.000 | Quality rating alto |
| Tier 4 | ilimitado | Quality rating alto + volume |

## Tratamento de Erros

- **Número inválido**: Marcar contato como inválido, não retentar
- **Template rejeitado**: Notificar CMO para revisão
- **Rate limit**: Queue com retry exponencial
- **Timeout de sessão**: Reengajar com template na próxima janela
- **Bloqueio**: Escalar ao CMO imediatamente
