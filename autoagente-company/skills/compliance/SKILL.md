---
name: Compliance
description: Verificação KYC, LGPD, histórico veicular e conformidade regulatória
slug: compliance
schema: agentcompanies/v1
version: 1.0.0
tags:
  - compliance
  - legal
  - lgpd
  - compliance-agent
---

# Compliance

Skill do agente Compliance para garantir conformidade legal e regulatória em todas as operações da AutoAgente.

## KYC (Know Your Customer) — Lojistas

### Documentos Obrigatórios (PJ)
1. **CNPJ ativo** — consulta ReceitaWS
2. **Contrato Social** — identificar sócios e representante legal
3. **CNAE compatível** — 4511-1/01 (Comércio a varejo de automóveis) ou similar
4. **Identidade do responsável** — RG ou CNH do representante legal
5. **Comprovante de endereço** — do estabelecimento (máx 90 dias)

### Critérios de Aprovação
| Critério | Regra |
|----------|-------|
| CNPJ | Ativo, sem restrições |
| CNAE | Compatível com comércio de veículos |
| Fundação | Mín 6 meses de atividade |
| Endereço | Verificável e consistente com CNPJ |
| Representante | Documento válido, sem pendências |

### Motivos de Rejeição
- CNPJ baixado, inapto ou suspenso
- CNAE incompatível
- Empresa recém-criada (< 6 meses) sem justificativa
- Documentos adulterados ou ilegíveis
- Representante com restrições judiciais

## Verificação de Veículos

### Consultas Obrigatórias (antes de iniciar negociação)
1. **Base DENATRAN** — situação do veículo, restrições
2. **CheckCarro / Lupa Veicular / CarCheck** — histórico completo:
   - Sinistro / Recuperado de sinistro
   - Leilão
   - Roubo/furto ativo
   - Restrição judicial (penhora, alienação)
   - Recall pendente
   - Débitos (IPVA, multas, licenciamento)

### Critérios de Aprovação
| Resultado | Ação |
|-----------|------|
| Limpo (sem ocorrências) | Aprovar → seguir para Pricing |
| Recall pendente | Aprovar condicionado (desconto no recall) |
| Débitos < R$ 2.000 | Aprovar condicionado (desconto nos débitos) |
| Sinistro leve (sem perda total) | Rejeitar (política zero sinistro) |
| Leilão | Rejeitar |
| Roubo/furto | Rejeitar + alertar |
| Restrição judicial | Rejeitar |

## LGPD (Lei 13.709/2018)

### Dados Pessoais Coletados
| Categoria | Dados | Base Legal |
|-----------|-------|-----------|
| Lojista PJ | CNPJ, razão social, endereço, telefone, email | Execução de contrato (Art. 7, V) |
| Representante PJ | Nome, CPF, RG, telefone | Execução de contrato (Art. 7, V) |
| Mensagens WhatsApp | Conteúdo, timestamps, mídia | Legítimo interesse (Art. 7, IX) |
| Dados veiculares | Placa, RENAVAM, chassi | Execução de contrato (Art. 7, V) |

### Direitos do Titular (Art. 18)
Garantir que lojistas podem:
- Acessar seus dados
- Corrigir dados incompletos ou inexatos
- Solicitar anonimização ou eliminação
- Revogar consentimento
- Solicitar portabilidade

### Retenção de Dados
| Tipo | Prazo | Justificativa |
|------|-------|---------------|
| Dados de contrato | 5 anos após término | Obrigação legal (CC Art. 205) |
| Mensagens WhatsApp | 2 anos | Legítimo interesse |
| Dados KYC | 5 anos após desativação | Prevenção à fraude |
| Logs de sistema | 1 ano | Segurança |

### Auditoria LGPD (Trimestral)
1. Verificar consentimentos válidos
2. Checar dados expirados para eliminação
3. Revisar acessos a dados pessoais
4. Atualizar ROPA (Registro de Operações de Tratamento)
5. Relatório ao CLO com findings e recomendações

## Regulamentações DETRAN/CONTRAN

### Transferência de Propriedade
- ATPV-e obrigatória (Resolução CONTRAN 809/2020)
- Prazo: 30 dias para transferência após compra
- Multa por atraso: Art. 233 CTB

### Intermediação de Veículos
- Monitorar mudanças na regulamentação de intermediação digital
- Manter conformidade com Código de Defesa do Consumidor
- Garantia legal de 90 dias para vícios ocultos (CDC Art. 26)

## Métricas

- `kyc_processed` — total de KYCs processados
- `kyc_approved` — aprovados
- `kyc_rejected` — rejeitados (com breakdown de motivos)
- `vehicle_checks` — verificações de veículos realizadas
- `vehicle_clean_rate` — % de veículos limpos
- `lgpd_data_requests` — solicitações de titulares atendidas
- `compliance_incidents` — incidentes de compliance
