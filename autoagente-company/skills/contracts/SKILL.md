---
name: Contracts
description: Geração de contratos de compra e venda, ATPV-e e assinatura digital
slug: contracts
schema: agentcompanies/v1
version: 1.0.0
tags:
  - legal
  - contracts
  - contratos-agent
---

# Contracts

Skill do agente Contratos para gerar, enviar e acompanhar contratos de compra e venda de veículos.

## Tipos de Documento

### 1. Contrato de Compra e Venda (C&V)
Documento principal da transação contendo:
- Qualificação das partes (comprador e vendedor)
- Descrição do veículo (marca, modelo, ano, placa, RENAVAM, chassi)
- Preço e forma de pagamento
- Condições de entrega
- Cláusula de vício oculto (garantia legal 90 dias — CDC Art. 26)
- Cláusula de boa-fé e ausência de ônus
- Penalidades por descumprimento
- Foro de eleição

### 2. ATPV-e (Autorização para Transferência de Propriedade de Veículo Eletrônica)
- Documento digital obrigatório para transferência (Resolução CONTRAN 809/2020)
- Emitido pelo vendedor via Portal SENATRAN
- Assinatura digital com certificado e-CPF ou Gov.br
- Validade: 30 dias após emissão

### 3. Recibo de Compra e Venda
- Comprovação de pagamento
- Dados bancários da transferência
- Data e assinaturas

### 4. Termo de Vistoria
- Laudo cautelar do veículo (referência: resultado da skill Compliance)
- Estado geral no momento da entrega
- Checklist de acessórios e documentação entregue

## Assinatura Digital

### Lei 14.063/2020 — Assinaturas Eletrônicas
| Tipo | Nível | Uso |
|------|-------|-----|
| Simples | Básico | C&V entre partes |
| Avançada | Médio | C&V com validação Gov.br |
| Qualificada | ICP-Brasil | ATPV-e (obrigatório) |

### Plataforma de Assinatura
- Integração com plataforma de assinatura digital (DocuSign, Clicksign ou D4Sign)
- Envio do C&V por WhatsApp (link para assinatura)
- Notificações de status: enviado → visualizado → assinado
- Armazenamento do documento assinado no Supabase Storage

## Fluxo de Contratos

1. **Deal aprovado pelo CEO** → Contratos recebe dados do deal
2. **Gerar C&V** → Preencher template com dados das partes e do veículo
3. **Revisão CLO** → CLO valida cláusulas (se deal > R$ 200k ou cláusula não-padrão)
4. **Envio para assinatura** → Link enviado via WhatsApp ao lojista
5. **Acompanhamento** → Follow-up em 24h se não assinado
6. **Assinatura concluída** → Notificar CEO + iniciar transferência
7. **ATPV-e** → Orientar vendedor sobre emissão (ou emitir se tiver procuração)

## Follow-up de Assinaturas Pendentes (14h BRT, seg-sex)

- Verificar contratos enviados há mais de 24h sem assinatura
- Enviar lembrete via WhatsApp
- Se pendente há mais de 72h → escalar ao CLO
- Se pendente há mais de 7 dias → considerar deal como `stale`

## Templates de Contrato

Manter templates parametrizados em Supabase Storage:
- `cv_pj_compra.docx` — C&V padrão (compra de PJ)
- `cv_pf_compra.docx` — C&V padrão (compra de PF)
- `recibo_pagamento.docx` — Recibo
- `termo_vistoria.docx` — Termo de vistoria

Campos dinâmicos marcados com `{{placeholder}}`:
- `{{vendedor_nome}}`, `{{vendedor_cpf_cnpj}}`, `{{vendedor_endereco}}`
- `{{veiculo_marca}}`, `{{veiculo_modelo}}`, `{{veiculo_placa}}`, etc.
- `{{preco_numeral}}`, `{{preco_extenso}}`, `{{data_assinatura}}`

## Métricas

- `contracts_generated` — contratos gerados
- `contracts_signed` — assinados
- `contracts_pending` — aguardando assinatura
- `signature_avg_time` — tempo médio até assinatura
- `contracts_expired` — expirados sem assinatura
